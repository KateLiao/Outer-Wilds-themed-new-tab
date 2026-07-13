/**
 * 统一风格的确认弹窗，替代浏览器原生 confirm。
 */

/** @type {HTMLElement | null} */
let overlayEl = null;

/** @type {HTMLElement | null} */
let titleEl = null;

/** @type {HTMLElement | null} */
let messageEl = null;

/** @type {HTMLButtonElement | null} */
let cancelButton = null;

/** @type {HTMLButtonElement | null} */
let confirmButton = null;

/** @type {((confirmed: boolean) => void) | null} */
let resolvePending = null;

/** @type {HTMLElement | null} */
let previousFocus = null;

/** @type {(event: KeyboardEvent) => void} */
let keydownHandler = null;

/**
 * 创建并挂载确认弹窗 DOM（仅首次调用时执行）。
 * @returns {void}
 */
function ensureDialogMounted() {
  if (overlayEl) {
    return;
  }

  overlayEl = document.createElement("div");
  overlayEl.id = "confirmOverlay";
  overlayEl.className = "confirm-overlay";
  overlayEl.hidden = true;
  overlayEl.inert = true;
  overlayEl.setAttribute("aria-hidden", "true");

  const panel = document.createElement("div");
  panel.className = "confirm-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "confirmTitle");

  titleEl = document.createElement("h2");
  titleEl.id = "confirmTitle";
  titleEl.className = "confirm-title";

  messageEl = document.createElement("p");
  messageEl.className = "confirm-message";

  const actions = document.createElement("div");
  actions.className = "confirm-actions";

  cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "btn-secondary";
  cancelButton.addEventListener("click", () => closeConfirm(false));

  confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.className = "btn-primary";
  confirmButton.addEventListener("click", () => closeConfirm(true));

  actions.append(cancelButton, confirmButton);
  panel.append(titleEl, messageEl, actions);
  overlayEl.append(panel);

  overlayEl.addEventListener("click", (event) => {
    if (event.target === overlayEl) {
      closeConfirm(false);
    }
  });

  document.body.append(overlayEl);
}

/**
 * 关闭确认弹窗并 resolve 等待中的 Promise。
 * @param {boolean} confirmed 用户是否点击确认
 * @returns {void}
 */
function closeConfirm(confirmed) {
  if (!overlayEl || !resolvePending) {
    return;
  }

  // 必须先把焦点移出即将隐藏的弹层，否则 Chrome 会阻止 aria-hidden 并记录警告。
  if (previousFocus instanceof HTMLElement && previousFocus.isConnected && typeof previousFocus.focus === "function") {
    previousFocus.focus({ preventScroll: true });
  } else if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  overlayEl.inert = true;
  overlayEl.hidden = true;
  overlayEl.setAttribute("aria-hidden", "true");

  if (keydownHandler) {
    document.removeEventListener("keydown", keydownHandler);
    keydownHandler = null;
  }

  const resolve = resolvePending;
  resolvePending = null;
  resolve(confirmed);

  previousFocus = null;
}

/**
 * 显示统一风格的确认弹窗。
 * @param {object} options 弹窗配置
 * @param {string} options.message 主文案
 * @param {string} [options.title='确认'] 标题
 * @param {string} [options.confirmLabel='确定'] 确认按钮文案
 * @param {string} [options.cancelLabel='取消'] 取消按钮文案
 * @param {'default'|'danger'} [options.variant='default'] 确认按钮样式：default 为橙色主按钮，danger 为警示红
 * @returns {Promise<boolean>} 用户确认返回 true，取消或 Esc 返回 false
 */
export function showConfirm(options) {
  ensureDialogMounted();

  if (resolvePending) {
    closeConfirm(false);
  }

  const {
    message,
    title = "确认",
    confirmLabel = "确定",
    cancelLabel = "取消",
    variant = "default",
  } = options;

  titleEl.textContent = title;
  messageEl.textContent = message;
  cancelButton.textContent = cancelLabel;
  confirmButton.textContent = confirmLabel;

  confirmButton.className = variant === "danger" ? "btn-danger" : "btn-primary";

  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  overlayEl.hidden = false;
  overlayEl.inert = false;
  overlayEl.setAttribute("aria-hidden", "false");

  keydownHandler = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeConfirm(false);
    }
  };
  document.addEventListener("keydown", keydownHandler);

  requestAnimationFrame(() => {
    confirmButton?.focus({ preventScroll: true });
  });

  return new Promise((resolve) => {
    resolvePending = resolve;
  });
}
