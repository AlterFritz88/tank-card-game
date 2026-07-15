package com.panzershrek.game;

import android.app.Activity;
import android.util.Log;

import androidx.appcompat.app.AlertDialog;

import ru.rustore.sdk.appupdate.listener.InstallStateUpdateListener;
import ru.rustore.sdk.appupdate.manager.RuStoreAppUpdateManager;
import ru.rustore.sdk.appupdate.manager.factory.RuStoreAppUpdateManagerFactory;
import ru.rustore.sdk.appupdate.model.AppUpdateInfo;
import ru.rustore.sdk.appupdate.model.AppUpdateOptions;
import ru.rustore.sdk.appupdate.model.AppUpdateType;
import ru.rustore.sdk.appupdate.model.InstallStatus;
import ru.rustore.sdk.appupdate.model.UpdateAvailability;

final class RuStoreUpdateNotifier {
    private static final String TAG = "RuStoreUpdate";

    private final Activity activity;
    private final RuStoreAppUpdateManager updateManager;
    private final AppUpdateOptions flexibleUpdateOptions =
        new AppUpdateOptions.Builder()
            .appUpdateType(AppUpdateType.FLEXIBLE)
            .build();
    private final InstallStateUpdateListener installStateListener = state -> {
        if (state.getInstallStatus() == InstallStatus.DOWNLOADED) {
            showInstallPrompt();
        } else if (
            state.getInstallStatus() == InstallStatus.FAILED
                || state.getInstallStatus() == InstallStatus.DOWNLOAD_INTERRUPTED
        ) {
            unregisterInstallStateListener();
        }
    };

    private boolean updateCheckStarted;
    private boolean updatePromptVisible;
    private boolean installPromptVisible;
    private boolean installStateListenerRegistered;

    RuStoreUpdateNotifier(Activity activity) {
        this.activity = activity;
        updateManager = RuStoreAppUpdateManagerFactory.INSTANCE.create(activity);
    }

    void checkForUpdate() {
        if (updateCheckStarted || activity.isFinishing() || activity.isDestroyed()) {
            return;
        }

        updateCheckStarted = true;
        updateManager
            .getAppUpdateInfo()
            .addOnSuccessListener(this::handleUpdateInfo)
            .addOnFailureListener(error -> Log.d(TAG, "Update check is unavailable", error));
    }

    void destroy() {
        unregisterInstallStateListener();
    }

    private void handleUpdateInfo(AppUpdateInfo updateInfo) {
        if (updateInfo.getInstallStatus() == InstallStatus.DOWNLOADED) {
            showInstallPrompt();
            return;
        }

        if (updateInfo.getUpdateAvailability() == UpdateAvailability.UPDATE_AVAILABLE) {
            showUpdatePrompt(updateInfo);
            return;
        }

        if (
            updateInfo.getUpdateAvailability()
                == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
            && updateInfo.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)
        ) {
            startUpdate(updateInfo, AppUpdateType.IMMEDIATE);
        }
    }

    private void showUpdatePrompt(AppUpdateInfo updateInfo) {
        activity.runOnUiThread(() -> {
            if (
                updatePromptVisible
                    || activity.isFinishing()
                    || activity.isDestroyed()
            ) {
                return;
            }

            updatePromptVisible = true;
            String versionName = updateInfo.getAvailableVersionName();
            String message = versionName == null || versionName.trim().isEmpty()
                ? "В RuStore доступна новая версия игры. Обновитесь, чтобы получить исправления и новые возможности."
                : "В RuStore доступна версия " + versionName
                    + ". Обновитесь, чтобы получить исправления и новые возможности.";

            AlertDialog dialog = new AlertDialog.Builder(activity)
                .setTitle("Доступно обновление")
                .setMessage(message)
                .setNegativeButton("Позже", null)
                .setPositiveButton("Обновить", (ignoredDialog, ignoredButton) -> {
                    int updateType = updateInfo.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)
                        ? AppUpdateType.IMMEDIATE
                        : AppUpdateType.FLEXIBLE;
                    startUpdate(updateInfo, updateType);
                })
                .create();
            dialog.setOnDismissListener(ignored -> updatePromptVisible = false);
            dialog.show();
        });
    }

    private void startUpdate(AppUpdateInfo updateInfo, int updateType) {
        if (!updateInfo.isUpdateTypeAllowed(updateType)) {
            Log.d(TAG, "The available update type is not allowed by RuStore");
            return;
        }

        AppUpdateOptions options = new AppUpdateOptions.Builder()
            .appUpdateType(updateType)
            .build();

        if (updateType == AppUpdateType.FLEXIBLE) {
            registerInstallStateListener();
        }

        updateManager
            .startUpdateFlow(updateInfo, options)
            .addOnFailureListener(error -> {
                if (updateType == AppUpdateType.FLEXIBLE) {
                    unregisterInstallStateListener();
                }
                Log.d(TAG, "RuStore update flow is unavailable", error);
            });
    }

    private void showInstallPrompt() {
        activity.runOnUiThread(() -> {
            if (
                installPromptVisible
                    || activity.isFinishing()
                    || activity.isDestroyed()
            ) {
                return;
            }

            installPromptVisible = true;
            AlertDialog dialog = new AlertDialog.Builder(activity)
                .setTitle("Обновление загружено")
                .setMessage("Новая версия игры готова к установке.")
                .setNegativeButton("Позже", null)
                .setPositiveButton("Установить", (ignoredDialog, ignoredButton) -> {
                    updateManager
                        .completeUpdate(flexibleUpdateOptions)
                        .addOnFailureListener(
                            error -> Log.d(TAG, "RuStore update installation is unavailable", error)
                        );
                })
                .create();
            dialog.setOnDismissListener(ignored -> installPromptVisible = false);
            dialog.show();
        });
    }

    private void registerInstallStateListener() {
        if (installStateListenerRegistered) {
            return;
        }

        updateManager.registerListener(installStateListener);
        installStateListenerRegistered = true;
    }

    private void unregisterInstallStateListener() {
        if (!installStateListenerRegistered) {
            return;
        }

        updateManager.unregisterListener(installStateListener);
        installStateListenerRegistered = false;
    }
}
