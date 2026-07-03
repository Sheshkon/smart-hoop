import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconSource = join(root, 'assets', 'icon-only.png')
const logoTarget = join(root, 'assets', 'logo.png')

if (!existsSync(iconSource)) {
  console.error(
    [
      '',
      'Не найден файл assets/icon-only.png',
      '',
      'Положите PNG-иконку (минимум 1024×1024 px) в:',
      '  assets/icon-only.png',
      '',
      'Затем снова выполните:',
      '  npm run generate:android-assets',
      '',
    ].join('\n'),
  )
  process.exit(1)
}

copyFileSync(iconSource, logoTarget)
console.log('assets/icon-only.png → assets/logo.png (для иконки и splash screen)')
