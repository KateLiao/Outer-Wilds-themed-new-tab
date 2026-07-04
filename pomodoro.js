/**
 * 番茄钟默认设置与常量。
 */
export const DEFAULT_SETTINGS = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLong: 4,
  autoStartNext: false,
  soundEnabled: true,
  notifyEnabled: true,
  manualRoastEnabled: true,
};

export const CEREMONY_DURATION_MS = 0;

export const PHASE = {
  IDLE: "idle",
  FOCUS: "focus",
  ROAST_CEREMONY: "roast_ceremony",
  SHORT_BREAK: "short_break",
  LONG_BREAK: "long_break",
  PAUSED: "paused",
};

/**
 * 创建默认会话对象。
 * @returns {object}
 */
export function createDefaultSession() {
  return {
    phase: PHASE.IDLE,
    round: 1,
    endAt: null,
    pausedRemainingMs: null,
    pausedFromPhase: null,
    ceremonyStartedAt: null,
    pendingBreak: null,
    completedMessageUntil: null,
  };
}

/**
 * 将毫秒格式化为 MM:SS 字符串。
 * @param {number} ms
 * @returns {string}
 */
export function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * 将轮次限制在 [1, cyclesBeforeLong] 内，避免显示「第 5/4 轮」等非法状态。
 * @param {number} round 原始轮次
 * @param {number} cyclesBeforeLong 每周期专注轮数
 * @returns {number}
 */
export function normalizeRound(round, cyclesBeforeLong) {
  const cycles = Math.max(2, Number(cyclesBeforeLong) || DEFAULT_SETTINGS.cyclesBeforeLong);
  const value = Number(round) || 1;
  return Math.min(cycles, Math.max(1, value));
}

/**
 * 判断当前轮次完成后是否应进入长休息。
 * @param {number} round 当前轮次
 * @param {number} cyclesBeforeLong 每周期专注轮数
 * @returns {boolean}
 */
export function isLongBreakRound(round, cyclesBeforeLong) {
  return normalizeRound(round, cyclesBeforeLong) >= Math.max(2, Number(cyclesBeforeLong) || DEFAULT_SETTINGS.cyclesBeforeLong);
}

/**
 * 短休息结束后下一轮的轮次（不超过 cyclesBeforeLong；异常数据时回到 1）。
 * @param {number} round 刚结束短休息时对应的专注轮次
 * @param {number} cyclesBeforeLong 每周期专注轮数
 * @returns {number}
 */
export function getNextRoundAfterShortBreak(round, cyclesBeforeLong) {
  const normalized = normalizeRound(round, cyclesBeforeLong);
  const cycles = Math.max(2, Number(cyclesBeforeLong) || DEFAULT_SETTINGS.cyclesBeforeLong);
  if (normalized >= cycles) {
    return 1;
  }
  return normalized + 1;
}

/**
 * 生成 HUD 阶段状态文案（统一轮次展示规则）。
 * @param {string} phase 当前阶段
 * @param {number} round 当前轮次
 * @param {number} cyclesBeforeLong 每周期专注轮数
 * @returns {string}
 */
export function formatRoundStatus(phase, round, cyclesBeforeLong) {
  const cycles = Math.max(2, Number(cyclesBeforeLong) || DEFAULT_SETTINGS.cyclesBeforeLong);
  const currentRound = normalizeRound(round, cycles);

  if (phase === PHASE.LONG_BREAK) {
    return `长休息 · 已完成 ${cycles} 轮专注`;
  }

  const phaseLabel = {
    [PHASE.FOCUS]: "专注中",
    [PHASE.PAUSED]: "已暂停",
    [PHASE.SHORT_BREAK]: "短休息",
    [PHASE.ROAST_CEREMONY]: "短休息",
  }[phase];

  if (!phaseLabel) {
    return "";
  }

  return `${phaseLabel} · 第 ${currentRound}/${cycles} 轮`;
}

/**
 * 校正会话中的轮次字段，修复历史脏数据。
 * @param {object} session 会话对象
 * @param {number} cyclesBeforeLong 每周期专注轮数
 * @returns {object}
 */
export function sanitizeSessionRound(session, cyclesBeforeLong) {
  return {
    ...session,
    round: normalizeRound(session.round, cyclesBeforeLong),
  };
}

/**
 * 番茄钟控制器：经典四阶段状态机，支持持久化与跨标签同步。
 */
export class PomodoroController {
  /**
   * @param {object} options
   * @param {(event: object) => void} [options.onChange] 状态变更回调
   * @param {(event: object) => void} [options.onComplete] 阶段完成回调（用于音效/场景）
   */
  constructor(options = {}) {
    this.settings = { ...DEFAULT_SETTINGS };
    this.session = createDefaultSession();
    this.onChange = options.onChange ?? (() => {});
    this.onComplete = options.onComplete ?? (() => {});
    this.tickTimer = null;
  }

  /**
   * 从 storage 加载设置与会话并校正过期状态。
   * @returns {Promise<void>}
   */
  async init() {
    const { storageSyncGet, storageLocalGet } = await import("./storage-adapter.js");
    const syncData = await storageSyncGet(["pomodoroSettings", "onboardingComplete"]);
    const localData = await storageLocalGet(["pomodoroSession"]);

    if (syncData.pomodoroSettings) {
      this.settings = { ...DEFAULT_SETTINGS, ...syncData.pomodoroSettings };
    }
    if (localData.pomodoroSession) {
      this.session = { ...createDefaultSession(), ...localData.pomodoroSession };
      this.session = sanitizeSessionRound(this.session, this.settings.cyclesBeforeLong);
    }

    this.reconcileExpiredState();
    await this.persistSession();
    this.startTick();
    this.emitChange();
  }

  /**
   * 获取当前设置副本。
   * @returns {object}
   */
  getSettings() {
    return { ...this.settings };
  }

  /**
   * 获取当前会话副本。
   * @returns {object}
   */
  getSession() {
    return { ...this.session };
  }

  /**
   * 获取当前阶段剩余毫秒数。
   * @returns {number}
   */
  getRemainingMs() {
    const { phase, endAt, pausedRemainingMs, ceremonyStartedAt } = this.session;
    if (phase === PHASE.IDLE) {
      return 0;
    }
    if (phase === PHASE.PAUSED && pausedRemainingMs !== null) {
      return pausedRemainingMs;
    }
    if (phase === PHASE.ROAST_CEREMONY && ceremonyStartedAt) {
      const ceremonyLeft = CEREMONY_DURATION_MS - (Date.now() - ceremonyStartedAt);
      return Math.max(0, ceremonyLeft);
    }
    if (endAt) {
      return Math.max(0, endAt - Date.now());
    }
    return 0;
  }

  /**
   * 是否处于番茄钟活跃态（非 idle）。
   * @returns {boolean}
   */
  isActive() {
    return this.session.phase !== PHASE.IDLE;
  }

  /**
   * 是否允许手动触发烤棉花糖。
   * @returns {boolean}
   */
  canManualRoast() {
    if (!this.settings.manualRoastEnabled) {
      return false;
    }
    if (this.session.phase === PHASE.FOCUS || this.session.phase === PHASE.PAUSED) {
      return false;
    }
    return true;
  }

  /**
   * 开始专注：从 idle 进入 focus，若当前在烤火视角由 UI 先退出。
   * @returns {void}
   */
  startFocus() {
    if (this.session.phase !== PHASE.IDLE) {
      return;
    }
    const durationMs = this.settings.focusMinutes * 60 * 1000;
    const round = normalizeRound(this.session.round || 1, this.settings.cyclesBeforeLong);
    this.session = {
      ...createDefaultSession(),
      phase: PHASE.FOCUS,
      round,
      endAt: Date.now() + durationMs,
      completedMessageUntil: null,
    };
    this.commit("focus-start");
  }

  /**
   * 暂停当前倒计时。
   * @returns {void}
   */
  pause() {
    const { phase, endAt } = this.session;
    if (phase !== PHASE.FOCUS) {
      return;
    }
    const remaining = endAt ? Math.max(0, endAt - Date.now()) : 0;
    this.session.phase = PHASE.PAUSED;
    this.session.pausedFromPhase = PHASE.FOCUS;
    this.session.pausedRemainingMs = remaining;
    this.session.endAt = null;
    this.commit();
  }

  /**
   * 从暂停恢复倒计时。
   * @returns {void}
   */
  resume() {
    if (this.session.phase !== PHASE.PAUSED || this.session.pausedRemainingMs === null) {
      return;
    }
    this.session.phase = this.session.pausedFromPhase ?? PHASE.FOCUS;
    this.session.endAt = Date.now() + this.session.pausedRemainingMs;
    this.session.pausedRemainingMs = null;
    this.session.pausedFromPhase = null;
    this.commit();
  }

  /**
   * 放弃当前专注，回到 idle，轮次不增加。
   * @returns {void}
   */
  abandon() {
    if (this.session.phase !== PHASE.FOCUS && this.session.phase !== PHASE.PAUSED) {
      return;
    }
    const round = normalizeRound(this.session.round, this.settings.cyclesBeforeLong);
    this.session = { ...createDefaultSession(), round };
    this.commit();
  }

  /**
   * 调试：在「专注中」与「短休息」之间切换，并重置对应阶段倒计时。
   * 从专注切到短休息时会触发 focus-complete，便于测试烤棉花糖场景联动。
   * @returns {string} 切换后的阶段（PHASE.FOCUS 或 PHASE.SHORT_BREAK）
   */
  debugToggleFocusBreak() {
    const { phase, round } = this.session;
    const safeRound = normalizeRound(round || 1, this.settings.cyclesBeforeLong);

    if (phase === PHASE.FOCUS || phase === PHASE.PAUSED) {
      const isLongBreak = isLongBreakRound(safeRound, this.settings.cyclesBeforeLong);
      const breakPhase = isLongBreak ? PHASE.LONG_BREAK : PHASE.SHORT_BREAK;
      const durationMs = isLongBreak
        ? this.settings.longBreakMinutes * 60 * 1000
        : this.settings.shortBreakMinutes * 60 * 1000;

      this.session.phase = breakPhase;
      this.session.round = safeRound;
      this.session.endAt = Date.now() + durationMs;
      this.session.pausedRemainingMs = null;
      this.session.pausedFromPhase = null;
      this.session.ceremonyStartedAt = null;
      this.session.pendingBreak = null;
      this.session.completedMessageUntil = null;
      this.onComplete({ type: "focus-complete", round: safeRound, debug: true });
      this.commit(isLongBreak ? "debug-long-break" : "debug-short-break");
      return breakPhase;
    }

    const durationMs = this.settings.focusMinutes * 60 * 1000;
    this.session = {
      ...createDefaultSession(),
      phase: PHASE.FOCUS,
      round: safeRound,
      endAt: Date.now() + durationMs,
      completedMessageUntil: null,
    };
    this.commit("debug-focus");
    return PHASE.FOCUS;
  }

  /**
   * 跳过休息：根据 autoStart 决定进入下一轮专注或 idle。
   * @returns {void}
   */
  skipBreak() {
    if (this.session.phase !== PHASE.SHORT_BREAK && this.session.phase !== PHASE.LONG_BREAK) {
      return;
    }
    this.finishBreak(true);
  }

  /**
   * 保存用户设置；进行中周期不受影响。
   * @param {object} partial
   * @returns {Promise<boolean>} 是否番茄钟进行中
   */
  async saveSettings(partial) {
    const wasActive = this.isActive();
    this.settings = { ...this.settings, ...partial };
    this.session = sanitizeSessionRound(this.session, this.settings.cyclesBeforeLong);
    const { storageSyncSet } = await import("./storage-adapter.js");
    await storageSyncSet({ pomodoroSettings: this.settings });
    this.emitChange();
    return wasActive;
  }

  /**
   * 恢复默认设置。
   * @returns {Promise<void>}
   */
  async resetSettings() {
    this.settings = { ...DEFAULT_SETTINGS };
    const { storageSyncSet } = await import("./storage-adapter.js");
    await storageSyncSet({ pomodoroSettings: this.settings });
    this.emitChange();
  }

  /**
   * 标记 onboarding 已完成。
   * @returns {Promise<void>}
   */
  async completeOnboarding() {
    const { storageSyncSet } = await import("./storage-adapter.js");
    await storageSyncSet({ onboardingComplete: true });
  }

  /**
   * 检查是否已完成 onboarding。
   * @returns {Promise<boolean>}
   */
  async hasCompletedOnboarding() {
    const { storageSyncGet } = await import("./storage-adapter.js");
    const data = await storageSyncGet("onboardingComplete");
    return Boolean(data.onboardingComplete);
  }

  /**
   * 外部 storage 变更时同步会话（多标签）。
   * @param {object} newSession
   * @returns {void}
   */
  syncSessionFromStorage(newSession) {
    if (!newSession) {
      return;
    }
    this.session = { ...createDefaultSession(), ...newSession };
    this.session = sanitizeSessionRound(this.session, this.settings.cyclesBeforeLong);
    this.reconcileExpiredState();
    this.emitChange();
  }

  /**
   * 每秒 tick，检测阶段完成。
   * @returns {void}
   */
  tick() {
    if (this.session.completedMessageUntil && Date.now() >= this.session.completedMessageUntil) {
      this.session.completedMessageUntil = null;
    }

    if (this.session.phase === PHASE.PAUSED || this.session.phase === PHASE.IDLE) {
      this.emitChange();
      return;
    }

    if (this.session.phase === PHASE.ROAST_CEREMONY) {
      // 兼容旧会话：仪式阶段已废弃，直接转入休息
      this.beginBreakAfterCeremony(true);
      return;
    }

    if (this.getRemainingMs() <= 0) {
      this.handlePhaseComplete();
    }
    this.emitChange();
  }

  /**
   * 校正过期状态（页面刷新或休眠唤醒）。
   * @returns {void}
   */
  reconcileExpiredState() {
    if (this.session.phase === PHASE.IDLE || this.session.phase === PHASE.PAUSED) {
      return;
    }

    if (this.session.phase === PHASE.ROAST_CEREMONY) {
      // 兼容旧会话：仪式阶段已废弃，直接转入休息
      this.beginBreakAfterCeremony(true);
      return;
    }

    if (this.session.endAt && this.session.endAt <= Date.now()) {
      this.handlePhaseComplete(false);
    }
  }

  /**
   * 处理阶段完成逻辑。
   * @param {boolean} [fireComplete=true] 是否触发 onComplete
   * @returns {void}
   */
  handlePhaseComplete(fireComplete = true) {
    const { phase, round } = this.session;

    if (phase === PHASE.FOCUS) {
      const safeRound = normalizeRound(round, this.settings.cyclesBeforeLong);
      const isLongBreak = isLongBreakRound(safeRound, this.settings.cyclesBeforeLong);
      const breakPhase = isLongBreak ? PHASE.LONG_BREAK : PHASE.SHORT_BREAK;
      const durationMs =
        breakPhase === PHASE.LONG_BREAK
          ? this.settings.longBreakMinutes * 60 * 1000
          : this.settings.shortBreakMinutes * 60 * 1000;

      // 专注结束：跳过 8 秒仪式，直接进入休息并交由场景播放烤棉花糖动画
      this.session.phase = breakPhase;
      this.session.round = safeRound;
      this.session.endAt = Date.now() + durationMs;
      this.session.ceremonyStartedAt = null;
      this.session.pendingBreak = null;
      this.session.completedMessageUntil = null;

      if (fireComplete) {
        this.onComplete({ type: "focus-complete", round: safeRound });
      }
      this.commit(fireComplete ? "focus-complete" : null);
      return;
    }

    if (phase === PHASE.SHORT_BREAK || phase === PHASE.LONG_BREAK) {
      if (fireComplete) {
        this.onComplete({
          type: phase === PHASE.LONG_BREAK ? "long-break-complete" : "short-break-complete",
          round,
        });
      }
      this.finishBreak(false, fireComplete);
    }
  }

  /**
   * 仪式结束后开始休息倒计时（仅用于兼容旧会话中的 roast_ceremony 阶段）。
   * @param {boolean} [persist=true]
   * @returns {void}
   */
  beginBreakAfterCeremony(persist = true) {
    const breakPhase = this.session.pendingBreak ?? PHASE.SHORT_BREAK;
    const durationMs =
      breakPhase === PHASE.LONG_BREAK
        ? this.settings.longBreakMinutes * 60 * 1000
        : this.settings.shortBreakMinutes * 60 * 1000;

    this.session.phase = breakPhase;
    this.session.endAt = Date.now() + durationMs;
    this.session.ceremonyStartedAt = null;
    this.session.pendingBreak = null;

    if (persist) {
      this.commit("break-start");
    }
  }

  /**
   * 休息结束后的流转。
   * @param {boolean} skipped
   * @param {boolean} [fireComplete=true]
   * @returns {void}
   */
  finishBreak(skipped, fireComplete = true) {
    const { phase, round } = this.session;
    const wasLongBreak = phase === PHASE.LONG_BREAK;

    if (wasLongBreak) {
      if (this.settings.autoStartNext) {
        this.session = {
          ...createDefaultSession(),
          phase: PHASE.FOCUS,
          round: 1,
          endAt: Date.now() + this.settings.focusMinutes * 60 * 1000,
        };
      } else {
        this.session = { ...createDefaultSession(), round: 1 };
      }
      this.commit(skipped ? "skip-long-break" : "long-break-end");
      return;
    }

    const nextRound = getNextRoundAfterShortBreak(round, this.settings.cyclesBeforeLong);
    if (this.settings.autoStartNext) {
      this.session = {
        ...createDefaultSession(),
        phase: PHASE.FOCUS,
        round: nextRound,
        endAt: Date.now() + this.settings.focusMinutes * 60 * 1000,
      };
    } else {
      this.session = { ...createDefaultSession(), round: nextRound };
    }
    this.commit(skipped ? "skip-short-break" : "short-break-end");
  }

  /**
   * 持久化会话并通知监听者。
   * @param {string|null} [eventType]
   * @returns {Promise<void>}
   */
  async persistSession() {
    const { storageLocalSet } = await import("./storage-adapter.js");
    await storageLocalSet({ pomodoroSession: this.session });
  }

  /**
   * 提交状态变更。
   * @param {string|null} [eventType]
   * @returns {void}
   */
  commit(eventType = null) {
    this.persistSession();
    this.emitChange(eventType);
  }

  /**
   * 触发 onChange 回调。
   * @param {string|null} [eventType]
   * @returns {void}
   */
  emitChange(eventType = null) {
    this.onChange({
      settings: this.getSettings(),
      session: this.getSession(),
      remainingMs: this.getRemainingMs(),
      eventType,
    });
  }

  /**
   * 启动每秒 tick 定时器。
   * @returns {void}
   */
  startTick() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
    }
    this.tickTimer = setInterval(() => this.tick(), 1000);
  }

  /**
   * 销毁控制器，清除定时器。
   * @returns {void}
   */
  destroy() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }
}
