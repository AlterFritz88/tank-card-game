import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolveWritableDbPath } from "./storagePath";

const SQLITE_DB_PATH = resolveWritableDbPath(
  process.env.PANZERSHREK_DB_PATH ?? process.env.PLAYER_SQLITE_DB_PATH,
  "panzershrek.sqlite",
  "SQLite database"
);

console.log(`SQLite database path: ${SQLITE_DB_PATH}`);

let database: DatabaseSync | null = null;

function getDatabase(): DatabaseSync {
  if (database) return database;

  database = new DatabaseSync(SQLITE_DB_PATH);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS json_documents (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  return database;
}

function parseJson<T>(rawValue: string, fallback: T): T {
  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

function readLegacyJson<T>(legacyPath: string | null, fallback: T): T | null {
  if (!legacyPath || !existsSync(legacyPath)) return null;

  try {
    return JSON.parse(readFileSync(legacyPath, "utf8")) as T;
  } catch (error) {
    console.warn(`Failed to import legacy JSON database ${legacyPath}`, error);
    return fallback;
  }
}

export class JsonDocumentStore<T> {
  constructor(
    private readonly key: string,
    private readonly fallback: T,
    private readonly legacyPath: string | null = null
  ) {}

  read(): T {
    const db = getDatabase();
    const row = db
      .prepare("SELECT value FROM json_documents WHERE key = ?")
      .get(this.key) as { value?: string } | undefined;

    if (typeof row?.value === "string") {
      return parseJson(row.value, this.fallback);
    }

    const legacyValue = readLegacyJson(this.legacyPath, this.fallback);
    if (legacyValue !== null) {
      this.write(legacyValue);
      console.log(
        `Imported legacy JSON database ${this.legacyPath} into SQLite document ${this.key}`
      );
      return legacyValue;
    }

    return this.fallback;
  }

  write(value: T) {
    getDatabase()
      .prepare(
        `
          INSERT INTO json_documents (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `
      )
      .run(this.key, JSON.stringify(value), Date.now());
  }
}
