import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolveWritableDbPath, writeJsonFileAtomic } from "./storagePath";
import { PlayerProfileManager } from "./playerProfiles";

export type GoldProductId = "gold-100" | "gold-500" | "gold-1500";

type GoldProduct = {
  id: GoldProductId;
  goldTracks: number;
  defaultAmountRub: number;
  envPriceKey: string;
};

export type GoldProductCatalogItem = {
  id: GoldProductId;
  goldTracks: number;
  amountRub: number | null;
};

type GoldPaymentRecord = {
  paymentId: string;
  playerId: string;
  productId: GoldProductId;
  goldTracks: number;
  amountRub: number;
  status: "pending" | "succeeded" | "cancelled";
  yookassaStatus: string;
  confirmationUrl: string | null;
  createdAt: number;
  updatedAt: number;
  creditedAt: number | null;
};

type PaymentDb = Record<string, GoldPaymentRecord>;

type YookassaPaymentResponse = {
  id?: string;
  status?: string;
  confirmation?: {
    confirmation_url?: string;
  };
  metadata?: Record<string, unknown>;
};

const PAYMENT_DB_PATH = resolveWritableDbPath(
  process.env.PLAYER_PAYMENT_DB_PATH,
  "player-payments.json",
  "Player payments"
);

const YOOKASSA_API_BASE =
  process.env.YOOKASSA_API_BASE?.trim() || "https://api.yookassa.ru/v3";

const GOLD_PRODUCTS: Record<GoldProductId, GoldProduct> = {
  "gold-100": {
    id: "gold-100",
    goldTracks: 100,
    defaultAmountRub: 99,
    envPriceKey: "YOOKASSA_GOLD_100_RUB",
  },
  "gold-500": {
    id: "gold-500",
    goldTracks: 500,
    defaultAmountRub: 449,
    envPriceKey: "YOOKASSA_GOLD_500_RUB",
  },
  "gold-1500": {
    id: "gold-1500",
    goldTracks: 1500,
    defaultAmountRub: 1190,
    envPriceKey: "YOOKASSA_GOLD_1500_RUB",
  },
};

console.log(`Player payments database path: ${PAYMENT_DB_PATH}`);

function readPaymentDb(): PaymentDb {
  try {
    if (!existsSync(PAYMENT_DB_PATH)) return {};

    const rawValue = readFileSync(PAYMENT_DB_PATH, "utf8");
    const parsed = JSON.parse(rawValue) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as PaymentDb)
      : {};
  } catch (error) {
    console.warn("Failed to read player payments database", error);
    return {};
  }
}

function writePaymentDb(db: PaymentDb) {
  writeJsonFileAtomic(PAYMENT_DB_PATH, db);
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Не настроена переменная окружения ${name}`);
  }

  return value;
}

function getProductPriceRub(product: GoldProduct): number {
  const rawValue = process.env[product.envPriceKey]?.trim();
  const value = rawValue ? Number(rawValue) : product.defaultAmountRub;

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Некорректная цена ${product.envPriceKey}`);
  }

  return Math.round(value * 100) / 100;
}

function getOptionalProductPriceRub(product: GoldProduct): number | null {
  try {
    return getProductPriceRub(product);
  } catch {
    return null;
  }
}

function formatRubAmount(value: number): string {
  return value.toFixed(2);
}

function getBasicAuthHeader(): string {
  const shopId = getRequiredEnv("YOOKASSA_SHOP_ID");
  const secretKey = getRequiredEnv("YOOKASSA_SECRET_KEY");
  const credentials = Buffer.from(`${shopId}:${secretKey}`, "utf8").toString(
    "base64"
  );

  return `Basic ${credentials}`;
}

function getKnownProduct(productId: string): GoldProduct {
  const product = GOLD_PRODUCTS[productId as GoldProductId];
  if (!product) {
    throw new Error("Товар магазина не найден");
  }

  return product;
}

async function requestYookassaPayment(
  path: string,
  init?: RequestInit
): Promise<YookassaPaymentResponse> {
  const response = await fetch(`${YOOKASSA_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: getBasicAuthHeader(),
      ...(init?.headers ?? {}),
    },
  });

  const responseText = await response.text();
  const parsed = responseText
    ? (JSON.parse(responseText) as YookassaPaymentResponse)
    : {};

  if (!response.ok) {
    throw new Error(
      `ЮKassa отклонила запрос: ${response.status} ${response.statusText}`
    );
  }

  return parsed;
}

function getMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

export class PaymentManager {
  private profiles = new PlayerProfileManager();

  getGoldCatalog(): GoldProductCatalogItem[] {
    return Object.values(GOLD_PRODUCTS).map((product) => ({
      id: product.id,
      goldTracks: product.goldTracks,
      amountRub: getOptionalProductPriceRub(product),
    }));
  }

  async createGoldPayment({
    playerId,
    productId,
    returnUrl,
  }: {
    playerId: string;
    productId: string;
    returnUrl: string;
  }): Promise<{
    paymentId: string;
    confirmationUrl: string;
    goldTracks: number;
    amountRub: number;
  }> {
    const safePlayerId = playerId.trim();
    if (!safePlayerId) {
      throw new Error("Профиль игрока не найден");
    }

    const product = getKnownProduct(productId);
    const amountRub = getProductPriceRub(product);
    const payment = await requestYookassaPayment("/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotence-Key": randomUUID(),
      },
      body: JSON.stringify({
        amount: {
          value: formatRubAmount(amountRub),
          currency: "RUB",
        },
        capture: true,
        confirmation: {
          type: "redirect",
          return_url: returnUrl,
        },
        description: `Panzershrek: ${product.goldTracks} золотых траков`,
        metadata: {
          playerId: safePlayerId,
          productId: product.id,
          goldTracks: String(product.goldTracks),
        },
      }),
    });

    if (!payment.id || !payment.confirmation?.confirmation_url) {
      throw new Error("ЮKassa не вернула ссылку подтверждения платежа");
    }

    const now = Date.now();
    const record: GoldPaymentRecord = {
      paymentId: payment.id,
      playerId: safePlayerId,
      productId: product.id,
      goldTracks: product.goldTracks,
      amountRub,
      status: "pending",
      yookassaStatus: payment.status ?? "pending",
      confirmationUrl: payment.confirmation.confirmation_url,
      createdAt: now,
      updatedAt: now,
      creditedAt: null,
    };
    const db = readPaymentDb();
    db[payment.id] = record;
    writePaymentDb(db);

    return {
      paymentId: payment.id,
      confirmationUrl: payment.confirmation.confirmation_url,
      goldTracks: product.goldTracks,
      amountRub,
    };
  }

  async handleYookassaWebhook(event: unknown): Promise<{
    processed: boolean;
    credited: boolean;
    paymentId: string | null;
  }> {
    if (!event || typeof event !== "object") {
      throw new Error("Некорректное уведомление ЮKassa");
    }

    const eventRecord = event as {
      event?: unknown;
      object?: { id?: unknown; status?: unknown };
    };
    const paymentId =
      typeof eventRecord.object?.id === "string"
        ? eventRecord.object.id
        : null;

    if (!paymentId) {
      throw new Error("В уведомлении ЮKassa нет payment id");
    }

    if (
      eventRecord.event !== "payment.succeeded" &&
      eventRecord.event !== "payment.canceled"
    ) {
      return { processed: false, credited: false, paymentId };
    }

    const verifiedPayment = await requestYookassaPayment(
      `/payments/${encodeURIComponent(paymentId)}`
    );
    const db = readPaymentDb();
    const record = db[paymentId];

    if (!record) {
      console.warn(`Payment ${paymentId} not found in local payment database`);
      return { processed: true, credited: false, paymentId };
    }

    const now = Date.now();
    record.yookassaStatus = verifiedPayment.status ?? record.yookassaStatus;
    record.updatedAt = now;

    if (verifiedPayment.status === "canceled") {
      record.status = "cancelled";
      writePaymentDb(db);
      return { processed: true, credited: false, paymentId };
    }

    if (verifiedPayment.status !== "succeeded") {
      writePaymentDb(db);
      return { processed: true, credited: false, paymentId };
    }

    const metadata = verifiedPayment.metadata;
    const metadataPlayerId = getMetadataString(metadata, "playerId");
    const metadataProductId = getMetadataString(metadata, "productId");

    if (
      metadataPlayerId !== record.playerId ||
      metadataProductId !== record.productId
    ) {
      throw new Error("Метаданные платежа ЮKassa не совпадают с записью сервера");
    }

    record.status = "succeeded";

    if (!record.creditedAt) {
      this.profiles.creditGoldTracks(
        record.playerId,
        record.goldTracks,
        `payment:${paymentId}`
      );
      record.creditedAt = now;
      writePaymentDb(db);
      return { processed: true, credited: true, paymentId };
    }

    writePaymentDb(db);
    return { processed: true, credited: false, paymentId };
  }
}
