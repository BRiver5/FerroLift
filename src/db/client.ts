import * as SQLite from "expo-sqlite";
import { runMigrations } from "./migrations";

const DB_NAME = "forma.db";

let dbInstance: SQLite.SQLiteDatabase | null = null;
let readyPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Открытие базы и прогон миграций гарантированно происходит один раз,
// даже если несколько экранов запросят getDb() параллельно на старте
// (гонка вида "оба видят пустую таблицу и оба делают INSERT" — известная
// ловушка на самом первом запуске, см. docs/PLAN.template.md).
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!readyPromise) {
    readyPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync("PRAGMA journal_mode = WAL;");
      await runMigrations(db);
      dbInstance = db;
      return db;
    })();
  }
  return readyPromise;
}

export function getDbSync(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    throw new Error("getDb() ещё не резолвился — вызывай после await getDb() на старте приложения");
  }
  return dbInstance;
}
