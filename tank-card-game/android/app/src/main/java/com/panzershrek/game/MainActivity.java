package com.panzershrek.game;

import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

import ru.rustore.sdk.pay.IntentInteractor;
import ru.rustore.sdk.pay.RuStorePayClient;
import ru.rustore.sdk.pay.model.SdkTheme;

public class MainActivity extends BridgeActivity {
    private RuStoreUpdateNotifier updateNotifier;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(RuStorePaymentsPlugin.class);
        super.onCreate(savedInstanceState);
        enableImmersiveFullscreen();
        registerWebViewRendererRecovery();
        updateNotifier = new RuStoreUpdateNotifier(this);
        getWindow().getDecorView().postDelayed(updateNotifier::checkForUpdate, 1500L);
        if (savedInstanceState == null) {
            proceedRuStorePayIntent(getIntent());
        }
        getOnBackPressedDispatcher().addCallback(
            this,
            new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    dispatchAndroidBackToWeb();
                }
            }
        );
    }

    @Override
    public void onResume() {
        super.onResume();
        enableImmersiveFullscreen();
        restoreWebViewAfterResume();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        proceedRuStorePayIntent(intent);
    }

    @Override
    public void onDestroy() {
        if (updateNotifier != null) {
            updateNotifier.destroy();
        }
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);

        if (hasFocus) {
            enableImmersiveFullscreen();
        }
    }

    @Override
    public void onBackPressed() {
        dispatchAndroidBackToWeb();
    }

    private void dispatchAndroidBackToWeb() {
        if (getBridge() != null) {
            getBridge().triggerWindowJSEvent("panzershrekAndroidBack");
        }
    }

    private void restoreWebViewAfterResume() {
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }

        WebView webView = getBridge().getWebView();
        webView.onResume();
        webView.resumeTimers();
        webView.setVisibility(View.VISIBLE);
        webView.setEnabled(true);
        webView.setAlpha(1f);
        webView.requestFocus(View.FOCUS_DOWN);
        webView.post(() -> {
            if (isFinishing() || isDestroyed() || getBridge() == null) {
                return;
            }

            webView.requestLayout();
            webView.invalidate();
            getBridge().triggerWindowJSEvent("panzershrekAndroidResume");
        });
    }

    private void registerWebViewRendererRecovery() {
        if (getBridge() == null) {
            return;
        }

        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(
                WebView webView,
                RenderProcessGoneDetail detail
            ) {
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) {
                        return;
                    }

                    if (webView.getParent() instanceof ViewGroup) {
                        ((ViewGroup) webView.getParent()).removeView(webView);
                    }
                    webView.destroy();
                    recreate();
                });
                return true;
            }
        });
    }

    private void proceedRuStorePayIntent(Intent intent) {
        try {
            IntentInteractor intentInteractor =
                RuStorePayClient.Companion.getInstance().getIntentInteractor();
            intentInteractor.proceedIntent(intent, SdkTheme.LIGHT);
        } catch (Exception ignored) {
            // RuStore client is unavailable until the app is installed through RuStore.
        }
    }

    private void enableImmersiveFullscreen() {
        Window window = getWindow();

        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attributes = window.getAttributes();
            attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(attributes);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);

            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }

            return;
        }

        window.getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }
}
