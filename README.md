# Smart Hoop

Приложение для тренировки бросков в баскетбол. Работает как **PWA** в браузере и как **нативное Android-приложение** (Capacitor) — без App Store и Google Play.

## О проекте

Smart Hoop помогает отслеживать тренировочные сессии: считает попадания и промахи, ведёт статистику и серии. Поддерживает два режима:

- **Ручной** — пользователь сам отмечает попадания и промахи (кнопки на экране или кнопки громкости на Android).
- **AI** — камера телефона, ONNX-модель детектирует мяч и кольцо, автоматически определяет результат броска.

## Технологии

| Слой | Стек |
|------|------|
| Фронтенд | Vue 3, Vue Router, Vite |
| Язык | JavaScript (без TypeScript) |
| PWA | Service Worker, manifest, установка на домашний экран |
| Android | Capacitor 8 |
| AI | ONNX Runtime Web (YOLOv8), MediaPipe Pose |
| Хранение | IndexedDB |
| UI | Canvas overlay, Web Audio API |

## Требования

### Веб-разработка

- Node.js 20+ (в CI используется 24)
- npm

### Сборка Android APK

- JDK 17+
- [Android SDK](https://developer.android.com/studio) (через Android Studio или command-line tools)
- Переменные окружения `ANDROID_HOME` / `ANDROID_SDK_ROOT` и `JAVA_HOME`

Проверка:

```bash
java -version
# Android SDK: adb version (опционально, для установки на устройство)
```

## Быстрый старт (веб)

```bash
npm install
npm run dev
```

Откройте `http://localhost:5173/smart-hoop/`.

> Камера в браузере работает только на `localhost` или HTTPS. Для теста камеры на телефоне используйте Android-сборку (см. ниже).

Production-сборка:

```bash
npm run build
npm run preview
```

## Деплой PWA (GitHub Pages)

При пуше в ветку `master` GitHub Actions автоматически собирает и публикует приложение.

Адрес: `https://<user>.github.io/smart-hoop/`

### Обновление PWA у пользователей

После деплоя новой версии service worker предлагает обновление через баннер «Доступна новая версия приложения». Пользователь нажимает **Обновить** — страница перезагружается с актуальным кодом.

---

## Android APK

### Первоначальная настройка

1. Установите зависимости:

```bash
npm install
```

2. Положите AI-модели в `public/models/`:

| Файл | Назначение |
|------|------------|
| `public/models/smart-hoop-detector.onnx` | Детектор мяча, кольца, игрока (YOLOv8) |
| `public/models/mediapipe/pose_landmarker_lite.task` | Скелет игрока (MediaPipe, опционально) |

3. (Опционально) Сгенерируйте иконки и splash screen:

```bash
# Положите PNG 1024×1024 в assets/icon-only.png (см. assets/README.md)
npm run generate:android-assets
```

4. Синхронизируйте веб-сборку с Android-проектом:

```bash
npm run cap:sync
```

Команда `cap:sync` выполняет `build:cap` (Vite с `base: './'` для Capacitor) и копирует `dist/` в `android/`.

### Сборка debug APK (для тестов)

```bash
npm run cap:sync
cd android
./gradlew assembleDebug        # Linux / macOS
gradlew.bat assembleDebug      # Windows
```

Готовый APK:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Установка на подключённый телефон:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Или откройте проект в Android Studio:

```bash
npm run cap:open
```

Затем **Run** (▶) на подключённом устройстве.

### Сборка release APK (для распространения)

Release-сборка требует подписи. Debug-ключ подходит только для личного тестирования.

**1. Создайте keystore** (один раз):

```bash
keytool -genkey -v -keystore smart-hoop-release.keystore -alias smart-hoop -keyalg RSA -keysize 2048 -validity 10000
```

Храните файл и пароли в безопасном месте. Файлы `*.keystore`, `*.jks` и `key.properties` уже в `.gitignore`.

**2. Создайте `android/key.properties`:**

```properties
storeFile=../smart-hoop-release.keystore
storePassword=ВАШ_ПАРОЛЬ
keyAlias=smart-hoop
keyPassword=ВАШ_ПАРОЛЬ
```

**3. Добавьте signing config** в `android/app/build.gradle` (внутрь блока `android { ... }`):

```gradle
def keystorePropertiesFile = rootProject.file("key.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

signingConfigs {
    release {
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
        storeFile file(keystoreProperties['storeFile'])
        storePassword keystoreProperties['storePassword']
    }
}

buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
    }
}
```

**4. Соберите release APK:**

```bash
npm run cap:sync
cd android
./gradlew assembleRelease        # Linux / macOS
gradlew.bat assembleRelease      # Windows
```

Готовый APK:

```
android/app/build/outputs/apk/release/app-release.apk
```

### Обновление Android-приложения

При каждом обновлении нужно **увеличить версию** и пересобрать APK. Android не обновляет установленное приложение автоматически (в отличие от PWA в браузере).

**1. Обновите версию** в `android/app/build.gradle`:

```gradle
defaultConfig {
    versionCode 2        // целое число, всегда больше предыдущего
    versionName "0.2.0"  // отображаемая версия
}
```

Также обновите `"version"` в `package.json` для согласованности.

**2. Внесите изменения в код**, затем:

```bash
npm run cap:sync
cd android
./gradlew assembleRelease   # или assembleDebug
```

**3. Установите новый APK** поверх старого (тот же ключ подписи):

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Или передайте APK пользователям — они устанавливают вручную (нужно разрешить установку из неизвестных источников).

> **Важно:** `versionCode` должен строго расти. Если APK подписан другим ключом, установка поверх не сработает — сначала удалите старую версию.

### Полезные npm-скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev` | Локальный dev-сервер (PWA, base `/smart-hoop/`) |
| `npm run build` | Production-сборка для GitHub Pages |
| `npm run build:cap` | Сборка для Capacitor (`base: './'`) |
| `npm run cap:sync` | `build:cap` + `cap sync android` |
| `npm run cap:open` | Открыть Android-проект в Android Studio |
| `npm run generate:android-assets` | Иконки и splash из `assets/icon-only.png` |

---

## Экраны

| Экран | Путь | Описание |
|-------|------|----------|
| **Главная** | `/` | Старт ручной или AI-сессии |
| **Ручная сессия** | `/session/manual` | Тренировка с ручным вводом |
| **AI-сессия** | `/ai/session` | Камера, детекция, автоматический подсчёт |
| **Калибровка** | `/ai/calibration` | Ручная настройка положения кольца |
| **Статистика** | `/stats` | История, фильтры, экспорт/импорт |
| **Настройки** | `/settings` | AI-модель, скелет MediaPipe, тема |

## Текущие возможности

### Ручная сессия

- Старт / пауза / завершение
- Попадание / промах (кнопки и кнопки громкости на Android)
- HUD: попадания, промахи, %, таймер, серии
- Название, игрок, описание, теги

### AI-сессия

- Задняя камера телефона
- ONNX-детектор (мяч, кольцо, игрок)
- Ручная калибровка кольца
- Автоматическое определение попаданий и промахов
- Траектория мяча и overlay детекций
- Скелет игрока (MediaPipe Pose, опционально)
- Тестовые траектории в manual-детекторе

### Статистика и данные

- История сессий в IndexedDB (сохраняется после перезагрузки)
- Фильтры по дате, тегам, поиску
- Редактирование завершённых сессий
- Экспорт JSON / CSV, импорт JSON

### Прочее

- Тёмная / светлая / системная тема
- PWA: установка на домашний экран, автообновление
- Android: нативный APK, плагин кнопок громкости

## Планируемые возможности

- Звуковые уведомления (попадание, промах, предупреждения)
- Предупреждения при перекрытии камеры / потере кольца
- Запись видео тренировки
- Дополнительные AI-модели

## Структура проекта

```
src/
  ai/               # Детекторы (ONNX, MediaPipe), трекинг, worker
  components/       # UI-компоненты (SessionHUD, HoopSceneCanvas и др.)
  composables/      # Логика Vue
  media/            # Камера
  plugins/          # Capacitor-плагины (кнопки громкости)
  pwa/              # Service worker, обновления
  shot/             # Калибровка кольца, классификатор броска
  storage/          # IndexedDB
  stores/           # Состояние приложения
  utils/            # Утилиты
  views/            # Экраны
android/            # Capacitor Android-проект
public/
  models/           # ONNX и MediaPipe модели
  ort/              # WASM-бинарники ONNX Runtime
  icons/            # PWA-иконки
assets/             # Исходники для Android-иконок (icon-only.png)
scripts/            # Вспомогательные скрипты сборки
```

## Лицензия

Private project.
