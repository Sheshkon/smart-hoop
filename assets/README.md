# Исходники для @capacitor/assets

## Иконка приложения (обязательно)

Положите сюда файл:

```
assets/icon-only.png
```

Требования:
- формат PNG;
- минимум **1024×1024 px**;
- квадратное изображение без прозрачных полей по краям (логотип по центру).

После добавления файла выполните:

```bash
npm run generate:android-assets
npm run build
npx cap sync android
```

## Splash screen (опционально)

В проекте уже есть сгенерированные splash-ресурсы в `android/app/src/main/res/drawable-*`.
Чтобы обновить их из исходника, добавьте `assets/splash.png` (рекомендуется 2732×2732 px) и снова запустите `npm run generate:android-assets`.
