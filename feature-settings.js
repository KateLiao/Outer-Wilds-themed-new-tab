/**
 * 可选功能模块设置：控制启动坞中出现哪些模块。
 */
import { storageSyncGet, storageSyncSet } from "./storage-adapter.js";

export const FEATURE_MODULES = [
  {
    id: "pomodoro",
    label: "番茄钟",
    icon: "timer",
    description: "专注、休息与篝火仪式",
    defaultEnabled: true,
  },
  {
    id: "todayTodo",
    label: "今日 TODO",
    icon: "checklist",
    description: "当前待办清单",
    defaultEnabled: true,
  },
  {
    id: "quickLinks",
    label: "快捷导航",
    icon: "compass",
    description: "常用网站入口",
    defaultEnabled: true,
  },
  {
    id: "readLater",
    label: "稍后再看",
    icon: "bookmark",
    description: "文章与视频消费队列",
    defaultEnabled: true,
  },
];

const DEFAULT_ENABLED_MODULES = FEATURE_MODULES.filter((module) => module.defaultEnabled).map((module) => module.id);

export const DEFAULT_FEATURE_SETTINGS = {
  version: 2,
  enabledModuleIds: DEFAULT_ENABLED_MODULES,
  activeModuleId: null,
};

/**
 * 读取、校正与保存功能模块设置。
 */
export class FeatureSettingsController {
  /**
   * @param {object} options
   * @param {(settings: object) => void} [options.onChange]
   */
  constructor(options = {}) {
    this.settings = { ...DEFAULT_FEATURE_SETTINGS };
    this.onChange = options.onChange ?? (() => {});
  }

  /**
   * 从 sync storage 加载设置。
   * @returns {Promise<void>}
   */
  async init() {
    const data = await storageSyncGet("featureSettings");
    this.settings = normalizeFeatureSettings(data.featureSettings);
    await this.persist();
    this.emitChange();
  }

  /**
   * 获取当前设置副本。
   * @returns {object}
   */
  getSettings() {
    return {
      ...this.settings,
      enabledModuleIds: [...this.settings.enabledModuleIds],
    };
  }

  /**
   * 判断模块是否启用。
   * @param {string} moduleId
   * @returns {boolean}
   */
  isEnabled(moduleId) {
    return this.settings.enabledModuleIds.includes(moduleId);
  }

  /**
   * 启用或关闭某个模块。至少保留一个模块。
   * @param {string} moduleId
   * @param {boolean} enabled
   * @returns {Promise<void>}
   */
  async setModuleEnabled(moduleId, enabled) {
    const knownIds = getKnownModuleIds();
    if (!knownIds.includes(moduleId)) {
      return;
    }

    const next = new Set(this.settings.enabledModuleIds);
    if (enabled) {
      next.add(moduleId);
    } else if (next.size > 1) {
      next.delete(moduleId);
    }

    this.settings = normalizeFeatureSettings({
      ...this.settings,
      enabledModuleIds: [...next],
    });
    await this.persist();
    this.emitChange();
  }

  /**
   * 一次性保存启用模块列表。
   * @param {string[]} moduleIds
   * @returns {Promise<void>}
   */
  async setEnabledModules(moduleIds) {
    this.settings = normalizeFeatureSettings({
      ...this.settings,
      enabledModuleIds: moduleIds,
    });
    await this.persist();
    this.emitChange();
  }

  /**
   * 记录最近打开的模块。
   * @param {string|null} moduleId
   * @returns {Promise<void>}
   */
  async setActiveModule(moduleId) {
    const nextActive = this.isEnabled(moduleId) ? moduleId : null;
    this.settings = normalizeFeatureSettings({
      ...this.settings,
      activeModuleId: nextActive,
    });
    await this.persist();
    this.emitChange();
  }

  /**
   * 恢复默认模块设置。
   * @returns {Promise<void>}
   */
  async resetSettings() {
    this.settings = { ...DEFAULT_FEATURE_SETTINGS, enabledModuleIds: [...DEFAULT_ENABLED_MODULES] };
    await this.persist();
    this.emitChange();
  }

  /**
   * 外部 storage 变更时同步。
   * @param {object} newSettings
   */
  syncFromStorage(newSettings) {
    if (!newSettings) {
      return;
    }
    this.settings = normalizeFeatureSettings(newSettings);
    this.emitChange();
  }

  /**
   * 保存设置。
   * @returns {Promise<void>}
   */
  async persist() {
    await storageSyncSet({ featureSettings: this.settings });
  }

  /**
   * 通知 UI。
   */
  emitChange() {
    this.onChange(this.getSettings());
  }
}

/**
 * 校正设置结构，兼容未来新增模块。
 * @param {object} value
 * @returns {object}
 */
export function normalizeFeatureSettings(value = {}) {
  const knownIds = getKnownModuleIds();
  let enabled = Array.isArray(value.enabledModuleIds)
    ? value.enabledModuleIds.filter((id) => knownIds.includes(id))
    : DEFAULT_ENABLED_MODULES;
  if ((Number(value.version) || 1) < 2 && !enabled.includes("readLater")) {
    enabled = [...enabled, "readLater"];
  }
  const safeEnabled = enabled.length > 0 ? [...new Set(enabled)] : DEFAULT_ENABLED_MODULES;
  const activeModuleId = safeEnabled.includes(value.activeModuleId) ? value.activeModuleId : null;

  return {
    version: 2,
    enabledModuleIds: safeEnabled,
    activeModuleId,
  };
}

/**
 * @returns {string[]}
 */
function getKnownModuleIds() {
  return FEATURE_MODULES.map((module) => module.id);
}
