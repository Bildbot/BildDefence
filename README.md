# BildDefence

Портретная 2D roguelite tower-defense игра для браузера, Telegram Mini Apps и Android. Сейчас репозиторий содержит нулевой вертикальный срез: меню, фиксированную арену, паузу, настройки, платформенные адаптеры и версионированное локальное сохранение.

## Быстрый старт

Требования: Node.js 22.12+ и pnpm 9.12.

```powershell
pnpm.cmd install
pnpm.cmd dev
```

Откройте `http://localhost:5173`. В PowerShell с запрещёнными сценариями используйте `pnpm.cmd`, а не `pnpm`.

Если `npm config get script-shell` возвращает `/bin/bash` на Windows, удалите эту пользовательскую настройку командой `npm.cmd config delete script-shell`. Иначе npm-скрипты будут пытаться открыть отсутствующий Unix shell.

## Команды

- `pnpm dev` — локальный Vite-сервер.
- `pnpm build` — typecheck и production bundle в `dist/`.
- `pnpm lint` / `pnpm format:check` — статические проверки.
- `pnpm test` — unit-тесты Vitest.
- `pnpm test:e2e` — browser smoke в desktop и mobile Chromium.
- `pnpm cap:sync` — собрать web bundle и синхронизировать Android-проект.
- `pnpm android:open` — открыть Android-проект в Android Studio.

## Архитектура

- `src/game` — игровое состояние и Phaser-сцены без платформенных API.
- `src/ui` — React-меню, HUD, оверлеи и адаптивный layout.
- `src/platform` — browser, Telegram и Capacitor-адаптеры.
- `src/services` — сохранения и storage boundary.
- `src/content` — будущие типизированные определения контента.
- `src/shared` — общие константы и редкие React–Phaser события.

Логическая игровая область всегда равна 390 × 640. Desktop не видит больше арены: свободное место используется только для DOM-интерфейса.

## Telegram Mini App

Telegram bridge загружается только если URL содержит параметры `tgWebApp*`. Обычный browser startup от Telegram не зависит. Для ручного теста нужен HTTPS URL опубликованного GitHub Pages и его привязка к Mini App через BotFather.

`initDataUnsafe` не используется как доверенная идентичность. Когда появится backend, на сервер нужно передавать сырой `initData` и проверять подпись, свежесть и bot identity. Bot token никогда не должен попадать в `VITE_*` переменные.

## Android

Capacitor использует тот же `dist/`. Для реальной APK-сборки установите Android Studio с Android SDK и совместимый JDK, затем выполните:

```powershell
pnpm.cmd cap:sync
pnpm.cmd android:open
```

Signing credentials, `local.properties`, keystore-файлы и store secrets исключены из Git.

## Что пока не входит

Враги, стрельба, урон, опыт, апгрейды, backend, авторизация и платежи будут добавляться следующими вертикальными срезами.
