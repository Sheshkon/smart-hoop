# Логика определения попадания/промаха AI

## Где начинается AI-сценарий

`src/router/index.js` не содержит самой логики броска. Он только подключает экраны AI-раздела:

- `/ai/session` - AI-сессия;
- `/ai/test` - тест определения объектов;
- `/ai/shot-test` - тест определения броска.

Также роутер блокирует уход со страницы `session-ai`, если активная сессия еще идет:

```js
router.beforeEach((to, from) => {
  const fromAiSession = from.name === 'session-ai'
  if (!fromAiSession) return true

  const { isInProgress } = useActiveSession()
  if (!isInProgress.value) return true
  return false
})
```

То есть `index.js` отвечает за навигацию, а не за попадание/промах. Сама цепочка определения броска проходит через:

1. `src/views/AiWorkspaceView.vue`
2. `src/components/HoopSceneCanvas.vue`
3. `src/ai/tracking.js`
4. `src/shot/shotStateMachine.js`
5. `src/shot/shotClassifier.js`

## Общий поток данных

AI-модель не говорит напрямую "попадание" или "промах". Она определяет объекты на кадре: мяч, кольцо, игрока. После этого приложение само считает траекторию мяча относительно кольца.

Поток такой:

1. `AiWorkspaceView.vue` включает `HoopSceneCanvas` в режиме `detector-mode="ai"`.
2. `HoopSceneCanvas.vue` на каждом кадре вызывает AI-детектор.
3. `tracking.js` стабилизирует найденные боксы мяча и кольца:
   - выбирает наиболее подходящий мяч;
   - сглаживает координаты;
   - предсказывает положение мяча на коротких пропусках;
   - хранит историю траектории.
4. `HoopSceneCanvas.vue` переводит координаты в единое portrait-пространство.
5. `shotStateMachine.js` получает центр мяча, область кольца, историю мяча и решает, был `make` или `miss`.
6. `HoopSceneCanvas.vue` отправляет событие `shot-detected`.
7. `AiWorkspaceView.vue` записывает результат в активную сессию через `recordMake` или `recordMiss`.

## Когда AI-автоопределение активно

В `AiWorkspaceView.vue` автоопределение бросков включено только для активной AI-сессии:

```js
const sceneAutoDetect = computed(() => isSessionRoute.value && isActive.value)
```

Для `HoopSceneCanvas` это передается как:

```vue
<HoopSceneCanvas
  :auto-detect-shots="sceneAutoDetect"
  detector-mode="ai"
  @shot-detected="handleAutoShot"
/>
```

Если прилетает событие:

```js
function handleAutoShot({ type, confidence }) {
  if (type === 'make') {
    recordMake({ source: 'ai', confidence })
  } else if (type === 'miss') {
    recordMiss({ source: 'ai', confidence })
  }
}
```

## Подготовка объектов перед классификацией

В `src/ai/tracking.js` используется трекер, который делает AI-детекцию пригодной для геометрической логики.

### Кольцо

Модель может вернуть полный бокс кольца/щита. Для логики броска используется не весь бокс, а верхняя полоса:

```js
lastHoopBox = getTopBoxBand(lastHoopSourceBox, {
  factor: HOOP_RIM_HEIGHT_FACTOR,
  minHeight: HOOP_RIM_MIN_HEIGHT_PX,
  maxHeight: HOOP_RIM_MAX_HEIGHT_PX,
})
```

Параметры:

- `HOOP_RIM_HEIGHT_FACTOR = 0.28`
- `HOOP_RIM_MIN_HEIGHT_PX = 8`
- `HOOP_RIM_MAX_HEIGHT_PX = 30`

Это означает: для расчета броска кольцо становится узкой горизонтальной зоной, примерно соответствующей ободу.

Если кольцо временно пропало, трекер какое-то время держит последнее положение. После `HOOP_LOST_FRAME_THRESHOLD = 18` свежих кадров без кольца трек сбрасывается, и появляется предупреждение `Кольцо не видно`.

### Мяч

Для мяча трекер:

- берет уверенные detections с `confidence >= 0.15`;
- может продолжать трекинг слабого detection с `confidence >= 0.08`;
- допускает повторный захват мяча с `confidence >= 0.28`;
- ограничивает скачки положения мяча;
- использует Kalman-фильтр;
- хранит историю до `BALL_HISTORY_MAX = 120` точек;
- чистит историю старше `BALL_TRAJECTORY_TTL_MS = 1400`;
- предсказывает мяч при короткой потере до `BALL_COAST_MAX_MS = 520`.

История прерывается, если:

- между точками прошло больше `BALL_HISTORY_BREAK_MS = 220`;
- или расстояние между точками больше `BALL_HISTORY_BREAK_DISTANCE_PX = 170`.

## Нормализация координат

Классификация броска всегда работает в portrait-пространстве сцены. Это сделано в `src/utils/sceneViewport.js`:

```js
export function toPortraitShotSpace(ballCenter, hoopBox, viewport, orientation)
```

Если видео landscape, координаты переводятся обратно в portrait. Благодаря этому `shotStateMachine.js` не должен иметь отдельную логику для портретной и альбомной ориентации.

## Вход в state machine

В `HoopSceneCanvas.vue` функция `processShotDetection` запускает классификацию:

```js
const machineResult = shotMachine.update({
  ballCenter,
  hoopBox,
  timestampMs,
  ballVisible: Boolean(ballCenter),
  ballRadius,
  ballHistory,
  backboardZone,
})
```

Если state machine вернула событие, компонент эмитит:

```js
emit('shot-detected', { type: machineResult.event, confidence: 0.9 })
```

Важно: `confidence: 0.9` сейчас фиксированный. Это не реальная уверенность модели в попадании/промахе, а статическое значение события.

## Состояния броска

В `src/shot/shotStateMachine.js` есть состояния:

- `idle` - ожидание;
- `ball_detected` - мяч найден и достаточно сместился;
- `approaching_hoop` - мяч приблизился к кольцу;
- `in_rim_zone` - мяч вошел в зону кольца;
- `made` - внутреннее состояние попадания;
- `missed` - внутреннее состояние промаха;
- `cooldown` - пауза после засчитанного броска.

После `make` или `miss` state machine сразу переводится в `cooldown`, чтобы один и тот же бросок не засчитался несколько раз.

Параметры:

- `COOLDOWN_MS = 1500`
- `ATTEMPT_WINDOW_MS = 2500`
- `MIN_MOVEMENT_PX = 8`
- `RIM_CROSSING_HISTORY_POINTS = 10`

## Старт попытки

Попытка не начинается от одного появления мяча. Сначала фиксируется стартовая точка траектории, и мяч должен сместиться минимум на `8px`:

```js
const movedEnough =
  distanceBetween(trajectoryStartCenter, ballCenter) >= MIN_MOVEMENT_PX
```

После этого состояние становится `ball_detected`.

Дальше попытка считается начатой, если мяч находится рядом с кольцом:

```js
isApproachingHoop(ballCenter, hoopBox)
```

В `shotClassifier.js` "рядом" значит расстояние от центра мяча до центра кольца не больше:

```js
hoopBox.width * 1.8
```

При входе в эту область:

- состояние становится `approaching_hoop`;
- запоминается `attemptStartedAt`;
- ставится флаг `wasInApproachRange`.

## Главные геометрические зоны

Все проверки завязаны на `hoopBox`.

### Мяч выше кольца

```js
isBallAboveHoop(ballCenter, hoopBox)
```

Возвращает `true`, если:

```js
ballCenter.y < hoopBox.y + hoopBox.height * 0.35
```

Если это хоть раз произошло, state machine ставит флаг `wasAboveHoop = true`.

### Мяч ниже кольца

```js
isBallBelowHoop(ballCenter, hoopBox)
```

Возвращает `true`, если:

```js
ballCenter.y > hoopBox.y + hoopBox.height * 0.65
```

### Мяч в зоне кольца

```js
isBallInRimZone(ballCenter, hoopBox)
```

Возвращает `true`, если центр мяча внутри прямоугольника `hoopBox`.

### Пересечение зоны кольца между кадрами

```js
didBallCrossRimZone(prevCenter, currentCenter, hoopBox)
```

Это защита от случая, когда мяч быстро пролетел через кольцо между двумя кадрами и ни один отдельный кадр не попал внутрь `hoopBox`.

Логика:

- если предыдущая или текущая точка внутри зоны - пересечение есть;
- иначе проверяется, пролетел ли сегмент между точками через вертикальную полосу кольца;
- вычисляется `crossingX`;
- если `crossingX` внутри ширины кольца - пересечение есть.

## Быстрое определение попадания через линию обода

Самый быстрый путь к `make` находится в `shotStateMachine.js`:

```js
if (hasAttemptSignal && rimLineCrossing?.direction === 'down') {
  if (rimLineCrossing.withinWidth) {
    enteredRimZone = true
    return finishAttempt('make', timestampMs)
  }
}
```

`rimLineCrossing` считается функцией:

```js
getRimLineCrossing(prevCenter, currentCenter, hoopBox, ballRadius)
```

Она проверяет пересечение горизонтальной линии:

```js
lineY = hoopBox.y + hoopBox.height / 2
```

Если мяч пересек эту линию сверху вниз, считается `direction: 'down'`.

Для попадания `crossingX` должен попасть в расширенную ширину кольца:

```js
withinWidth: crossingX >= left - makePadding && crossingX <= right + makePadding
```

`makePadding`:

```js
Math.min(
  hoopBox.width * 0.55,
  hoopBox.width * 0.18 + ballRadius * 1,
)
```

То есть ширина для make немного расширяется с учетом радиуса мяча, но не больше `55%` ширины кольца с каждой стороны.

Перед этим должен быть `hasAttemptSignal`:

- мяч уже был выше кольца;
- мяч сместился минимум на `8px`;
- state machine не в `idle` или мяч сейчас в зоне приближения к кольцу.

## Дополнительное определение попадания

Если быстрое пересечение линии не сработало, есть второй путь:

```js
const makeDetected =
  wasAboveHoop &&
  isMovingDown(prevCenter, ballCenter) &&
  enteredRimZone &&
  isBallBelowHoop(ballCenter, hoopBox) &&
  isBallWithinHoopWidth(ballCenter, hoopBox)
```

Попадание засчитывается, когда одновременно:

1. мяч раньше был выше кольца;
2. сейчас движется вниз;
3. он входил или пересекал зону кольца;
4. сейчас он ниже кольца;
5. по X он находится внутри ширины кольца.

## Как определяется промах

Промах засчитывается только во время попытки:

```js
const inAttempt =
  state === SHOT_STATES.approachingHoop ||
  state === SHOT_STATES.inRimZone ||
  attemptStartedAt != null
```

Есть несколько независимых сценариев промаха.

### 1. Широкий промах

```js
const missByWidePath = inAttempt && !enteredRimZone && isWideMiss(ballCenter, hoopBox)
```

`isWideMiss` возвращает `true`, если:

- мяч уже ниже нижней границы кольца;
- и центр мяча не внутри ширины кольца.

То есть мяч прошел уровень кольца, но не попал в его горизонтальную ширину.

### 2. Недолет / короткое падение

```js
const missByShortFall =
  inAttempt &&
  !enteredRimZone &&
  wasInApproachRange &&
  attemptApexY != null &&
  attemptApexY > hoopBox.y + hoopBox.height * 0.55 &&
  isMovingDown(prevCenter, ballCenter)
```

Это промах, когда:

- попытка началась;
- мяч не входил в зону кольца;
- мяч был рядом с кольцом;
- верхняя точка траектории была ниже середины/нижней части кольца;
- мяч начал двигаться вниз.

Фактически это попытка поймать бросок, который не поднялся достаточно высоко для попадания.

### 3. Таймаут попытки

```js
const missByTimeout =
  inAttempt && !enteredRimZone && attemptExpired && hasPassedHoopLevel(ballCenter, hoopBox)
```

`attemptExpired` наступает через `ATTEMPT_WINDOW_MS = 2500` после старта попытки.

Промах засчитывается, если за это время мяч не вошел в зону кольца и уже прошел уровень кольца вниз.

### 4. Падение ниже кольца без входа в обод

```js
const missByDropWithoutRim =
  inAttempt &&
  !enteredRimZone &&
  isBallBelowHoop(ballCenter, hoopBox) &&
  isWideMiss(ballCenter, hoopBox)
```

Этот сценарий очень похож на широкий промах. Он требует, чтобы мяч был ниже кольца и вне ширины кольца.

### 5. От щита без входа в кольцо

```js
const missByBackboard =
  inAttempt &&
  touchedBackboardZone &&
  !enteredRimZone &&
  isMovingDown(prevCenter, ballCenter) &&
  isBallBelowHoop(ballCenter, hoopBox)
```

`touchedBackboardZone` ставится, если сегмент движения мяча пересек зону щита.

Зона щита строится в `getBackboardZone`:

- ширина: `hoopBox.width * 2.4`;
- высота: `hoopBox.width * 1.5`;
- верхний сдвиг: `hoopBox.width * 1.2` над кольцом.

Если мяч коснулся этой зоны, не вошел в обод, пошел вниз и оказался ниже кольца - это промах.

### 6. Близкое пересечение линии обода мимо кольца

```js
const missByRimLineNearCrossing =
  inAttempt &&
  rimLineNearMissCandidate &&
  !enteredRimZone &&
  isBallBelowHoop(ballCenter, hoopBox)
```

`rimLineNearMissCandidate` ставится, если мяч пересек среднюю линию обода сверху вниз рядом с кольцом, но вне `withinWidth`.

Для "рядом" используется:

```js
missPadding = hoopBox.width * 0.75
```

То есть мяч может пройти на расстоянии до `75%` ширины кольца слева или справа от боксовой ширины. Если после такого пересечения мяч оказался ниже кольца и так и не вошел в обод - это промах.

## Что происходит после make/miss

Любой результат проходит через:

```js
finishAttempt('make' | 'miss', timestampMs)
```

Функция:

- выставляет событие `make` или `miss`;
- включает `cooldown` на `1500ms`;
- очищает флаги попытки;
- сбрасывает запомненную траекторию попытки.

Из-за cooldown один бросок не должен быть засчитан несколько раз подряд.

## Что происходит, если попытка истекла без результата

Если попытка истекла, но мяч не вошел в зону кольца и ни один промах не сработал, state machine просто возвращается в `idle`:

```js
if (attemptExpired && !enteredRimZone) {
  state = SHOT_STATES.idle
  ...
}
```

Событие `miss` в этом случае не отправляется.

## Текущие особенности и риски логики

1. `confidence: 0.9` для события броска фиксированный. Он не отражает реальную уверенность AI-модели или state machine.
2. AI-модель определяет только объекты. Классификация попадания/промаха полностью геометрическая.
3. Логика сильно зависит от качества `hoopBox`. Если AI нашел кольцо слишком большим/маленьким или со сдвигом, зона попадания тоже сдвинется.
4. Для попадания используется расширение `makePadding`, поэтому некоторые близкие пролеты около края могут быть засчитаны как попадание.
5. `missByWidePath` и `missByDropWithoutRim` частично дублируют друг друга: оба требуют, чтобы мяч не входил в зону кольца и был вне ширины кольца после прохождения уровня кольца.
6. State machine работает по центру мяча, а не по реальному пересечению окружности мяча с ободом. Радиус учитывается только в `getRimLineCrossing` через `makePadding`.
7. Если мяч потерян на кадрах дольше допустимого окна трекера, история может сброситься, и попытка может не завершиться событием.
8. Если мяч пересек обод сверху вниз внутри расширенной ширины, попадание засчитывается сразу, еще до проверки дальнейшего движения ниже кольца.

## Краткая формула

Попадание:

- мяч был выше кольца;
- есть движение вниз;
- мяч пересек линию/зону обода в допустимой ширине;
- либо после входа в зону обода оказался ниже кольца внутри ширины кольца.

Промах:

- попытка уже началась;
- мяч не вошел в зону обода;
- и один из признаков промаха сработал: широкий пролет, недолет, таймаут, отскок/касание зоны щита, близкий проход рядом с линией обода.
