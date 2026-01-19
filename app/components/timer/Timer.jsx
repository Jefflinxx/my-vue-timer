"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import styled, { css, keyframes } from "styled-components";

// --- 核心幾何常數 ---
const MAX_MINUTES = 60;
const RADIUS = 130;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SVG_VIEWBOX_SIZE = 300; // SVG viewBox="0 0 300 300"
const CENTER = SVG_VIEWBOX_SIZE / 2; // 150
const STORAGE_KEY = "eye-guardian-settings";

// --- 格式化時間 (MM:SS) ---
const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

// --- SVG 刻度線組件 ---
const Ticks = () => {
  const ticks = [];
  for (let i = 0; i < 60; i++) {
    const angle = i * 6 * (Math.PI / 180);
    const isMajor = i % 5 === 0;
    const outerR = 145;
    const innerR = isMajor ? 135 : 140;

    const x1 = CENTER + innerR * Math.cos(angle);
    const y1 = CENTER + innerR * Math.sin(angle);
    const x2 = CENTER + outerR * Math.cos(angle);
    const y2 = CENTER + outerR * Math.sin(angle);

    ticks.push(
      <TickMark
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        style={{ stroke: isMajor ? "#78716c" : "#44403c", strokeWidth: isMajor ? 3 : 2 }}
      />,
    );
  }
  return (
    <g id="ticks-group" pointerEvents="none">
      {ticks}
    </g>
  );
};

// --- 計時器元件 ---
const Timer = () => {
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
  const [soundMode, setSoundMode] = useState("default"); // 'default' | 'loud'

  // Ref
  const timerIntervalRef = useRef(null);
  const audioCtxRef = useRef(null);
  const svgRef = useRef(null);
  const pointerRef = useRef(null);
  const notificationPermissionRef = useRef(
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );
  const alertShownRef = useRef(false); // 作為「已通知」的 guard，避免重複送出
  const beforeUnloadHandlerRef = useRef(null);
  const settingsLoadedRef = useRef(false);
  const wasRunningRef = useRef(false);
  const endTimeRef = useRef(null); // 用來計算剩餘時間的絕對時間戳 (ms)
  const scheduledBeepRef = useRef(null);

  const persistSettings = useCallback(
    (overrides = {}) => {
      if (typeof window === "undefined") return;
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
        console.log("[storage] save error:", err);
      }
    },
    [durationMinutes, enableNotification, enableSystemAlert, enableSound, soundMode],
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
    [persistSettings],
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
      if (audioCtx.state === "suspended") audioCtx.resume();

      const nowMs = Date.now();
      const delaySec = Math.max(0, (targetTimeMs - nowMs) / 1000);
      const baseStart = audioCtx.currentTime + delaySec;

      // 定義音效 pattern
      const patterns =
        mode === "loud"
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
          : [{ offset: 0.0, duration: 0.5, startFreq: 440, endFreq: 880, gain: 0.1 }];

      cancelScheduledBeep();
      const nodes = [];

      patterns.forEach(({ offset, duration, startFreq, endFreq, gain }) => {
        const startAt = baseStart + offset;
        const endAt = startAt + duration;

        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = "sine";
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
    [enableSound, soundMode, cancelScheduledBeep],
  );

  const playSoundPreview = useCallback(
    (mode) => {
      const target = Date.now() + 50;
      scheduleAlarmSound(target, mode);
    },
    [scheduleAlarmSound],
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
    if (typeof Notification === "undefined") return;

    // 要提醒用戶開 mac chrome 通知權限
    const showNotification = () => {
      try {
        new Notification("時間到了！", {
          body: "請休息眼睛，眺望遠方至少 20 秒。",
          icon: "/favicon.ico",
          // requireInteraction: true, // 加上這行 mac 通知會壞
        });
        console.log("[notify] notification dispatched");
        return true;
      } catch (err) {
        console.log("[notify] notification error:", err?.message || err);
        return false;
      }
    };

    // 若已同意權限且不在當前分頁，發出系統通知
    if (notificationPermissionRef.current === "granted") {
      console.log("[notify] permission granted, sending notification");
      const ok = showNotification();
      if (!ok && typeof window !== "undefined") {
        window.alert("時間到了！請休息眼睛，眺望遠方至少 20 秒。");
      }
      return;
    }

    // 若尚未決定權限，嘗試在計時完成時請求一次
    if (notificationPermissionRef.current === "default") {
      console.log("[notify] requesting permission at finish");
      Notification.requestPermission().then((perm) => {
        notificationPermissionRef.current = perm;
        if (perm === "granted") {
          console.log("[notify] permission granted after request, sending notification");
          const ok = showNotification();
          if (!ok && typeof window !== "undefined") {
            window.alert("時間到了！請休息眼睛，眺望遠方至少 20 秒。");
          }
        } else {
          console.log("[notify] permission not granted after request:", perm);
        }
      });
      return;
    }

    console.log(
      "[notify] permission state blocks notification:",
      notificationPermissionRef.current,
    );
  }, []);

  const timerFinished = useCallback(() => {
    if (alertShownRef.current) {
      console.log("[timer] finish skipped, already notified");
      return;
    }
    alertShownRef.current = true;
    console.log("[timer] finished, timeLeft reached 0");
    setIsRunning(false);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = null;
    endTimeRef.current = null;
    setIsAlertOpen(true);
    if (enableNotification) {
      triggerNotification();
    }
    if (enableSystemAlert) {
      if (typeof window !== "undefined") {
        const handler = (e) => {
          e.preventDefault();
          e.returnValue = "";
        };
        beforeUnloadHandlerRef.current = handler;
        window.addEventListener("beforeunload", handler);
        // 觸發 reload 以顯示 beforeunload 提醒
        window.location.reload();
      }
    }
  }, [enableNotification, enableSystemAlert, triggerNotification]);

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
    if (
      !isRunning &&
      typeof Notification !== "undefined" &&
      notificationPermissionRef.current === "default"
    ) {
      console.log("[notify] requesting permission on start");
      Notification.requestPermission().then((perm) => {
        notificationPermissionRef.current = perm;
        console.log("[notify] permission result on start:", perm);
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

  const handleDragMove = useCallback(
    (e) => {
      if (!isDragging) return;
      e.preventDefault();

      const angle = getAngleFromEvent(e);

      // CW 拖曳映射邏輯: 0 deg (12 o'clock) -> 100% time, 360 deg (12 o'clock) -> 0% time
      let targetPercentage = 1 - angle / 360;

      // 靠近 12 點 (0/360度) 時，確保能設定到 100%
      if ((angle > 350 && angle <= 360) || (angle >= 0 && angle < 10)) {
        targetPercentage = 1.0;
      }

      const newTime = targetPercentage * totalDuration;

      // 更新時間狀態 (只更新 timeLeft，totalDuration 不變)
      setTimeLeft(Math.round(Math.max(0, Math.min(totalDuration, newTime))));
    },
    [isDragging, totalDuration, getAngleFromEvent],
  );

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
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (typeof saved.durationMinutes === "number") {
          const mins = Math.max(1, Math.min(MAX_MINUTES, saved.durationMinutes));
          setDurationMinutes(mins);
          const secs = mins * 60;
          setTotalDuration(secs);
          setTimeLeft(secs);
        }
        if (typeof saved.enableNotification === "boolean") {
          setEnableNotification(saved.enableNotification);
        }
        if (typeof saved.enableSystemAlert === "boolean") {
          setEnableSystemAlert(saved.enableSystemAlert);
        }
        if (typeof saved.enableSound === "boolean") {
          setEnableSound(saved.enableSound);
        }
        if (typeof saved.soundMode === "string") {
          setSoundMode(saved.soundMode);
        }
      }
      settingsLoadedRef.current = true;
      // 若無存檔，初次也寫入一次預設值，確保後續更新有基礎
      if (!raw) {
        persistSettings();
      }
    } catch (err) {
      console.log("[storage] load error:", err);
    }
  }, [persistSettings]);

  // 1. 定時器清理
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (beforeUnloadHandlerRef.current) {
        window.removeEventListener("beforeunload", beforeUnloadHandlerRef.current);
      }
    };
  }, []);

  // 2. 拖曳事件監聽 (綁定到 window 以確保滑鼠移出元素時仍可追蹤)
  useEffect(() => {
    // Mouse Events
    window.addEventListener("mousemove", handleDragMove);
    window.addEventListener("mouseup", handleDragEnd);

    // Touch Events
    window.addEventListener("touchmove", handleDragMove, { passive: false });
    window.addEventListener("touchend", handleDragEnd);

    return () => {
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchmove", handleDragMove);
      window.removeEventListener("touchend", handleDragEnd);
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
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
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
    <TimerShell>
      <TimerBackgroundGlow>
        <TimerGlowOne />
        <TimerGlowTwo />
      </TimerBackgroundGlow>

      <TimerMainStack>
        <TimerTitleBlock>
          <h1>Eye Guardian</h1>
          <p>拖曳指針設定時間，保護您的雙眼</p>
        </TimerTitleBlock>

        <TimerClockShell id="clock-container" $breathing={isRunning}>
          <svg ref={svgRef} id="timer-svg" viewBox={`0 0 ${SVG_VIEWBOX_SIZE} ${SVG_VIEWBOX_SIZE}`}>
            <Ticks />

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

            <TimerProgress
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
              pointerEvents="none"
            />

            <TimerPointer
              ref={pointerRef}
              id="pointer-group"
              style={{ transform: `translate(${CENTER}px, ${CENTER}px) rotate(${degrees}deg)` }}
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
              onClick={(e) => e.stopPropagation()}
            >
              <TimerPointerDot
                cx={RADIUS}
                cy={0}
                r="12"
                fill="#ecfccb"
                stroke="#10b981"
                strokeWidth="3"
              />
              <circle cx={RADIUS} cy={0} r="24" fill="transparent" />
            </TimerPointer>
          </svg>

          <TimerCenterArea id="center-click-area" style={{ pointerEvents: "none" }}>
            <TimerCenterButton
              type="button"
              style={{ pointerEvents: "auto" }}
              onClick={handleStartStop}
            >
              <TimerTimeDisplay id="time-display">{formatTime(timeLeft)}</TimerTimeDisplay>
              <TimerStatusText id="status-text">{statusText}</TimerStatusText>
            </TimerCenterButton>
          </TimerCenterArea>
        </TimerClockShell>

        <TimerControlsStack>
          <TimerSettingsTriggerArea>
            <TimerMoreButton
              aria-label="提醒設定"
              onClick={() => setIsSettingsOpen((prev) => !prev)}
            >
              <span />
              <span />
              <span />
            </TimerMoreButton>
          </TimerSettingsTriggerArea>

          <TimerControlCard>
            <TimerControlRow>
              <span>專注時長 (計時中無法調整)</span>
              <TimerControlValue id="slider-value">{durationMinutes} 分鐘</TimerControlValue>
            </TimerControlRow>
            <TimerSlider
              type="range"
              id="duration-slider"
              min="1"
              max={MAX_MINUTES}
              value={durationMinutes}
              step="1"
              disabled={isRunning}
              onChange={handleSliderChange}
            />
            <TimerControlScale>
              <span>1 min</span>
              <span>{MAX_MINUTES} min</span>
            </TimerControlScale>
          </TimerControlCard>
        </TimerControlsStack>
      </TimerMainStack>

      {isAlertOpen && (
        <>
          <DialogBackdrop></DialogBackdrop>
          <TimerAlertCard id="alert-dialog">
            <TimerAlertIcon>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </TimerAlertIcon>
            <TimerAlertTitle>時間到了！</TimerAlertTitle>
            <TimerAlertBody>
              請放下手邊工作，讓眼睛休息一下。
              <br />
              眺望遠方至少 20 秒。
            </TimerAlertBody>
            <TimerAlertButton onClick={closeAlert}>好的，我會休息</TimerAlertButton>
          </TimerAlertCard>
        </>
      )}

      {isSettingsOpen && (
        <>
          <DialogBackdrop onClick={() => setIsSettingsOpen(false)}></DialogBackdrop>
          <TimerSettingsModal>
            <TimerSettingsModalTitle>設定選項</TimerSettingsModalTitle>
            <TimerSettingsDivider></TimerSettingsDivider>
            <TimerSettingsRow>
              <span>結束時播放警報音效</span>
              <TimerSettingsToggle
                type="checkbox"
                checked={enableSound}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setEnableSound(checked);
                  persistSettings({ enableSound: checked });
                }}
              />
            </TimerSettingsRow>
            {enableSound && (
              <>
                <TimerSoundOptions>
                  <TimerModeDesc>點擊可立即試聽</TimerModeDesc>
                  <TimerSoundSegment>
                    <TimerSoundPill
                      type="button"
                      $active={soundMode === "default"}
                      onClick={() => {
                        setSoundMode("default");
                        persistSettings({ soundMode: "default" });
                        playSoundPreview("default");
                      }}
                    >
                      預設音效
                    </TimerSoundPill>
                    <TimerSoundPill
                      type="button"
                      $active={soundMode === "loud"}
                      onClick={() => {
                        setSoundMode("loud");
                        persistSettings({ soundMode: "loud" });
                        playSoundPreview("loud");
                      }}
                    >
                      顯著音效
                    </TimerSoundPill>
                  </TimerSoundSegment>
                </TimerSoundOptions>
              </>
            )}
            <TimerSettingsDivider></TimerSettingsDivider>
            <TimerModeGroup>
              <TimerModeText>
                <TimerModeTitle>通知方式</TimerModeTitle>
                <TimerModeDesc>選擇提醒方式，系統通知需允許瀏覽器通知。</TimerModeDesc>
              </TimerModeText>
              <TimerModeSegment>
                <TimerModePill
                  type="button"
                  $active={enableNotification}
                  onClick={() => setNotificationMode(true)}
                >
                  系統通知
                </TimerModePill>
                <TimerModePill
                  type="button"
                  $active={enableSystemAlert}
                  onClick={() => setNotificationMode(false)}
                >
                  系統級提示
                </TimerModePill>
              </TimerModeSegment>
            </TimerModeGroup>
            <TimerSettingsCloseButton onClick={() => setIsSettingsOpen(false)}>
              關閉
            </TimerSettingsCloseButton>
          </TimerSettingsModal>
        </>
      )}
    </TimerShell>
  );
};

export default Timer;

const breathe = keyframes`
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
  50% {
    box-shadow: 0 0 20px 2px rgba(16, 185, 129, 0.3);
  }
`;

const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
`;

const TimerShell = styled.div`
  /* position: relative; */
  /* min-height: 100vh; */
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 48px 16px 64px;
  background: #1c1917;
  color: #e7e5e4;
  overflow: hidden;

  /* border: 1px solid green; */
`;

const TimerBackgroundGlow = styled.div`
  position: absolute;
  inset: 0;
  overflow: hidden;
  opacity: 0.2;
  pointer-events: none;
`;

const TimerGlowBase = styled.div`
  position: absolute;
  width: 24rem;
  height: 24rem;
  border-radius: 9999px;
  filter: blur(80px);
  mix-blend-mode: screen;
`;

const TimerGlowOne = styled(TimerGlowBase)`
  top: -10%;
  left: -10%;
  background: #064e3b;
`;

const TimerGlowTwo = styled(TimerGlowBase)`
  bottom: -10%;
  right: -10%;
  background: #292524;
`;

const TimerMainStack = styled.div`
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
  /* position: relative; */
  z-index: 1;

  /* border: 1px solid red; */
`;

const TimerTitleBlock = styled.div`
  text-align: center;
  user-select: none;

  h1 {
    margin: 0;
    font-size: 32px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #34d399;
  }

  p {
    margin: 6px 0 0;
    font-size: 14px;
    color: #a8a29e;
  }

  @media (min-width: 768px) {
    h1 {
      font-size: 36px;
    }
  }
`;

const TimerClockShell = styled.div`
  position: relative;
  width: 18rem;
  height: 18rem;
  border-radius: 9999px;
  transition: box-shadow 0.5s ease;
  ${(props) =>
    props.$breathing &&
    css`
      animation: ${breathe} 3s infinite ease-in-out;
    `}

  svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  @media (min-width: 768px) {
    width: 20rem;
    height: 20rem;
  }
`;

const TimerPointer = styled.g`
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
`;

const TimerPointerDot = styled.circle`
  filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.4));
`;

const TimerProgress = styled.circle`
  opacity: 0.9;
  filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.3));
`;

const TimerCenterArea = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  text-align: center;
`;

const TimerCenterButton = styled.button`
  all: unset;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 210px;
  height: 210px;
  border-radius: 9999px;
`;

const TimerTimeDisplay = styled.div`
  font-size: 60px;
  font-weight: 300;
  color: #ffffff;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
`;

const TimerStatusText = styled.div`
  margin-top: 8px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #10b981;
  opacity: 0.85;
`;

const TimerControlsStack = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0px;
`;

const TimerSettingsTriggerArea = styled.div`
  width: 100%;
  display: flex;
  justify-content: flex-start;
  position: relative;
`;

const TimerMoreButton = styled.button`
  width: 42px;
  height: 42px;
  border-radius: 12px;
  border: none;
  background: rgba(24, 24, 27, 0.7);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  cursor: pointer;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.24);
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    transform 0.08s ease;

  span {
    width: 6px;
    height: 6px;
    border-radius: 9999px;
    background: #d1fae5;
    box-shadow: 0 0 6px rgba(52, 211, 153, 0.4);
  }

  &:hover {
    border-color: rgba(52, 211, 153, 0.45);
    background: rgba(24, 24, 27, 0.8);
    transform: translateY(-1px);
  }
`;

const TimerControlCard = styled.div`
  /* width: 100%; */
  background: rgba(41, 37, 36, 0.6);
  border: 1px solid rgba(120, 113, 108, 0.45);
  border-radius: 20px;
  padding: 24px;
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.24);
`;

const TimerControlRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: #a8a29e;
`;

const TimerControlValue = styled.span`
  color: #34d399;
  font-weight: 700;
`;

const TimerSlider = styled.input`
  width: 100%;
  background: transparent;
  cursor: pointer;
  -webkit-appearance: none;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    height: 24px;
    width: 24px;
    border-radius: 50%;
    background: #10b981;
    cursor: pointer;
    margin-top: -10px;
    box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
    transition: transform 0.1s;
  }

  &:disabled::-webkit-slider-thumb {
    cursor: not-allowed;
  }

  &::-webkit-slider-thumb:hover {
    transform: scale(1.1);
  }

  &::-webkit-slider-runnable-track {
    width: 100%;
    height: 4px;
    cursor: pointer;
    background: #44403c;
    border-radius: 2px;
  }
`;

const TimerControlScale = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #78716c;
  padding: 0 6px;
`;

const DialogBackdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.82);
  backdrop-filter: blur(8px);
  z-index: 40;
`;

const TimerAlertCard = styled.div`
  animation: ${fadeIn} 0.3s ease-out;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 50;
  background: rgba(41, 37, 36, 0.95);
  border: 1px solid rgba(16, 185, 129, 0.35);
  border-radius: 22px;
  padding: 32px 28px 28px;
  width: min(420px, calc(100vw - 32px));
  text-align: center;
  color: #e7e5e4;
  box-shadow:
    0 20px 80px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(0, 0, 0, 0.2);
`;

const TimerAlertIcon = styled.div`
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  border-radius: 9999px;
  background: rgba(6, 78, 59, 0.9);
  display: grid;
  place-items: center;

  svg {
    width: 32px;
    height: 32px;
    stroke: #6ee7b7;
    stroke-width: 2.2;
    fill: none;
  }
`;

const TimerAlertTitle = styled.h2`
  margin: 0 0 12px;
  font-size: 22px;
  font-weight: 800;
  color: #f5f5f4;
`;

const TimerAlertBody = styled.p`
  margin: 0 0 22px;
  color: #d6d3d1;
  line-height: 1.6;
  font-size: 15px;
`;

const TimerAlertButton = styled.button`
  width: 100%;
  padding: 14px 16px;
  background: linear-gradient(120deg, #0ea667, #16c58b);
  border: 1px solid rgba(16, 185, 129, 0.65);
  border-radius: 9999px;
  color: #f1fff7;
  font-weight: 800;
  font-size: 15px;
  cursor: pointer;
  box-shadow: none;
  transition:
    box-shadow 0.12s ease,
    filter 0.12s ease;

  &:hover {
    box-shadow: 0 14px 36px rgba(16, 185, 129, 0.4);
    filter: brightness(1.03);
  }

  &:active {
    filter: brightness(1.01);
  }
`;

const TimerSettingsModal = styled.div`
  animation: ${fadeIn} 0.3s ease-out;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 50;
  background: rgba(41, 37, 36, 0.95);
  border: 1px solid rgba(16, 185, 129, 0.35);
  border-radius: 22px;
  padding: 32px 28px 28px;
  width: min(420px, calc(100vw - 32px));
  color: #e7e5e4;
  box-shadow:
    0 20px 80px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(0, 0, 0, 0.2);
`;

const TimerSettingsModalTitle = styled.div`
  font-size: 20px;
  font-weight: 800;
  color: #34d399;
  margin: 0 0 12px;
`;

const TimerSettingsDivider = styled.div`
  height: 1px;
  background: rgba(120, 113, 108, 0.5);
  margin: 14px 0;
`;

const TimerSettingsRow = styled.label`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  color: #e7e5e4;
`;

const TimerSettingsToggle = styled.input`
  appearance: none;
  -webkit-appearance: none;
  width: 46px;
  height: 26px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.3);
  position: relative;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease;
  padding: 0;

  &::before {
    content: "";
    position: absolute;
    top: 2px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 9999px;
    background: #ffffff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
    transition: transform 0.18s ease;
  }

  &:checked {
    background: rgba(20, 162, 107, 0.55);
    border-color: rgba(20, 162, 107, 0.8);
  }

  &:checked::before {
    transform: translateX(20px);
  }
`;

const TimerModeGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const TimerModeText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const TimerModeTitle = styled.span`
  font-weight: 800;
  color: #34d399;
`;

const TimerModeDesc = styled.span`
  font-size: 13px;
  color: #d6d3d1;
`;

const TimerModeSegment = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
`;

const TimerModePill = styled.button`
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 9999px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.06);
  color: #e7e5e4;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;

  ${(props) =>
    props.$active &&
    css`
      background: rgba(20, 162, 107, 0.25);
      border-color: rgba(20, 162, 107, 0.8);
      color: #ffffff;
    `}
`;

const TimerSoundOptions = styled.div`
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const TimerSoundSegment = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
`;

const TimerSoundPill = styled.button`
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.06);
  color: #e7e5e4;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;

  ${(props) =>
    props.$active &&
    css`
      background: rgba(20, 162, 107, 0.2);
      border-color: rgba(20, 162, 107, 0.8);
      color: #ffffff;
    `}
`;

const TimerSettingsCloseButton = styled.button`
  margin-top: 24px;
  width: 100%;
  padding: 14px 16px;
  border-radius: 9999px;
  border: none;
  background: #14a26b;
  color: #ffffff;
  font-weight: 800;
  font-size: 16px;
  cursor: pointer;
  box-shadow: none;

  &:hover {
    filter: brightness(1.05);
  }
`;

const TickMark = styled.line`
  stroke: #44403c;
  stroke-width: 2;
`;
