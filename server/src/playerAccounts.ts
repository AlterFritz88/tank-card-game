import { existsSync, readFileSync } from "node:fs";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { resolveWritableDbPath, writeJsonFileAtomic } from "./storagePath";

type PlayerAccount = {
  userId: string;
  username: string;
  usernameKey: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
  lastLoginAt: number;
};

type AccountDb = Record<string, PlayerAccount>;

const ACCOUNT_DB_PATH = resolveWritableDbPath(
  process.env.PLAYER_ACCOUNT_DB_PATH,
  "player-accounts.json",
  "Player accounts"
);
const PASSWORD_HASH_BYTES = 64;
const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,14}$/;

console.log(`Player accounts database path: ${ACCOUNT_DB_PATH}`);

function readDb(): AccountDb {
  try {
    if (!existsSync(ACCOUNT_DB_PATH)) return {};

    const rawValue = readFileSync(ACCOUNT_DB_PATH, "utf8");
    const parsed = JSON.parse(rawValue);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as AccountDb)
      : {};
  } catch {
    return {};
  }
}

function writeDb(db: AccountDb) {
  writeJsonFileAtomic(ACCOUNT_DB_PATH, db);
}

function normalizeUsername(username: string): string {
  return username.trim().slice(0, 14);
}

function getUsernameKey(username: string): string {
  return normalizeUsername(username)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
}

function validateUsername(username: string): { username: string; key: string } {
  const trimmedUsername = username.trim();
  const normalizedUsername = normalizeUsername(username);
  const usernameKey = getUsernameKey(username);

  if (
    trimmedUsername !== normalizedUsername ||
    !USERNAME_PATTERN.test(normalizedUsername) ||
    usernameKey !== normalizedUsername.toLowerCase()
  ) {
    throw new Error("Логин: 3-14 символов, только латиница, цифры, дефис и нижнее подчёркивание");
  }

  return {
    username: normalizedUsername,
    key: usernameKey,
  };
}

function validatePassword(password: string) {
  if (password.length < 6) {
    throw new Error("Пароль должен содержать минимум 6 символов");
  }
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, PASSWORD_HASH_BYTES).toString("hex");
}

function verifyPassword(password: string, account: PlayerAccount): boolean {
  const expectedHash = Buffer.from(account.passwordHash, "hex");
  const actualHash = Buffer.from(hashPassword(password, account.salt), "hex");

  return (
    expectedHash.length === actualHash.length &&
    timingSafeEqual(expectedHash, actualHash)
  );
}

export class PlayerAccountManager {
  register(username: string, password: string): PlayerAccount {
    const validatedUsername = validateUsername(username);
    validatePassword(password);

    const db = readDb();
    if (db[validatedUsername.key]) {
      throw new Error("Такой логин уже занят");
    }

    const now = Date.now();
    const salt = randomBytes(16).toString("hex");
    const account: PlayerAccount = {
      userId: `user:${validatedUsername.key}`,
      username: validatedUsername.username,
      usernameKey: validatedUsername.key,
      passwordHash: hashPassword(password, salt),
      salt,
      createdAt: now,
      lastLoginAt: now,
    };

    db[validatedUsername.key] = account;
    writeDb(db);

    return account;
  }

  login(username: string, password: string): PlayerAccount {
    const validatedUsername = validateUsername(username);
    const db = readDb();
    const account = db[validatedUsername.key];

    if (!account || !verifyPassword(password, account)) {
      throw new Error("Неверный логин или пароль");
    }

    const nextAccount = {
      ...account,
      lastLoginAt: Date.now(),
    };

    db[validatedUsername.key] = nextAccount;
    writeDb(db);

    return nextAccount;
  }
}
