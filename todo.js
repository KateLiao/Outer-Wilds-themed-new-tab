/**
 * 今日 TODO 数据控制器。这里的“今日”表示当前清单，不做日期自动归档或清理。
 */
import { storageLocalGet, storageLocalSet } from "./storage-adapter.js";

const STORAGE_KEY = "todayTodoItems";

/**
 * 管理 TODO items 的增删改与持久化。
 */
export class TodoController {
  /**
   * @param {object} options
   * @param {(items: object[]) => void} [options.onChange]
   */
  constructor(options = {}) {
    this.items = [];
    this.onChange = options.onChange ?? (() => {});
  }

  /**
   * 加载本地 TODO 清单。
   * @returns {Promise<void>}
   */
  async init() {
    const data = await storageLocalGet(STORAGE_KEY);
    this.items = normalizeItems(data[STORAGE_KEY]);
    await this.persist();
    this.emitChange();
  }

  /**
   * 获取排序后的清单副本。
   * @returns {object[]}
   */
  getItems() {
    return normalizeItems(this.items);
  }

  /**
   * 添加任务。
   * @param {object} item
   * @param {string} item.title
   * @returns {Promise<object|null>}
   */
  async addItem(item) {
    const title = normalizeTitle(item.title);
    if (!title) {
      return null;
    }
    const now = Date.now();
    const nextItem = {
      id: createId(),
      title,
      completed: false,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    this.items = [nextItem, ...this.items];
    await this.persistAndEmit();
    return nextItem;
  }

  /**
   * 更新任务内容。
   * @param {string} id
   * @param {object} patch
   * @returns {Promise<void>}
   */
  async updateItem(id, patch) {
    const now = Date.now();
    this.items = this.items.map((item) => {
      if (item.id !== id) {
        return item;
      }
      const next = { ...item, updatedAt: now };
      if (Object.prototype.hasOwnProperty.call(patch, "title")) {
        const title = normalizeTitle(patch.title);
        if (title) {
          next.title = title;
        }
      }
      return next;
    });
    await this.persistAndEmit();
  }

  /**
   * 完成或取消完成。
   * @param {string} id
   * @param {boolean} completed
   * @returns {Promise<void>}
   */
  async setCompleted(id, completed) {
    const now = Date.now();
    this.items = this.items.map((item) =>
      item.id === id
        ? {
            ...item,
            completed,
            completedAt: completed ? now : null,
            updatedAt: now,
          }
        : item,
    );
    await this.persistAndEmit();
  }

  /**
   * 删除单条任务。
   * @param {string} id
   * @returns {Promise<void>}
   */
  async removeItem(id) {
    this.items = this.items.filter((item) => item.id !== id);
    await this.persistAndEmit();
  }

  /**
   * 清空已完成任务。
   * @returns {Promise<void>}
   */
  async clearCompleted() {
    this.items = this.items.filter((item) => !item.completed);
    await this.persistAndEmit();
  }

  /**
   * 外部 storage 变更时同步。
   * @param {object[]} newItems
   */
  syncFromStorage(newItems) {
    this.items = normalizeItems(newItems);
    this.emitChange();
  }

  /**
   * @returns {Promise<void>}
   */
  async persist() {
    await storageLocalSet({ [STORAGE_KEY]: normalizeItems(this.items) });
  }

  /**
   * @returns {Promise<void>}
   */
  async persistAndEmit() {
    await this.persist();
    this.emitChange();
  }

  /**
   * 通知 UI。
   */
  emitChange() {
    this.onChange(this.getItems());
  }
}

/**
 * @param {object[]} items
 * @returns {object[]}
 */
function normalizeItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .filter((item) => item && typeof item === "object" && normalizeTitle(item.title))
    .map((item) => ({
      id: item.id || createId(),
      title: normalizeTitle(item.title),
      completed: Boolean(item.completed),
      createdAt: Number(item.createdAt) || Date.now(),
      updatedAt: Number(item.updatedAt) || Number(item.createdAt) || Date.now(),
      completedAt: item.completed && item.completedAt ? Number(item.completedAt) : null,
    }))
    .sort(sortTodoItems);
}

/**
 * 未完成在前，同状态下新任务在前。
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function sortTodoItems(a, b) {
  if (a.completed !== b.completed) {
    return a.completed ? 1 : -1;
  }
  return b.createdAt - a.createdAt;
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeTitle(value) {
  return String(value ?? "").trim().slice(0, 120);
}

/**
 * @returns {string}
 */
function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
