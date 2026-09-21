package com.activepause.timer;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private static final int PERMISSION_REQUEST_NOTIFICATION = 101;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        setupWebView();

        checkNotificationPermission();

        // Cargar aplicación web empaquetada
        webView.loadUrl("file:///android_asset/web/index.html");

        handleIntent(getIntent());
    }

    private void setupWebView() {
        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());

        // Inyectar puente JavaScript <-> Android Nativo
        webView.addJavascriptInterface(new AndroidBridge(this), "AndroidBridge");
    }

    private void checkNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                        this,
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        PERMISSION_REQUEST_NOTIFICATION
                );
            }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        String action = intent.getAction();
        if ("ACTION_NATIVE_BREAK".equals(action)) {
            webView.evaluateJavascript("if (window.onNativeAction) window.onNativeAction('break');", null);
        } else if ("ACTION_NATIVE_END_DAY".equals(action)) {
            webView.evaluateJavascript("if (window.onNativeAction) window.onNativeAction('end_day');", null);
        }
    }

    // --- PUENTE NATIVO PARA JAVASCRIPT ---
    public class AndroidBridge {
        private final Context context;

        public AndroidBridge(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public void startStudyService(int seconds) {
            Intent intent = new Intent(context, TimerService.class);
            intent.setAction(TimerService.ACTION_START_STUDY);
            intent.putExtra(TimerService.EXTRA_SECONDS, seconds);
            ContextCompat.startForegroundService(context, intent);
        }

        @JavascriptInterface
        public void startBreakService(int seconds, boolean isTimed) {
            Intent intent = new Intent(context, TimerService.class);
            intent.setAction(TimerService.ACTION_START_BREAK);
            intent.putExtra(TimerService.EXTRA_SECONDS, seconds);
            intent.putExtra(TimerService.EXTRA_IS_TIMED, isTimed);
            ContextCompat.startForegroundService(context, intent);
        }

        @JavascriptInterface
        public void stopTimerService() {
            Intent intent = new Intent(context, TimerService.class);
            intent.setAction(TimerService.ACTION_STOP);
            context.startService(intent);
        }

        @JavascriptInterface
        public void triggerNativeVibration() {
            Vibrator vibrator;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = vm != null ? vm.getDefaultVibrator() : null;
            } else {
                vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            }

            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = {0, 400, 200, 400, 200, 600};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
                } else {
                    vibrator.vibrate(pattern, -1);
                }
            }
        }

        @JavascriptInterface
        public void testAlarmSound() {
            try {
                Uri alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                if (alarmUri == null) {
                    alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                }
                Ringtone ringtone = RingtoneManager.getRingtone(context, alarmUri);
                if (ringtone != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        ringtone.setAudioAttributes(new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_ALARM)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build());
                    }
                    ringtone.play();
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            // Mover la tarea al fondo en vez de destruirla para que el servicio siga corriendo
            moveTaskToBack(true);
        }
    }
}
