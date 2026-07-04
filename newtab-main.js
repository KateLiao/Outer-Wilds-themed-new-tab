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
import { playSound, warmupAudio } from "./audio.js";

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
    isRoastViewActive: () => false,
  };

  // 必须先声明 ui，防止 PomodoroController 的 onChange 回调在 ui 赋值前被调用
  // 触发 Temporal Dead Zone ReferenceError
  let ui = null;
  let pendingRoastView = false;

  /**
   * 进入烤棉花糖近景；场景未就绪时排队，加载完成后补触发。
   */
  function triggerRoastView() {
    if (sceneBridge.enterRoastView) {
      sceneBridge.enterRoastView(false);
      pendingRoastView = false;
      return;
    }
    pendingRoastView = true;
  }

  const pomodoro = new PomodoroController({
    onChange: (payload) => {
      // 使用可选链，init() 结束前 onChange 可能被调用而 ui 尚未赋值
      ui?.render(payload);
      if (payload.session.phase === PHASE.PAUSED) {
        sceneBridge.setMotionScale?.(0.3);
      } else if (payload.session.phase === PHASE.FOCUS) {
        sceneBridge.setMotionScale?.(1);
        sceneBridge.setFocusIntensity?.(true);
        if (sceneBridge.isRoastViewActive?.()) {
          sceneBridge.exitRoastView?.();
        }
      } else {
        sceneBridge.setMotionScale?.(1);
        sceneBridge.setFocusIntensity?.(false);
      }
    },
    onComplete: (event) => {
      const settings = pomodoro.getSettings();
      if (settings.soundEnabled && !isPageHidden() && !event.debug) {
        if (event.type === "focus-complete") {
          playSound("focus-complete", true);
        } else {
          playSound("break-complete", true);
        }
      }

      if (event.type === "focus-complete") {
        // 与手动双击篝火相同：直接进入烤棉花糖近景
        triggerRoastView();
      }
    },
  });

  await pomodoro.init();

  // init() 结束后再赋值，此后 onChange 调用 ui?.render() 才能正常渲染
  ui = initPomodoroUI(pomodoro, {
    onStartFocus: () => {
      warmupAudio();
      if (sceneBridge.isRoastViewActive()) {
        sceneBridge.exitRoastView?.();
      }
      pomodoro.startFocus();
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
    if (pendingRoastView) {
      triggerRoastView();
    }
  } catch (error) {
    console.error("WebGL scene failed", error);
    document.querySelector("#webglFallback").hidden = false;
  }

  document.addEventListener("pointerdown", warmupAudio, { once: true });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      pomodoro.reconcileExpiredState();
      const session = pomodoro.getSession();
      ui.render({
        settings: pomodoro.getSettings(),
        session,
        remainingMs: pomodoro.getRemainingMs(),
      });
    }
  });
}

bootstrap();
