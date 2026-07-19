import type { RadioDuelEvent } from "../../tank-card-game/src/game/radioDuel";
import { JsonDocumentStore } from "./sqliteStore";

type StoredPushAccount = {
  tokens: string[];
  provider?: "rustore";
  updatedAt: number;
};

type PushTokenDb = {
  accounts: Record<string, StoredPushAccount>;
};

type RuStoreErrorResponse = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

const EMPTY_DB: PushTokenDb = { accounts: {} };
const MAX_TOKENS_PER_ACCOUNT = 5;
const INVALID_TOKEN_STATUSES = new Set([
  "INVALID_ARGUMENT",
  "NOT_FOUND",
  "UNREGISTERED",
]);
const RADIO_DUEL_CHANNEL_ID = "radio_duels";
const RADIO_DUEL_CLICK_ACTION = "com.panzershrek.game.OPEN_RADIO_DUELS";

export class PushNotificationService {
  private readonly store = new JsonDocumentStore<PushTokenDb>(
    "push-notification-tokens",
    EMPTY_DB
  );
  private readonly projectId = process.env.RUSTORE_PUSH_PROJECT_ID?.trim() ?? "";
  private readonly serviceToken =
    process.env.RUSTORE_PUSH_SERVICE_TOKEN?.trim() ?? "";

  constructor() {
    if (!this.isConfigured()) {
      console.warn(
        "[PUSH] RuStore Project ID or Service token is not configured; Android push notifications are disabled"
      );
    }
  }

  registerToken(accountId: string, token: string, enabled: boolean): void {
    const normalizedToken = token.trim();
    if (!normalizedToken || normalizedToken.length > 4_096) return;

    const db = this.store.read();

    // One physical installation must belong only to the account currently
    // authenticated on it. This also makes switching accounts safe.
    for (const [storedAccountId, account] of Object.entries(db.accounts)) {
      account.tokens = account.tokens.filter((item) => item !== normalizedToken);
      if (account.tokens.length === 0) delete db.accounts[storedAccountId];
    }

    if (enabled) {
      const stored = db.accounts[accountId];
      // Tokens saved by the earlier FCM integration are not valid in RuStore.
      const current = stored?.provider === "rustore" ? stored.tokens : [];
      db.accounts[accountId] = {
        provider: "rustore",
        tokens: [normalizedToken, ...current]
          .filter((item, index, list) => list.indexOf(item) === index)
          .slice(0, MAX_TOKENS_PER_ACCOUNT),
        updatedAt: Date.now(),
      };
    }

    this.store.write(db);
  }

  sendRadioDuelEvent(accountId: string, event: RadioDuelEvent): boolean {
    if (!this.isConfigured()) return false;

    const account = this.store.read().accounts[accountId];
    const tokens = account?.provider === "rustore" ? account.tokens : [];
    if (tokens.length === 0) return false;

    void Promise.allSettled(
      tokens.map((token) => this.sendToToken(token, event))
    ).then((results) => {
      const invalidTokens = results.flatMap((result, index) =>
        result.status === "fulfilled" && result.value === "invalid"
          ? [tokens[index]]
          : []
      );
      if (invalidTokens.length > 0) this.removeTokens(invalidTokens);

      const failedCount = results.filter(
        (result) => result.status === "rejected"
      ).length;
      if (failedCount > 0) {
        console.warn(
          `[PUSH] ${failedCount} of ${tokens.length} RuStore radio-duel notifications failed`
        );
      }
    });

    return true;
  }

  private isConfigured(): boolean {
    return Boolean(this.projectId && this.serviceToken);
  }

  private async sendToToken(
    token: string,
    event: RadioDuelEvent
  ): Promise<"sent" | "invalid"> {
    const endpoint = `https://vkpns.rustore.ru/v1/projects/${encodeURIComponent(this.projectId)}/messages:send`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.serviceToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          data: {
            type: "radio_duel",
            kind: event.kind,
            duelId: event.duelId,
          },
          notification: {
            title: event.title,
            body: event.message,
          },
          android: {
            ttl: "43200s",
            notification: {
              channel_id: RADIO_DUEL_CHANNEL_ID,
              click_action: RADIO_DUEL_CLICK_ACTION,
              click_action_type: 0,
            },
          },
        },
      }),
    });

    if (response.ok) return "sent";

    const error = (await response.json().catch(() => ({}))) as RuStoreErrorResponse;
    const status = error.error?.status?.toUpperCase() ?? "";
    if (INVALID_TOKEN_STATUSES.has(status)) return "invalid";

    throw new Error(
      `RuStore Push API ${response.status}: ${error.error?.message ?? response.statusText}`
    );
  }

  private removeTokens(tokensToRemove: string[]): void {
    const remove = new Set(tokensToRemove);
    const db = this.store.read();

    for (const [accountId, account] of Object.entries(db.accounts)) {
      account.tokens = account.tokens.filter((token) => !remove.has(token));
      if (account.tokens.length === 0) delete db.accounts[accountId];
    }

    this.store.write(db);
  }
}
