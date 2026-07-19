import { randomUUID } from "node:crypto";
import { resolveWritableDbPath } from "./storagePath";
import { JsonDocumentStore } from "./sqliteStore";
import { PlayerProfileManager } from "./playerProfiles";
import { PlayerAccountManager } from "./playerAccounts";
import {
  FIRST_PANTHERS_CAMPAIGN_ID,
  FIRST_PANTHERS_CAMPAIGN_PRICE_RUB,
  FIRST_PANTHERS_CAMPAIGN_PRODUCT_ID,
  type CampaignPaymentProductId,
} from "../../tank-card-game/src/game/campaigns";

export type GoldProductId =
  | "gold-100"
  | "gold-500"
  | "gold-1500"
  | "first-player-pack"
  | CampaignPaymentProductId;

type GoldProduct = {
  id: GoldProductId;
  goldTracks: number;
  defaultAmountRub: number;
  envPriceKey: string;
  title?: string;
  bundle?: "first-player";
  campaignId?: string;
};

export type GoldProductCatalogItem = {
  id: GoldProductId;
  goldTracks: number;
  amountRub: number | null;
  title: string | null;
  campaignId: string | null;
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
  productTitle?: string | null;
  campaignId?: string | null;
};

type PaymentDb = Record<string, GoldPaymentRecord>;

export type GoldPaymentAdminView = Omit<GoldPaymentRecord, "confirmationUrl"> & {
  confirmationUrlPresent: boolean;
};

export type YookassaConfigStatus = {
  configured: boolean;
  shopIdConfigured: boolean;
  secretKeyConfigured: boolean;
  receiptEnabled: boolean;
  vatCode: number;
  apiBase: string;
  webhookSecretConfigured: boolean;
  products: GoldProductCatalogItem[];
};

export type PaymentAdminOverview = {
  config: YookassaConfigStatus;
  payments: GoldPaymentAdminView[];
};

type YookassaPaymentResponse = {
  id?: string;
  status?: string;
  confirmation?: {
    confirmation_url?: string;
  };
  metadata?: Record<string, unknown>;
};

type YookassaErrorResponse = {
  type?: string;
  id?: string;
  code?: string;
  description?: string;
  parameter?: string;
};

const PAYMENT_DB_PATH = resolveWritableDbPath(
  process.env.PLAYER_PAYMENT_DB_PATH,
  "player-payments.json",
  "Player payments"
);

const YOOKASSA_API_BASE =
  process.env.YOOKASSA_API_BASE?.trim() || "https://api.yookassa.ru/v3";

// Самозанятый (НПД) обязан выдавать чек, поэтому по умолчанию чек включён.
// Можно отключить через YOOKASSA_RECEIPT_ENABLED=false для тестового магазина
// без подключённой фискализации.
const YOOKASSA_RECEIPT_ENABLED =
  process.env.YOOKASSA_RECEIPT_ENABLED?.trim().toLowerCase() !== "false";

// Код ставки НДС в чеке ЮKassa. Для самозанятого на НПД это «без НДС» — код 1.
function getReceiptVatCode(): number {
  const rawValue = process.env.YOOKASSA_VAT_CODE?.trim();
  const value = rawValue ? Number(rawValue) : 1;

  return Number.isInteger(value) && value >= 1 && value <= 6 ? value : 1;
}

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
  "first-player-pack": {
    id: "first-player-pack",
    goldTracks: 777,
    defaultAmountRub: 199,
    envPriceKey: "YOOKASSA_FIRST_PLAYER_PACK_RUB",
    title: "Набор первого игрока",
    bundle: "first-player",
  },
  [FIRST_PANTHERS_CAMPAIGN_PRODUCT_ID]: {
    id: FIRST_PANTHERS_CAMPAIGN_PRODUCT_ID,
    goldTracks: 0,
    defaultAmountRub: FIRST_PANTHERS_CAMPAIGN_PRICE_RUB,
    envPriceKey: "YOOKASSA_FIRST_PANTHERS_CAMPAIGN_RUB",
    title: "Кампания «Первые пантеры»",
    campaignId: FIRST_PANTHERS_CAMPAIGN_ID,
  },
};

console.log(`Player payments database path: ${PAYMENT_DB_PATH}`);
const paymentStore = new JsonDocumentStore<PaymentDb>(
  "player-payments",
  {},
  PAYMENT_DB_PATH
);

function readPaymentDb(): PaymentDb {
  const parsed = paymentStore.read();
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed
    : {};
}

function writePaymentDb(db: PaymentDb) {
  paymentStore.write(db);
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

function isEnvConfigured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
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
    ? (JSON.parse(responseText) as YookassaPaymentResponse & YookassaErrorResponse)
    : {};

  if (!response.ok) {
    const details = [
      parsed.description,
      parsed.code ? `код: ${parsed.code}` : null,
      parsed.parameter ? `параметр: ${parsed.parameter}` : null,
      parsed.id ? `id: ${parsed.id}` : null,
    ]
      .filter(Boolean)
      .join("; ");

    throw new Error(
      details
        ? `ЮKassa отклонила запрос: ${details}`
        : `ЮKassa отклонила запрос: ${response.status} ${response.statusText}`
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

type YookassaReceipt = {
  customer: { email: string };
  items: Array<{
    description: string;
    quantity: string;
    amount: { value: string; currency: "RUB" };
    vat_code: number;
    payment_subject: "service";
    payment_mode: "full_payment";
  }>;
};

function buildReceipt(
  email: string,
  product: GoldProduct,
  amountRub: number
): YookassaReceipt {
  return {
    customer: { email },
    items: [
      {
        // Описание в чеке ограничено 128 символами.
        description: (product.title ?? `Золотые траки PanzerShrek: ${product.goldTracks} шт.`).slice(
          0,
          128
        ),
        quantity: "1.00",
        amount: {
          value: formatRubAmount(amountRub),
          currency: "RUB",
        },
        vat_code: getReceiptVatCode(),
        payment_subject: "service",
        payment_mode: "full_payment",
      },
    ],
  };
}

export class PaymentManager {
  private profiles = new PlayerProfileManager();
  private accounts = new PlayerAccountManager();

  getGoldCatalog(): GoldProductCatalogItem[] {
    return Object.values(GOLD_PRODUCTS).map((product) => ({
      id: product.id,
      goldTracks: product.goldTracks,
      amountRub: getOptionalProductPriceRub(product),
      title: product.title ?? null,
      campaignId: product.campaignId ?? null,
    }));
  }

  getConfigStatus(): YookassaConfigStatus {
    const shopIdConfigured = isEnvConfigured("YOOKASSA_SHOP_ID");
    const secretKeyConfigured = isEnvConfigured("YOOKASSA_SECRET_KEY");

    return {
      configured: shopIdConfigured && secretKeyConfigured,
      shopIdConfigured,
      secretKeyConfigured,
      receiptEnabled: YOOKASSA_RECEIPT_ENABLED,
      vatCode: getReceiptVatCode(),
      apiBase: YOOKASSA_API_BASE,
      webhookSecretConfigured: isEnvConfigured("YOOKASSA_WEBHOOK_SECRET"),
      products: this.getGoldCatalog(),
    };
  }

  listPayments(limit = 80): GoldPaymentAdminView[] {
    return Object.values(readPaymentDb())
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, limit)
      .map(({ confirmationUrl, ...payment }) => ({
        ...payment,
        confirmationUrlPresent: Boolean(confirmationUrl),
      }));
  }

  getAdminOverview(): PaymentAdminOverview {
    return {
      config: this.getConfigStatus(),
      payments: this.listPayments(),
    };
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
    if (
      product.bundle === "first-player" &&
      this.profiles.getProfile(safePlayerId, { touchActivity: false }).cardBackId === "first_player"
    ) {
      throw new Error("Набор первого игрока уже куплен");
    }
    if (
      product.campaignId &&
      this.profiles
        .getProfile(safePlayerId, { touchActivity: false })
        .unlockedCampaignIds.includes(product.campaignId)
    ) {
      throw new Error("Кампания уже куплена");
    }

    // Для самозанятого (НПД) ЮKassa должна сформировать чек, а для чека нужен
    // контакт покупателя. Берём email из аккаунта; гостям без email продажа
    // запрещена, иначе фискальный чек выдать невозможно.
    let receipt: YookassaReceipt | undefined;
    if (YOOKASSA_RECEIPT_ENABLED) {
      const email = this.accounts.getEmailByUserId(safePlayerId);
      if (!email) {
        throw new Error(
          "Для покупки войдите в аккаунт с подтверждённым e-mail — он нужен для отправки кассового чека"
        );
      }

      receipt = buildReceipt(email, product, amountRub);
    }

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
        description: product.title ? `Panzershrek: ${product.title}` : `Panzershrek: ${product.goldTracks} золотых траков`,
        metadata: {
          playerId: safePlayerId,
          productId: product.id,
          goldTracks: String(product.goldTracks),
        },
        ...(receipt ? { receipt } : {}),
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
      productTitle: product.title ?? null,
      campaignId: product.campaignId ?? null,
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
      const product = getKnownProduct(record.productId);
      if (product.campaignId) {
        this.profiles.grantCampaignAccess(
          record.playerId,
          product.campaignId
        );
      } else if (product.bundle === "first-player") {
        this.profiles.grantFirstPlayerPack(record.playerId, `payment:${paymentId}`);
      } else {
        this.profiles.creditGoldTracks(record.playerId, record.goldTracks, `payment:${paymentId}`);
      }
      record.creditedAt = now;
      writePaymentDb(db);
      return { processed: true, credited: true, paymentId };
    }

    writePaymentDb(db);
    return { processed: true, credited: false, paymentId };
  }

  async completeRuStoreGoldPurchase({
    playerId,
    productId,
    purchaseId,
    invoiceId,
  }: {
    playerId: string;
    productId: string;
    purchaseId: string;
    invoiceId?: string;
  }): Promise<{
    paymentId: string;
    credited: boolean;
    goldTracks: number;
    profile: ReturnType<PlayerProfileManager["creditGoldTracks"]>;
  }> {
    const safePlayerId = playerId.trim();
    const safePurchaseId = purchaseId.trim();
    const safeInvoiceId = invoiceId?.trim() ?? "";

    if (!safePlayerId) {
      throw new Error("Профиль игрока не найден");
    }

    if (!safePurchaseId) {
      throw new Error("RuStore purchaseId не найден");
    }

    const product = getKnownProduct(productId);
    const amountRub = getProductPriceRub(product);
    const paymentId = `rustore:${safePurchaseId}`;
    const db = readPaymentDb();
    const existing = db[paymentId];

    if (existing) {
      if (
        existing.playerId !== safePlayerId ||
        existing.productId !== product.id
      ) {
        throw new Error("Данные покупки RuStore не совпадают с записью сервера");
      }

      return {
        paymentId,
        credited: false,
        goldTracks: existing.goldTracks,
        profile: this.profiles.getProfile(safePlayerId),
      };
    }

    if (
      product.bundle === "first-player" &&
      this.profiles.getProfile(safePlayerId, { touchActivity: false }).cardBackId === "first_player"
    ) {
      throw new Error("Набор первого игрока уже куплен");
    }
    if (
      product.campaignId &&
      this.profiles
        .getProfile(safePlayerId, { touchActivity: false })
        .unlockedCampaignIds.includes(product.campaignId)
    ) {
      throw new Error("Кампания уже куплена");
    }

    const now = Date.now();
    const record: GoldPaymentRecord = {
      paymentId,
      playerId: safePlayerId,
      productId: product.id,
      goldTracks: product.goldTracks,
      amountRub,
      status: "succeeded",
      yookassaStatus: safeInvoiceId
        ? `rustore:succeeded:${safeInvoiceId}`
        : "rustore:succeeded",
      confirmationUrl: null,
      createdAt: now,
      updatedAt: now,
      creditedAt: now,
      productTitle: product.title ?? null,
      campaignId: product.campaignId ?? null,
    };

    const profile = product.campaignId
      ? this.profiles.grantCampaignAccess(safePlayerId, product.campaignId)
      : product.bundle === "first-player"
        ? this.profiles.grantFirstPlayerPack(safePlayerId, paymentId)
        : this.profiles.creditGoldTracks(safePlayerId, product.goldTracks, paymentId);
    db[paymentId] = record;
    writePaymentDb(db);

    return {
      paymentId,
      credited: true,
      goldTracks: product.goldTracks,
      profile,
    };
  }
}
