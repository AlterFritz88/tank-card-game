package com.panzershrek.game;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import ru.rustore.sdk.pushclient.RuStorePushClient;
import ru.rustore.sdk.pushclient.common.logger.DefaultLogger;

public final class PanzershrekApplication extends Application {
    private static final String TAG = "PanzershrekPush";
    private static final String PROJECT_ID_META = "panzershrek.rustore.push.project_id";

    @Override
    public void onCreate() {
        super.onCreate();
        createRadioDuelNotificationChannel(this);
        initializeRuStorePush(this);
    }

    static boolean initializeRuStorePush(Application application) {
        if (RuStorePushClient.INSTANCE.isInitialized()) return true;

        String projectId = readPushProjectId(application);
        if (projectId.isEmpty()) {
            Log.w(TAG, "RuStore Push Project ID is not configured");
            return false;
        }

        try {
            RuStorePushClient.INSTANCE.init(
                application,
                projectId,
                new DefaultLogger(TAG)
            );
            return true;
        } catch (Exception error) {
            Log.e(TAG, "Unable to initialize RuStore Push SDK", error);
            return false;
        }
    }

    static void createRadioDuelNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        NotificationChannel channel = new NotificationChannel(
            context.getString(R.string.radio_duels_notification_channel_id),
            context.getString(R.string.radio_duels_notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(
            context.getString(R.string.radio_duels_notification_channel_description)
        );
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    private static String readPushProjectId(Context context) {
        try {
            ApplicationInfo info = context.getPackageManager().getApplicationInfo(
                context.getPackageName(),
                PackageManager.GET_META_DATA
            );
            if (info.metaData == null) return "";
            String projectId = info.metaData.getString(PROJECT_ID_META, "");
            return projectId == null ? "" : projectId.trim();
        } catch (PackageManager.NameNotFoundException error) {
            Log.e(TAG, "Unable to read RuStore Push Project ID", error);
            return "";
        }
    }
}
