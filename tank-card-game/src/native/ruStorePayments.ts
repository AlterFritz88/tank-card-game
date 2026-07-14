import { Capacitor, registerPlugin } from "@capacitor/core";
import type { GoldProductId } from "../network/profileClient";

export type RuStoreProduct = {
  productId: GoldProductId;
  type: string;
  amountLabel: string;
  price: number;
  currency: string;
  title: string;
  description: string;
};

export type RuStorePurchase = {
  productId: GoldProductId;
  purchaseId: string;
  invoiceId: string;
  purchaseType?: string;
  productType?: string;
  quantity?: number;
  sandbox?: boolean;
};

type RuStorePaymentsPlugin = {
  isAvailable(): Promise<{ available: boolean }>;
  getProducts(options: { productIds: GoldProductId[] }): Promise<{
    products: RuStoreProduct[];
  }>;
  purchaseProduct(options: {
    productId: GoldProductId;
    playerId: string;
  }): Promise<RuStorePurchase>;
  acknowledgePurchase(options: {
    purchaseId: string;
    playerId: string;
  }): Promise<{ acknowledgementState: string }>;
  getPaidPurchases(): Promise<{ purchases: RuStorePurchase[] }>;
};

const RuStorePayments =
  registerPlugin<RuStorePaymentsPlugin>("RuStorePayments");

export function isRuStorePlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function isRuStorePaymentsAvailable(): Promise<boolean> {
  if (!isRuStorePlatform()) return false;

  try {
    const result = await RuStorePayments.isAvailable();
    return result.available;
  } catch {
    return false;
  }
}

export async function loadRuStoreProducts(
  productIds: GoldProductId[]
): Promise<RuStoreProduct[]> {
  const result = await RuStorePayments.getProducts({ productIds });
  return result.products;
}

export function purchaseRuStoreProduct(
  productId: GoldProductId,
  playerId: string
): Promise<RuStorePurchase> {
  return RuStorePayments.purchaseProduct({ productId, playerId });
}

export function acknowledgeRuStorePurchase(
  purchaseId: string,
  playerId: string
): Promise<{ acknowledgementState: string }> {
  return RuStorePayments.acknowledgePurchase({ purchaseId, playerId });
}

export async function loadPendingRuStorePurchases(): Promise<RuStorePurchase[]> {
  const result = await RuStorePayments.getPaidPurchases();
  return result.purchases;
}
