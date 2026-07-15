/**
 * 新标签页 UI 控制器：HUD、设置工作台、SVG 启动坞、右侧观测舱面板与功能模块。
 */
import { PHASE, formatCountdown, DEFAULT_SETTINGS, formatRoundStatus } from "./pomodoro.js";
import { FEATURE_MODULES } from "./feature-settings.js";
import { READ_LATER_STATUS, READ_LATER_TYPE } from "./read-later.js";
import { onStorageChanged } from "./storage-adapter.js";
import {
  getAudioVolume,
  isAudioMuted,
  onAudioMutedChange,
  onAudioVolumeChange,
  playSound,
  setAudioMuted,
  setAudioVolume,
  syncFocusFireSoundForPhase,
  syncRestMusicForPhase,
  warmupAudio,
} from "./audio.js";
import { showConfirm } from "./confirm-dialog.js";

const LABELS = {
  [PHASE.IDLE]: "Campfire clock",
  [PHASE.FOCUS]: "Focus session",
  [PHASE.SHORT_BREAK]: "Short break",
  [PHASE.LONG_BREAK]: "Long break",
  [PHASE.PAUSED]: "Paused",
  [PHASE.ROAST_CEREMONY]: "Marshmallow time",
};

const DOCK_PREVIEW_CLOSE_DELAY_MS = 320;
const DOCK_DRAWER_HIDE_DELAY_MS = 360;
const AUDIO_VOLUME_HIDE_DELAY_MS = 520;

/**
 * 初始化新标签页 UI 并绑定事件。
 * @param {import("./pomodoro.js").PomodoroController} pomodoro
 * @param {object} hooks
 * @param {() => void} hooks.onStartFocus 开始专注时的回调
 * @param {object} options
 * @param {import("./feature-settings.js").FeatureSettingsController} options.featureSettings
 * @param {import("./todo.js").TodoController} options.todo
 * @param {import("./quick-links.js").QuickLinksController} options.quickLinks
 * @param {import("./read-later.js").ReadLaterController} options.readLater
 * @param {(state: object) => void} [options.onDockStateChange]
 * @returns {{ render: (payload: object) => void, showToast: (message: string) => void, openSettings: () => void }}
 */
export function initPomodoroUI(pomodoro, hooks, options) {
  const featureSettingsController = options.featureSettings;
  const todo = options.todo;
  const quickLinks = options.quickLinks;
  const readLater = options.readLater;
  const onDockStateChange = options.onDockStateChange ?? (() => {});

  const hud = document.querySelector(".hud");
  const signalEl = document.querySelector("#signal");
  const pomodoroPanel = document.querySelector("#pomodoroPanel");
  const pomodoroStatus = document.querySelector("#pomodoroStatus");
  const pomodoroCountdown = document.querySelector("#pomodoroCountdown");
  const pomodoroActions = document.querySelector("#pomodoroActions");
  const settingsButton = document.querySelector("#settingsButton");
  const settingsOverlay = document.querySelector("#settingsOverlay");
  const settingsForm = document.querySelector("#settingsForm");
  const closeSettingsButton = document.querySelector("#closeSettingsButton");
  const resetSettingsButton = document.querySelector("#resetSettingsButton");
  const saveSettingsButton = document.querySelector("#saveSettingsButton");
  const debugPhaseButton = document.querySelector("#debugPhaseButton");
  const featureDock = document.querySelector("#featureDock");
  const featureDrawer = document.querySelector("#featureDrawer");
  const featureDrawerTitle = document.querySelector("#featureDrawerTitle");
  const featureDrawerKicker = document.querySelector("#featureDrawerKicker");
  const featureDrawerBody = document.querySelector("#featureDrawerBody");
  const closeFeatureDrawerButton = document.querySelector("#closeFeatureDrawerButton");
  const audioControl = document.querySelector("#audioControl");
  const audioToggleButton = document.querySelector("#audioToggleButton");
  const audioVolumeSlider = document.querySelector("#audioVolumeSlider");
  const quickLinkTitleInput = document.querySelector("#quickLinkTitle");
  const quickLinkUrlInput = document.querySelector("#quickLinkUrl");
  const addQuickLinkButton = document.querySelector("#addQuickLinkButton");
  const quickLinksSettingsList = document.querySelector("#quickLinksSettingsList");
  const toastEl = document.querySelector("#toast");

  let toastTimer = null;
  let hoverModuleId = null;
  let pinnedModuleId = null;
  let visibleModuleId = null;
  let drawerState = "closed";
  let closePreviewTimer = null;
  let hideDrawerTimer = null;
  let hideAudioVolumeTimer = null;
  let featureSettings = featureSettingsController.getSettings();
  let todoItems = todo.getItems();
  let quickLinkItems = quickLinks.getLinks();
  let readLaterItems = readLater.getItems();
  let readLaterSettings = readLater.getSettings();
  let readLaterManaging = false;
  let readLaterCompletedExpanded = false;
  let draggedReadLaterId = null;
  const selectedReadLaterIds = new Set();
  let readLaterUndo = null;
  let readLaterUndoTimer = null;
  let draggedQuickLinkId = null;
  let lastPomodoroPayload = {
    settings: pomodoro.getSettings(),
    session: pomodoro.getSession(),
    remainingMs: pomodoro.getRemainingMs(),
  };

  /**
   * 显示短暂 toast 提示。
   * @param {string} message
   * @param {number} [durationMs=2600]
   */
  function showToast(message, durationMs = 2600) {
    toastEl.onclick = null;
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, durationMs);
  }

  /**
   * 将焦点移出设置工作台，避免关闭时 aria-hidden 与聚焦子元素冲突。
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
   * 打开设置工作台并回填当前值。
   */
  function openSettings() {
    if (!settingsOverlay) {
      return;
    }
    fillSettingsForm(pomodoro.getSettings(), featureSettingsController.getSettings());
    document.querySelector(".watch")?.setAttribute("data-settings-state", "open");
    settingsOverlay.hidden = false;
    settingsOverlay.setAttribute("aria-hidden", "false");
    settingsOverlay.inert = false;
    requestAnimationFrame(() => {
      closeSettingsButton?.focus({ preventScroll: true });
    });
  }

  /**
   * 关闭设置工作台。
   */
  function closeSettings() {
    if (!settingsOverlay) {
      return;
    }
    releaseSettingsFocus();
    document.querySelector(".watch")?.setAttribute("data-settings-state", "closed");
    settingsOverlay.hidden = true;
    settingsOverlay.setAttribute("aria-hidden", "true");
    settingsOverlay.inert = true;
  }

  /**
   * 判断设置工作台是否打开。
   * @returns {boolean}
   */
  function isSettingsOpen() {
    return Boolean(settingsOverlay && !settingsOverlay.hidden);
  }

  /**
   * 从表单读取番茄钟设置项。
   * @returns {object}
   */
  function readPomodoroSettingsFromForm() {
    const focusMinutes = document.querySelector("#focusMinutes");
    const shortBreakMinutes = document.querySelector("#shortBreakMinutes");
    const longBreakMinutes = document.querySelector("#longBreakMinutes");
    const cyclesBeforeLong = document.querySelector("#cyclesBeforeLong");
    const autoStartNext = document.querySelector("#autoStartNext");
    const soundEnabled = document.querySelector("#soundEnabled");
    const focusFireSoundEnabled = document.querySelector("#focusFireSoundEnabled");
    const restMusicEnabled = document.querySelector("#restMusicEnabled");
    const notifyEnabled = document.querySelector("#notifyEnabled");
    const manualRoastEnabled = document.querySelector("#manualRoastEnabled");

    return {
      focusMinutes: clamp(Number(focusMinutes.value) || DEFAULT_SETTINGS.focusMinutes, 5, 90),
      shortBreakMinutes: clamp(Number(shortBreakMinutes.value) || DEFAULT_SETTINGS.shortBreakMinutes, 1, 30),
      longBreakMinutes: clamp(Number(longBreakMinutes.value) || DEFAULT_SETTINGS.longBreakMinutes, 5, 45),
      cyclesBeforeLong: clamp(Number(cyclesBeforeLong.value) || DEFAULT_SETTINGS.cyclesBeforeLong, 2, 8),
      autoStartNext: autoStartNext.checked,
      soundEnabled: soundEnabled.checked,
      focusFireSoundEnabled: focusFireSoundEnabled.checked,
      restMusicEnabled: restMusicEnabled.checked,
      notifyEnabled: notifyEnabled.checked,
      manualRoastEnabled: manualRoastEnabled.checked,
    };
  }

  /**
   * 从表单读取启用模块。
   * @returns {string[]}
   */
  function readEnabledModulesFromForm() {
    const enabled = [];
    if (document.querySelector("#featurePomodoro")?.checked) {
      enabled.push("pomodoro");
    }
    if (document.querySelector("#featureTodayTodo")?.checked) {
      enabled.push("todayTodo");
    }
    if (document.querySelector("#featureQuickLinks")?.checked) {
      enabled.push("quickLinks");
    }
    if (document.querySelector("#featureReadLater")?.checked) {
      enabled.push("readLater");
    }
    return enabled.length > 0 ? enabled : ["pomodoro"];
  }

  /**
   * 保存设置。
   */
  async function saveSettings() {
    try {
      const pomodoroSettings = readPomodoroSettingsFromForm();
      const enabledModuleIds = readEnabledModulesFromForm();
      const wasActive = await pomodoro.saveSettings(pomodoroSettings);
      await featureSettingsController.setEnabledModules(enabledModuleIds);
      closeSettings();
      showToast(wasActive ? "已保存，当前周期不受影响" : "已保存");
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
   * 显示统一风格确认弹窗。
   * @param {object} options
   * @returns {Promise<boolean>}
   */
  function confirmAction(options) {
    return showConfirm(options);
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
        makeActionButton("放弃", "btn-danger", async () => {
          const confirmed = await confirmAction({
            title: "放弃专注",
            message: "确定放弃本轮专注？不会获得烤棉花糖奖励。",
            confirmLabel: "放弃",
            variant: "danger",
          });
          if (confirmed) {
            pomodoro.abandon();
          }
        }),
      );
    } else if (phase === PHASE.PAUSED) {
      pomodoroActions.append(
        makeActionButton("继续", "btn-primary", () => pomodoro.resume()),
        makeActionButton("放弃", "btn-danger", async () => {
          const confirmed = await confirmAction({
            title: "放弃专注",
            message: "确定放弃本轮专注？不会获得烤棉花糖奖励。",
            confirmLabel: "放弃",
            variant: "danger",
          });
          if (confirmed) {
            pomodoro.abandon();
          }
        }),
      );
    } else if (phase === PHASE.SHORT_BREAK || phase === PHASE.LONG_BREAK) {
      pomodoroActions.append(
        makeActionButton("跳过休息", "btn-secondary", async () => {
          const confirmed = await confirmAction({
            title: "跳过休息",
            message: "确定跳过休息？",
            confirmLabel: "跳过",
          });
          if (confirmed) {
            pomodoro.skipBreak();
          }
        }),
      );
    }
  }

  /**
   * 更新调试按钮文案。
   * @param {string} phase
   */
  function updateDebugButtonLabel(phase) {
    if (!debugPhaseButton) {
      return;
    }
    if (phase === PHASE.FOCUS || phase === PHASE.PAUSED) {
      debugPhaseButton.textContent = "调试 → 休息";
      debugPhaseButton.title = "切换到休息（短休息或长休息，触发烤棉花糖动画）";
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
    lastPomodoroPayload = payload;
    const { settings, session, remainingMs } = payload;
    const { phase, round, completedMessageUntil } = session;
    const isPomodoroVisible = phase !== PHASE.IDLE;

    hud.dataset.phase = phase;
    pomodoroPanel.hidden = !isPomodoroVisible;
    settingsButton.hidden = false;

    if (isPomodoroVisible) {
      if (completedMessageUntil && Date.now() < completedMessageUntil) {
        pomodoroStatus.textContent = "专注完成！";
        pomodoroCountdown.textContent = "🍡";
      } else if (phase === PHASE.ROAST_CEREMONY) {
        pomodoroStatus.textContent = formatRoundStatus(phase, round, settings.cyclesBeforeLong);
        pomodoroCountdown.textContent = formatCountdown(remainingMs);
      } else if (phase === PHASE.FOCUS || phase === PHASE.PAUSED || phase === PHASE.SHORT_BREAK || phase === PHASE.LONG_BREAK) {
        pomodoroStatus.textContent = formatRoundStatus(phase, round, settings.cyclesBeforeLong);
        pomodoroCountdown.textContent = formatCountdown(remainingMs);
      }

      signalEl.textContent = LABELS[phase] ?? "Pomodoro";
      renderActions(session);
    } else {
      signalEl.textContent = LABELS[PHASE.IDLE];
    }

    updateDebugButtonLabel(phase);
    renderAudioToggleButton(settings, phase);
    renderDock();
    if (visibleModuleId === "pomodoro") {
      renderFeatureDrawerContent(visibleModuleId);
    }
  }

  /**
   * 专注白噪音或休息音乐启用时显示声音控件。
   * @param {object} settings
   * @param {string} phase
   */
  function renderAudioToggleButton(settings, phase) {
    if (!audioControl || !audioToggleButton) {
      return;
    }
    const focusSoundActive = phase === PHASE.FOCUS && settings.focusFireSoundEnabled !== false;
    const isBreak = phase === PHASE.SHORT_BREAK || phase === PHASE.LONG_BREAK;
    const restSoundActive = isBreak && settings.restMusicEnabled !== false;
    const muted = isAudioMuted();
    audioControl.hidden = !(focusSoundActive || restSoundActive);
    audioToggleButton.dataset.muted = muted ? "true" : "false";
    audioToggleButton.setAttribute("aria-label", muted ? "开启背景声音" : "静音背景声音");
    audioToggleButton.setAttribute("title", muted ? "开启背景声音" : "静音背景声音");
    if (audioVolumeSlider) {
      audioVolumeSlider.value = String(Math.round(getAudioVolume() * 100));
      audioVolumeSlider.setAttribute("aria-valuetext", `${audioVolumeSlider.value}%`);
    }
  }

  /**
   * 渲染底部启动坞。
   */
  function renderDock() {
    if (!featureDock) {
      return;
    }
    featureDock.replaceChildren();
    const enabledModules = FEATURE_MODULES.filter((module) => featureSettings.enabledModuleIds.includes(module.id));

    enabledModules.forEach((module) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "feature-dock-button";
      button.dataset.preview = hoverModuleId === module.id && pinnedModuleId !== module.id ? "true" : "false";
      button.dataset.pinned = pinnedModuleId === module.id ? "true" : "false";
      button.dataset.moduleId = module.id;
      button.setAttribute("aria-label", `打开${module.label}`);
      button.setAttribute("title", module.label);
      button.innerHTML = renderModuleIcon(module.icon);
      if (module.id === "readLater" && readLater.getPendingCount() > 0) {
        const badge = document.createElement("span");
        badge.className = "feature-dock-badge";
        badge.textContent = String(readLater.getPendingCount());
        badge.setAttribute("aria-label", `${readLater.getPendingCount()} 条等待消费`);
        button.append(badge);
      }
      featureDock.append(button);
    });

    if (pinnedModuleId && !featureSettings.enabledModuleIds.includes(pinnedModuleId)) {
      closeFeaturePanel({ clearPinned: true });
    }
  }

  /**
   * 鼠标悬浮时预览功能面板。
   * @param {string} moduleId
   */
  function previewFeaturePanel(moduleId) {
    if (!moduleId || !featureSettings.enabledModuleIds.includes(moduleId)) {
      return;
    }
    if (pinnedModuleId) {
      clearPanelTimers();
      return;
    }
    if (hoverModuleId === moduleId && visibleModuleId === moduleId && drawerState !== "leaving") {
      clearPanelTimers();
      return;
    }
    clearPanelTimers();
    hoverModuleId = moduleId;
    updateFeaturePanelState();
  }

  /**
   * 点击常驻或取消常驻功能面板。
   * @param {string} moduleId
   */
  async function togglePinnedFeaturePanel(moduleId) {
    if (!moduleId || !featureSettings.enabledModuleIds.includes(moduleId)) {
      return;
    }
    clearPanelTimers();
    if (pinnedModuleId === moduleId) {
      pinnedModuleId = null;
      hoverModuleId = null;
      await featureSettingsController.setActiveModule(null);
      updateFeaturePanelState();
      return;
    }
    pinnedModuleId = moduleId;
    hoverModuleId = null;
    await featureSettingsController.setActiveModule(moduleId);
    updateFeaturePanelState();
  }

  /**
   * 延迟关闭 hover 预览，给鼠标从 Dock 移到面板留出缓冲。
   */
  function schedulePreviewClose() {
    if (pinnedModuleId || draggedReadLaterId || featureDrawer?.dataset.dragging === "true") {
      return;
    }
    clearTimeout(closePreviewTimer);
    closePreviewTimer = setTimeout(() => {
      hoverModuleId = null;
      updateFeaturePanelState();
    }, DOCK_PREVIEW_CLOSE_DELAY_MS);
  }

  /**
   * 关闭功能面板。
   * @param {object} [options]
   * @param {boolean} [options.clearPinned=false]
   */
  async function closeFeaturePanel(options = {}) {
    const { clearPinned = false } = options;
    const active = document.activeElement;
    if (featureDrawer?.contains(active) && active instanceof HTMLElement) {
      active.blur();
    }
    hoverModuleId = null;
    if (clearPinned) {
      pinnedModuleId = null;
      await featureSettingsController.setActiveModule(null);
    }
    updateFeaturePanelState();
  }

  /**
   * 根据 hover/pinned 状态刷新右侧面板与场景让位状态。
   */
  function updateFeaturePanelState() {
    const nextVisibleModuleId = pinnedModuleId ?? hoverModuleId;
    const nextDrawerState = pinnedModuleId ? "pinned" : nextVisibleModuleId ? "preview" : visibleModuleId ? "leaving" : "closed";

    visibleModuleId = nextVisibleModuleId ?? visibleModuleId;
    drawerState = nextDrawerState;

    if (featureDrawer) {
      clearTimeout(hideDrawerTimer);
      if (nextVisibleModuleId) {
        featureDrawer.hidden = false;
        featureDrawer.inert = false;
        featureDrawer.setAttribute("aria-hidden", "false");
        featureDrawer.dataset.state = drawerState;
        renderFeatureDrawerContent(nextVisibleModuleId);
      } else if (drawerState === "leaving") {
        releaseFeatureDrawerFocus();
        featureDrawer.dataset.state = "leaving";
        featureDrawer.inert = true;
        featureDrawer.setAttribute("aria-hidden", "true");
        hideDrawerTimer = setTimeout(() => {
          visibleModuleId = null;
          drawerState = "closed";
          featureDrawer.hidden = true;
          featureDrawer.dataset.state = "closed";
          syncDockStateToShell();
          renderDock();
        }, DOCK_DRAWER_HIDE_DELAY_MS);
      } else {
        releaseFeatureDrawerFocus();
        visibleModuleId = null;
        featureDrawer.hidden = true;
        featureDrawer.dataset.state = "closed";
        featureDrawer.setAttribute("aria-hidden", "true");
        featureDrawer.inert = true;
      }
    }

    syncDockStateToShell();
    renderDock();
  }

  /** 在隐藏抽屉前把焦点送回对应 Dock 入口。 */
  function releaseFeatureDrawerFocus() {
    const active = document.activeElement;
    if (!featureDrawer?.contains(active)) return;
    const dockButton = visibleModuleId
      ? featureDock?.querySelector(`[data-module-id="${visibleModuleId}"]`)
      : null;
    if (dockButton instanceof HTMLElement) {
      dockButton.focus({ preventScroll: true });
    } else if (active instanceof HTMLElement) {
      active.blur();
    }
  }

  /**
   * 同步 Dock 状态给页面根节点与 3D 场景桥接。
   */
  function syncDockStateToShell() {
    const active = drawerState === "preview" || drawerState === "pinned";
    const shellState = active ? drawerState : drawerState === "leaving" ? "leaving" : "closed";
    document.querySelector(".watch")?.setAttribute("data-dock-state", shellState);
    document.querySelector(".watch")?.setAttribute("data-active-module", visibleModuleId ?? "");
    onDockStateChange({
      active,
      mode: shellState,
      moduleId: active ? visibleModuleId : null,
    });
  }

  /**
   * 清理面板相关定时器。
   */
  function clearPanelTimers() {
    clearTimeout(closePreviewTimer);
    clearTimeout(hideDrawerTimer);
  }

  /**
   * 渲染抽屉内容。
   * @param {string} moduleId
   */
  function renderFeatureDrawerContent(moduleId) {
    const module = FEATURE_MODULES.find((item) => item.id === moduleId);
    if (!module || !featureDrawerBody) {
      return;
    }
    featureDrawerKicker.textContent = module.description;
    featureDrawerTitle.textContent = module.label;
    featureDrawerBody.replaceChildren();

    if (moduleId === "pomodoro") {
      renderPomodoroDrawer();
    }
    if (moduleId === "todayTodo") {
      renderTodoDrawer();
    }
    if (moduleId === "quickLinks") {
      renderQuickLinksDrawer();
    }
    if (moduleId === "readLater") {
      renderReadLaterDrawer();
    }
  }

  /** 渲染稍后再看抽屉。 */
  function renderReadLaterDrawer() {
    const section = document.createElement("div");
    section.className = "read-later-module";

    const toolbar = document.createElement("div");
    toolbar.className = "read-later-toolbar";
    const sortButton = makeCompactButton(readLaterSettings.sortDirection === "desc" ? "最新优先" : "最早优先", async () => {
      await readLater.setSortDirection(readLaterSettings.sortDirection === "desc" ? "asc" : "desc");
    });
    const manageButton = makeCompactButton(readLaterManaging ? "退出管理" : "管理", () => {
      readLaterManaging = !readLaterManaging;
      selectedReadLaterIds.clear();
      renderFeatureDrawerContent("readLater");
    });
    toolbar.append(sortButton, manageButton);
    section.append(toolbar);

    const pending = readLaterItems.filter((item) => item.status !== READ_LATER_STATUS.COMPLETED);
    section.append(
      createReadLaterGroup("文章", READ_LATER_TYPE.ARTICLE, pending.filter((item) => item.contentType === READ_LATER_TYPE.ARTICLE)),
      createReadLaterGroup("视频", READ_LATER_TYPE.VIDEO, pending.filter((item) => item.contentType === READ_LATER_TYPE.VIDEO)),
    );

    const completed = readLaterItems.filter((item) => item.status === READ_LATER_STATUS.COMPLETED);
    const completedSection = document.createElement("section");
    completedSection.className = "read-later-completed";
    const completedToggle = document.createElement("button");
    completedToggle.type = "button";
    completedToggle.className = "read-later-completed-toggle";
    completedToggle.textContent = `已完成 ${completed.length} ${readLaterCompletedExpanded ? "▾" : "▸"}`;
    completedToggle.addEventListener("click", () => {
      readLaterCompletedExpanded = !readLaterCompletedExpanded;
      renderFeatureDrawerContent("readLater");
    });
    completedSection.append(completedToggle);
    if (readLaterCompletedExpanded) {
      completedSection.append(
        createReadLaterGroup("文章", READ_LATER_TYPE.ARTICLE, completed.filter((item) => item.contentType === READ_LATER_TYPE.ARTICLE), true),
        createReadLaterGroup("视频", READ_LATER_TYPE.VIDEO, completed.filter((item) => item.contentType === READ_LATER_TYPE.VIDEO), true),
      );
    }
    section.append(completedSection);

    if (readLaterManaging) {
      const visibleIds = getVisibleReadLaterIds();
      const bulk = document.createElement("div");
      bulk.className = "read-later-bulk";
      const count = document.createElement("span");
      count.textContent = `已选 ${selectedReadLaterIds.size} 项`;
      const selectAll = makeCompactButton("全选当前范围", () => {
        visibleIds.forEach((id) => selectedReadLaterIds.add(id));
        renderFeatureDrawerContent("readLater");
      });
      const remove = makeCompactButton("删除", async () => {
        if (!selectedReadLaterIds.size) return;
        const confirmed = await confirmAction({
          title: "批量删除",
          message: `确定删除选中的 ${selectedReadLaterIds.size} 条内容？此操作无法撤销。`,
          confirmLabel: "删除",
          variant: "danger",
        });
        if (confirmed) {
          await readLater.removeItems([...selectedReadLaterIds]);
          selectedReadLaterIds.clear();
          readLaterManaging = false;
        }
      }, "is-danger");
      bulk.append(count, selectAll, remove);
      section.append(bulk);
    }

    featureDrawerBody.append(section);
  }

  function createReadLaterGroup(label, type, items, completed = false) {
    const group = document.createElement("section");
    group.className = "read-later-group";
    group.dataset.type = type;
    const heading = document.createElement("h3");
    heading.textContent = `${label} ${items.length}`;
    const list = document.createElement("div");
    list.className = "read-later-list";
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "read-later-empty";
      empty.textContent = completed ? "暂无已完成内容" : `暂无${label}，可拖到这里分类`;
      list.append(empty);
    } else {
      items.forEach((item) => list.append(createReadLaterItem(item)));
    }
    group.addEventListener("dragover", (event) => {
      event.preventDefault();
      group.dataset.dropTarget = "true";
    });
    group.addEventListener("dragleave", (event) => {
      if (!group.contains(event.relatedTarget)) delete group.dataset.dropTarget;
    });
    group.addEventListener("drop", async (event) => {
      event.preventDefault();
      delete group.dataset.dropTarget;
      if (draggedReadLaterId) await readLater.setContentType(draggedReadLaterId, type);
      draggedReadLaterId = null;
    });
    group.append(heading, list);
    return group;
  }

  function createReadLaterItem(item) {
    const row = document.createElement("article");
    row.className = `read-later-item is-${item.status}`;
    row.dataset.readLaterId = item.id;

    if (readLaterManaging) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedReadLaterIds.has(item.id);
      checkbox.setAttribute("aria-label", `选择 ${item.title}`);
      checkbox.addEventListener("change", () => {
        checkbox.checked ? selectedReadLaterIds.add(item.id) : selectedReadLaterIds.delete(item.id);
        renderFeatureDrawerContent("readLater");
      });
      row.append(checkbox);
    }

    const drag = document.createElement("button");
    drag.type = "button";
    drag.className = "read-later-drag";
    drag.draggable = true;
    drag.textContent = "⋮⋮";
    drag.setAttribute("aria-label", `拖动修改 ${item.title} 的分类`);
    drag.addEventListener("dragstart", (event) => {
      draggedReadLaterId = item.id;
      clearPanelTimers();
      featureDrawer.dataset.dragging = "true";
      document.querySelector(".watch")?.setAttribute("data-dragging-read-later", "true");
      event.dataTransfer?.setData("text/plain", item.id);
    });
    drag.addEventListener("dragend", () => {
      draggedReadLaterId = null;
      delete featureDrawer.dataset.dragging;
      document.querySelector(".watch")?.removeAttribute("data-dragging-read-later");
      clearPanelTimers();
      featureDrawerBody.querySelectorAll("[data-drop-target]").forEach((node) => delete node.dataset.dropTarget);
    });

    const icon = document.createElement("span");
    icon.className = "read-later-icon";
    const img = document.createElement("img");
    img.src = item.faviconUrl;
    img.alt = "";
    img.addEventListener("error", () => {
      img.remove();
      icon.textContent = getReadLaterHost(item).slice(0, 1).toUpperCase() || "页";
    });
    if (item.faviconUrl) icon.append(img); else icon.textContent = getReadLaterHost(item).slice(0, 1).toUpperCase() || "页";

    const content = document.createElement("div");
    content.className = "read-later-content";
    const title = document.createElement("a");
    title.className = "read-later-title";
    title.href = item.url;
    title.textContent = item.title;
    title.title = item.title;
    title.addEventListener("click", async (event) => {
      if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        await readLater.markOpened(item.id);
        window.location.assign(item.url);
        return;
      }
      readLater.markOpened(item.id);
    });
    title.addEventListener("auxclick", () => readLater.markOpened(item.id));
    const meta = document.createElement("span");
    meta.className = "read-later-meta";
    meta.textContent = `${getReadLaterHost(item)} · ${formatReadLaterDate(item.createdAt)} · ${getReadLaterStatusLabel(item.status)}`;
    content.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "read-later-actions";
    const newTab = document.createElement("a");
    newTab.className = "read-later-icon-button";
    newTab.href = item.url;
    newTab.target = "_blank";
    newTab.rel = "noopener noreferrer";
    newTab.textContent = "↗";
    newTab.title = "在新标签页打开";
    newTab.setAttribute("aria-label", "在新标签页打开");
    newTab.addEventListener("click", () => readLater.markOpened(item.id));
    const complete = makeCompactButton(item.status === READ_LATER_STATUS.COMPLETED ? "恢复" : "完成", () => {
      return item.status === READ_LATER_STATUS.COMPLETED ? readLater.restoreInProgress(item.id) : readLater.markCompleted(item.id);
    });
    const move = makeCompactButton(item.contentType === READ_LATER_TYPE.ARTICLE ? "移至视频" : "移至文章", () => {
      return readLater.setContentType(item.id, item.contentType === READ_LATER_TYPE.ARTICLE ? READ_LATER_TYPE.VIDEO : READ_LATER_TYPE.ARTICLE);
    }, "read-later-move");
    const remove = makeCompactButton("删除", () => removeReadLaterItem(item), "is-danger");
    actions.append(newTab, complete, move, remove);
    row.append(drag, icon, content, actions);
    return row;
  }

  async function removeReadLaterItem(item) {
    clearTimeout(readLaterUndoTimer);
    const removed = await readLater.removeItems([item.id]);
    readLaterUndo = removed;
    showToast("已删除 · 点击此处撤销", 5000);
    toastEl.onclick = async () => {
      if (!readLaterUndo) return;
      await readLater.restoreItems(readLaterUndo);
      readLaterUndo = null;
      toastEl.onclick = null;
      toastEl.hidden = true;
    };
    readLaterUndoTimer = setTimeout(() => {
      readLaterUndo = null;
      toastEl.onclick = null;
    }, 5000);
  }

  function makeCompactButton(label, handler, extraClass = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `read-later-small-button ${extraClass}`.trim();
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function getVisibleReadLaterIds() {
    return readLaterItems
      .filter((item) => item.status !== READ_LATER_STATUS.COMPLETED || readLaterCompletedExpanded)
      .map((item) => item.id);
  }

  function getReadLaterHost(item) {
    try { return new URL(item.url).hostname.replace(/^www\./, ""); } catch { return item.url; }
  }

  function formatReadLaterDate(timestamp) {
    return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(timestamp));
  }

  function getReadLaterStatusLabel(status) {
    if (status === READ_LATER_STATUS.IN_PROGRESS) return "正在看";
    if (status === READ_LATER_STATUS.COMPLETED) return "已完成";
    return "未开始";
  }

  /**
   * 渲染番茄钟抽屉内容。
   */
  function renderPomodoroDrawer() {
    const { session, remainingMs, settings } = lastPomodoroPayload;
    const section = document.createElement("div");
    section.className = "drawer-pomodoro";

    const status = document.createElement("p");
    status.className = "drawer-status";
    status.textContent =
      session.phase === PHASE.IDLE
        ? `第 ${session.round}/${settings.cyclesBeforeLong} 轮准备中`
        : formatRoundStatus(session.phase, session.round, settings.cyclesBeforeLong);

    const timer = document.createElement("div");
    timer.className = "drawer-timer";
    timer.textContent = session.phase === PHASE.IDLE ? `${settings.focusMinutes}:00` : formatCountdown(remainingMs);

    const actions = document.createElement("div");
    actions.className = "drawer-actions";

    if (session.phase === PHASE.IDLE) {
      actions.append(
        makeActionButton("开始专注", "btn-primary", () => {
          warmupAudio();
          hooks.onStartFocus();
          closeFeaturePanel({ clearPinned: true });
        }),
      );
    } else if (session.phase === PHASE.FOCUS) {
      actions.append(
        makeActionButton("暂停", "btn-secondary", () => pomodoro.pause()),
        makeActionButton("放弃", "btn-danger", async () => {
          const confirmed = await confirmAction({
            title: "放弃专注",
            message: "确定放弃本轮专注？不会获得烤棉花糖奖励。",
            confirmLabel: "放弃",
            variant: "danger",
          });
          if (confirmed) {
            pomodoro.abandon();
          }
        }),
      );
    } else if (session.phase === PHASE.PAUSED) {
      actions.append(
        makeActionButton("继续", "btn-primary", () => pomodoro.resume()),
        makeActionButton("放弃", "btn-danger", async () => {
          const confirmed = await confirmAction({
            title: "放弃专注",
            message: "确定放弃本轮专注？不会获得烤棉花糖奖励。",
            confirmLabel: "放弃",
            variant: "danger",
          });
          if (confirmed) {
            pomodoro.abandon();
          }
        }),
      );
    } else if (session.phase === PHASE.SHORT_BREAK || session.phase === PHASE.LONG_BREAK) {
      actions.append(
        makeActionButton("跳过休息", "btn-secondary", async () => {
          const confirmed = await confirmAction({
            title: "跳过休息",
            message: "确定跳过休息？",
            confirmLabel: "跳过",
          });
          if (confirmed) {
            pomodoro.skipBreak();
          }
        }),
      );
    }

    section.append(status, timer, actions);
    featureDrawerBody.append(section);
  }

  /**
   * 渲染 TODO 抽屉内容。
   */
  function renderTodoDrawer() {
    const section = document.createElement("div");
    section.className = "todo-module";

    const form = document.createElement("form");
    form.className = "todo-form";
    form.innerHTML = `
      <input class="todo-title-input" name="title" type="text" maxlength="120" placeholder="写下一个待办" aria-label="待办内容" />
      <button class="btn-primary" type="submit">添加</button>
    `;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const item = await todo.addItem({ title: data.get("title") });
      if (item) {
        form.reset();
        form.querySelector("[name='title']")?.focus({ preventScroll: true });
      } else {
        showToast("先写下待办内容");
      }
    });

    const list = document.createElement("div");
    list.className = "todo-list";

    if (todoItems.length === 0) {
      const empty = document.createElement("p");
      empty.className = "todo-empty";
      empty.textContent = "还没有待办。把今天最想推进的一件事放进来。";
      list.append(empty);
    } else {
      todoItems.forEach((item) => {
        list.append(createTodoItemElement(item));
      });
    }

    const footer = document.createElement("div");
    footer.className = "todo-footer";
    const completedCount = todoItems.filter((item) => item.completed).length;
    const count = document.createElement("span");
    count.textContent = `${todoItems.length} 项 · ${completedCount} 已完成`;
    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "btn-secondary todo-clear-button";
    clearButton.textContent = "清空已完成";
    clearButton.disabled = completedCount === 0;
    clearButton.addEventListener("click", () => todo.clearCompleted());
    footer.append(count, clearButton);

    section.append(form, list, footer);
    featureDrawerBody.append(section);
  }

  /**
   * 创建单条 TODO 节点。
   * @param {object} item
   * @returns {HTMLElement}
   */
  function createTodoItemElement(item) {
    const row = document.createElement("article");
    row.className = `todo-item ${item.completed ? "is-completed" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.completed;
    checkbox.setAttribute("aria-label", item.completed ? "取消完成" : "完成待办");
    checkbox.addEventListener("change", () => todo.setCompleted(item.id, checkbox.checked));

    const content = document.createElement("div");
    content.className = "todo-item-content";

    const title = document.createElement("textarea");
    title.className = "todo-item-title";
    title.value = item.title;
    title.maxLength = 120;
    title.rows = 1;
    title.setAttribute("aria-label", "待办内容");
    title.addEventListener("input", () => resizeTodoTitle(title));
    title.addEventListener("change", () => todo.updateItem(item.id, { title: title.value }));
    requestAnimationFrame(() => resizeTodoTitle(title));

    content.append(title);

    const tools = document.createElement("div");
    tools.className = "todo-item-tools";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "todo-remove-button";
    removeButton.setAttribute("aria-label", "删除待办");
    removeButton.textContent = "×";
    removeButton.addEventListener("click", () => todo.removeItem(item.id));

    tools.append(removeButton);
    row.dataset.todoId = item.id;
    row.append(checkbox, content, tools);
    return row;
  }

  /**
   * 根据内容撑开 TODO 标题输入区，避免长待办被单行截断。
   * @param {HTMLTextAreaElement} title
   */
  function resizeTodoTitle(title) {
    title.style.height = "auto";
    title.style.height = `${title.scrollHeight}px`;
  }

  /**
   * 渲染快捷导航抽屉。
   */
  function renderQuickLinksDrawer() {
    const section = document.createElement("div");
    section.className = "quick-links-module";

    if (quickLinkItems.length === 0) {
      const empty = document.createElement("p");
      empty.className = "quick-links-empty";
      empty.textContent = "还没有快捷导航。可以在设置里添加常用网站。";
      section.append(empty);
      featureDrawerBody.append(section);
      return;
    }

    const grid = document.createElement("div");
    grid.className = "quick-links-grid";
    quickLinkItems.forEach((link) => {
      const anchor = document.createElement("a");
      anchor.className = "quick-link-card";
      anchor.href = link.url;
      anchor.title = link.url;
      anchor.append(createQuickLinkIcon(link), createQuickLinkLabel(link));
      grid.append(anchor);
    });

    section.append(grid);
    featureDrawerBody.append(section);
  }

  /**
   * 渲染设置页快捷导航列表。
   */
  function renderQuickLinksSettingsList() {
    if (!quickLinksSettingsList) {
      return;
    }
    quickLinksSettingsList.replaceChildren();
    if (quickLinkItems.length === 0) {
      const empty = document.createElement("p");
      empty.className = "quick-links-settings-empty";
      empty.textContent = "暂无网站。添加后会出现在快捷导航面板中。";
      quickLinksSettingsList.append(empty);
      return;
    }
    quickLinkItems.forEach((link, index) => {
      const row = document.createElement("div");
      row.className = "quick-link-settings-row";
      row.dataset.linkId = link.id;

      row.addEventListener("dragover", (event) => {
        if (!draggedQuickLinkId || draggedQuickLinkId === link.id) {
          return;
        }
        event.preventDefault();
        row.dataset.dropTarget = "true";
      });
      row.addEventListener("dragleave", () => {
        delete row.dataset.dropTarget;
      });
      row.addEventListener("drop", async (event) => {
        event.preventDefault();
        delete row.dataset.dropTarget;
        if (!draggedQuickLinkId || draggedQuickLinkId === link.id) {
          return;
        }
        await quickLinks.moveLinkToIndex(draggedQuickLinkId, index);
        draggedQuickLinkId = null;
      });

      const dragHandle = document.createElement("button");
      dragHandle.type = "button";
      dragHandle.className = "quick-link-drag-handle";
      dragHandle.draggable = true;
      dragHandle.textContent = "⋮⋮";
      dragHandle.setAttribute("aria-label", `拖动调整 ${link.title} 的位置`);
      dragHandle.addEventListener("dragstart", (event) => {
        draggedQuickLinkId = link.id;
        row.dataset.dragging = "true";
        event.dataTransfer?.setData("text/plain", link.id);
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
        }
      });
      dragHandle.addEventListener("dragend", () => {
        draggedQuickLinkId = null;
        delete row.dataset.dragging;
        quickLinksSettingsList?.querySelectorAll("[data-drop-target]").forEach((item) => {
          delete item.dataset.dropTarget;
        });
      });

      const meta = document.createElement("div");
      meta.className = "quick-link-settings-meta";
      meta.append(createQuickLinkIcon(link), createQuickLinkLabel(link, true));

      const actions = document.createElement("div");
      actions.className = "quick-link-settings-actions";

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "quick-link-remove-button";
      removeButton.textContent = "删除";
      removeButton.addEventListener("click", () => quickLinks.removeLink(link.id));

      actions.append(removeButton);
      row.append(dragHandle, meta, actions);
      quickLinksSettingsList.append(row);
    });
  }

  /**
   * 从设置页添加快捷导航。
   * @returns {Promise<void>}
   */
  async function addQuickLinkFromSettings() {
    const url = quickLinkUrlInput?.value ?? "";
    const title = quickLinkTitleInput?.value ?? "";
    const link = await quickLinks.addLink({ title, url });
    if (!link) {
      showToast("请输入有效且未重复的网址");
      quickLinkUrlInput?.focus({ preventScroll: true });
      return;
    }
    if (quickLinkTitleInput) {
      quickLinkTitleInput.value = "";
    }
    if (quickLinkUrlInput) {
      quickLinkUrlInput.value = "";
      quickLinkUrlInput.focus({ preventScroll: true });
    }
    showToast("已添加快捷导航");
  }

  /**
   * @param {object} link
   * @returns {HTMLElement}
   */
  function createQuickLinkIcon(link) {
    const icon = document.createElement("span");
    icon.className = "quick-link-icon";
    const img = document.createElement("img");
    img.src = link.iconUrl;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => {
      img.remove();
      icon.dataset.fallback = "true";
      icon.textContent = getQuickLinkInitial(link);
    });
    icon.append(img);
    return icon;
  }

  /**
   * @param {object} link
   * @param {boolean} [withUrl=false]
   * @returns {HTMLElement}
   */
  function createQuickLinkLabel(link, withUrl = false) {
    const label = document.createElement("span");
    label.className = "quick-link-label";
    const title = document.createElement("span");
    title.className = "quick-link-title";
    title.textContent = link.title;
    label.append(title);
    if (withUrl) {
      const url = document.createElement("span");
      url.className = "quick-link-url";
      url.textContent = getQuickLinkHost(link);
      label.append(url);
    }
    return label;
  }

  /**
   * @param {object} link
   * @returns {string}
   */
  function getQuickLinkInitial(link) {
    return String(link.title || getQuickLinkHost(link) || "站").trim().slice(0, 1).toUpperCase();
  }

  /**
   * @param {object} link
   * @returns {string}
   */
  function getQuickLinkHost(link) {
    try {
      return new URL(link.url).hostname.replace(/^www\./, "");
    } catch {
      return link.url;
    }
  }

  /**
   * 将设置填入表单。
   * @param {object} settings
   * @param {object} currentFeatureSettings
   */
  function fillSettingsForm(settings, currentFeatureSettings) {
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    document.querySelector("#featurePomodoro").checked = currentFeatureSettings.enabledModuleIds.includes("pomodoro");
    document.querySelector("#featureTodayTodo").checked = currentFeatureSettings.enabledModuleIds.includes("todayTodo");
    document.querySelector("#featureQuickLinks").checked = currentFeatureSettings.enabledModuleIds.includes("quickLinks");
    document.querySelector("#featureReadLater").checked = currentFeatureSettings.enabledModuleIds.includes("readLater");
    renderQuickLinksSettingsList();
    document.querySelector("#focusMinutes").value = merged.focusMinutes;
    document.querySelector("#shortBreakMinutes").value = merged.shortBreakMinutes;
    document.querySelector("#longBreakMinutes").value = merged.longBreakMinutes;
    document.querySelector("#cyclesBeforeLong").value = merged.cyclesBeforeLong;
    document.querySelector("#autoStartNext").checked = merged.autoStartNext;
    document.querySelector("#soundEnabled").checked = merged.soundEnabled;
    document.querySelector("#focusFireSoundEnabled").checked = merged.focusFireSoundEnabled;
    document.querySelector("#restMusicEnabled").checked = merged.restMusicEnabled;
    document.querySelector("#notifyEnabled").checked = merged.notifyEnabled;
    document.querySelector("#manualRoastEnabled").checked = merged.manualRoastEnabled;
  }

  settingsButton.addEventListener("click", () => {
    openSettings();
  });

  if (debugPhaseButton) {
    debugPhaseButton.addEventListener("click", () => {
      const nextPhase = pomodoro.debugToggleFocusBreak();
      const debugLabel =
        nextPhase === PHASE.SHORT_BREAK
          ? "调试：短休息"
          : nextPhase === PHASE.LONG_BREAK
            ? "调试：长休息"
            : "调试：专注中";
      showToast(debugLabel);
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

  if (closeFeatureDrawerButton) {
    closeFeatureDrawerButton.addEventListener("click", () => {
      closeFeaturePanel({ clearPinned: true });
    });
  }

  if (audioToggleButton) {
    audioToggleButton.addEventListener("click", () => {
      const session = pomodoro.getSession();
      const settings = pomodoro.getSettings();
      const nextMuted = !isAudioMuted();
      setAudioMuted(nextMuted);
      if (!nextMuted) {
        syncFocusFireSoundForPhase(session.phase, settings.focusFireSoundEnabled !== false);
        syncRestMusicForPhase(session.phase, settings.restMusicEnabled !== false);
      }
      renderAudioToggleButton(settings, session.phase);
      showToast(nextMuted ? "已静音背景声音" : "已开启背景声音");
    });

    const openAudioVolume = () => {
      if (hideAudioVolumeTimer) {
        clearTimeout(hideAudioVolumeTimer);
        hideAudioVolumeTimer = null;
      }
      audioControl.dataset.volumeOpen = "true";
    };
    const scheduleAudioVolumeClose = () => {
      if (hideAudioVolumeTimer) {
        clearTimeout(hideAudioVolumeTimer);
      }
      hideAudioVolumeTimer = setTimeout(() => {
        audioControl.dataset.volumeOpen = "false";
        hideAudioVolumeTimer = null;
      }, AUDIO_VOLUME_HIDE_DELAY_MS);
    };

    audioToggleButton.addEventListener("pointerenter", openAudioVolume);
    audioToggleButton.addEventListener("pointerleave", scheduleAudioVolumeClose);
    audioToggleButton.addEventListener("focus", openAudioVolume);
    audioControl?.addEventListener("pointerleave", scheduleAudioVolumeClose);
    audioControl?.addEventListener("focusout", (event) => {
      if (!audioControl.contains(event.relatedTarget)) {
        scheduleAudioVolumeClose();
      }
    });
    audioVolumeSlider?.addEventListener("pointerenter", openAudioVolume);
  }

  if (audioVolumeSlider) {
    audioVolumeSlider.value = String(Math.round(getAudioVolume() * 100));
    audioVolumeSlider.addEventListener("input", () => {
      const session = pomodoro.getSession();
      const settings = pomodoro.getSettings();
      setAudioVolume(Number(audioVolumeSlider.value) / 100);
      if (isAudioMuted()) {
        setAudioMuted(false);
      }
      syncFocusFireSoundForPhase(session.phase, settings.focusFireSoundEnabled !== false);
      syncRestMusicForPhase(session.phase, settings.restMusicEnabled !== false);
      renderAudioToggleButton(settings, session.phase);
    });
  }

  onAudioMutedChange(() => {
    const session = pomodoro.getSession();
    renderAudioToggleButton(pomodoro.getSettings(), session.phase);
  });

  onAudioVolumeChange(() => {
    const session = pomodoro.getSession();
    renderAudioToggleButton(pomodoro.getSettings(), session.phase);
  });

  if (addQuickLinkButton) {
    addQuickLinkButton.addEventListener("click", addQuickLinkFromSettings);
  }
  [quickLinkTitleInput, quickLinkUrlInput].forEach((input) => {
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addQuickLinkFromSettings();
      }
    });
  });

  featureDock?.addEventListener("pointerover", (event) => {
    const button = event.target.closest?.(".feature-dock-button");
    if (!button || !featureDock.contains(button)) {
      return;
    }
    previewFeaturePanel(button.dataset.moduleId);
  });
  featureDock?.addEventListener("focusin", (event) => {
    const button = event.target.closest?.(".feature-dock-button");
    if (!button || !featureDock.contains(button)) {
      return;
    }
    previewFeaturePanel(button.dataset.moduleId);
  });
  featureDock?.addEventListener("pointerdown", (event) => {
    const button = event.target.closest?.(".feature-dock-button");
    if (!button || !featureDock.contains(button)) {
      return;
    }
    event.preventDefault();
    togglePinnedFeaturePanel(button.dataset.moduleId);
  });
  featureDock?.addEventListener("pointerenter", clearPanelTimers);
  featureDock?.addEventListener("pointerleave", schedulePreviewClose);
  featureDrawer?.addEventListener("pointerenter", clearPanelTimers);
  featureDrawer?.addEventListener("pointerleave", schedulePreviewClose);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (isSettingsOpen()) {
      closeSettings();
      return;
    }
    if (featureDrawer && !featureDrawer.hidden) {
      closeFeaturePanel({ clearPinned: true });
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

  if (saveSettingsButton) {
    saveSettingsButton.addEventListener("click", () => {
      saveSettings();
    });
  }

  resetSettingsButton.addEventListener("click", async () => {
    await pomodoro.resetSettings();
    await featureSettingsController.resetSettings();
    fillSettingsForm(DEFAULT_SETTINGS, featureSettingsController.getSettings());
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
    if (area === "local" && changes.todayTodoItems) {
      todo.syncFromStorage(changes.todayTodoItems.newValue);
      todoItems = todo.getItems();
      if (visibleModuleId === "todayTodo") {
        renderFeatureDrawerContent("todayTodo");
      }
    }
    if (area === "local" && (changes.readLaterItems || changes.readLaterSettings)) {
      readLater.syncFromStorage(
        changes.readLaterItems?.newValue ?? readLaterItems,
        changes.readLaterSettings?.newValue ?? readLaterSettings,
      );
    }
    if (area === "sync" && changes.quickLinks) {
      quickLinks.syncFromStorage(changes.quickLinks.newValue);
      quickLinkItems = quickLinks.getLinks();
      renderQuickLinksSettingsList();
      if (visibleModuleId === "quickLinks") {
        renderFeatureDrawerContent("quickLinks");
      }
    }
    if (area === "sync" && changes.featureSettings) {
      featureSettingsController.syncFromStorage(changes.featureSettings.newValue);
      featureSettings = featureSettingsController.getSettings();
      renderDock();
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
        playSound("break-start", pomodoro.getSettings().soundEnabled);
      }
    }
  });

  featureSettingsController.onChange = (settings) => {
    featureSettings = settings;
    renderDock();
    if (visibleModuleId && !featureSettings.enabledModuleIds.includes(visibleModuleId)) {
      closeFeaturePanel({ clearPinned: true });
    }
  };

  todo.onChange = (items) => {
    todoItems = items;
    if (visibleModuleId === "todayTodo") {
      renderFeatureDrawerContent("todayTodo");
    }
  };

  quickLinks.onChange = (links) => {
    quickLinkItems = links;
    renderQuickLinksSettingsList();
    if (visibleModuleId === "quickLinks") {
      renderFeatureDrawerContent("quickLinks");
    }
  };

  readLater.onChange = (items, settings) => {
    readLaterItems = items;
    readLaterSettings = settings;
    renderDock();
    if (visibleModuleId === "readLater") renderFeatureDrawerContent("readLater");
  };

  pinnedModuleId = featureSettings.activeModuleId;
  if (pinnedModuleId) {
    updateFeaturePanelState();
  }
  renderDock();
  syncDockStateToShell();

  return { render, showToast, openSettings };
}

/**
 * 渲染统一风格 Dock SVG 图标。
 * @param {string} icon
 * @returns {string}
 */
function renderModuleIcon(icon) {
  const common = 'class="feature-dock-icon" viewBox="0 0 28 28" fill="none" aria-hidden="true"';
  if (icon === "timer") {
    return `
      <svg ${common}>
        <path d="M10.2 4.6h7.6" />
        <path d="M14 4.8v3.1" />
        <circle cx="14" cy="15.5" r="8.2" />
        <path d="M14 15.5l3.5-3.8" />
        <path d="M8.8 9.2 7.1 7.5" />
        <path d="M19.2 9.2l1.7-1.7" />
        <path d="M9.3 20.4c1.2 1.1 2.8 1.8 4.7 1.8 1.8 0 3.4-.7 4.7-1.8" />
      </svg>
    `;
  }
  if (icon === "checklist") {
    return `
      <svg ${common}>
        <path d="M8 7.6h12.2" />
        <path d="M8 14h7.4" />
        <path d="M8 20.4h5.2" />
        <path d="M18 18.8l2.1 2.1 4-4.6" />
        <path d="M4.2 7.5h.1" />
        <path d="M4.2 14h.1" />
        <path d="M4.2 20.4h.1" />
        <path d="M20.6 6.2c.9.7 1.6 1.7 1.9 2.8" />
      </svg>
    `;
  }
  if (icon === "compass") {
    return `
      <svg ${common}>
        <circle cx="14" cy="14" r="8.7" />
        <path d="M17.6 8.9 15.5 15.5 9.2 18.8l2.1-6.6 6.3-3.3Z" />
        <path d="M15.5 15.5 12 12.2" />
        <path d="M14 3.8v2.1" />
        <path d="M14 22.1v2.1" />
        <path d="M3.8 14h2.1" />
        <path d="M22.1 14h2.1" />
      </svg>
    `;
  }
  if (icon === "bookmark") {
    return `
      <svg ${common}>
        <path d="M8 5.2h12v18l-6-4-6 4z" />
        <path d="M11 9.2h6" />
        <path d="M11 12.7h4.2" />
      </svg>
    `;
  }
  return `
    <svg ${common}>
      <circle cx="14" cy="14" r="8" />
      <path d="M14 8.8v10.4" />
      <path d="M8.8 14h10.4" />
    </svg>
  `;
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
