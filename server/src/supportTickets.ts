import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolveWritableDbPath, writeJsonFileAtomic } from "./storagePath";

export type SupportTicket = {
  id: string;
  createdAt: number;
  playerId: string;
  nickname: string;
  contact: string;
  message: string;
  pageUrl: string;
  userAgent: string;
  status: "new";
};

type SupportTicketDb = {
  tickets: SupportTicket[];
};

const SUPPORT_TICKETS_DB_PATH = resolveWritableDbPath(
  process.env.SUPPORT_TICKETS_DB_PATH,
  "support-tickets.json",
  "Support tickets"
);
const MAX_TICKETS = 1000;
const MAX_ADMIN_TICKETS = 200;

console.log(`Support tickets database path: ${SUPPORT_TICKETS_DB_PATH}`);

function readDb(): SupportTicketDb {
  try {
    if (!existsSync(SUPPORT_TICKETS_DB_PATH)) {
      return { tickets: [] };
    }

    const rawValue = readFileSync(SUPPORT_TICKETS_DB_PATH, "utf8");
    const parsed = JSON.parse(rawValue);

    return {
      tickets: Array.isArray(parsed?.tickets)
        ? normalizeTickets(parsed.tickets)
        : [],
    };
  } catch {
    return { tickets: [] };
  }
}

function writeDb(db: SupportTicketDb) {
  writeJsonFileAtomic(SUPPORT_TICKETS_DB_PATH, db);
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";

  return value.trim().replace(/\s+\n/g, "\n").slice(0, maxLength);
}

function normalizeTickets(values: unknown[]): SupportTicket[] {
  return values.flatMap((value): SupportTicket[] => {
    if (!value || typeof value !== "object") return [];
    const ticket = value as Partial<SupportTicket>;

    if (typeof ticket.id !== "string" || typeof ticket.createdAt !== "number") {
      return [];
    }

    return [
      {
        id: ticket.id,
        createdAt: Number.isFinite(ticket.createdAt)
          ? Math.max(0, Math.floor(ticket.createdAt))
          : 0,
        playerId: normalizeText(ticket.playerId, 120),
        nickname: normalizeText(ticket.nickname, 80),
        contact: normalizeText(ticket.contact, 160),
        message: normalizeText(ticket.message, 3000),
        pageUrl: normalizeText(ticket.pageUrl, 500),
        userAgent: normalizeText(ticket.userAgent, 500),
        status: "new",
      },
    ];
  });
}

export class SupportTicketManager {
  createTicket(input: {
    playerId: unknown;
    nickname: unknown;
    contact: unknown;
    message: unknown;
    pageUrl: unknown;
    userAgent: unknown;
  }): SupportTicket {
    const message = normalizeText(input.message, 3000);
    if (message.length < 8) {
      throw new Error("Опишите проблему подробнее");
    }

    const ticket: SupportTicket = {
      id: `support:${Date.now().toString(36)}:${randomUUID().slice(0, 8)}`,
      createdAt: Date.now(),
      playerId: normalizeText(input.playerId, 120),
      nickname: normalizeText(input.nickname, 80),
      contact: normalizeText(input.contact, 160),
      message,
      pageUrl: normalizeText(input.pageUrl, 500),
      userAgent: normalizeText(input.userAgent, 500),
      status: "new",
    };

    const db = readDb();
    writeDb({
      tickets: [ticket, ...db.tickets].slice(0, MAX_TICKETS),
    });

    return ticket;
  }

  listTickets(): SupportTicket[] {
    return readDb().tickets
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, MAX_ADMIN_TICKETS);
  }
}
