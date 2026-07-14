package com.panzershrek.game;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

import ru.rustore.sdk.core.util.RuStoreUtils;
import ru.rustore.sdk.pay.ProductInteractor;
import ru.rustore.sdk.pay.PurchaseInteractor;
import ru.rustore.sdk.pay.RuStorePayClient;
import ru.rustore.sdk.pay.model.AcknowledgementState;
import ru.rustore.sdk.pay.model.AppUserId;
import ru.rustore.sdk.pay.model.DeveloperPayload;
import ru.rustore.sdk.pay.model.PreferredPurchaseType;
import ru.rustore.sdk.pay.model.Product;
import ru.rustore.sdk.pay.model.ProductId;
import ru.rustore.sdk.pay.model.ProductPurchase;
import ru.rustore.sdk.pay.model.ProductPurchaseParams;
import ru.rustore.sdk.pay.model.ProductPurchaseResult;
import ru.rustore.sdk.pay.model.ProductPurchaseStatus;
import ru.rustore.sdk.pay.model.ProductType;
import ru.rustore.sdk.pay.model.Purchase;
import ru.rustore.sdk.pay.model.PurchaseId;
import ru.rustore.sdk.pay.model.Quantity;
import ru.rustore.sdk.pay.model.SdkTheme;

@CapacitorPlugin(name = "RuStorePayments")
public class RuStorePaymentsPlugin extends Plugin {
    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", RuStoreUtils.INSTANCE.isRuStoreInstalled(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        JSArray rawProductIds = call.getArray("productIds", new JSArray());
        List<ProductId> productIds = new ArrayList<>();

        for (int index = 0; index < rawProductIds.length(); index++) {
            String productId = rawProductIds.optString(index, "").trim();
            if (!productId.isEmpty()) {
                productIds.add(new ProductId(productId));
            }
        }

        if (productIds.isEmpty()) {
            call.reject("Product ids are empty");
            return;
        }

        try {
            ProductInteractor productInteractor =
                RuStorePayClient.Companion.getInstance().getProductInteractor();
            productInteractor
                .getProducts(productIds)
                .addOnSuccessListener(products -> {
                    JSArray items = new JSArray();
                    for (Product product : products) {
                        items.put(toProductJson(product));
                    }

                    JSObject result = new JSObject();
                    result.put("products", items);
                    call.resolve(result);
                })
                .addOnFailureListener(throwable -> reject(call, throwable));
        } catch (Exception error) {
            call.reject(getErrorMessage(error), error);
        }
    }

    @PluginMethod
    public void purchaseProduct(PluginCall call) {
        String productId = call.getString("productId", "").trim();
        String playerId = call.getString("playerId", "").trim();

        if (productId.isEmpty()) {
            call.reject("Product id is empty");
            return;
        }

        try {
            ProductPurchaseParams params = new ProductPurchaseParams(
                new ProductId(productId),
                new Quantity(1),
                null,
                playerId.isEmpty() ? null : new DeveloperPayload(playerId),
                playerId.isEmpty() ? null : new AppUserId(playerId),
                null
            );
            PurchaseInteractor purchaseInteractor =
                RuStorePayClient.Companion.getInstance().getPurchaseInteractor();
            purchaseInteractor
                .purchase(params, PreferredPurchaseType.ONE_STEP, SdkTheme.LIGHT, null)
                .addOnSuccessListener(result -> call.resolve(toPurchaseResultJson(result)))
                .addOnFailureListener(throwable -> reject(call, throwable));
        } catch (Exception error) {
            call.reject(getErrorMessage(error), error);
        }
    }

    @PluginMethod
    public void acknowledgePurchase(PluginCall call) {
        String purchaseId = call.getString("purchaseId", "").trim();
        String playerId = call.getString("playerId", "").trim();

        if (purchaseId.isEmpty()) {
            call.reject("Purchase id is empty");
            return;
        }

        try {
            PurchaseInteractor purchaseInteractor =
                RuStorePayClient.Companion.getInstance().getPurchaseInteractor();
            purchaseInteractor
                .updateAcknowledgementState(
                    new PurchaseId(purchaseId),
                    AcknowledgementState.ACKNOWLEDGED,
                    playerId.isEmpty() ? null : new DeveloperPayload(playerId)
                )
                .addOnSuccessListener(state -> {
                    JSObject result = new JSObject();
                    result.put("acknowledgementState", state.name());
                    call.resolve(result);
                })
                .addOnFailureListener(throwable -> reject(call, throwable));
        } catch (Exception error) {
            call.reject(getErrorMessage(error), error);
        }
    }

    @PluginMethod
    public void getPaidPurchases(PluginCall call) {
        try {
            PurchaseInteractor purchaseInteractor =
                RuStorePayClient.Companion.getInstance().getPurchaseInteractor();
            purchaseInteractor
                .getPurchases(
                    ProductType.CONSUMABLE_PRODUCT,
                    ProductPurchaseStatus.PAID,
                    AcknowledgementState.PENDING
                )
                .addOnSuccessListener(purchases -> {
                    JSArray items = new JSArray();
                    for (Purchase purchase : purchases) {
                        if (purchase instanceof ProductPurchase) {
                            items.put(toProductPurchaseJson((ProductPurchase) purchase));
                        }
                    }

                    JSObject result = new JSObject();
                    result.put("purchases", items);
                    call.resolve(result);
                })
                .addOnFailureListener(throwable -> reject(call, throwable));
        } catch (Exception error) {
            call.reject(getErrorMessage(error), error);
        }
    }

    private JSObject toProductJson(Product product) {
        JSObject item = new JSObject();
        item.put("productId", product.getProductId().getValue());
        item.put("type", product.getType().name());
        item.put("amountLabel", product.getAmountLabel().getValue());
        item.put("price", product.getPrice().getValue());
        item.put("currency", product.getCurrency().getValue());
        item.put("title", product.getTitle().getValue());
        item.put("description", product.getDescription().getValue());
        return item;
    }

    private JSObject toPurchaseResultJson(ProductPurchaseResult purchase) {
        JSObject result = new JSObject();
        result.put("productId", purchase.getProductId().getValue());
        result.put("purchaseId", purchase.getPurchaseId().getValue());
        result.put("invoiceId", purchase.getInvoiceId().getValue());
        result.put("purchaseType", purchase.getPurchaseType().name());
        result.put("productType", purchase.getProductType().name());
        result.put("quantity", purchase.getQuantity().getValue());
        result.put("sandbox", purchase.getSandbox());
        return result;
    }

    private JSObject toProductPurchaseJson(ProductPurchase purchase) {
        JSObject result = new JSObject();
        result.put("productId", purchase.getProductId().getValue());
        result.put("purchaseId", purchase.getPurchaseId().getValue());
        result.put("invoiceId", purchase.getInvoiceId().getValue());
        result.put("status", purchase.getStatus().toString());
        result.put("productType", purchase.getProductType().name());
        result.put("acknowledgementState", purchase.getAcknowledgementState().name());
        result.put("quantity", purchase.getQuantity().getValue());
        result.put("sandbox", purchase.getSandbox());
        return result;
    }

    private void reject(PluginCall call, Throwable throwable) {
        Exception exception =
            throwable instanceof Exception
                ? (Exception) throwable
                : new Exception(throwable);
        call.reject(getErrorMessage(throwable), exception);
    }

    private String getErrorMessage(Throwable throwable) {
        String message = throwable.getMessage();
        return message == null || message.trim().isEmpty()
            ? throwable.getClass().getSimpleName()
            : message;
    }
}
