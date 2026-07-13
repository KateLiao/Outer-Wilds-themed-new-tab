/** 稍后再看：本地内容队列、消费状态、分类与排序。 */
import { storageLocalGet, storageLocalSet } from "./storage-adapter.js";

export const READ_LATER_STATUS = Object.freeze({
  UNREAD: "unread",
  IN_PROGRESS: "inProgress",
  COMPLETED: "completed",
});

export const READ_LATER_TYPE = Object.freeze({ ARTICLE: "article", VIDEO: "video" });
export const DEFAULT_READ_LATER_SETTINGS = Object.freeze({ sortDirection: "desc" });

export class ReadLaterController {
  constructor(options = {}) {
    this.items = [];
    this.settings = { ...DEFAULT_READ_LATER_SETTINGS };
    this.onChange = options.onChange ?? (() => {});
  }

  async init() {
    const data = await storageLocalGet(["readLaterItems", "readLaterSettings"]);
    this.items = normalizeItems(data.readLaterItems);
    this.settings = normalizeSettings(data.readLaterSettings);
    await this.persist();
    this.emitChange();
  }

  getItems() {
    const direction = this.settings.sortDirection === "asc" ? 1 : -1;
    return this.items.map((item) => ({ ...item })).sort((a, b) => direction * (a.createdAt - b.createdAt));
  }

  getSettings() {
    return { ...this.settings };
  }

  getPendingCount() {
    return this.items.filter((item) => item.status !== READ_LATER_STATUS.COMPLETED).length;
  }

  async setSortDirection(direction) {
    this.settings = normalizeSettings({ sortDirection: direction });
    await this.persist();
    this.emitChange();
  }

  async markOpened(id) {
    return this.updateItem(id, (item) => ({
      ...item,
      status: item.status === READ_LATER_STATUS.UNREAD ? READ_LATER_STATUS.IN_PROGRESS : item.status,
      openedAt: item.openedAt ?? Date.now(),
    }));
  }

  async markCompleted(id) {
    return this.updateItem(id, (item) => ({ ...item, status: READ_LATER_STATUS.COMPLETED, completedAt: Date.now() }));
  }

  async restoreInProgress(id) {
    return this.updateItem(id, (item) => ({
      ...item,
      status: READ_LATER_STATUS.IN_PROGRESS,
      openedAt: item.openedAt ?? Date.now(),
      completedAt: null,
    }));
  }

  async setContentType(id, contentType) {
    if (!Object.values(READ_LATER_TYPE).includes(contentType)) return null;
    return this.updateItem(id, (item) => ({ ...item, contentType }));
  }

  async removeItems(ids) {
    const selected = new Set(ids);
    const removed = this.items.filter((item) => selected.has(item.id));
    if (!removed.length) return [];
    this.items = this.items.filter((item) => !selected.has(item.id));
    await this.persist();
    this.emitChange();
    return removed.map((item) => ({ ...item }));
  }

  async restoreItems(items) {
    const existing = new Set(this.items.map((item) => item.id));
    this.items.push(...normalizeItems(items).filter((item) => !existing.has(item.id)));
    await this.persist();
    this.emitChange();
  }

  syncFromStorage(items, settings = this.settings) {
    this.items = normalizeItems(items);
    this.settings = normalizeSettings(settings);
    this.emitChange();
  }

  async updateItem(id, updater) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) return null;
    this.items[index] = normalizeItem(updater({ ...this.items[index] }));
    await this.persist();
    this.emitChange();
    return { ...this.items[index] };
  }

  async persist() {
    await storageLocalSet({ readLaterItems: this.items, readLaterSettings: this.settings });
  }

  emitChange() {
    this.onChange(this.getItems(), this.getSettings());
  }
}

export function normalizeItems(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map(normalizeItem).filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function normalizeItem(value = {}) {
  const now = Date.now();
  const status = Object.values(READ_LATER_STATUS).includes(value.status) ? value.status : READ_LATER_STATUS.UNREAD;
  return {
    id: String(value.id || crypto.randomUUID()),
    url: String(value.url || ""),
    title: String(value.title || value.url || "未命名网页"),
    faviconUrl: String(value.faviconUrl || ""),
    contentType: Object.values(READ_LATER_TYPE).includes(value.contentType) ? value.contentType : READ_LATER_TYPE.ARTICLE,
    status,
    createdAt: Number(value.createdAt) || now,
    openedAt: Number(value.openedAt) || null,
    completedAt: status === READ_LATER_STATUS.COMPLETED ? Number(value.completedAt) || now : null,
  };
}

function normalizeSettings(value = {}) {
  return { sortDirection: value.sortDirection === "asc" ? "asc" : "desc" };
}
