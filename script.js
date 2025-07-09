document.addEventListener('DOMContentLoaded', () => {
    //
    // --- ⚠️ CONFIGURACIÓN IMPORTANTE ⚠️ ---
    // ESTA URL LA OBTENDRÁS EN EL PASO 3 DE LAS INSTRUCCIONES
    const PROXY_URL = 'https://beta10-proxy.mark-mlg.workers.dev/'; 
    //
    // --- FIN DE LA CONFIGURACIÓN ---
    //

    const PAUSE_LIMITS = {
        desayuno: 15 * 60 * 1000,
        comida: 30 * 60 * 1000
    };
    const PAUSE_ALARM_THRESHOLD = 14 * 60 * 1000; // 14 minutos
    const MIN_PAUSE_TIME = 5 * 60 * 1000; // 5 minutos

    const dom = {
        connectionStatus: document.getElementById('connection-status'),
        gpsStatus: document.getElementById('gps-status'),
        currentStateText: document.getElementById('current-state-text'),
        workTimer: document.getElementById('work-timer'),
        pauseTimer: document.getElementById('pause-timer'),
        buttonContainer: document.getElementById('button-container'),
        logContainer: document.getElementById('log-container'),
        loadingOverlay: document.getElementById('loading-overlay'),
        loadingText: document.getElementById('loading-text'),
        alarmSound: document.getElementById('alarm-sound'),
        infoMessage: document.getElementById('info-message'),
    };

    let appState = {
        currentState: 'FUERA', // FUERA, JORNADA, PAUSA, ALMACEN
        workStartTime: null,
        currentPauseStart: null,
        totalPauseTimeToday: 0,
        currentLocation: null,
        isAlarmPlaying: false,
    };

    function saveState() {
        localStorage.setItem('beta10AppState', JSON.stringify(appState));
    }

    function loadState() {
        const savedState = localStorage.getItem('beta10AppState');
        if (savedState) {
            const parsedState = JSON.parse(savedState);
            // Convertir strings de fecha a objetos Date
            appState = {
                ...parsedState,
                workStartTime: parsedState.workStartTime ? new Date(parsedState.workStartTime) : null,
                currentPauseStart: parsedState.currentPauseStart ? new Date(parsedState.currentPauseStart) : null,
            };
            logActivity("Estado recuperado de la sesión anterior.");
        }
    }
    
    function logActivity(message) {
        const now = new Date().toLocaleTimeString('es-ES');
        const p = document.createElement('p');
        p.textContent = `[${now}] ${message}`;
        dom.logContainer.prepend(p);
    }

    function showLoading(visible, text = 'Procesando...') {
        dom.loadingText.textContent = text;
        dom.loadingOverlay.classList.toggle('visible', visible);
    }

    async function getCurrentLocation() {
        showLoading(true, 'Obteniendo GPS...');
        dom.gpsStatus.className = 'status-indicator yellow';
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                dom.gpsStatus.className = 'status-indicator red';
                return reject(new Error('GPS no soportado por el navegador.'));
            }
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    appState.currentLocation = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: new Date().toISOString()
                    };
                    if (isNaN(appState.currentLocation.latitude)) {
                        dom.gpsStatus.className = 'status-indicator red';
                        return reject(new Error('Coordenadas GPS inválidas.'));
                    }
                    dom.gpsStatus.className = 'status-indicator green';
                    logActivity(`GPS OK: ${appState.currentLocation.latitude.toFixed(4)}, ${appState.currentLocation.longitude.toFixed(4)}`);
                    resolve(appState.currentLocation);
                },
                (error) => {
                    let errorMsg = 'Error GPS desconocido.';
                    if (error.code === 1) errorMsg = 'Permiso GPS denegado. Habilítalo.';
                    if (error.code === 2) errorMsg = 'Señal GPS no disponible. Ve a un lugar abierto.';
                    if (error.code === 3) errorMsg = 'Timeout de GPS. Reintenta.';
                    dom.gpsStatus.className = 'status-indicator red';
                    reject(new Error(errorMsg));
                },
                { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
            );
        });
    }

    async function sendToProxy(action, point) {
        if (!appState.currentLocation) {
            throw new Error("Ubicación GPS no disponible.");
        }
        
        showLoading(true, `Registrando ${action} (${point})...`);
        dom.connectionStatus.className = 'status-indicator yellow';
        
        try {
            const response = await fetch(PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: action,
                    point: point,
                    location: appState.currentLocation
                })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || `Error en el servidor proxy (HTTP ${response.status})`);
            }
            
            dom.connectionStatus.className = 'status-indicator green';
            logActivity(`Beta10 OK: ${action} con punto '${point}' registrado.`);
            return result;

        } catch (error) {
            dom.connectionStatus.className = 'status-indicator red';
            logActivity(`ERROR: ${error.message}`);
            throw error;
        } finally {
            showLoading(false);
        }
    }

    // --- FUNCIONES DE TRANSICIÓN DE ESTADO ---

    async function handleAction(actions) {
        try {
            await getCurrentLocation();
            for (const { action, point, newState, onComplete } of actions) {
                await sendToProxy(action, point);
                if (newState) appState.currentState = newState;
                if (onComplete) onComplete();
                saveState();
                updateUI();
            }
        } catch (error) {
            alert(`Error: ${error.message}`);
            showLoading(false);
        }
    }

    function startWorkday() {
        handleAction([
            {
                action: 'entrada', point: 'J', newState: 'JORNADA',
                onComplete: () => { appState.workStartTime = new Date(); }
            }
        ]);
    }
    
    function startAlmacen() {
        handleAction([
            {
                action: 'entrada', point: '9', newState: 'ALMACEN',
                onComplete: () => { appState.workStartTime = new Date(); }
            }
        ]);
    }

    function endAlmacenAndStartWorkday() {
        handleAction([
            { action: 'salida', point: '9' },
            { action: 'entrada', point: 'J', newState: 'JORNADA' }
        ]);
    }

    function startPause() {
        handleAction([
            { action: 'salida', point: 'J' },
            {
                action: 'entrada', point: 'P', newState: 'PAUSA',
                onComplete: () => { appState.currentPauseStart = new Date(); }
            }
        ]);
    }

    function endPause() {
        handleAction([
            { action: 'salida', point: 'P' },
            {
                action: 'entrada', point: 'J', newState: 'JORNADA',
                onComplete: () => {
                    if (appState.currentPauseStart) {
                        const pauseDuration = new Date() - appState.currentPauseStart;
                        appState.totalPauseTimeToday += pauseDuration;
                        appState.currentPauseStart = null;
                        stopAlarm();
                    }
                }
            }
        ]);
    }

    function endWorkday() {
        const actions = [];
        if (appState.currentState === 'PAUSA') {
            actions.push({ action: 'salida', point: 'P' });
        }
        if (appState.currentState === 'ALMACEN') {
            actions.push({ action: 'salida', point: '9' });
        } else {
             actions.push({ action: 'salida', point: 'J' });
        }
       
        actions[actions.length - 1].newState = 'FUERA';
        actions[actions.length - 1].onComplete = () => {
             // Reset para el día siguiente
            appState.workStartTime = null;
            appState.currentPauseStart = null;
            appState.totalPauseTimeToday = 0;
            stopAlarm();
        };

        handleAction(actions);
    }

    // --- ACTUALIZACIÓN DE UI Y TIMERS ---
    
    function formatTime(ms) {
        if (ms < 0) ms = 0;
        const totalSeconds = Math.floor(ms / 1000);
        const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
        const seconds = String(totalSeconds % 60).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    function playAlarm() {
        if (!appState.isAlarmPlaying) {
            dom.alarmSound.loop = true;
            dom.alarmSound.play();
            appState.isAlarmPlaying = true;
            dom.infoMessage.textContent = "¡Tiempo de pausa excedido!";
            dom.infoMessage.classList.add('alert');
        }
    }

    function stopAlarm() {
        dom.alarmSound.pause();
        dom.alarmSound.currentTime = 0;
        appState.isAlarmPlaying = false;
        dom.infoMessage.classList.remove('alert');
        dom.infoMessage.textContent = "";
    }

    function updateTimers() {
        if (appState.currentState === 'FUERA') {
            dom.workTimer.textContent = '00:00:00';
            dom.pauseTimer.textContent = '00:00:00';
            return;
        }

        if (appState.workStartTime) {
            const now = new Date();
            let workDuration = now - appState.workStartTime - appState.totalPauseTimeToday;
            
            if (appState.currentState === 'PAUSA' && appState.currentPauseStart) {
                const currentPauseDuration = now - appState.currentPauseStart;
                workDuration -= currentPauseDuration; // Restar la pausa actual que aún no está en el total
                dom.pauseTimer.textContent = formatTime(currentPauseDuration);

                // Control de alarma de pausa
                if (currentPauseDuration > PAUSE_ALARM_THRESHOLD) {
                    playAlarm();
                }

            } else {
                dom.pauseTimer.textContent = formatTime(appState.totalPauseTimeToday);
            }
            dom.workTimer.textContent = formatTime(workDuration);
        }
    }
    
    function generateDynamicButtons() {
        dom.buttonContainer.innerHTML = ''; // Limpiar botones
        let buttons = [];

        const createButton = (text, className, action, disabled = false) => {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.className = `btn ${className}`;
            btn.onclick = action;
            btn.disabled = disabled;
            dom.buttonContainer.appendChild(btn);
        };

        switch (appState.currentState) {
            case 'FUERA':
                createButton('▶️ Iniciar Jornada (J)', 'btn-start', startWorkday);
                createButton('📦 Iniciar Almacén (9)', 'btn-secondary', startAlmacen);
                break;
            case 'ALMACEN':
                 createButton('▶️ Salir Almacén e Iniciar Jornada (9 -> J)', 'btn-start', endAlmacenAndStartWorkday);
                 createButton('⛔ Finalizar Jornada', 'btn-stop', endWorkday);
                break;
            case 'JORNADA':
                createButton('⏸️ Iniciar Pausa (P)', 'btn-pause', startPause);
                createButton('⛔ Finalizar Jornada (J)', 'btn-stop', endWorkday);
                break;
            case 'PAUSA':
                const inPauseFor = appState.currentPauseStart ? new Date() - appState.currentPauseStart : 0;
                const canEndPause = inPauseFor > MIN_PAUSE_TIME;
                createButton(
                    `▶️ Volver de Pausa (P)`, 
                    'btn-start', 
                    endPause, 
                    !canEndPause
                );
                if(!canEndPause){
                   const remaining = formatTime(MIN_PAUSE_TIME - inPauseFor);
                   dom.infoMessage.textContent = `Pausa mínima de 5 min. Faltan ${remaining}`;
                   dom.infoMessage.classList.add('alert');
                } else if(!appState.isAlarmPlaying) {
                   dom.infoMessage.classList.remove('alert');
                }
                createButton('⛔ Finalizar Jornada', 'btn-stop', endWorkday);
                break;
        }
    }
    
    function updateUI() {
        let stateText = '--';
        switch (appState.currentState) {
            case 'FUERA': stateText = 'Fuera de Jornada'; break;
            case 'JORNADA': stateText = 'En Jornada'; break;
            case 'PAUSA': stateText = 'En Pausa'; break;
            case 'ALMACEN': stateText = 'En Almacén'; break;
        }
        dom.currentStateText.textContent = stateText;
        generateDynamicButtons();
    }
    
    // --- INICIALIZACIÓN ---
    function init() {
        if (PROXY_URL.includes('tu-worker')) {
            alert('ERROR: La URL del Proxy no está configurada en script.js. Sigue las instrucciones del PASO 3.');
            showLoading(true, 'Configuración Requerida');
            return;
        }
        loadState();
        updateUI();
        setInterval(() => {
            updateTimers();
            generateDynamicButtons(); // Para actualizar el estado del botón de pausa
        }, 1000);
        
        // Petición inicial para calentar la conexión y el GPS
        getCurrentLocation().catch(err => {
            logActivity(`Error inicial GPS: ${err.message}`);
            alert(`Error de GPS al iniciar: ${err.message}. Asegúrate de tenerlo activado y con permisos.`);
        }).finally(() => {
            showLoading(false);
        });
        
        // Registrar el Service Worker para PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/service-worker.js')
                .then(reg => logActivity('Service Worker registrado con éxito.'))
                .catch(err => logActivity(`Error al registrar Service Worker: ${err}`));
        }
    }

    init();
});