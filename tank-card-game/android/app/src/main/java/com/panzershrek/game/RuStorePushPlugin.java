package com.panzershrek.game;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import ru.rustore.sdk.pushclient.RuStorePushClient;

@CapacitorPlugin(
    name = "RuStorePush",
    permissions = @Permission(
        strings = { Manifest.permission.POST_NOTIFICATIONS },
        alias = RuStorePushPlugin.NOTIFICATIONS_PERMISSION
    )
)
public final class RuStorePushPlugin extends Plugin {
    static final String NOTIFICATIONS_PERMISSION = "receive";
    private static final String OPEN_RADIO_DUELS_ACTION =
        "com.panzershrek.game.OPEN_RADIO_DUELS";
    private static volatile RuStorePushPlugin activeInstance;

    @Override
    public void load() {
        activeInstance = this;
        PanzershrekApplication.createRadioDuelNotificationChannel(getContext());
        handleRadioDuelIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleRadioDuelIntent(intent);
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            resolveGranted(call);
            return;
        }
        super.checkPermissions(call);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            getPermissionState(NOTIFICATIONS_PERMISSION) == PermissionState.GRANTED
        ) {
            resolveGranted(call);
            return;
        }
        requestPermissionForAlias(
            NOTIFICATIONS_PERMISSION,
            call,
            "notificationsPermissionCallback"
        );
    }

    @PermissionCallback
    private void notificationsPermissionCallback(PluginCall call) {
        checkPermissions(call);
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        if (!PanzershrekApplication.initializeRuStorePush(getActivity().getApplication())) {
            call.reject("RuStore Push Project ID is not configured");
            return;
        }

        try {
            RuStorePushClient.INSTANCE
                .getToken()
                .addOnSuccessListener(token -> {
                    JSObject result = new JSObject();
                    result.put("token", token);
                    call.resolve(result);
                })
                .addOnFailureListener(error -> call.reject(errorMessage(error), asException(error)));
        } catch (Exception error) {
            call.reject(errorMessage(error), error);
        }
    }

    static void notifyTokenChanged(String token) {
        RuStorePushPlugin plugin = activeInstance;
        if (plugin == null || token == null || token.trim().isEmpty()) return;

        plugin.getActivity().runOnUiThread(() -> {
            JSObject event = new JSObject();
            event.put("token", token);
            plugin.notifyListeners("tokenChanged", event, true);
        });
    }

    private void handleRadioDuelIntent(Intent intent) {
        if (intent == null || !OPEN_RADIO_DUELS_ACTION.equals(intent.getAction())) return;

        JSObject event = new JSObject();
        Bundle extras = intent.getExtras();
        if (extras != null) {
            String duelId = extras.getString("duelId");
            if (duelId != null && !duelId.trim().isEmpty()) {
                event.put("duelId", duelId);
            }
        }
        notifyListeners("notificationActionPerformed", event, true);
        intent.setAction(null);
    }

    private void resolveGranted(PluginCall call) {
        JSObject result = new JSObject();
        result.put("receive", "granted");
        call.resolve(result);
    }

    private static Exception asException(Throwable throwable) {
        return throwable instanceof Exception
            ? (Exception) throwable
            : new Exception(throwable);
    }

    private static String errorMessage(Throwable throwable) {
        String message = throwable.getMessage();
        return message == null || message.trim().isEmpty()
            ? throwable.getClass().getSimpleName()
            : message;
    }
}
