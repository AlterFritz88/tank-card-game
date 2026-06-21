import { existsSync, readFileSync } from "node:fs";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { resolveWritableDbPath, writeJsonFileAtomic } from "./storagePath";

const scryptAsync = promisify(scrypt);

type PlayerAccount = {
  userId: string;
  username: string;
  usernameKey: string;
  email: string;
  emailKey: string;
  passwordHash: string;
  salt: string;
  legalAcceptedAt: number;
  legalVersion: string;
  createdAt: number;
  lastLoginAt: number;
};

type AccountDb = Record<string, PlayerAccount>;

export type AdminPlayerAccountView = Pick<
  PlayerAccount,
  | "userId"
  | "username"
  | "email"
  | "legalAcceptedAt"
  | "legalVersion"
  | "createdAt"
  | "lastLoginAt"
>;

const ACCOUNT_DB_PATH = resolveWritableDbPath(
  process.env.PLAYER_ACCOUNT_DB_PATH,
  "player-accounts.json",
  "Player accounts"
);
const PASSWORD_HASH_BYTES = 64;
const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,14}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LEGAL_VERSION = "2026-06-20";
// Fixed salt used only to equalize timing when a username does not exist.
const DUMMY_SALT = "0".repeat(32);

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

function validateEmail(email: string): { email: string; key: string } {
  const normalizedEmail = email.trim().toLowerCase();

  if (
    normalizedEmail.length < 5 ||
    normalizedEmail.length > 254 ||
    !EMAIL_PATTERN.test(normalizedEmail)
  ) {
    throw new Error("Укажите корректный e-mail");
  }

  return {
    email: normalizedEmail,
    key: normalizedEmail,
  };
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const derivedKey = (await scryptAsync(
    password,
    salt,
    PASSWORD_HASH_BYTES
  )) as Buffer;
  return derivedKey.toString("hex");
}

async function verifyPassword(
  password: string,
  account: PlayerAccount
): Promise<boolean> {
  const expectedHash = Buffer.from(account.passwordHash, "hex");
  const actualHash = Buffer.from(
    await hashPassword(password, account.salt),
    "hex"
  );

  return (
    expectedHash.length === actualHash.length &&
    timingSafeEqual(expectedHash, actualHash)
  );
}

export class PlayerAccountManager {
  async register({
    username,
    password,
    email,
    legalAccepted,
  }: {
    username: string;
    password: string;
    email: string;
    legalAccepted: boolean;
  }): Promise<PlayerAccount> {
    const validatedUsername = validateUsername(username);
    const validatedEmail = validateEmail(email);
    validatePassword(password);

    if (!legalAccepted) {
      throw new Error("Необходимо принять пользовательское соглашение, оферту и политику конфиденциальности");
    }

    const db = readDb();
    if (db[validatedUsername.key]) {
      throw new Error("Такой логин уже занят");
    }
    if (Object.values(db).some((account) => account.emailKey === validatedEmail.key)) {
      throw new Error("Такой e-mail уже используется");
    }

    const now = Date.now();
    const salt = randomBytes(16).toString("hex");
    const account: PlayerAccount = {
      userId: `user:${validatedUsername.key}`,
      username: validatedUsername.username,
      usernameKey: validatedUsername.key,
      email: validatedEmail.email,
      emailKey: validatedEmail.key,
      passwordHash: await hashPassword(password, salt),
      salt,
      legalAcceptedAt: now,
      legalVersion: LEGAL_VERSION,
      createdAt: now,
      lastLoginAt: now,
    };

    db[validatedUsername.key] = account;
    writeDb(db);

    return account;
  }

  async login(username: string, password: string): Promise<PlayerAccount> {
    const validatedUsername = validateUsername(username);
    const db = readDb();
    const account = db[validatedUsername.key];

    if (!account) {
      // Burn a comparable amount of CPU so response timing does not reveal
      // whether the username exists (user-enumeration side-channel).
      await hashPassword(password, DUMMY_SALT);
      throw new Error("Неверный логин или пароль");
    }

    if (!(await verifyPassword(password, account))) {
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

  getEmailByUserId(userId: string): string | null {
    const safeUserId = userId.trim();
    if (!safeUserId) return null;

    const account = Object.values(readDb()).find(
      (entry) => entry.userId === safeUserId
    );
    return account?.email ?? null;
  }

  listAccounts(): AdminPlayerAccountView[] {
    return Object.values(readDb())
      .map((account) => ({
        userId: account.userId,
        username: account.username,
        email: account.email,
        legalAcceptedAt: account.legalAcceptedAt,
        legalVersion: account.legalVersion,
        createdAt: account.createdAt,
        lastLoginAt: account.lastLoginAt,
      }))
      .sort((left, right) => right.lastLoginAt - left.lastLoginAt);
  }
}
