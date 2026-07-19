package com.panzershrek.game;

import android.util.Log;

import java.util.List;

import ru.rustore.sdk.pushclient.messaging.exception.RuStorePushClientException;
import ru.rustore.sdk.pushclient.messaging.model.RemoteMessage;
import ru.rustore.sdk.pushclient.messaging.service.RuStoreMessagingService;

public final class PanzershrekRuStoreMessagingService extends RuStoreMessagingService {
    private static final String TAG = "PanzershrekPush";

    @Override
    public void onNewToken(String token) {
        RuStorePushPlugin.notifyTokenChanged(token);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        // Notification payloads are displayed by RuStore Push SDK itself.
    }

    @Override
    public void onDeletedMessages() {
        Log.w(TAG, "One or more RuStore push messages expired before delivery");
    }

    @Override
    public void onError(List<? extends RuStorePushClientException> errors) {
        for (RuStorePushClientException error : errors) {
            Log.w(TAG, "RuStore Push SDK error", error);
        }
    }
}
