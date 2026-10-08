# {{APP_NAME}}

**{{TAGLINE}}**

{{Один абзац о том, что делает приложение и для кого.}}

## Особенности

- ...

## Стек

- Expo SDK 54 + expo-router, TypeScript
- `expo-sqlite` — вся persistence локально на устройстве, интернет не нужен
- `expo-notifications` / `expo-haptics` — если приложение их использует

## Запуск

```bash
npm install
npx expo start
```

`a` — Android, `i` — iOS, либо QR-код через Expo Go.

## Структура проекта

```
app/            expo-router экраны
src/
  theme/        палитра, типографика, отступы, анимации
  db/           expo-sqlite схема + миграции
  data/         доступ к данным (замени items.example.ts)
  services/     notifications, haptics
  components/   переиспользуемые UI-примитивы
  lib/          id, даты
tools/          генератор иконок, проверки, rename-скрипт
```

## Данные

Все данные хранятся локально на устройстве. Регистрации нет, интернет не
требуется для работы приложения.
