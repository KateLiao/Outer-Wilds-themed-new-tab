/**
 * 统一 storage 接口，扩展环境用 chrome.storage，本地开发降级为 localStorage。
 */

const SYNC_PREFIX = "sync:";
const LOCAL_PREFIX = "local:";

/**
 * 判断是否在扩展环境中运行。
 * @returns {boolean}
 */
export function isExtensionContext() {
  return typeof chrome !== "undefined" && Boolean(chrome.storage);
}

/**
 * 读取 sync 存储区数据。
 * @param {string|string[]|object|null} keys
 * @returns {Promise<object>}
 */
export async function storageSyncGet(keys) {
  if (isExtensionContext()) {
    return chrome.storage.sync.get(keys);
  }
  const result = {};
  const keyList = normalizeKeys(keys);
  keyList.forEach((key) => {
    const raw = localStorage.getItem(`${SYNC_PREFIX}${key}`);
    if (raw !== null) {
      result[key] = JSON.parse(raw);
    }
  });
  return result;
}

/**
 * 写入 sync 存储区数据。
 * @param {object} items
 * @returns {Promise<void>}
 */
export async function storageSyncSet(items) {
  if (isExtensionContext()) {
    await chrome.storage.sync.set(items);
    return;
  }
  Object.entries(items).forEach(([key, value]) => {
    localStorage.setItem(`${SYNC_PREFIX}${key}`, JSON.stringify(value));
  });
}

/**
 * 读取 local 存储区数据。
 * @param {string|string[]|object|null} keys
 * @returns {Promise<object>}
 */
export async function storageLocalGet(keys) {
  if (isExtensionContext()) {
    return chrome.storage.local.get(keys);
  }
  const result = {};
  const keyList = normalizeKeys(keys);
  keyList.forEach((key) => {
    const raw = localStorage.getItem(`${LOCAL_PREFIX}${key}`);
    if (raw !== null) {
      result[key] = JSON.parse(raw);
    }
  });
  return result;
}

/**
 * 写入 local 存储区数据。
 * @param {object} items
 * @returns {Promise<void>}
 */
export async function storageLocalSet(items) {
  if (isExtensionContext()) {
    await chrome.storage.local.set(items);
    return;
  }
  Object.entries(items).forEach(([key, value]) => {
    localStorage.setItem(`${LOCAL_PREFIX}${key}`, JSON.stringify(value));
  });
}

/**
 * 监听 storage 变更（仅扩展环境有效）。
 * @param {(changes: object, area: string) => void} listener
 */
export function onStorageChanged(listener) {
  if (isExtensionContext()) {
    chrome.storage.onChanged.addListener(listener);
  }
}

/**
 * 规范化 get 请求的 key 列表。
 * @param {string|string[]|object|null} keys
 * @returns {string[]}
 */
function normalizeKeys(keys) {
  if (keys === null || keys === undefined) {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(SYNC_PREFIX) || k.startsWith(LOCAL_PREFIX))
      .map((k) => k.replace(/^(sync|local):/, ""));
  }
  if (typeof keys === "string") {
    return [keys];
  }
  if (Array.isArray(keys)) {
    return keys;
  }
  return Object.keys(keys);
}
