/**
 * 新标签页入口：初始化番茄钟控制器、UI 与 3D 场景。
 *
 * 注意：
 * 1. `ui` 必须先声明为 let null，再赋值，避免 `onChange` 回调在 `const ui` 初始化前
 *    被调用时产生 TDZ（Temporal Dead Zone）ReferenceError。
 * 2. `app.js` 使用动态 import，使 Three.js 加载失败时不影响番茄钟主功能。
 */
import { PomodoroController, PHASE } from "./pomodoro.js";
import { initPomodoroUI } from "./pomodoro-ui.js";
import { FeatureSettingsController } from "./feature-settings.js";
import { TodoController } from "./todo.js";
import { QuickLinksController } from "./quick-links.js";
import { ReadLaterController } from "./read-later.js";
import { playSound, warmupAudio, syncFocusFireSoundForPhase, syncRestMusicForPhase } from "./audio.js";

/**
 * 判断页面是否处于后台或失去焦点。
 * @returns {boolean}
 */
function isPageHidden() {
  return document.hidden || !document.hasFocus();
}

/**
 * 启动应用：串联番茄钟与篝火场景。
 * 使用 let ui = null 解决 onChange 在 ui 初始化前被调用的 TDZ 问题。
 * 3D 场景通过动态 import 加载，加载失败不会影响番茄钟核心功能。
 * @returns {Promise<void>}
 */
async function bootstrap() {
  const sceneBridge = {
    enterRoastView: null,
    exitRoastView: null,
    setMotionScale: null,
    setFocusIntensity: null,
    setDockInteractionState: null,
    isRoastViewActive: () => false,
  };

  // 必须先声明 ui，防止 PomodoroController 的 onChange 回调在 ui 赋值前被调用
  // 触发 Temporal Dead Zone ReferenceError
  let ui = null;
  let pendingRoastView = false;
  let audioReady = false;
  const breakEndEvents = new Set(["short-break-end", "long-break-end", "skip-short-break", "skip-long-break"]);

  /**
   * 根据阶段变更事件播放对应开始提示音（跳过 init 后的首次同步）。
   * @param {object} payload onChange 载荷
   * @returns {void}
   */
  function maybePlayPhaseSound(payload) {
    if (!audioReady) {
      return;
    }
    const { settings, session, eventType } = payload;
    if (!settings.soundEnabled || isPageHidden()) {
      return;
    }

    const { phase } = session;
    const focusStartEvents = new Set([
      "focus-start",
      "short-break-end",
      "long-break-end",
      "skip-short-break",
      "skip-long-break",
      "debug-focus",
    ]);
    const breakStartEvents = new Set([
      "focus-complete",
      "break-start",
      "debug-short-break",
      "debug-long-break",
    ]);

    if (focusStartEvents.has(eventType) && phase === PHASE.FOCUS) {
      playSound("focus-start", true);
    }
    if (
      breakStartEvents.has(eventType) &&
      (phase === PHASE.SHORT_BREAK || phase === PHASE.LONG_BREAK)
    ) {
      playSound("break-start", true);
    }
  }

  /**
   * 进入烤棉花糖近景；场景未就绪时排队，加载完成后补触发。
   */
  function triggerRoastView() {
    if (sceneBridge.enterRoastView) {
      sceneBridge.enterRoastView(true);
      pendingRoastView = false;
      return;
    }
    pendingRoastView = true;
  }

  /**
   * 离开休息阶段时退出烤棉花糖近景，并清掉尚未执行的排队请求。
   */
  function clearRoastView() {
    pendingRoastView = false;
    if (sceneBridge.isRoastViewActive?.()) {
      sceneBridge.exitRoastView?.();
    }
  }

  /**
   * 判断是否处于休息阶段。
   * @param {string} phase
   * @returns {boolean}
   */
  function isBreakPhase(phase) {
    return phase === PHASE.SHORT_BREAK || phase === PHASE.LONG_BREAK;
  }

  /**
   * 根据当前阶段恢复环境音与烤棉花糖视角。
   */
  function syncCurrentExperience() {
    const session = pomodoro.getSession();
    const settings = pomodoro.getSettings();
    syncFocusFireSoundForPhase(session.phase, settings.focusFireSoundEnabled !== false);
    syncRestMusicForPhase(session.phase, settings.restMusicEnabled !== false);
    if (isBreakPhase(session.phase)) {
      triggerRoastView();
    }
  }

  const pomodoro = new PomodoroController({
    shouldHandleExpiry: () => !isPageHidden(),
    onChange: (payload) => {
      // 使用可选链，init() 结束前 onChange 可能被调用而 ui 尚未赋值
      ui?.render(payload);
      maybePlayPhaseSound(payload);
      syncFocusFireSoundForPhase(payload.session.phase, payload.settings.focusFireSoundEnabled !== false);
      syncRestMusicForPhase(payload.session.phase, payload.settings.restMusicEnabled !== false);
      if (isBreakPhase(payload.session.phase)) {
        if (!pendingRoastView && !sceneBridge.isRoastViewActive?.()) {
          triggerRoastView();
        }
      } else if (breakEndEvents.has(payload.eventType)) {
        clearRoastView();
      }
      if (payload.session.phase === PHASE.PAUSED) {
        sceneBridge.setMotionScale?.(0.3);
      } else if (payload.session.phase === PHASE.FOCUS) {
        sceneBridge.setMotionScale?.(1);
        sceneBridge.setFocusIntensity?.(true);
        clearRoastView();
      } else {
        sceneBridge.setMotionScale?.(1);
        sceneBridge.setFocusIntensity?.(false);
      }
    },
    onComplete: (event) => {
      if (event.type === "focus-complete") {
        // 与手动双击篝火相同：直接进入烤棉花糖近景
        triggerRoastView();
      }
    },
  });
  const featureSettings = new FeatureSettingsController();
  const todo = new TodoController();
  const quickLinks = new QuickLinksController();
  const readLater = new ReadLaterController();

  await Promise.all([pomodoro.init(), featureSettings.init(), todo.init(), quickLinks.init(), readLater.init()]);
  audioReady = true;

  // init() 结束后再赋值，此后 onChange 调用 ui?.render() 才能正常渲染
  ui = initPomodoroUI(pomodoro, {
    onStartFocus: () => {
      warmupAudio();
      if (sceneBridge.isRoastViewActive()) {
        sceneBridge.exitRoastView?.();
      }
      pomodoro.startFocus();
    },
  }, {
    featureSettings,
    todo,
    quickLinks,
    readLater,
    onDockStateChange: (state) => {
      sceneBridge.setDockInteractionState?.(state);
    },
  });

  ui.render({
    settings: pomodoro.getSettings(),
    session: pomodoro.getSession(),
    remainingMs: pomodoro.getRemainingMs(),
  });

  // 动态 import：加载 Rollup 打包后的 Three.js bundle，避免扩展环境裸模块名问题
  // 加载失败时不影响番茄钟核心功能
  try {
    const { initCampfireScene } = await import("./dist/app.bundle.js");
    const bridge = await initCampfireScene({
      canManualRoast: () => pomodoro.canManualRoast(),
    });
    Object.assign(sceneBridge, bridge);
    const session = pomodoro.getSession();
    if (pendingRoastView && isBreakPhase(session.phase)) {
      triggerRoastView();
    } else if (isBreakPhase(session.phase)) {
      triggerRoastView();
    } else {
      pendingRoastView = false;
    }
  } catch (error) {
    console.error("WebGL scene failed", error);
    document.querySelector("#webglFallback").hidden = false;
  }

  document.addEventListener("pointerdown", () => {
    warmupAudio();
    syncCurrentExperience();
  }, { once: true });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      pomodoro.reconcileExpiredState();
      const session = pomodoro.getSession();
      ui.render({
        settings: pomodoro.getSettings(),
        session,
        remainingMs: pomodoro.getRemainingMs(),
      });
      syncCurrentExperience();
    }
  });
}

bootstrap();
