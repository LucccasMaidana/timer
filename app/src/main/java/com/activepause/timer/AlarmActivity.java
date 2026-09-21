package com.activepause.timer;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import java.util.Random;

public class AlarmActivity extends AppCompatActivity {

    private final String[] EXERCISES = {
        "15 Sentadillas suaves para reactivar la circulación de piernas.",
        "Estiramiento de cuello y trapecios (30 seg hacia cada lado).",
        "Camina por la habitación y toma un buen vaso de agua fresca.",
        "10 Rotaciones de hombros hacia atrás y 10 hacia adelante.",
        "Abre el pecho: apoya las manos en una pared y estira hombros y espalda.",
        "20 Elevaciones de talones (gemelos) de pie.",
        "Regla 20-20-20: Mira un objeto lejano por la ventana para relajar tus ojos.",
        "Respiración profunda 4-7-8 (inhala en 4s, retén 7s, exhala en 8s).",
        "Flexión suave hacia adelante para estirar la espalda baja e isquiotibiales.",
        "Rota tus muñecas y abre/cierra los dedos con fuerza para aliviar el teclado."
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Despertar pantalla y mostrar sobre el bloqueo
        wakeUpScreen();

        setContentView(R.layout.activity_alarm);

        // Mostrar sugerencia aleatoria
        TextView tvSuggestion = findViewById(R.id.tv_exercise_suggestion);
        int randomIndex = new Random().nextInt(EXERCISES.length);
        tvSuggestion.setText(EXERCISES[randomIndex]);

        Button btnStartBreak = findViewById(R.id.btn_alarm_start_break);
        Button btnEndDay = findViewById(R.id.btn_alarm_end_day);

        btnStartBreak.setOnClickListener(v -> {
            stopAlarmSound();
            // Ir a la app principal y activar descanso
            Intent mainIntent = new Intent(this, MainActivity.class);
            mainIntent.setAction("ACTION_NATIVE_BREAK");
            mainIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(mainIntent);
            finish();
        });

        btnEndDay.setOnClickListener(v -> {
            stopAlarmSound();
            Intent stopService = new Intent(this, TimerService.class);
            stopService.setAction(TimerService.ACTION_STOP);
            startService(stopService);

            Intent mainIntent = new Intent(this, MainActivity.class);
            mainIntent.setAction("ACTION_NATIVE_END_DAY");
            mainIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(mainIntent);
            finish();
        });
    }

    private void wakeUpScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) {
                km.requestDismissKeyguard(this, null);
            }
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }
    }

    private void stopAlarmSound() {
        Intent stopIntent = new Intent(this, TimerService.class);
        stopIntent.setAction(TimerService.ACTION_STOP_ALARM);
        startService(stopIntent);
    }

    @Override
    protected void onDestroy() {
        stopAlarmSound();
        super.onDestroy();
    }
}
