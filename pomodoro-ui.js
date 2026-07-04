/**
 * 番茄钟 HUD 与设置面板 UI 控制器。
 */
import { PHASE, formatCountdown, DEFAULT_SETTINGS } from "./pomodoro.js";
import { onStorageChanged } from "./storage-adapter.js";
import { playSound, warmupAudio } from "./audio.js";

const LABELS = {
  [PHASE.IDLE]: "Campfire clock",
  [PHASE.FOCUS]: "Focus session",
  [PHASE.SHORT_BREAK]: "Short break",
  [PHASE.LONG_BREAK]: "Long break",
  [PHASE.PAUSED]: "Paused",
  [PHASE.ROAST_CEREMONY]: "Marshmallow time",
};

/**
 * 初始化番茄钟 UI 并绑定事件。
 * @param {import("./pomodoro.js").PomodoroController} pomodoro
 * @param {object} hooks
 * @param {() => void} hooks.onStartFocus 保存并开始专注时的回调
 * @returns {{ render: (payload: object) => void, showToast: (message: string) => void, openSettings: () => void }}
 */
export function initPomodoroUI(pomodoro, hooks) {
  const hud = document.querySelector(".hud");
  const signalEl = document.querySelector("#signal");
  const pomodoroPanel = document.querySelector("#pomodoroPanel");
  const pomodoroStatus = document.querySelector("#pomodoroStatus");
  const pomodoroCountdown = document.querySelector("#pomodoroCountdown");
  const pomodoroActions = document.querySelector("#pomodoroActions");
  const startFocusButton = document.querySelector("#startFocusButton");
  const settingsButton = document.querySelector("#settingsButton");
  const settingsOverlay = document.querySelector("#settingsOverlay");
  const settingsForm = document.querySelector("#settingsForm");
  const closeSettingsButton = document.querySelector("#closeSettingsButton");
  const resetSettingsButton = document.querySelector("#resetSettingsButton");
  const saveSettingsButton = document.querySelector("#saveSettingsButton");
  const saveAndStartButton = document.querySelector("#saveAndStartButton");
  const debugPhaseButton = document.querySelector("#debugPhaseButton");
  const toastEl = document.querySelector("#toast");

  let toastTimer = null;

  /**
   * 显示短暂 toast 提示。
   * @param {string} message
   * @param {number} [durationMs=2600]
   */
  function showToast(message, durationMs = 2600) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, durationMs);
  }

  /**
   * 将焦点移出设置面板，避免关闭时 aria-hidden 与聚焦子元素冲突。
   */
  function releaseSettingsFocus() {
    const active = document.activeElement;
    if (!settingsOverlay?.contains(active)) {
      return;
    }
    if (settingsButton && typeof settingsButton.focus === "function") {
      settingsButton.focus({ preventScroll: true });
      return;
    }
    if (active instanceof HTMLElement) {
      active.blur();
    }
  }

  /**
   * 打开番茄钟设置面板并回填当前值。
   */
  function openSettings() {
    if (!settingsOverlay) {
      return;
    }
    fillSettingsForm(pomodoro.getSettings());
    settingsOverlay.hidden = false;
    settingsOverlay.setAttribute("aria-hidden", "false");
    settingsOverlay.inert = false;
    requestAnimationFrame(() => {
      closeSettingsButton?.focus({ preventScroll: true });
    });
  }

  /**
   * 关闭设置面板。
   */
  function closeSettings() {
    if (!settingsOverlay) {
      return;
    }
    releaseSettingsFocus();
    settingsOverlay.hidden = true;
    settingsOverlay.setAttribute("aria-hidden", "true");
    settingsOverlay.inert = true;
  }

  /**
   * 判断设置面板是否处于打开状态。
   * @returns {boolean}
   */
  function isSettingsOpen() {
    return Boolean(settingsOverlay && !settingsOverlay.hidden);
  }

  /**
   * 从表单读取设置项。
   * @returns {object}
   */
  function readSettingsFromForm() {
    const focusMinutes = document.querySelector("#focusMinutes");
    const shortBreakMinutes = document.querySelector("#shortBreakMinutes");
    const longBreakMinutes = document.querySelector("#longBreakMinutes");
    const cyclesBeforeLong = document.querySelector("#cyclesBeforeLong");
    const autoStartNext = document.querySelector("#autoStartNext");
    const soundEnabled = document.querySelector("#soundEnabled");
    const notifyEnabled = document.querySelector("#notifyEnabled");
    const manualRoastEnabled = document.querySelector("#manualRoastEnabled");

    return {
      focusMinutes: clamp(Number(focusMinutes.value) || DEFAULT_SETTINGS.focusMinutes, 5, 90),
      shortBreakMinutes: clamp(Number(shortBreakMinutes.value) || DEFAULT_SETTINGS.shortBreakMinutes, 1, 30),
      longBreakMinutes: clamp(Number(longBreakMinutes.value) || DEFAULT_SETTINGS.longBreakMinutes, 5, 45),
      cyclesBeforeLong: clamp(Number(cyclesBeforeLong.value) || DEFAULT_SETTINGS.cyclesBeforeLong, 2, 8),
      autoStartNext: autoStartNext.checked,
      soundEnabled: soundEnabled.checked,
      notifyEnabled: notifyEnabled.checked,
      manualRoastEnabled: manualRoastEnabled.checked,
    };
  }

  /**
   * 保存设置，可选保存后立即开始专注。
   * @param {boolean} [startAfterSave=false]
   */
  async function saveSettings(startAfterSave = false) {
    try {
      const partial = readSettingsFromForm();
      const wasActive = await pomodoro.saveSettings(partial);
      closeSettings();
      showToast(wasActive ? "已保存，当前周期不受影响" : "已保存");

      if (startAfterSave) {
        if (pomodoro.getSession().phase === PHASE.IDLE) {
          warmupAudio();
          hooks.onStartFocus();
        } else {
          // 番茄钟进行中时，"保存并开始专注"仅保存设置，给出明确提示
          showToast("已保存，番茄钟进行中时无法重新开始");
        }
      }
    } catch (error) {
      console.error("保存设置失败", error);
      showToast("保存失败，请重试");
    }
  }

  /**
   * 创建操作按钮。
   * @param {string} label
   * @param {string} className
   * @param {() => void} onClick
   * @returns {HTMLButtonElement}
   */
  function makeActionButton(label, className, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `pomodoro-btn ${className}`;
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  /**
   * 确认对话框。
   * @param {string} message
   * @returns {boolean}
   */
  function confirmAction(message) {
    return window.confirm(message);
  }

  /**
   * 根据阶段渲染操作按钮区。
   * @param {object} session
   */
  function renderActions(session) {
    pomodoroActions.replaceChildren();
    const { phase } = session;

    if (phase === PHASE.FOCUS) {
      pomodoroActions.append(
        makeActionButton("暂停", "btn-secondary", () => pomodoro.pause()),
        makeActionButton("放弃", "btn-danger", () => {
          if (confirmAction("确定放弃本轮专注？不会获得烤棉花糖奖励。")) {
            pomodoro.abandon();
          }
        }),
      );
    } else if (phase === PHASE.PAUSED) {
      pomodoroActions.append(
        makeActionButton("继续", "btn-primary", () => pomodoro.resume()),
        makeActionButton("放弃", "btn-danger", () => {
          if (confirmAction("确定放弃本轮专注？不会获得烤棉花糖奖励。")) {
            pomodoro.abandon();
          }
        }),
      );
    } else if (phase === PHASE.SHORT_BREAK || phase === PHASE.LONG_BREAK) {
      pomodoroActions.append(
        makeActionButton("跳过休息", "btn-secondary", () => {
          if (confirmAction("确定跳过休息？")) {
            pomodoro.skipBreak();
          }
        }),
      );
    }
  }

  /**
   * 更新调试按钮文案，提示下一次点击将切换到的阶段。
   * @param {string} phase 当前番茄钟阶段
   */
  function updateDebugButtonLabel(phase) {
    if (!debugPhaseButton) {
      return;
    }
    if (phase === PHASE.FOCUS || phase === PHASE.PAUSED) {
      debugPhaseButton.textContent = "调试 → 短休息";
      debugPhaseButton.title = "切换到短休息（触发烤棉花糖动画）";
    } else {
      debugPhaseButton.textContent = "调试 → 专注";
      debugPhaseButton.title = "切换到专注中";
    }
  }

  /**
   * 渲染 HUD 主界面。
   * @param {object} payload
   */
  function render(payload) {
    const { settings, session, remainingMs } = payload;
    const { phase, round, completedMessageUntil } = session;
    const isPomodoroVisible = phase !== PHASE.IDLE;

    hud.dataset.phase = phase;
    pomodoroPanel.hidden = !isPomodoroVisible;
    startFocusButton.hidden = phase !== PHASE.IDLE;
    // settingsButton 在所有状态下保持可见，使用户随时可访问设置
    settingsButton.hidden = false;

    if (isPomodoroVisible) {
      if (completedMessageUntil && Date.now() < completedMessageUntil) {
        pomodoroStatus.textContent = "专注完成！";
        pomodoroCountdown.textContent = "🍡";
      } else if (phase === PHASE.ROAST_CEREMONY) {
        // 兼容旧会话：仪式阶段已废弃，按休息态展示
        pomodoroStatus.textContent = `短休息 · 第 ${round}/${settings.cyclesBeforeLong} 轮`;
        pomodoroCountdown.textContent = formatCountdown(remainingMs);
      } else if (phase === PHASE.FOCUS) {
        pomodoroStatus.textContent = `专注中 · 第 ${round}/${settings.cyclesBeforeLong} 轮`;
        pomodoroCountdown.textContent = formatCountdown(remainingMs);
      } else if (phase === PHASE.PAUSED) {
        pomodoroStatus.textContent = `已暂停 · 第 ${round}/${settings.cyclesBeforeLong} 轮`;
        pomodoroCountdown.textContent = formatCountdown(remainingMs);
      } else if (phase === PHASE.SHORT_BREAK) {
        pomodoroStatus.textContent = `短休息 · 第 ${round}/${settings.cyclesBeforeLong} 轮`;
        pomodoroCountdown.textContent = formatCountdown(remainingMs);
      } else if (phase === PHASE.LONG_BREAK) {
        pomodoroStatus.textContent = "长休息";
        pomodoroCountdown.textContent = formatCountdown(remainingMs);
      }

      signalEl.textContent = LABELS[phase] ?? "Pomodoro";
      renderActions(session);
    } else {
      signalEl.textContent = LABELS[PHASE.IDLE];
    }

    updateDebugButtonLabel(phase);
  }

  /**
   * 将设置填入表单。
   * @param {object} settings
   */
  function fillSettingsForm(settings) {
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    document.querySelector("#focusMinutes").value = merged.focusMinutes;
    document.querySelector("#shortBreakMinutes").value = merged.shortBreakMinutes;
    document.querySelector("#longBreakMinutes").value = merged.longBreakMinutes;
    document.querySelector("#cyclesBeforeLong").value = merged.cyclesBeforeLong;
    document.querySelector("#autoStartNext").checked = merged.autoStartNext;
    document.querySelector("#soundEnabled").checked = merged.soundEnabled;
    document.querySelector("#notifyEnabled").checked = merged.notifyEnabled;
    document.querySelector("#manualRoastEnabled").checked = merged.manualRoastEnabled;
  }

  // 直接触发开始专注，不打开设置对话框，符合 PRD "Idle: 开始专注按钮" 要求
  startFocusButton.addEventListener("click", () => {
    warmupAudio();
    hooks.onStartFocus();
  });

  settingsButton.addEventListener("click", () => {
    openSettings();
  });

  if (debugPhaseButton) {
    debugPhaseButton.addEventListener("click", () => {
      const nextPhase = pomodoro.debugToggleFocusBreak();
      showToast(nextPhase === PHASE.SHORT_BREAK ? "调试：短休息" : "调试：专注中");
    });
  }

  if (closeSettingsButton) {
    closeSettingsButton.addEventListener("click", (event) => {
      event.preventDefault();
      closeSettings();
    });
  }

  if (settingsOverlay) {
    settingsOverlay.addEventListener("click", (event) => {
      if (event.target === settingsOverlay) {
        closeSettings();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isSettingsOpen()) {
      closeSettings();
    }
  });

  settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  settingsForm.querySelectorAll("[data-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const field = btn.dataset.step;
      const input = document.querySelector(`#${field}`);
      const delta = Number(btn.dataset.delta);
      const min = Number(input.min);
      const max = Number(input.max);
      input.value = String(Math.min(max, Math.max(min, (Number(input.value) || 0) + delta)));
    });
  });

  // saveSettingsButton 仅在 newtab.html 中存在，index.html 开发页面没有此按钮，需判空
  if (saveSettingsButton) {
    saveSettingsButton.addEventListener("click", () => {
      saveSettings(false);
    });
  }

  saveAndStartButton.addEventListener("click", () => {
    saveSettings(true);
  });

  resetSettingsButton.addEventListener("click", async () => {
    await pomodoro.resetSettings();
    fillSettingsForm(DEFAULT_SETTINGS);
    showToast("已恢复默认设置");
  });

  onStorageChanged((changes, area) => {
    if (area === "local" && changes.pomodoroSession) {
      pomodoro.syncSessionFromStorage(changes.pomodoroSession.newValue);
      render({
        settings: pomodoro.getSettings(),
        session: pomodoro.getSession(),
        remainingMs: pomodoro.getRemainingMs(),
      });
    }
    if (area === "local" && changes.pomodoroPendingEvent?.newValue) {
      const pending = changes.pomodoroPendingEvent.newValue;
      pomodoro.reconcileExpiredState();
      render({
        settings: pomodoro.getSettings(),
        session: pomodoro.getSession(),
        remainingMs: pomodoro.getRemainingMs(),
      });
      if (pending.type === "phase-expired" && pending.phase === PHASE.FOCUS) {
        playSound("focus-complete", pomodoro.getSettings().soundEnabled);
      }
    }
  });

  return { render, showToast, openSettings };
}

/**
 * 将数值限制在范围内。
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
