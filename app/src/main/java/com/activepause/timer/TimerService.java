package com.activepause.timer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import androidx.core.app.NotificationCompat;

public class TimerService extends Service {

    public static final String CHANNEL_ID = "activepause_timer_channel";
    public static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_START_STUDY = "com.activepause.ACTION_START_STUDY";
    public static final String ACTION_START_BREAK = "com.activepause.ACTION_START_BREAK";
    public static final String ACTION_STOP = "com.activepause.ACTION_STOP";
    public static final String ACTION_STOP_ALARM = "com.activepause.ACTION_STOP_ALARM";

    public static final String EXTRA_SECONDS = "extra_seconds";
    public static final String EXTRA_IS_TIMED = "extra_is_timed";

    private Handler handler;
    private Runnable runnable;
    private int remainingSeconds = 0;
    private boolean isBreakMode = false;
    private boolean isTimedBreak = false;
    private boolean isRunning = false;

    private Vibrator vibrator;
    private Ringtone alarmRingtone;
    private boolean isAlarmActive = false;

    @Override
    public void onCreate() {
        super.onCreate();
        handler = new Handler(Looper.getMainLooper());
        initVibrator();
        createNotificationChannel();
    }

    private void initVibrator() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            if (vm != null) vibrator = vm.getDefaultVibrator();
        } else {
            vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Temporizador ActivePause",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Muestra el temporizador mientras usas otras aplicaciones");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) {
            return START_STICKY;
        }

        String action = intent.getAction();

        switch (action) {
            case ACTION_START_STUDY:
                stopAlarm();
                remainingSeconds = intent.getIntExtra(EXTRA_SECONDS, 50 * 60);
                isBreakMode = false;
                startTimer();
                break;

            case ACTION_START_BREAK:
                stopAlarm();
                isBreakMode = true;
                isTimedBreak = intent.getBooleanExtra(EXTRA_IS_TIMED, false);
                remainingSeconds = intent.getIntExtra(EXTRA_SECONDS, 10 * 60);
                startTimer();
                break;

            case ACTION_STOP_ALARM:
                stopAlarm();
                break;

            case ACTION_STOP:
                stopAlarm();
                stopSelf();
                break;
        }

        return START_STICKY;
    }

    private void startTimer() {
        if (runnable != null) {
            handler.removeCallbacks(runnable);
        }
        isRunning = true;
        startForeground(NOTIFICATION_ID, buildNotification());

        runnable = new Runnable() {
            @Override
            public void run() {
                if (!isRunning) return;

                if (isBreakMode && !isTimedBreak) {
                    // Modo descanso libre (cuenta hacia arriba)
                    remainingSeconds++;
                } else {
                    // Cuenta hacia atrás (estudio o descanso con tiempo)
                    if (remainingSeconds > 0) {
                        remainingSeconds--;
                    }
                }

                updateNotification();

                if ((!isBreakMode || isTimedBreak) && remainingSeconds <= 0) {
                    onTimerFinished();
                } else {
                    handler.postDelayed(this, 1000);
                }
            }
        };

        handler.postDelayed(runnable, 1000);
    }

    private void onTimerFinished() {
        isRunning = false;
        triggerAlarm();

        // Lanzar Pantalla Completa de Alarma tipo Reloj Android
        Intent alarmIntent = new Intent(this, AlarmActivity.class);
        alarmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(alarmIntent);
    }

    private void triggerAlarm() {
        isAlarmActive = true;

        // Vibración nativa continua
        if (vibrator != null && vibrator.hasVibrator()) {
            long[] pattern = {0, 600, 200, 600, 200, 1000};
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            } else {
                vibrator.vibrate(pattern, 0);
            }
        }

        // Sonido nativo de alarma
        try {
            Uri alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmUri == null) {
                alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }
            alarmRingtone = RingtoneManager.getRingtone(this, alarmUri);
            if (alarmRingtone != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    alarmRingtone.setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build());
                }
                alarmRingtone.play();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        // Actualizar notificación con alerta
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildAlarmNotification());
        }
    }

    public void stopAlarm() {
        isAlarmActive = false;
        if (vibrator != null) {
            vibrator.cancel();
        }
        if (alarmRingtone != null && alarmRingtone.isPlaying()) {
            alarmRingtone.stop();
        }
    }

    private void updateNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification());
        }
    }

    private Notification buildNotification() {
        Intent appIntent = new Intent(this, MainActivity.class);
        appIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, appIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        String title = isBreakMode ? "🏃 ActivePause • Pausa Activa" : "💻 ActivePause • En Concentración";
        String timeStr = formatTime(remainingSeconds);
        String text = isBreakMode && !isTimedBreak
                ? "Tiempo activo: " + timeStr
                : timeStr + " restantes";

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(text)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private Notification buildAlarmNotification() {
        Intent alarmIntent = new Intent(this, AlarmActivity.class);
        alarmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingAlarmIntent = PendingIntent.getActivity(
                this, 1, alarmIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("🔔 ¡Tiempo Cumplido!")
                .setContentText("Toca para detener la alarma e iniciar tu pausa activa")
                .setContentIntent(pendingAlarmIntent)
                .setFullScreenIntent(pendingAlarmIntent, true)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .build();
    }

    private String formatTime(int totalSeconds) {
        int m = totalSeconds / 60;
        int s = totalSeconds % 60;
        return String.format("%02d:%02d", m, s);
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        if (runnable != null) {
            handler.removeCallbacks(runnable);
        }
        stopAlarm();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
