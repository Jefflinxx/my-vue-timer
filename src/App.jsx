import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

// --- 核心幾何常數 ---
const MAX_MINUTES = 60;
const RADIUS = 130;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SVG_VIEWBOX_SIZE = 300; // SVG viewBox="0 0 300 300"
const CENTER = SVG_VIEWBOX_SIZE / 2; // 150
const STORAGE_KEY = 'eye-guardian-settings';

// --- 格式化時間 (MM:SS) ---
const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// --- SVG 刻度線組件 ---
const Ticks = () => {
    const ticks = [];
    for (let i = 0; i < 60; i++) {
        const angle = (i * 6) * (Math.PI / 180);
        const isMajor = i % 5 === 0;
        const outerR = 145;
        const innerR = isMajor ? 135 : 140;
        
        const x1 = CENTER + innerR * Math.cos(angle);
        const y1 = CENTER + innerR * Math.sin(angle);
        const x2 = CENTER + outerR * Math.cos(angle);
        const y2 = CENTER + outerR * Math.sin(angle);

        ticks.push(
            <line 
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className={`tick-mark ${isMajor ? 'major' : ''}`}
            />
        );
    }
    return <g id="ticks-group" pointerEvents="none">{ticks}</g>;
};

// --- 主要應用程式組件 ---
const App = () => {
    // 狀態
    const [durationMinutes, setDurationMinutes] = useState(20);
    const [totalDuration, setTotalDuration] = useState(20 * 60);
    const [timeLeft, setTimeLeft] = useState(20 * 60);
    const [isRunning, setIsRunning] = useState(false);
    const [isAlertOpen, setIsAlertOpen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [enableNotification, setEnableNotification] = useState(true);
    const [enableSystemAlert, setEnableSystemAlert] = useState(false);
    const [enableSound, setEnableSound] = useState(true);
    const [soundMode, setSoundMode] = useState('default'); // 'default' | 'loud'

    // Ref
    const timerIntervalRef = useRef(null);
    const audioCtxRef = useRef(null);
    const svgRef = useRef(null);
    const pointerRef = useRef(null);
    const notificationPermissionRef = useRef(
        typeof Notification !== 'undefined' ? Notification.permission : 'denied'
    );
    const alertShownRef = useRef(false); // 作為「已通知」的 guard，避免重複送出
    const beforeUnloadHandlerRef = useRef(null);
    const settingsLoadedRef = useRef(false);
    const wasRunningRef = useRef(false);
    const endTimeRef = useRef(null); // 用來計算剩餘時間的絕對時間戳 (ms)
    const scheduledBeepRef = useRef(null);

    const persistSettings = useCallback(
        (overrides = {}) => {
            if (typeof window === 'undefined') return;
            const payload = {
                durationMinutes,
                enableNotification,
                enableSystemAlert,
                enableSound,
                soundMode,
                ...overrides,
            };
            try {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
            } catch (err) {
                console.log('[storage] save error:', err);
            }
        },
        [durationMinutes, enableNotification, enableSystemAlert, enableSound, soundMode]
    );

    const setNotificationMode = useCallback(
        (useNotification) => {
            setEnableNotification(useNotification);
            setEnableSystemAlert(!useNotification);
            persistSettings({
                enableNotification: useNotification,
                enableSystemAlert: !useNotification,
            });
        },
        [persistSettings]
    );

    // --- 音效邏輯 ---
    const cancelScheduledBeep = useCallback(() => {
        if (scheduledBeepRef.current?.nodes) {
            scheduledBeepRef.current.nodes.forEach((node) => {
                try {
                    node.stop();
                } catch (e) {
                    // ignore
                }
            });
        }
        scheduledBeepRef.current = null;
    }, []);

    const scheduleAlarmSound = useCallback(
        (targetTimeMs, mode = soundMode) => {
            if (!enableSound) return;
            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            const audioCtx = audioCtxRef.current;
            if (audioCtx.state === 'suspended') audioCtx.resume();

            const nowMs = Date.now();
            const delaySec = Math.max(0, (targetTimeMs - nowMs) / 1000);
            const baseStart = audioCtx.currentTime + delaySec;

            // 定義音效 pattern
            const patterns =
                mode === 'loud'
                    ? [
                          // 多段強烈旋律，約 5.5 秒
                          { offset: 0.0, duration: 0.4, startFreq: 720, endFreq: 1000, gain: 0.18 },
                          { offset: 0.45, duration: 0.4, startFreq: 820, endFreq: 1120, gain: 0.19 },
                          { offset: 0.9, duration: 0.45, startFreq: 900, endFreq: 1250, gain: 0.2 },
                          { offset: 1.4, duration: 0.5, startFreq: 980, endFreq: 1350, gain: 0.21 },
                          { offset: 2.0, duration: 0.45, startFreq: 860, endFreq: 1180, gain: 0.19 },
                          { offset: 2.5, duration: 0.5, startFreq: 1040, endFreq: 1400, gain: 0.22 },
                          { offset: 3.1, duration: 0.5, startFreq: 920, endFreq: 1300, gain: 0.2 },
                          { offset: 3.7, duration: 0.45, startFreq: 1080, endFreq: 1450, gain: 0.22 },
                          { offset: 4.2, duration: 0.55, startFreq: 950, endFreq: 1350, gain: 0.21 },
                          { offset: 4.8, duration: 0.6, startFreq: 1100, endFreq: 1500, gain: 0.22 },
                      ]
                    : [
                          { offset: 0.0, duration: 0.5, startFreq: 440, endFreq: 880, gain: 0.1 },
                      ];

            cancelScheduledBeep();
            const nodes = [];

            patterns.forEach(({ offset, duration, startFreq, endFreq, gain }) => {
                const startAt = baseStart + offset;
                const endAt = startAt + duration;

                const osc = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(startFreq, startAt);
                osc.frequency.exponentialRampToValueAtTime(endFreq, startAt + 0.1);
                g.gain.setValueAtTime(gain, startAt);
                g.gain.exponentialRampToValueAtTime(0.001, endAt);
                osc.connect(g);
                g.connect(audioCtx.destination);
                osc.start(startAt);
                osc.stop(endAt);
                nodes.push(osc);
            });

            scheduledBeepRef.current = { nodes };
        },
        [enableSound, soundMode, cancelScheduledBeep]
    );

    const playSoundPreview = useCallback(
        (mode) => {
            const target = Date.now() + 50;
            scheduleAlarmSound(target, mode);
        },
        [scheduleAlarmSound]
    );

    // --- 輔助計算 (角度、百分比、長度) ---
    const percentage = totalDuration > 0 ? timeLeft / totalDuration : 0;
    const clampedPercentage = Math.max(0, Math.min(1, percentage));
    
    // 指針角度 (CW: 0% = 360 deg, 100% = 0 deg)
    const degrees = (1 - clampedPercentage) * 360; 
    
    // 進度條長度
    const drawLength = CIRCUMFERENCE * clampedPercentage;

    // --- 計時器邏輯 ---
    const triggerNotification = useCallback(() => {
        if (typeof Notification === 'undefined') return;

        // 要提醒用戶開 mac chrome 通知權限
        const showNotification = () => {
            try {
                new Notification('時間到了！', {
                    body: '請休息眼睛，眺望遠方至少 20 秒。',
                    icon: '/favicon.ico',
                    // requireInteraction: true, // 加上這行 mac 通知會壞
                });
                console.log('[notify] notification dispatched');
                return true;
            } catch (err) {
                console.log('[notify] notification error:', err?.message || err);
                return false;
            }
        };

        // 若已同意權限且不在當前分頁，發出系統通知
        if (notificationPermissionRef.current === 'granted') {
            console.log('[notify] permission granted, sending notification');
            const ok = showNotification();
            if (!ok && typeof window !== 'undefined') {
                window.alert('時間到了！請休息眼睛，眺望遠方至少 20 秒。');
            }
            return;
        }

        // 若尚未決定權限，嘗試在計時完成時請求一次
        if (notificationPermissionRef.current === 'default') {
            console.log('[notify] requesting permission at finish');
            Notification.requestPermission().then((perm) => {
                notificationPermissionRef.current = perm;
                if (perm === 'granted') {
                    console.log('[notify] permission granted after request, sending notification');
                    const ok = showNotification();
                    if (!ok && typeof window !== 'undefined') {
                        window.alert('時間到了！請休息眼睛，眺望遠方至少 20 秒。');
                    }
                } else {
                    console.log('[notify] permission not granted after request:', perm);
                }
            });
            return;
        }

        console.log('[notify] permission state blocks notification:', notificationPermissionRef.current);
    }, []);

    const timerFinished = useCallback(() => {
        if (alertShownRef.current) {
            console.log('[timer] finish skipped, already notified');
            return;
        }
        alertShownRef.current = true;
        console.log('[timer] finished, timeLeft reached 0');
        setIsRunning(false);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
        endTimeRef.current = null;
        setIsAlertOpen(true);
        if (enableNotification) {
            triggerNotification();
        }
        if (enableSystemAlert) {
            if (typeof window !== 'undefined') {
                const handler = (e) => {
                    e.preventDefault();
                    e.returnValue = '';
                };
                beforeUnloadHandlerRef.current = handler;
                window.addEventListener('beforeunload', handler);
                // 觸發 reload 以顯示 beforeunload 提醒
                window.location.reload();
            }
        }
    }, [enableNotification, enableSystemAlert, triggerNotification, cancelScheduledBeep]);

    const startTimer = useCallback(() => {
        const now = Date.now();
        const remainingMs = (timeLeft > 0 ? timeLeft : totalDuration) * 1000;
        endTimeRef.current = now + remainingMs;
        alertShownRef.current = false;
        setIsRunning(true);

        cancelScheduledBeep();
        scheduleAlarmSound(endTimeRef.current, soundMode);

        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

        timerIntervalRef.current = setInterval(() => {
            if (!endTimeRef.current) return;
            const msLeft = endTimeRef.current - Date.now();
            if (msLeft <= 0) {
                setTimeLeft(0);
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
                setTimeout(timerFinished, 0);
            } else {
                setTimeLeft(Math.ceil(msLeft / 1000));
            }
        }, 500);
    }, [timeLeft, totalDuration, timerFinished, cancelScheduledBeep, scheduleAlarmSound, soundMode]);

    const stopTimer = useCallback(() => {
        setIsRunning(false);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
        endTimeRef.current = null;
        cancelScheduledBeep();
    }, [cancelScheduledBeep]);

    // 處理中心點擊
    const handleStartStop = () => {
        if (!isRunning && typeof Notification !== 'undefined' && notificationPermissionRef.current === 'default') {
            console.log('[notify] requesting permission on start');
            Notification.requestPermission().then((perm) => {
                notificationPermissionRef.current = perm;
                console.log('[notify] permission result on start:', perm);
            });
        }

        if (isRunning) stopTimer();
        else startTimer();
    };

    // 處理滑桿變更
    const handleSliderChange = (e) => {
        const mins = parseInt(e.target.value, 10);
        if (isRunning) return; 

        setDurationMinutes(mins);
        const newTotalSeconds = mins * 60;
        setTotalDuration(newTotalSeconds);
        setTimeLeft(newTotalSeconds);
        alertShownRef.current = false;
        persistSettings({ durationMinutes: mins });
    };

    // 警報彈窗關閉
    const closeAlert = () => {
        setIsAlertOpen(false);
        const restoredSeconds = durationMinutes * 60;
        setTotalDuration(restoredSeconds);
        setTimeLeft(restoredSeconds);
        alertShownRef.current = false;
        endTimeRef.current = null;
        stopTimer();
    };


    // --- 拖曳邏輯 ---
    const getAngleFromEvent = useCallback((e) => {
        if (!svgRef.current) return 0;
        const rect = svgRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const dx = clientX - centerX;
        const dy = clientY - centerY;
        
        let angleRad = Math.atan2(dy, dx);
        let angleDeg = angleRad * (180 / Math.PI) + 90;

        if (angleDeg < 0) angleDeg += 360;
        return angleDeg;
    }, []);

    const handleDragMove = useCallback((e) => {
        if (!isDragging) return; 
        e.preventDefault(); 

        const angle = getAngleFromEvent(e);
        
        // CW 拖曳映射邏輯: 0 deg (12 o'clock) -> 100% time, 360 deg (12 o'clock) -> 0% time
        let targetPercentage = 1 - (angle / 360); 
        
        // 靠近 12 點 (0/360度) 時，確保能設定到 100%
        if ((angle > 350 && angle <= 360) || (angle >= 0 && angle < 10)) {
             targetPercentage = 1.0;
        }

        const newTime = targetPercentage * totalDuration;
        
        // 更新時間狀態 (只更新 timeLeft，totalDuration 不變)
        setTimeLeft(Math.round(Math.max(0, Math.min(totalDuration, newTime))));

    }, [isDragging, totalDuration, getAngleFromEvent]);

    const handleDragEnd = useCallback(() => {
        if (isDragging) {
            setIsDragging(false);
            if (wasRunningRef.current) {
                startTimer(); // 恢復計時
            }
        }
    }, [isDragging, startTimer]);

    const handleDragStart = (e) => {
        e.stopPropagation(); 
        wasRunningRef.current = isRunning;
        stopTimer(); // 拖曳時先暫停計時
        setIsDragging(true);
        handleDragMove(e);
    };

    // --- 副作用 (Side Effects) ---

    // 0. 載入/儲存使用者設定
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                if (typeof saved.durationMinutes === 'number') {
                    const mins = Math.max(1, Math.min(MAX_MINUTES, saved.durationMinutes));
                    setDurationMinutes(mins);
                    const secs = mins * 60;
                    setTotalDuration(secs);
                    setTimeLeft(secs);
                }
                if (typeof saved.enableNotification === 'boolean') {
                    setEnableNotification(saved.enableNotification);
                }
                if (typeof saved.enableSystemAlert === 'boolean') {
                    setEnableSystemAlert(saved.enableSystemAlert);
                }
                if (typeof saved.enableSound === 'boolean') {
                    setEnableSound(saved.enableSound);
                }
                if (typeof saved.soundMode === 'string') {
                    setSoundMode(saved.soundMode);
                }
            }
            settingsLoadedRef.current = true;
            // 若無存檔，初次也寫入一次預設值，確保後續更新有基礎
            if (!raw) {
                persistSettings();
            }
        } catch (err) {
            console.log('[storage] load error:', err);
        }
    }, [persistSettings]);

    // 1. 定時器清理
    useEffect(() => {
        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
            }
            if (beforeUnloadHandlerRef.current) {
                window.removeEventListener('beforeunload', beforeUnloadHandlerRef.current);
            }
        };
    }, []);

    // 2. 拖曳事件監聽 (綁定到 window 以確保滑鼠移出元素時仍可追蹤)
    useEffect(() => {
        // Mouse Events
        window.addEventListener('mousemove', handleDragMove);
        window.addEventListener('mouseup', handleDragEnd);

        // Touch Events
        window.addEventListener('touchmove', handleDragMove, { passive: false });
        window.addEventListener('touchend', handleDragEnd);

        return () => {
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
            window.removeEventListener('touchmove', handleDragMove);
            window.removeEventListener('touchend', handleDragEnd);
        };
    }, [handleDragMove, handleDragEnd]);

    // 3. 可見性改變時重新校正時間，避免背景頁節流
    useEffect(() => {
        const handleVisibility = () => {
            if (!isRunning || !endTimeRef.current) return;
            const msLeft = endTimeRef.current - Date.now();
            if (msLeft <= 0) {
                setTimeLeft(0);
                if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
                setTimeout(timerFinished, 0);
            } else {
                setTimeLeft(Math.ceil(msLeft / 1000));
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [isRunning, timerFinished]);

    // 4. 確定狀態文字
    let statusText;
    if (isDragging && wasRunningRef.current) {
        statusText = "調整中...";
    } else if (isRunning) {
        statusText = "工作中...";
    } else if (timeLeft <= 0) {
        statusText = "時間到";
    } else {
        statusText = "點擊開始";
    }

    return (
        <div className="app-shell">
            {/* 背景裝飾 */}
            <div className="background-glow">
                <div className="glow-one"></div>
                <div className="glow-two"></div>
            </div>

            {/* 主容器 */}
            <main className="main-stack">
                {/* 標題 */}
                <div className="title-block">
                    <h1>Eye Guardian</h1>
                    <p>拖曳指針設定時間，保護您的雙眼</p>
                </div>

                {/* 圓形計時器容器 */}
                <div
                    id="clock-container"
                    className={`clock-shell ${isRunning ? 'breathing-border' : ''}`}
                >
                    {/* SVG 環形圖 */}
                    <svg
                        ref={svgRef}
                        id="timer-svg"
                        viewBox={`0 0 ${SVG_VIEWBOX_SIZE} ${SVG_VIEWBOX_SIZE}`}
                    >
                        {/* 錶盤刻度 */}
                        <Ticks />

                        {/* 底部軌道 (半透明) */}
                        <circle
                            cx={CENTER}
                            cy={CENTER}
                            r={RADIUS}
                            fill="none"
                            stroke="#292524"
                            strokeWidth="12"
                            strokeLinecap="round"
                            pointerEvents="none"
                        />

                        {/* 進度條 (綠色) */}
                        <circle
                            id="progress-ring"
                            cx={CENTER}
                            cy={CENTER}
                            r={RADIUS}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="12"
                            strokeLinecap="round"
                            style={{
                                strokeDasharray: `${CIRCUMFERENCE - drawLength} ${CIRCUMFERENCE}`,
                                strokeDashoffset: 0,
                            }}
                            className="progress"
                            pointerEvents="none"
                        />

                        {/* 指針 (小球) - 拖曳元素 */}
                        <g
                            ref={pointerRef}
                            id="pointer-group"
                            style={{ transform: `translate(${CENTER}px, ${CENTER}px) rotate(${degrees}deg)` }}
                            className={isRunning ? 'pointer pointer-draggable' : 'pointer'}
                            onMouseDown={handleDragStart}
                            onTouchStart={handleDragStart}
                            onClick={(e) => e.stopPropagation()} // 阻止冒泡到中心點擊區
                        >
                            {/* 小球 visual */}
                            <circle
                                cx={RADIUS}
                                cy={0}
                                r="12"
                                fill="#ecfccb"
                                stroke="#10b981"
                                strokeWidth="3"
                                className="pointer-dot"
                            />
                            {/* 隱形觸控靶心 */}
                            <circle cx={RADIUS} cy={0} r="24" fill="transparent" />
                        </g>
                    </svg>

                    {/* 中間文字顯示 (點擊這裡可以開始/暫停) */}
                    <div
                        id="center-click-area"
                        className="center-area"
                        style={{ pointerEvents: 'none' }}
                    >
                        <button
                            type="button"
                            className="center-button"
                            style={{ pointerEvents: 'auto' }}
                            onClick={handleStartStop}
                        >
                            <div id="time-display" className="time-display">
                                {formatTime(timeLeft)}
                            </div>
                            <div id="status-text" className="status-text">
                                {statusText}
                            </div>
                        </button>
                    </div>
                </div>

                <div className="controls-stack">
                    {/* 更多設定觸發 */}
                    <div className="settings-trigger-area">
                        <button
                            className="more-button"
                            aria-label="提醒設定"
                            onClick={() => setIsSettingsOpen((prev) => !prev)}
                        >
                            <span></span>
                            <span></span>
                            <span></span>
                        </button>
                    </div>

                    {/* 控制區：滑桿 */}
                    <div className="control-card">
                        <div className="control-row">
                            <span>專注時長 (計時中無法調整)</span>
                            <span id="slider-value" className="control-value">
                                {durationMinutes} 分鐘
                            </span>
                        </div>
                        <input
                            type="range"
                            id="duration-slider"
                            min="1"
                            max={MAX_MINUTES}
                            value={durationMinutes}
                            step="1"
                            disabled={isRunning}
                            onChange={handleSliderChange}
                            className="slider"
                        />
                        <div className="control-scale">
                            <span>1 min</span>
                            <span>{MAX_MINUTES} min</span>
                        </div>
                    </div>
                </div>
            </main>

            {/* 彈窗 (React 模態框實現) */}
            {isAlertOpen && (
                <>
                    <div className="dialog-backdrop"></div>
                    <div id="alert-dialog" className="dialog-open alert-card">
                        <div className="alert-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                        </div>
                        <h2 className="alert-title">時間到了！</h2>
                        <p className="alert-body">
                            請放下手邊工作，讓眼睛休息一下。<br />
                            眺望遠方至少 20 秒。
                        </p>
                        <button onClick={closeAlert} className="alert-button">
                            好的，我會休息
                        </button>
                    </div>
                </>
            )}

            {/* 設定彈窗 */}
            {isSettingsOpen && (
                <>
                    <div className="dialog-backdrop" onClick={() => setIsSettingsOpen(false)}></div>
                    <div className="settings-modal dialog-open">
                        <div className="settings-modal-title">設定選項</div>
                        <div className="settings-divider"></div>
                        <label className="settings-row">
                            <span>結束時播放警報音效</span>
                            <input
                                type="checkbox"
                                checked={enableSound}
                                onChange={(e) => {
                                    const checked = e.target.checked;
                                    setEnableSound(checked);
                                    persistSettings({ enableSound: checked });
                            }}
                                className="settings-toggle"
                            />
                        </label>
                        {enableSound && (
                            <>
                                <div className="sound-options">
                                    <div className="mode-desc">點擊可立即試聽</div>
                                    <div className="sound-segment">
                                        <button
                                            type="button"
                                            className={`sound-pill ${soundMode === 'default' ? 'active' : ''}`}
                                            onClick={() => {
                                                setSoundMode('default');
                                                persistSettings({ soundMode: 'default' });
                                                playSoundPreview('default');
                                            }}
                                        >
                                            預設音效
                                        </button>
                                        <button
                                            type="button"
                                            className={`sound-pill ${soundMode === 'loud' ? 'active' : ''}`}
                                            onClick={() => {
                                                setSoundMode('loud');
                                                persistSettings({ soundMode: 'loud' });
                                                playSoundPreview('loud');
                                            }}
                                        >
                                            顯著音效
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                        <div className="settings-divider"></div>
                        <div className="mode-group">
                            <div className="mode-text">
                                <span className="mode-title">通知方式</span>
                                <span className="mode-desc">選擇提醒方式，系統通知需允許瀏覽器通知。</span>
                            </div>
                            <div className="mode-segment">
                                <button
                                    type="button"
                                    className={`mode-pill ${enableNotification ? 'active' : ''}`}
                                    onClick={() => setNotificationMode(true)}
                                >
                                    系統通知
                                </button>
                                <button
                                    type="button"
                                    className={`mode-pill ${enableSystemAlert ? 'active' : ''}`}
                                    onClick={() => setNotificationMode(false)}
                                >
                                    系統級提示
                                </button>
                            </div>
                        </div>
                        <button className="settings-close-btn" onClick={() => setIsSettingsOpen(false)}>
                            關閉
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default App;
