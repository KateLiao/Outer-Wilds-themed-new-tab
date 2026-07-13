/**
 * 快捷导航数据控制器。用户手动添加网址，系统自动推导名称与 favicon。
 */
import { storageSyncGet, storageSyncSet } from "./storage-adapter.js";

const STORAGE_KEY = "quickLinks";
const MAX_LINKS = 24;

/**
 * 管理快捷导航链接。
 */
export class QuickLinksController {
  /**
   * @param {object} options
   * @param {(links: object[]) => void} [options.onChange]
   */
  constructor(options = {}) {
    this.links = [];
    this.onChange = options.onChange ?? (() => {});
  }

  /**
   * 加载快捷导航。
   * @returns {Promise<void>}
   */
  async init() {
    const data = await storageSyncGet(STORAGE_KEY);
    this.links = normalizeLinks(data[STORAGE_KEY]);
    await this.persist();
    this.emitChange();
  }

  /**
   * 获取链接副本。
   * @returns {object[]}
   */
  getLinks() {
    return normalizeLinks(this.links);
  }

  /**
   * 添加网址。
   * @param {object} link
   * @param {string} link.url
   * @param {string} [link.title]
   * @returns {Promise<object|null>}
   */
  async addLink(link) {
    const normalized = normalizeUrl(link.url);
    if (!normalized) {
      return null;
    }
    const exists = this.links.some((item) => item.url === normalized.href);
    if (exists) {
      return null;
    }
    const now = Date.now();
    const currentLinks = normalizeLinks(this.links).map((item, index) => ({
      ...item,
      position: index + 1,
    }));
    const nextLink = {
      id: createId(),
      title: normalizeTitle(link.title) || inferTitle(normalized),
      url: normalized.href,
      origin: normalized.origin,
      iconUrl: createFaviconUrl(normalized),
      position: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.links = [nextLink, ...currentLinks].slice(0, MAX_LINKS);
    await this.persistAndEmit();
    return nextLink;
  }

  /**
   * 调整链接位置。
   * @param {string} id
   * @param {"up"|"down"} direction
   * @returns {Promise<void>}
   */
  async moveLink(id, direction) {
    const list = normalizeLinks(this.links);
    const index = list.findIndex((link) => link.id === id);
    if (index < 0) {
      return;
    }
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) {
      return;
    }
    const next = [...list];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    this.links = next.map((link, position) => ({ ...link, position, updatedAt: Date.now() }));
    await this.persistAndEmit();
  }

  /**
   * 将链接移动到指定位置。
   * @param {string} id
   * @param {number} targetIndex
   * @returns {Promise<void>}
   */
  async moveLinkToIndex(id, targetIndex) {
    const list = normalizeLinks(this.links);
    const fromIndex = list.findIndex((link) => link.id === id);
    const nextIndex = Math.max(0, Math.min(list.length - 1, Number(targetIndex)));
    if (fromIndex < 0 || fromIndex === nextIndex) {
      return;
    }
    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(nextIndex, 0, moved);
    this.links = next.map((link, position) => ({ ...link, position, updatedAt: Date.now() }));
    await this.persistAndEmit();
  }

  /**
   * 删除链接。
   * @param {string} id
   * @returns {Promise<void>}
   */
  async removeLink(id) {
    this.links = normalizeLinks(this.links)
      .filter((link) => link.id !== id)
      .map((link, position) => ({ ...link, position }));
    await this.persistAndEmit();
  }

  /**
   * 外部 storage 变更时同步。
   * @param {object[]} links
   */
  syncFromStorage(links) {
    this.links = normalizeLinks(links);
    this.emitChange();
  }

  /**
   * @returns {Promise<void>}
   */
  async persist() {
    await storageSyncSet({ [STORAGE_KEY]: normalizeLinks(this.links) });
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
    this.onChange(this.getLinks());
  }
}

/**
 * @param {object[]} links
 * @returns {object[]}
 */
function normalizeLinks(links) {
  if (!Array.isArray(links)) {
    return [];
  }
  return links
    .map((link) => normalizeLink(link))
    .filter(Boolean)
    .sort(sortLinks)
    .slice(0, MAX_LINKS)
    .map((link, position) => ({ ...link, position }));
}

/**
 * @param {object} link
 * @returns {object|null}
 */
function normalizeLink(link) {
  if (!link || typeof link !== "object") {
    return null;
  }
  const normalized = normalizeUrl(link.url);
  if (!normalized) {
    return null;
  }
  const createdAt = Number(link.createdAt) || Date.now();
  return {
    id: link.id || createId(),
    title: normalizeTitle(link.title) || inferTitle(normalized),
    url: normalized.href,
    origin: normalized.origin,
    iconUrl: normalizeIconUrl(link.iconUrl, normalized),
    position: normalizePosition(link.position),
    createdAt,
    updatedAt: Number(link.updatedAt) || createdAt,
  };
}

/**
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function sortLinks(a, b) {
  if (a.position !== b.position) {
    return a.position - b.position;
  }
  return b.createdAt - a.createdAt;
}

/**
 * @param {string} value
 * @returns {URL|null}
 */
function normalizeUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeTitle(value) {
  return String(value ?? "").trim().slice(0, 32);
}

/**
 * @param {number} value
 * @returns {number}
 */
function normalizePosition(value) {
  const position = Number(value);
  return Number.isFinite(position) && position >= 0 ? position : Number.MAX_SAFE_INTEGER;
}

/**
 * @param {string} value
 * @param {URL} url
 * @returns {string}
 */
function normalizeIconUrl(value, url) {
  const normalized = normalizeUrl(value);
  return normalized ? normalized.href : createFaviconUrl(url);
}

/**
 * @param {URL} url
 * @returns {string}
 */
function createFaviconUrl(url) {
  return `${url.origin}/favicon.ico`;
}

/**
 * @param {URL} url
 * @returns {string}
 */
function inferTitle(url) {
  return url.hostname.replace(/^www\./, "").split(".")[0].slice(0, 32) || "网站";
}

/**
 * @returns {string}
 */
function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `link-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
