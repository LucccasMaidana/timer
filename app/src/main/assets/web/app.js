/**
 * ACTIVEPAUSE - LÓGICA Y MÁQUINA DE ESTADOS
 * Mobile-first • Web Audio API • Wake Lock • Vibration API
 * Bloques de estudio y descansos personalizables de antemano
 */

(function () {
  'use strict';

  // --- MÁQUINA DE ESTADOS ---
  const STATES = {
    IDLE: 'IDLE',           // Antes de empezar el día
    WORK: 'WORK',           // Bloque de estudio/PC (cuenta regresiva)
    ALARM: 'ALARM',         // Fin del bloque de estudio (alarma continua)
    BREAK: 'BREAK'          // Pausa activa / ejercicio (con tiempo o libre)
  };

  let currentState = STATES.IDLE;

  // Configuración de tiempos
  let workDurationSeconds = 50 * 60;   // 50 min por defecto
  let remainingSeconds = workDurationSeconds;
  
  let breakMode = 'free';              // 'free' (libre) o 'timed' (con tiempo)
  let breakDurationSeconds = 10 * 60;  // 10 min por defecto si es con tiempo
  let breakRemainingSeconds = breakDurationSeconds;
  let breakElapsedSeconds = 0;

  let timerInterval = null;
  let targetEndTime = null;

  // Estadísticas del día
  let completedBlocks = 0;
  let totalStudySeconds = 0;
  let totalBreakSeconds = 0;

  // Web Audio Context
  let audioCtx = null;
  let alarmInterval = null;

  // Screen Wake Lock API
  let wakeLock = null;

  // Banco de sugerencias de ejercicios y pausas activas
  const EXERCISES = [
    "🦵 15 Sentadillas suaves para reactivar la circulación de piernas.",
    "🙆‍♂️ Estiramiento de cuello y trapecios (30 seg hacia cada lado).",
    "🚶‍♀️ Camina por la habitación y toma un buen vaso de agua fresca.",
    "🔄 10 Rotaciones de hombros hacia atrás y 10 hacia adelante.",
    "🧱 Abre el pecho: apoya las manos en una pared y estira hombros y espalda.",
    "👣 20 Elevaciones de talones (gemelos) de pie.",
    "👀 Regla 20-20-20: Mira un objeto lejano por la ventana para relajar tus ojos.",
    "🧘 Respiración profunda 4-7-8 (inhala en 4s, retén 7s, exhala en 8s).",
    "🤸 Flexión suave hacia adelante para estirar la espalda baja e isquiotibiales.",
    "🤲 Rota tus muñecas y abre/cierra los dedos con fuerza para aliviar el teclado."
  ];
  let currentExerciseIndex = -1;

  // --- ELEMENTOS DEL DOM ---
  const body = document.body;
  const appViewport = document.querySelector('.app-viewport');
  const metaThemeColor = document.getElementById('meta-theme-color');
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const btnTestSound = document.getElementById('btn-test-sound');
  const btnTestVibrate = document.getElementById('btn-test-vibrate');
  const btnSettingsToggle = document.getElementById('btn-settings-toggle');
  const toastNotification = document.getElementById('toast-notification');

  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');
  const blocksCountEl = document.getElementById('blocks-count');

  const timerLabel = document.getElementById('timer-label');
  const timerDigits = document.getElementById('timer-digits');
  const ringProgress = document.getElementById('ring-progress');
  const ringCircumference = 2 * Math.PI * 120; // 753.98px
  const wakelockIndicator = document.getElementById('wakelock-indicator');

  const exerciseCard = document.getElementById('exercise-card');
  const exerciseText = document.getElementById('exercise-text');
  const btnNextExercise = document.getElementById('btn-next-exercise');

  // Configuración de Bloques
  const settingsPanel = document.getElementById('settings-panel');
  const badgeWorkTime = document.getElementById('badge-work-time');
  const badgeBreakTime = document.getElementById('badge-break-time');

  const workPresetButtons = document.querySelectorAll('#work-presets .preset-btn');
  const inputWorkMin = document.getElementById('input-work-min');
  const btnWorkMinus = document.getElementById('btn-work-minus');
  const btnWorkPlus = document.getElementById('btn-work-plus');

  const breakPresetButtons = document.querySelectorAll('#break-presets .preset-btn');
  const inputBreakMin = document.getElementById('input-break-min');
  const btnBreakMinus = document.getElementById('btn-break-minus');
  const btnBreakPlus = document.getElementById('btn-break-plus');

  // Botones principales
  const btnMainAction = document.getElementById('btn-main-action');
  const actionLabel = document.getElementById('action-label');
  const actionIcon = document.getElementById('action-icon');
  const btnEndDay = document.getElementById('btn-end-day');

  // Modal
  const summaryModal = document.getElementById('summary-modal');
  const statBlocks = document.getElementById('stat-blocks');
  const statFocusTime = document.getElementById('stat-focus-time');
  const statBreakTime = document.getElementById('stat-break-time');
  const btnNewDay = document.getElementById('btn-new-day');
  const btnCloseModal = document.getElementById('btn-close-modal');

  // ==========================================================
  // 1. NOTIFICACIONES TOAST & FEEDBACK VISUAL
  // ==========================================================
  let toastTimeout = null;
  function showToastMessage(msg, type = 'info', duration = 3800) {
    if (!toastNotification) return;
    clearTimeout(toastTimeout);
    toastNotification.textContent = msg;
    toastNotification.className = `toast-notification ${type}`;
    toastNotification.classList.remove('hidden');

    toastTimeout = setTimeout(() => {
      toastNotification.classList.add('hidden');
    }, duration);
  }

  // ==========================================================
  // 2. GESTIÓN DE AUDIO (Web Audio API)
  // ==========================================================
  async function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      try {
        await audioCtx.resume();
      } catch (e) {
        console.warn("Audio resume error:", e);
      }
    }
  }

  function playChimeNote(freq, startTime, duration = 0.4) {
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.4, startTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    } catch (e) {
      console.warn("Audio play error:", e);
    }
  }

  // Alarma de fin de estudio (Acorde ascendente Mi5, Sol#5, Si5, Mi6)
  function playAlarmChime() {
    initAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    playChimeNote(659.25, now + 0.0, 0.35); // E5
    playChimeNote(830.61, now + 0.15, 0.35); // G#5
    playChimeNote(987.77, now + 0.30, 0.4);  // B5
    playChimeNote(1318.51, now + 0.45, 0.6); // E6
  }

  // Alarma de fin de descanso (Doble campana alegre para volver)
  function playBreakOverChime() {
    initAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    playChimeNote(880.00, now + 0.0, 0.4);  // A5
    playChimeNote(1174.66, now + 0.2, 0.6); // D6
  }

  function startAlarmLoop() {
    stopAlarmLoop();
    playAlarmChime();
    triggerVibration(false);
    
    alarmInterval = setInterval(() => {
      playAlarmChime();
      triggerVibration(false);
    }, 1800);
  }

  function stopAlarmLoop() {
    if (alarmInterval) {
      clearInterval(alarmInterval);
      alarmInterval = null;
    }
  }

  // Vibración física y simulación visual
  function triggerVibration(isManualTest = false) {
    if (appViewport) {
      appViewport.classList.remove('shake-screen');
      void appViewport.offsetWidth;
      appViewport.classList.add('shake-screen');
      setTimeout(() => appViewport.classList.remove('shake-screen'), 500);
    }

    let didVibrate = false;

    // Si estamos en la app Android nativa, invocar motor háptico de sistema
    if (typeof window.AndroidBridge !== 'undefined') {
      try {
        window.AndroidBridge.triggerNativeVibration();
        didVibrate = true;
      } catch (e) {
        console.warn("AndroidBridge vibration error:", e);
      }
    } else if ('vibrate' in navigator) {
      try {
        didVibrate = navigator.vibrate([350, 150, 350, 150, 600]);
      } catch (e) {
        console.warn("Vibration API warning:", e);
      }
    }

    if (isManualTest) {
      if (didVibrate) {
        showToastMessage("📳 ¡Dispositivo vibrando! (Motor háptico activo)", "success");
      } else if ('vibrate' in navigator || typeof window.AndroidBridge !== 'undefined') {
        showToastMessage("📳 Vibración activa.", "info");
      } else {
        showToastMessage("📳 Vibración visual activa en pantalla. (Las PC y iPhone no tienen motor de vibración web; en Android o APK sí vibrará)", "info");
      }
    }
  }

  // ==========================================================
  // 3. SCREEN WAKE LOCK API
  // ==========================================================
  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakelockIndicator.classList.add('active');
        wakeLock.addEventListener('release', () => {
          wakelockIndicator.classList.remove('active');
        });
      } catch (err) {
        console.log("WakeLock no disponible o denegado:", err);
      }
    }
  }

  function releaseWakeLock() {
    if (wakeLock !== null) {
      wakeLock.release().then(() => {
        wakeLock = null;
        wakelockIndicator.classList.remove('active');
      }).catch(() => {});
    }
  }

  // ==========================================================
  // 4. GESTIÓN Y SELECCIÓN DE TIEMPOS PERSONALIZADOS
  // ==========================================================
  function setWorkDuration(minutes, seconds = null) {
    if (seconds !== null) {
      workDurationSeconds = seconds;
      badgeWorkTime.textContent = `${seconds}s`;
    } else {
      workDurationSeconds = Math.max(1, minutes) * 60;
      badgeWorkTime.textContent = `${minutes} min`;
      inputWorkMin.value = minutes;
    }

    // Actualizar botones de presets
    workPresetButtons.forEach(btn => {
      if (seconds !== null && btn.dataset.seconds == seconds) {
        btn.classList.add('active');
      } else if (seconds === null && btn.dataset.minutes == minutes) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Si estamos en IDLE, actualizar el reloj
    if (currentState === STATES.IDLE) {
      remainingSeconds = workDurationSeconds;
      updateTimerDisplay(remainingSeconds);
      updateProgressRing(1);
    } else {
      showToastMessage(`⏱️ Próximo bloque de estudio: ${badgeWorkTime.textContent}`, 'info');
    }

    localStorage.setItem('activepause_work_sec', workDurationSeconds);
  }

  function setBreakMode(mode, minutes = null, seconds = null) {
    breakMode = mode;

    breakPresetButtons.forEach(b => b.classList.remove('active'));

    if (mode === 'free') {
      badgeBreakTime.textContent = 'Libre ∞';
      const freeBtn = document.querySelector('#break-presets [data-mode="free"]');
      if (freeBtn) freeBtn.classList.add('active');
    } else {
      if (seconds !== null) {
        breakDurationSeconds = seconds;
        badgeBreakTime.textContent = `${seconds}s`;
        const testBtn = document.querySelector('#break-presets [data-seconds="5"]');
        if (testBtn) testBtn.classList.add('active');
      } else {
        breakDurationSeconds = Math.max(1, minutes) * 60;
        badgeBreakTime.textContent = `${minutes} min`;
        inputBreakMin.value = minutes;

        const presetBtn = document.querySelector(`#break-presets [data-minutes="${minutes}"]`);
        if (presetBtn) presetBtn.classList.add('active');
      }
    }

    if (currentState !== STATES.IDLE) {
      showToastMessage(`🏃 Pausa activa configurada a: ${badgeBreakTime.textContent}`, 'info');
    }

    localStorage.setItem('activepause_break_mode', breakMode);
    localStorage.setItem('activepause_break_sec', breakDurationSeconds);
  }

  // ==========================================================
  // 5. TRANSICIÓN Y MÁQUINA DE ESTADOS
  // ==========================================================
  function setState(newState) {
    currentState = newState;
    clearInterval(timerInterval);

    switch (newState) {
      case STATES.IDLE:
        stopAlarmLoop();
        releaseWakeLock();
        if (typeof window.AndroidBridge !== 'undefined') {
          window.AndroidBridge.stopTimerService();
        }
        remainingSeconds = workDurationSeconds;
        updateTimerDisplay(remainingSeconds);
        updateProgressRing(1);

        // UI
        statusBadge.className = 'badge badge-idle';
        statusText.textContent = 'Listo para iniciar';
        timerLabel.textContent = 'TIEMPO DE ESTUDIO';
        exerciseCard.classList.add('hidden');
        settingsPanel.classList.remove('hidden');
        btnEndDay.classList.add('hidden');

        btnMainAction.className = 'primary-action-btn action-start';
        actionLabel.textContent = 'Iniciar Día';
        actionIcon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
        break;

      case STATES.WORK:
        stopAlarmLoop();
        requestWakeLock();
        if (typeof window.AndroidBridge !== 'undefined') {
          window.AndroidBridge.startStudyService(remainingSeconds);
        }
        targetEndTime = Date.now() + (remainingSeconds * 1000);

        // UI
        statusBadge.className = 'badge badge-work';
        statusText.textContent = 'En concentración 💻';
        timerLabel.textContent = 'BLOQUE EN CURSO';
        exerciseCard.classList.add('hidden');
        settingsPanel.classList.add('hidden'); // Ocultar panel para enfocar pantalla
        btnEndDay.classList.remove('hidden');

        btnMainAction.className = 'primary-action-btn action-working';
        actionLabel.textContent = 'Pausar concentración';
        actionIcon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

        timerInterval = setInterval(tickWork, 250);
        break;

      case STATES.ALARM:
        releaseWakeLock();
        startAlarmLoop();

        // UI
        statusBadge.className = 'badge badge-alarm';
        statusText.textContent = '¡TIEMPO CUMPLIDO! 🔔';
        timerLabel.textContent = '¡LEVÁNTATE AHORA!';
        timerDigits.textContent = '00:00';
        updateProgressRing(0);
        ringProgress.style.stroke = 'var(--ring-alarm)';

        btnMainAction.className = 'primary-action-btn action-alarm';
        actionLabel.textContent = 'Detener e Iniciar Ejercicio';
        actionIcon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
        break;

      case STATES.BREAK:
        stopAlarmLoop();
        releaseWakeLock();
        if (typeof window.AndroidBridge !== 'undefined') {
          window.AndroidBridge.startBreakService(breakMode === 'timed' ? breakDurationSeconds : 0, breakMode === 'timed');
        }
        completedBlocks++;
        blocksCountEl.textContent = completedBlocks;
        totalStudySeconds += workDurationSeconds;

        showRandomExercise();

        // UI
        statusBadge.className = 'badge badge-break';
        statusText.textContent = 'Pausa Activa 🏃';
        exerciseCard.classList.remove('hidden');
        settingsPanel.classList.add('hidden');
        btnEndDay.classList.remove('hidden');

        btnMainAction.className = 'primary-action-btn action-break';
        actionLabel.textContent = 'Volver al estudio / PC';
        actionIcon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;

        ringProgress.style.stroke = 'var(--ring-break)';

        if (breakMode === 'timed') {
          // Descanso con tiempo determinado (cuenta regresiva)
          breakRemainingSeconds = breakDurationSeconds;
          targetEndTime = Date.now() + (breakRemainingSeconds * 1000);
          timerLabel.textContent = 'DESCANSO RESTANTE';
          updateTimerDisplay(breakRemainingSeconds);
          updateProgressRing(1);
          timerInterval = setInterval(tickBreakTimed, 250);
        } else {
          // Descanso libre (cuenta ascendente)
          breakElapsedSeconds = 0;
          timerLabel.textContent = 'TIEMPO DE MOVIMIENTO';
          updateTimerDisplay(breakElapsedSeconds);
          timerInterval = setInterval(tickBreakFree, 1000);
        }
        break;
    }
  }

  // --- CÁLCULO DE TIEMPO DE ESTUDIO ---
  function tickWork() {
    const now = Date.now();
    const diffMs = targetEndTime - now;
    const diffSec = Math.max(0, Math.ceil(diffMs / 1000));

    remainingSeconds = diffSec;
    updateTimerDisplay(remainingSeconds);

    const progressRatio = remainingSeconds / workDurationSeconds;
    updateProgressRing(progressRatio);

    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      setState(STATES.ALARM);
    }
  }

  // --- CÁLCULO DE DESCANSO CON TIEMPO PROGRAMADO ---
  function tickBreakTimed() {
    const now = Date.now();
    const diffMs = targetEndTime - now;
    const diffSec = Math.max(0, Math.ceil(diffMs / 1000));

    breakRemainingSeconds = diffSec;
    totalBreakSeconds++;
    updateTimerDisplay(breakRemainingSeconds);

    const progressRatio = breakRemainingSeconds / breakDurationSeconds;
    updateProgressRing(progressRatio);

    if (breakRemainingSeconds <= 0) {
      clearInterval(timerInterval);
      playBreakOverChime();
      triggerVibration(false);

      statusBadge.className = 'badge badge-alarm';
      statusText.textContent = '¡DESCANSO FINALIZADO! 🔔';
      timerLabel.textContent = 'HORA DE VOLVER';
      btnMainAction.className = 'primary-action-btn action-start';
      actionLabel.textContent = 'Volver al estudio / PC';
      showToastMessage("🔔 ¡Tu tiempo de descanso ha terminado! Toca para volver a estudiar.", "info", 5000);
    }
  }

  // --- CÁLCULO DE DESCANSO LIBRE (SIN LÍMITE) ---
  function tickBreakFree() {
    breakElapsedSeconds++;
    totalBreakSeconds++;
    updateTimerDisplay(breakElapsedSeconds);
    const offset = (breakElapsedSeconds % 60) / 60;
    updateProgressRing(offset);
  }

  function updateTimerDisplay(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    timerDigits.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function updateProgressRing(fraction) {
    const offset = ringCircumference * (1 - fraction);
    ringProgress.style.strokeDashoffset = offset;
    if (currentState === STATES.WORK) {
      ringProgress.style.stroke = 'var(--ring-work)';
    }
  }

  // --- SUGERENCIAS DE EJERCICIO ---
  function showRandomExercise() {
    let nextIndex;
    do {
      nextIndex = Math.floor(Math.random() * EXERCISES.length);
    } while (nextIndex === currentExerciseIndex && EXERCISES.length > 1);
    
    currentExerciseIndex = nextIndex;
    exerciseText.textContent = EXERCISES[currentExerciseIndex];
  }

  // ==========================================================
  // 6. EVENTOS DE INTERACCIÓN
  // ==========================================================
  btnMainAction.addEventListener('click', () => {
    initAudio();

    switch (currentState) {
      case STATES.IDLE:
        remainingSeconds = workDurationSeconds;
        setState(STATES.WORK);
        break;

      case STATES.WORK:
        if (confirm("¿Deseas pausar y pasar directamente a tu descanso activo?")) {
          setState(STATES.BREAK);
        }
        break;

      case STATES.ALARM:
        setState(STATES.BREAK);
        break;

      case STATES.BREAK:
        remainingSeconds = workDurationSeconds;
        setState(STATES.WORK);
        break;
    }
  });

  // Botón para refrescar ejercicio durante descanso
  btnNextExercise.addEventListener('click', (e) => {
    e.stopPropagation();
    showRandomExercise();
  });

  // Toggle de configuración de bloques (abrir/cerrar panel en cualquier momento)
  btnSettingsToggle.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
    const isHidden = settingsPanel.classList.contains('hidden');
    if (!isHidden) {
      showToastMessage("⚙️ Ajusta los minutos de estudio y descansos aquí", "info");
    }
  });

  // --- PRESETS Y STEPPERS DE ESTUDIO ---
  workPresetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.seconds) {
        setWorkDuration(null, parseInt(btn.dataset.seconds, 10));
      } else if (btn.dataset.minutes) {
        setWorkDuration(parseInt(btn.dataset.minutes, 10));
      }
    });
  });

  btnWorkMinus.addEventListener('click', () => {
    let current = parseInt(inputWorkMin.value, 10) || 50;
    current = Math.max(5, current - 5);
    setWorkDuration(current);
  });

  btnWorkPlus.addEventListener('click', () => {
    let current = parseInt(inputWorkMin.value, 10) || 50;
    current = Math.min(300, current + 5);
    setWorkDuration(current);
  });

  inputWorkMin.addEventListener('change', () => {
    let val = parseInt(inputWorkMin.value, 10);
    if (isNaN(val) || val < 1) val = 50;
    setWorkDuration(val);
  });

  // --- PRESETS Y STEPPERS DE DESCANSO ---
  breakPresetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === 'free') {
        setBreakMode('free');
      } else if (btn.dataset.seconds) {
        setBreakMode('timed', null, parseInt(btn.dataset.seconds, 10));
      } else if (btn.dataset.minutes) {
        setBreakMode('timed', parseInt(btn.dataset.minutes, 10));
      }
    });
  });

  btnBreakMinus.addEventListener('click', () => {
    let current = parseInt(inputBreakMin.value, 10) || 10;
    current = Math.max(1, current - 1);
    setBreakMode('timed', current);
  });

  btnBreakPlus.addEventListener('click', () => {
    let current = parseInt(inputBreakMin.value, 10) || 10;
    current = Math.min(120, current + 1);
    setBreakMode('timed', current);
  });

  inputBreakMin.addEventListener('change', () => {
    let val = parseInt(inputBreakMin.value, 10);
    if (isNaN(val) || val < 1) val = 10;
    setBreakMode('timed', val);
  });

  // Finalizar jornada y mostrar resumen
  btnEndDay.addEventListener('click', () => {
    if (confirm("¿Deseas finalizar tu jornada de hoy y ver tu resumen?")) {
      openSummaryModal();
    }
  });

  function openSummaryModal() {
    stopAlarmLoop();
    clearInterval(timerInterval);
    releaseWakeLock();

    statBlocks.textContent = completedBlocks;
    statFocusTime.textContent = `${Math.round(totalStudySeconds / 60)}m`;
    statBreakTime.textContent = `${Math.round(totalBreakSeconds / 60)}m`;

    summaryModal.classList.remove('hidden');
  }

  btnNewDay.addEventListener('click', () => {
    summaryModal.classList.add('hidden');
    completedBlocks = 0;
    totalStudySeconds = 0;
    totalBreakSeconds = 0;
    blocksCountEl.textContent = '0';
    setState(STATES.IDLE);
  });

  btnCloseModal.addEventListener('click', () => {
    summaryModal.classList.add('hidden');
    setState(STATES.IDLE);
  });

  // ==========================================================
  // 7. SELECTOR DE TEMA CLARO / OSCURO & PERSISTENCIA
  // ==========================================================
  function applyTheme(theme) {
    if (theme === 'light') {
      body.classList.remove('theme-dark');
      body.classList.add('theme-light');
      metaThemeColor.setAttribute('content', '#EAF0F8');
    } else {
      body.classList.remove('theme-light');
      body.classList.add('theme-dark');
      metaThemeColor.setAttribute('content', '#080E1E');
    }
    localStorage.setItem('activepause_theme', theme);
  }

  btnThemeToggle.addEventListener('click', () => {
    const isDark = body.classList.contains('theme-dark');
    applyTheme(isDark ? 'light' : 'dark');
  });

  // Cargar tema guardado
  const savedTheme = localStorage.getItem('activepause_theme') || 'dark';
  applyTheme(savedTheme);

  // Botón para probar sonido
  btnTestSound.addEventListener('click', async () => {
    if (typeof window.AndroidBridge !== 'undefined') {
      try {
        window.AndroidBridge.testAlarmSound();
        showToastMessage("🔔 Probando sonido de alarma nativa", "info");
        return;
      } catch (e) {}
    }
    await initAudio();
    playAlarmChime();
    showToastMessage("🔔 Probando sonido de campana de alarma", "info");
  });

  // Botón para probar vibración
  if (btnTestVibrate) {
    btnTestVibrate.addEventListener('click', () => {
      triggerVibration(true);
    });
  }

  // Cargar configuraciones previas si existen
  const savedWork = localStorage.getItem('activepause_work_sec');
  if (savedWork) {
    const sec = parseInt(savedWork, 10);
    setWorkDuration(Math.round(sec / 60));
  } else {
    setWorkDuration(50);
  }

  const savedBreakMode = localStorage.getItem('activepause_break_mode') || 'free';
  const savedBreakSec = localStorage.getItem('activepause_break_sec') || (10 * 60);
  if (savedBreakMode === 'timed') {
    setBreakMode('timed', Math.round(parseInt(savedBreakSec, 10) / 60));
  } else {
    setBreakMode('free');
  }

  // Escuchador para acciones nativas desde la barra de Android o la alarma
  window.onNativeAction = function (action) {
    if (action === 'break') {
      setState(STATES.BREAK);
    } else if (action === 'end_day') {
      openSummaryModal();
    }
  };

  // Inicialización visual
  updateTimerDisplay(workDurationSeconds);
  updateProgressRing(1);

})();

