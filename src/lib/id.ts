// Локальный ID для записей в SQLite. Это не device-UUID для синхронизации с
// сервером (бэкенда в шаблоне нет) — просто уникальный первичный ключ.
export function generateId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // Фолбэк для рантаймов без crypto.randomUUID — не криптостойкий,
  // но для локального первичного ключа этого не требуется.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
