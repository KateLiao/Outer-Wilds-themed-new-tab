/**
 * 扩展 Service Worker：负责番茄钟 alarm 调度与系统通知。
 * 当新标签页关闭时，通过 chrome.alarms 在阶段结束时触发通知。
 */

const ALARM_NAME = "pomodoro-phase-end";
const READ_LATER_KEY = "readLaterItems";
const ACTION_DEFAULT_TITLE = "保存到稍后再看";
const VIDEO_HOSTS = [
  "youtube.com", "youtu.be", "bilibili.com", "vimeo.com", "youku.com",
  "iqiyi.com", "netflix.com", "twitch.tv", "douyin.com",
];

/**
 * 创建默认会话对象。
 * @returns {object}
 */
function createDefaultSession() {
  return {
    phase: "idle",
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
 * 将轮次限制在合法范围内。
 * @param {number} round 原始轮次
 * @param {number} cyclesBeforeLong 每周期专注轮数
 * @returns {number}
 */
function normalizeRound(round, cyclesBeforeLong) {
  const cycles = Math.max(2, Number(cyclesBeforeLong) || 4);
  const value = Number(round) || 1;
  return Math.min(cycles, Math.max(1, value));
}

/**
 * 短休息结束后下一轮专注的轮次。
 * @param {number} round 当前轮次
 * @param {number} cyclesBeforeLong 每周期专注轮数
 * @returns {number}
 */
function getNextRoundAfterShortBreak(round, cyclesBeforeLong) {
  const normalized = normalizeRound(round, cyclesBeforeLong);
  const cycles = Math.max(2, Number(cyclesBeforeLong) || 4);
  if (normalized >= cycles) {
    return 1;
  }
  return normalized + 1;
}

/**
 * 当前轮次完成后是否进入长休息。
 * @param {number} round 当前轮次
 * @param {number} cyclesBeforeLong 每周期专注轮数
 * @returns {boolean}
 */
function isLongBreakRound(round, cyclesBeforeLong) {
  const cycles = Math.max(2, Number(cyclesBeforeLong) || 4);
  return normalizeRound(round, cycles) >= cycles;
}

/**
 * 从 storage.local 读取当前番茄钟会话。
 * @returns {Promise<object|null>}
 */
async function loadSession() {
  const data = await chrome.storage.local.get("pomodoroSession");
  return data.pomodoroSession ?? null;
}

/**
 * 根据会话阶段与 endAt 创建或清除 alarm。
 * @param {object|null} session
 */
async function syncAlarm(session) {
  await chrome.alarms.clear(ALARM_NAME);
  if (!session?.endAt || session.phase === "idle" || session.phase === "paused") {
    return;
  }
  const when = session.endAt;
  if (when > Date.now()) {
    chrome.alarms.create(ALARM_NAME, { when });
  }
}

/**
 * 发送阶段完成系统通知。
 * @param {string} title
 * @param {string} message
 */
function showNotification(title, message) {
  chrome.notifications.create(`pomodoro-${Date.now()}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
    priority: 1,
  });
}

/**
 * alarm 触发时根据会话状态发送通知并标记待处理事件。
 */
async function handleAlarm() {
  const session = await loadSession();
  if (!session || !session.endAt || session.endAt > Date.now() + 500) {
    return;
  }

  const settings = (await chrome.storage.sync.get("pomodoroSettings")).pomodoroSettings ?? {};
  const shouldNotify = settings.notifyEnabled !== false;

  const round = session.round ?? 1;
  const cycles = settings.cyclesBeforeLong ?? 4;
  const displayRound = normalizeRound(round, cycles);
  let nextSession = null;
  const expiredPhase = session.phase;

  if (session.phase === "focus") {
    if (shouldNotify) {
      showNotification("专注完成", `第 ${displayRound} 轮结束，开始烤棉花糖吧`);
    }
    const breakPhase = isLongBreakRound(displayRound, cycles) ? "long_break" : "short_break";
    const durationMinutes =
      breakPhase === "long_break"
        ? settings.longBreakMinutes ?? 15
        : settings.shortBreakMinutes ?? 5;
    nextSession = {
      ...createDefaultSession(),
      phase: breakPhase,
      round: displayRound,
      endAt: Date.now() + durationMinutes * 60 * 1000,
    };
  } else if (session.phase === "short_break") {
    const nextRound = getNextRoundAfterShortBreak(round, cycles);
    if (shouldNotify) {
      showNotification("休息结束", `准备开始第 ${nextRound} 轮专注`);
    }
    nextSession =
      settings.autoStartNext === true
        ? {
            ...createDefaultSession(),
            phase: "focus",
            round: nextRound,
            endAt: Date.now() + (settings.focusMinutes ?? 25) * 60 * 1000,
          }
        : { ...createDefaultSession(), round: nextRound };
  } else if (session.phase === "long_break") {
    if (shouldNotify) {
      showNotification("长休息结束", `${cycles} 轮已完成，随时可以重新开始`);
    }
    nextSession =
      settings.autoStartNext === true
        ? {
            ...createDefaultSession(),
            phase: "focus",
            round: 1,
            endAt: Date.now() + (settings.focusMinutes ?? 25) * 60 * 1000,
          }
        : { ...createDefaultSession(), round: 1 };
  } else {
    return;
  }

  await chrome.storage.local.set({
    pomodoroSession: nextSession,
    pomodoroPendingEvent: {
      type: "phase-expired",
      at: Date.now(),
      phase: expiredPhase,
    },
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.pomodoroSession) {
    syncAlarm(changes.pomodoroSession.newValue);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    handleAlarm();
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  const session = await loadSession();
  await syncAlarm(session);
});

loadSession().then(syncAlarm);

/** 点击工具栏图标后保存当前页面。 */
chrome.action.onClicked.addListener(async (tab) => {
  try {
    const url = new URL(tab.url || "");
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      await showActionFeedback(tab.id, "!", "当前页面无法保存", "#b84d4d");
      return;
    }

    const data = await chrome.storage.local.get(READ_LATER_KEY);
    const items = Array.isArray(data[READ_LATER_KEY]) ? data[READ_LATER_KEY] : [];
    const index = items.findIndex((item) => item.url === url.href);
    const now = Date.now();
    const title = String(tab.title || url.hostname || url.href);
    const faviconUrl = String(tab.favIconUrl || "");
    let duplicate = index >= 0;

    if (duplicate) {
      const previous = items[index];
      items[index] = {
        ...previous,
        title,
        faviconUrl: faviconUrl || previous.faviconUrl || "",
        ...(previous.status === "completed"
          ? { status: "unread", createdAt: now, openedAt: null, completedAt: null }
          : {}),
      };
    } else {
      items.push({
        id: crypto.randomUUID(),
        url: url.href,
        title,
        faviconUrl,
        contentType: isVideoUrl(url) ? "video" : "article",
        status: "unread",
        createdAt: now,
        openedAt: null,
        completedAt: null,
      });
    }

    await chrome.storage.local.set({ [READ_LATER_KEY]: items });
    await showActionFeedback(
      tab.id,
      duplicate ? "已存" : "✓",
      duplicate ? "已在稍后再看中" : "已加入稍后再看",
      duplicate ? "#4f817b" : "#2f8f68",
    );
  } catch (error) {
    console.error("Save to read later failed", error);
    await showActionFeedback(tab.id, "!", "保存失败，请重试", "#b84d4d");
  }
});

function isVideoUrl(url) {
  const host = url.hostname.replace(/^www\./, "");
  return VIDEO_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

async function showActionFeedback(tabId, text, title, color) {
  if (!tabId) return;
  await Promise.all([
    chrome.action.setBadgeBackgroundColor({ tabId, color }),
    chrome.action.setBadgeText({ tabId, text }),
    chrome.action.setTitle({ tabId, title }),
  ]);
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    chrome.action.setTitle({ tabId, title: ACTION_DEFAULT_TITLE }).catch(() => {});
  }, 1800);
}
