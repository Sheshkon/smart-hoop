# Smart Hoop PWA — пошаговый план для Cursor Agent без TypeScript

## Главный принцип разработки

Не начинать с “идеального AI”.

Сначала нужно сделать весь pipeline приложения на mock detections и тестовых траекториях:

1. mock-мяч;
2. mock-кольцо;
3. mock-попадания;
4. mock-промахи;
5. статистика;
6. звуки;
7. запись сессии;
8. история сессий.

Только после этого подключать реальную камеру и ONNX-модель.

Так приложение будет развиваться по слоям, и Cursor Agent не застрянет на сложной AI-части.

---

# Технологический стек

Использовать:

* React
* Vite
* JavaScript
* PWA
* ONNX Runtime Web
* IndexedDB
* MediaRecorder API
* Canvas
* Web Audio API
* Service Worker

Не использовать TypeScript.

---

# Итоговая структура проекта

```txt
src/
  App.jsx
  main.jsx

  components/
    HomeScreen.jsx
    SessionScreen.jsx
    CalibrationScreen.jsx
    StatsScreen.jsx
    SettingsScreen.jsx
    CameraView.jsx
    SessionHUD.jsx
    DetectionOverlay.jsx
    WarningOverlay.jsx
    RecordingControls.jsx

  ai/
    mockDetector.js
    onnxDetector.js
    detectorWorker.js
    preprocessing.js
    postprocessing.js
    tracking.js

  shot/
    hoopCalibration.js
    shotStateMachine.js
    shotClassifier.js
    occlusionDetector.js

  media/
    camera.js
    recorder.js
    audio.js

  storage/
    db.js
    sessionsRepo.js
    settingsRepo.js

  pwa/
    registerServiceWorker.js

  utils/
    geometry.js
    time.js
    id.js

public/
  models/
    smart-hoop-detector.onnx

  sounds/
    make-1.mp3
    make-2.mp3
    miss-1.mp3
    warning-camera-blocked.mp3
    warning-hoop-lost.mp3
    session-start.mp3
    session-end.mp3
    recording-started.mp3
    recording-stopped.mp3

  manifest.webmanifest
```

---

# Этап 1 — Минимальный PWA scaffold

## Цель

Создать пустое PWA-приложение с базовой навигацией.

## Что сделать

Создать Vite React app на JavaScript.

Экраны:

* Home;
* Session;
* Stats;
* Settings.

На Home добавить кнопки:

* “Новая сессия”;
* “Статистика”;
* “Настройки”.

Добавить PWA:

* `manifest.webmanifest`;
* иконки;
* service worker;
* регистрацию service worker.

## Acceptance criteria

Этап готов, если:

* приложение запускается;
* есть навигация между экранами;
* приложение можно открыть на телефоне;
* есть PWA manifest;
* нет TypeScript-файлов.

## Cursor prompt

```txt
Create a Vite React app using JavaScript only, no TypeScript.

Build a PWA scaffold for a mobile-first basketball training app called Smart Hoop.

Create these screens:
- HomeScreen
- SessionScreen
- StatsScreen
- SettingsScreen

Add simple navigation using React state, not react-router yet.

Add manifest.webmanifest and service worker registration.

Do not implement camera or AI yet.
```

---

# Этап 2 — Mock Session без камеры и AI

## Цель

Сделать тренировочную сессию без камеры, только с кнопками “Попадание” и “Промах”.

## Что сделать

На экране Session добавить:

* кнопку “Старт”;
* кнопку “Пауза”;
* кнопку “Завершить”;
* кнопку “Mock попадание”;
* кнопку “Mock промах”.

HUD должен показывать:

* попадания;
* промахи;
* всего бросков;
* процент попаданий;
* таймер;
* текущую серию;
* лучшую серию.

## Данные сессии

Сессия должна выглядеть так:

```js
{
  id: "session-id",
  startedAt: "2026-07-02T12:00:00.000Z",
  endedAt: null,
  durationMs: 0,
  attempts: 0,
  makes: 0,
  misses: 0,
  makePercentage: 0,
  currentStreak: 0,
  bestStreak: 0,
  shotEvents: []
}
```

Shot event:

```js
{
  id: "shot-id",
  type: "make",
  timestampMs: 15200,
  confidence: 1,
  source: "mock"
}
```

## Acceptance criteria

Этап готов, если:

* можно начать сессию;
* можно вручную добавить попадание;
* можно вручную добавить промах;
* статистика обновляется сразу;
* процент считается правильно;
* серия попаданий работает;
* после завершения сессии данные остаются в памяти приложения.

## Cursor prompt

```txt
Implement a mock basketball session without camera and without AI.

Use JavaScript only.

In SessionScreen add:
- Start session
- Pause session
- End session
- Mock Make
- Mock Miss

Create SessionHUD component showing:
- makes
- misses
- attempts
- make percentage
- timer
- current streak
- best streak

Implement session state in React.

Do not use TypeScript.
Do not use real camera.
Do not use ONNX yet.
```

---

# Этап 3 — Локальное сохранение сессий

## Цель

Сделать сохранение истории тренировок.

## Что сделать

Добавить IndexedDB wrapper.

Файлы:

```txt
storage/db.js
storage/sessionsRepo.js
```

Функции:

```js
saveSession(session)
getAllSessions()
getSessionById(id)
deleteSession(id)
clearSessions()
```

Экран Stats должен показывать список завершённых сессий:

* дата;
* длительность;
* attempts;
* makes;
* misses;
* процент;
* лучшая серия.

## Acceptance criteria

Этап готов, если:

* завершённая сессия сохраняется в IndexedDB;
* после перезагрузки страницы сессия остаётся;
* Stats показывает историю;
* можно очистить историю.

## Cursor prompt

```txt
Add IndexedDB storage for session history.

Use JavaScript only.

Create:
- storage/db.js
- storage/sessionsRepo.js

Implement:
- saveSession(session)
- getAllSessions()
- getSessionById(id)
- deleteSession(id)
- clearSessions()

Update StatsScreen to show saved sessions.

When a session is ended, save it to IndexedDB.

Do not add camera.
Do not add AI.
```

---

# Этап 4 — Mock Detector и Canvas Overlay

## Цель

Создать визуальный pipeline для будущего AI, но пока без реальной модели.

## Что сделать

Добавить экран Session с canvas-зоной вместо камеры.

На canvas рисовать:

* mock-кольцо;
* mock-мяч;
* траекторию мяча;
* bounding box кольца;
* bounding box мяча.

Создать:

```txt
ai/mockDetector.js
components/DetectionOverlay.jsx
utils/geometry.js
```

Mock detector должен возвращать detections:

```js
[
  {
    className: "hoop",
    confidence: 0.95,
    box: {
      x: 220,
      y: 120,
      width: 120,
      height: 80
    }
  },
  {
    className: "ball",
    confidence: 0.9,
    box: {
      x: 260,
      y: 300,
      width: 40,
      height: 40
    }
  }
]
```

## Acceptance criteria

Этап готов, если:

* на экране Session есть canvas;
* на canvas видно mock-кольцо;
* на canvas видно mock-мяч;
* мяч может двигаться по тестовой траектории;
* overlay обновляется в realtime;
* detections имеют такую же структуру, как будущая ONNX-модель.

## Cursor prompt

```txt
Add a mock AI detection pipeline.

Use JavaScript only.

Create mockDetector.js that returns mock detections for:
- hoop
- ball

Create DetectionOverlay component that draws detections on canvas.

In SessionScreen, show a canvas instead of camera for now.

Draw:
- hoop bounding box
- ball bounding box
- ball center point
- ball trajectory

Do not use real camera.
Do not use ONNX.
The mock detection format must be compatible with a future object detector.
```

---

# Этап 5 — Тестовые траектории попадания и промаха

## Цель

Сделать заранее заданные движения мяча, чтобы тестировать логику бросков.

## Что сделать

Добавить mock trajectories:

```txt
makeTrajectory
missLeftTrajectory
missRightTrajectory
shortMissTrajectory
```

Каждая траектория — массив точек:

```js
[
  { x: 280, y: 420, t: 0 },
  { x: 285, y: 350, t: 200 },
  { x: 290, y: 250, t: 400 },
  { x: 292, y: 170, t: 600 },
  { x: 294, y: 150, t: 800 },
  { x: 296, y: 210, t: 1000 },
  { x: 298, y: 300, t: 1200 }
]
```

Добавить кнопки:

* “Test Make Trajectory”;
* “Test Miss Left”;
* “Test Miss Right”;
* “Test Short Miss”.

## Acceptance criteria

Этап готов, если:

* можно запустить тестовую траекторию попадания;
* можно запустить разные траектории промаха;
* мяч двигается по canvas;
* история координат сохраняется;
* пока статистика может не считаться автоматически.

## Cursor prompt

```txt
Add mock ball trajectories for testing shot detection.

Use JavaScript only.

Create predefined trajectories:
- makeTrajectory
- missLeftTrajectory
- missRightTrajectory
- shortMissTrajectory

Add buttons in SessionScreen:
- Test Make Trajectory
- Test Miss Left
- Test Miss Right
- Test Short Miss

Animate the ball along the selected trajectory on canvas.

Store ball position history during animation.

Do not use camera.
Do not use ONNX.
```

---

# Этап 6 — Ручная калибровка кольца

## Цель

Позволить пользователю вручную поправить положение кольца.

Это важно, потому что AI может ошибаться, а положение кольца должно быть стабильным.

## Что сделать

Создать:

```txt
components/CalibrationScreen.jsx
shot/hoopCalibration.js
```

Пользователь должен иметь возможность:

* видеть рамку кольца;
* двигать рамку пальцем/мышкой;
* менять размер рамки;
* нажать “Готово”.

Калибровка:

```js
{
  hoopBox: {
    x: 220,
    y: 120,
    width: 120,
    height: 80
  },
  manuallyAdjusted: true,
  confidence: 1,
  createdAt: "2026-07-02T12:00:00.000Z"
}
```

## Acceptance criteria

Этап готов, если:

* перед стартом сессии можно открыть калибровку;
* рамку кольца можно двигать;
* рамку можно изменять;
* после подтверждения калибровка используется в SessionScreen;
* mock detector не должен резко менять ручную калибровку.

## Cursor prompt

```txt
Add manual hoop calibration.

Use JavaScript only.

Create CalibrationScreen where user can adjust hoop bounding box.

The hoop box must be draggable and resizable.

After confirmation, save calibration in app state and use it in SessionScreen.

Manual calibration should override mock hoop detection.

Do not use real AI yet.
Do not use camera yet.
```

---

# Этап 7 — Shot State Machine

## Цель

Автоматически определять попадание и промах по траектории мяча.

## Что сделать

Создать:

```txt
shot/shotStateMachine.js
shot/shotClassifier.js
```

Состояния:

```js
"idle"
"ball_detected"
"approaching_hoop"
"in_rim_zone"
"made"
"missed"
"cooldown"
```

## Логика попадания

Попадание считать, если:

* мяч был выше кольца;
* мяч двигался вниз;
* центр мяча прошёл через зону кольца;
* центр мяча оказался ниже кольца;
* x-координата мяча была внутри ширины кольца;
* cooldown не активен.

## Логика промаха

Промах считать, если:

* мяч приблизился к кольцу;
* траектория похожа на бросок;
* но мяч не прошёл через rim zone;
* мяч ушёл в сторону или вниз;
* истекло окно попытки.

## Acceptance criteria

Этап готов, если:

* Test Make Trajectory автоматически засчитывает попадание;
* Test Miss Left автоматически засчитывает промах;
* Test Miss Right автоматически засчитывает промах;
* Test Short Miss автоматически засчитывает промах;
* одно движение мяча не считается два раза;
* после make/miss включается cooldown.

## Cursor prompt

```txt
Implement shot detection state machine using mock trajectories.

Use JavaScript only.

Create:
- shotStateMachine.js
- shotClassifier.js

Detect make if ball moves from above the hoop to below the hoop through the calibrated hoop box.

Detect miss if ball approaches the hoop but does not pass through the rim zone.

Add cooldown to avoid double counting.

Connect the state machine to SessionScreen.

When a make or miss is detected, update session stats automatically.

Do not use camera.
Do not use ONNX.
```

---

# Этап 8 — Звуки событий

## Цель

Добавить звуковые уведомления.

## Что сделать

Создать:

```txt
media/audio.js
components/SoundSettings.jsx
```

События:

```js
"session_start"
"session_end"
"make"
"miss"
"camera_blocked"
"hoop_lost"
"move_away"
"calibration_success"
"recording_started"
"recording_stopped"
```

Добавить:

* включение/выключение звука;
* громкость;
* разблокировку звука после первого нажатия;
* debounce для предупреждений.

## Acceptance criteria

Этап готов, если:

* при старте сессии есть звук;
* при завершении сессии есть звук;
* при попадании есть звук;
* при промахе есть звук;
* звуки можно выключить;
* предупреждения не повторяются слишком часто.

## Cursor prompt

```txt
Add audio notifications.

Use JavaScript only.

Create media/audio.js with a SoundManager.

Support these events:
- session_start
- session_end
- make
- miss
- camera_blocked
- hoop_lost
- move_away
- calibration_success
- recording_started
- recording_stopped

Add volume setting and mute setting.

Unlock audio after first user interaction.

Play make sound when make is detected.
Play miss sound when miss is detected.

Do not add camera yet.
Do not add ONNX yet.
```

---

# Этап 9 — Mock предупреждения

## Цель

Сделать систему предупреждений до подключения реальной камеры.

## Что сделать

Создать:

```txt
components/WarningOverlay.jsx
shot/occlusionDetector.js
```

Добавить mock-кнопки:

* “Mock camera blocked”;
* “Mock hoop lost”;
* “Mock player too close”.

Предупреждения:

* “Отойдите, вы закрыли камеру”
* “Кольцо не видно”
* “Поставьте телефон так, чтобы кольцо было в кадре”
* “Плохое освещение”

## Acceptance criteria

Этап готов, если:

* warning overlay появляется;
* warning overlay исчезает автоматически;
* предупреждение сопровождается звуком;
* одинаковые предупреждения не спамятся.

## Cursor prompt

```txt
Add warning overlay system.

Use JavaScript only.

Create WarningOverlay component.

Create occlusionDetector.js, but for now use mock warning triggers.

Add buttons:
- Mock camera blocked
- Mock hoop lost
- Mock player too close

When warning is triggered:
- show large warning overlay
- play warning sound
- hide warning automatically after a few seconds
- debounce repeated warnings

Do not use real camera yet.
Do not use ONNX yet.
```

---

# Этап 10 — Камера

## Цель

Подключить настоящую камеру, но пока не использовать AI.

## Что сделать

Создать:

```txt
media/camera.js
components/CameraView.jsx
```

Камера:

* задняя камера по умолчанию;
* `facingMode: "environment"`;
* разрешение сначала 1280x720;
* fallback 960x540;
* fallback 640x480.

SessionScreen должен уметь переключаться:

* mock canvas mode;
* real camera mode.

## Acceptance criteria

Этап готов, если:

* приложение запрашивает доступ к камере;
* задняя камера открывается на телефоне;
* при ошибке показывается понятное сообщение;
* mock mode всё ещё работает;
* поверх камеры можно рисовать overlay.

## Cursor prompt

```txt
Add real camera support.

Use JavaScript only.

Create media/camera.js and CameraView.jsx.

Use getUserMedia with facingMode environment.

Try 1280x720 first, then fallback to 960x540, then 640x480.

In SessionScreen add mode switch:
- Mock mode
- Camera mode

Show camera video with canvas overlay on top.

Do not add ONNX yet.
Do not remove mock mode.
```

---

# Этап 11 — Запись видео сессии

## Цель

Добавить запись всей тренировки в видеофайл.

## Что сделать

Создать:

```txt
media/recorder.js
components/RecordingControls.jsx
```

MVP запись:

* записывать чистый camera stream;
* сохранять Blob;
* прикреплять видео к сессии;
* давать скачать файл.

Позже можно записывать canvas с overlay.

## Acceptance criteria

Этап готов, если:

* можно нажать “Start Recording”;
* можно нажать “Stop Recording”;
* после остановки появляется видеофайл;
* видео можно скачать;
* если сессия завершена, видео привязано к session record.

## Cursor prompt

```txt
Add video recording for training sessions.

Use JavaScript only.

Create media/recorder.js.

Use MediaRecorder API to record the camera stream.

Add RecordingControls component.

Allow:
- start recording
- stop recording
- save video Blob
- download video file

Attach recorded video metadata to the current session.

For now record raw camera stream only, not overlay.

Do not add ONNX yet.
```

---

# Этап 12 — Подготовка AI-интерфейса

## Цель

Сделать общий интерфейс detector, чтобы mock detector и ONNX detector были взаимозаменяемы.

## Что сделать

Detector должен иметь методы:

```js
async init()
async detect(input)
dispose()
```

Результат всегда одинаковый:

```js
[
  {
    className: "ball",
    confidence: 0.91,
    box: {
      x: 100,
      y: 200,
      width: 40,
      height: 40
    }
  }
]
```

Создать:

```txt
ai/detectorFactory.js
ai/mockDetector.js
ai/onnxDetector.js
```

Режимы:

```js
"mock"
"onnx"
```

## Acceptance criteria

Этап готов, если:

* SessionScreen не знает, какой detector используется;
* mock detector работает через общий интерфейс;
* onnxDetector пока может быть пустой заглушкой;
* можно переключить detector mode в настройках.

## Cursor prompt

```txt
Create a detector abstraction.

Use JavaScript only.

Create:
- detectorFactory.js
- mockDetector.js
- onnxDetector.js

Both detectors must expose:
- init()
- detect(input)
- dispose()

Detection result format:
className, confidence, box.

Update SessionScreen so it uses detectorFactory instead of calling mockDetector directly.

ONNX detector can be a placeholder for now.

Do not implement ONNX inference yet.
```

---

# Этап 13 — ONNX Runtime Web подключение

## Цель

Подключить ONNX Runtime Web, но не ломать mock mode.

## Что сделать

Установить:

```bash
npm install onnxruntime-web
```

Создать реальный `onnxDetector.js`.

Он должен:

* загружать `/models/smart-hoop-detector.onnx`;
* пробовать WebGPU;
* если WebGPU не работает — использовать WASM;
* делать preprocessing кадра;
* запускать inference;
* делать postprocessing;
* возвращать detections в общем формате.

Важно:

* inference должен быть throttled;
* если модель не найдена, приложение должно показать ошибку и предложить mock mode;
* mock mode должен остаться рабочим.

## Acceptance criteria

Этап готов, если:

* ONNX Runtime Web установлен;
* модель загружается из `public/models`;
* при отсутствии модели приложение не падает;
* mock mode всё ещё работает;
* ONNX mode возвращает detections в том же формате.

## Cursor prompt

```txt
Add ONNX Runtime Web support.

Use JavaScript only.

Install and use onnxruntime-web.

Implement ai/onnxDetector.js.

The detector should:
- load /models/smart-hoop-detector.onnx
- try WebGPU provider first if available
- fallback to WASM
- preprocess video/canvas frame
- run inference
- postprocess output
- return detections in the same format as mockDetector

If model loading fails, show an error and allow switching back to mock mode.

Do not remove mock mode.
```

---

# Этап 14 — Web Worker для AI

## Цель

Перенести inference в worker, чтобы UI не лагал.

## Что сделать

Создать:

```txt
ai/detectorWorker.js
ai/workerClient.js
```

Worker должен:

* загружать модель;
* получать frame;
* запускать inference;
* возвращать detections;
* не принимать новый frame, пока предыдущий не обработан.

## Acceptance criteria

Этап готов, если:

* UI не блокируется во время inference;
* detections продолжают рисоваться;
* inference FPS можно ограничить;
* при ошибке worker не ломает приложение.

## Cursor prompt

```txt
Move AI detection into a Web Worker.

Use JavaScript only.

Create:
- detectorWorker.js
- workerClient.js

The worker should:
- initialize ONNX detector
- receive image frames
- run detection
- return detections

The main thread should:
- send a new frame only when the previous inference is complete
- throttle inference FPS
- keep UI responsive

Keep mock mode working without worker if needed.
```

---

# Этап 15 — Реальное отслеживание мяча и кольца

## Цель

Использовать реальные detections для tracking.

## Что сделать

Создать:

```txt
ai/tracking.js
```

Ball tracking:

* хранить последние позиции мяча;
* считать направление движения;
* считать скорость;
* фильтровать detections с низким confidence.

Hoop tracking:

* после ручной калибровки не менять кольцо резко;
* AI hoop detection использовать только для проверки;
* если кольцо потеряно — показать предупреждение.

## Acceptance criteria

Этап готов, если:

* мяч отслеживается между кадрами;
* траектория мяча рисуется на overlay;
* кольцо стабилизировано;
* ручная калибровка важнее AI detection;
* при потере кольца появляется warning.

## Cursor prompt

```txt
Implement real ball and hoop tracking from detections.

Use JavaScript only.

Create ai/tracking.js.

Track ball:
- keep recent position history
- compute velocity
- filter low confidence detections
- draw trajectory

Track hoop:
- use manual calibration as primary hoop position
- use AI hoop detection only as verification
- do not suddenly move calibrated hoop box

Connect tracking output to shotStateMachine.

Keep mock mode working.
```

---

# Этап 16 — Реальные предупреждения

## Цель

Предупреждать пользователя, если камера или кольцо перекрыты.

## Что сделать

Обновить:

```txt
shot/occlusionDetector.js
```

Предупреждать, если:

* hoop не найден N кадров подряд;
* person bbox перекрывает hoop box;
* frame слишком тёмный;
* frame почти однотонный;
* camera stream frozen;
* большая часть кадра закрыта.

Предупреждения:

* “Отойдите, вы закрыли камеру”
* “Кольцо не видно”
* “Камера перекрыта”
* “Плохое освещение”
* “Поставьте телефон так, чтобы кольцо было в кадре”

## Acceptance criteria

Этап готов, если:

* приложение предупреждает, когда кольцо потеряно;
* приложение предупреждает, когда игрок закрывает кольцо;
* warning overlay работает с реальными detections;
* звук предупреждения срабатывает;
* debounce сохраняется.

## Cursor prompt

```txt
Implement real occlusion and visibility warnings.

Use JavaScript only.

Update occlusionDetector.js.

Detect:
- hoop lost for several frames
- person box overlaps hoop box
- frame is too dark
- frame is nearly uniform
- camera stream appears frozen

Show warning overlay and play warning sound.

Debounce repeated warnings.

Keep mock warning buttons for testing.
```

---

# Этап 17 — Улучшение записи: видео с overlay

## Цель

Записывать не только камеру, но и overlay со статистикой.

## Что сделать

Сделать canvas compositing:

```txt
camera video
+ detection boxes
+ ball trajectory
+ score HUD
+ warnings
= recorded canvas stream
```

Использовать:

```js
canvas.captureStream(30)
```

Записывать canvas stream через MediaRecorder.

## Acceptance criteria

Этап готов, если:

* можно выбрать режим записи:

    * raw camera;
    * camera with overlay;
* overlay попадает в записанное видео;
* HUD виден на видео;
* видео можно скачать.

## Cursor prompt

```txt
Add overlay video recording mode.

Use JavaScript only.

Create a composited canvas that draws:
- camera frame
- detection boxes
- hoop calibration
- ball trajectory
- session HUD
- warnings

Use canvas.captureStream(30) and MediaRecorder to record the composited stream.

Add recording mode setting:
- raw camera
- with overlay

Keep raw camera recording working.
```

---

# Этап 18 — Полная статистика

## Цель

Довести статистику до полноценной.

## Что добавить

Для каждой сессии:

* дата;
* длительность;
* attempts;
* makes;
* misses;
* make percentage;
* current streak;
* best streak;
* среднее время между бросками;
* shot timeline;
* видео;
* режим detector: mock или onnx;
* calibration info.

Добавить экспорт:

* JSON;
* CSV.

## Acceptance criteria

Этап готов, если:

* StatsScreen показывает подробную историю;
* можно открыть детали сессии;
* можно скачать JSON;
* можно скачать CSV;
* видео сессии доступно из истории.

## Cursor prompt

```txt
Improve session statistics.

Use JavaScript only.

Add detailed session view with:
- date
- duration
- attempts
- makes
- misses
- make percentage
- current streak
- best streak
- average time between shots
- shot timeline
- recording video link
- detector mode
- calibration info

Add export to JSON and CSV.

Keep IndexedDB persistence.
```

---

# Этап 19 — Настройки приложения

## Цель

Сделать полноценные настройки.

## Что добавить

Settings:

* detector mode: mock / onnx;
* звуки on/off;
* громкость;
* голосовые подсказки on/off;
* confidence threshold для мяча;
* confidence threshold для кольца;
* чувствительность попаданий;
* inference FPS;
* camera quality;
* recording mode;
* очистить историю;
* экспорт всех данных.

## Acceptance criteria

Этап готов, если:

* настройки сохраняются;
* после перезапуска приложения настройки остаются;
* настройки влияют на SessionScreen;
* можно очистить данные.

## Cursor prompt

```txt
Build full SettingsScreen.

Use JavaScript only.

Settings:
- detector mode: mock or onnx
- sounds enabled
- volume
- voice prompts enabled
- ball confidence threshold
- hoop confidence threshold
- shot sensitivity
- inference FPS
- camera quality
- recording mode
- clear history
- export all data

Save settings in IndexedDB or localStorage.

Apply settings in SessionScreen.
```

---

# Этап 20 — Mobile polish

## Цель

Подготовить приложение к реальному использованию на телефоне.

## Что сделать

Добавить:

* mobile-first layout;
* fullscreen session mode;
* portrait/landscape support;
* крупные кнопки;
* понятные ошибки камеры;
* режим низкой производительности;
* ограничение inference FPS;
* сохранение сессии при случайном закрытии;
* предупреждение перед выходом из активной сессии.

## Acceptance criteria

Этап готов, если:

* приложение удобно использовать на телефоне;
* интерфейс не мелкий;
* камера не ломает layout;
* приложение не теряет сессию при случайном закрытии;
* mock mode и onnx mode доступны.

## Cursor prompt

```txt
Polish the app for mobile PWA usage.

Use JavaScript only.

Add:
- mobile-first layout
- fullscreen session mode
- portrait and landscape support
- large touch buttons
- clear camera permission errors
- low performance mode
- inference FPS limit
- autosave active session
- warning before leaving active session

Make sure the app works well as an installed PWA.
```

---

# Финальная версия приложения должна уметь

* запускаться как PWA на Android и iOS;
* работать без TypeScript;
* открывать заднюю камеру;
* калибровать кольцо вручную;
* отслеживать мяч и кольцо через AI-модель;
* использовать mock mode для тестирования;
* считать попадания;
* считать промахи;
* не считать один бросок дважды;
* предупреждать, если игрок закрыл камеру или кольцо;
* проигрывать разные звуки;
* вести статистику сессий;
* сохранять историю;
* записывать видео всей тренировки;
* скачивать видео;
* экспортировать статистику.

---

# Рекомендуемый порядок выполнения

Выполнять строго по этапам:

1. PWA scaffold
2. Mock session
3. IndexedDB sessions
4. Mock detector + canvas
5. Test trajectories
6. Manual hoop calibration
7. Shot state machine
8. Sounds
9. Mock warnings
10. Real camera
11. Raw video recording
12. Detector abstraction
13. ONNX Runtime Web
14. Web Worker
15. Real tracking
16. Real warnings
17. Overlay video recording
18. Full stats
19. Settings
20. Mobile polish

Не переходить к ONNX, пока полностью не работают:

* mock session;
* mock trajectories;
* make/miss detection;
* stats;
* sounds;
* warnings;
* recording.