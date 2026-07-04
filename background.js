/**
 * 扩展 Service Worker：负责番茄钟 alarm 调度与系统通知。
 * 当新标签页关闭时，通过 chrome.alarms 在阶段结束时触发通知。
 */

const ALARM_NAME = "pomodoro-phase-end";

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
  if (settings.notifyEnabled === false) {
    return;
  }

  const round = session.round ?? 1;
  const cycles = settings.cyclesBeforeLong ?? 4;

  if (session.phase === "focus") {
    showNotification("专注完成", `第 ${round} 轮结束，开始烤棉花糖吧`);
  } else if (session.phase === "short_break") {
    showNotification("休息结束", `准备开始第 ${round + 1} 轮专注`);
  } else if (session.phase === "long_break") {
    showNotification("长休息结束", `${cycles} 轮已完成，随时可以重新开始`);
  }

  await chrome.storage.local.set({
    pomodoroPendingEvent: {
      type: "phase-expired",
      at: Date.now(),
      phase: session.phase,
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
