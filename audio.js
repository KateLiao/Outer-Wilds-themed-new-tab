/**
 * 番茄钟音效：专注/休息开始提示音与休息背景音乐。
 */

const SOUND_URLS = {
  "focus-start": "./assets/floraphonic-short-punchy-sine-wave-ding-10-a-211748.mp3",
  "break-start": "./assets/floraphonic-minimal-pop-click-ui-1-198301.mp3",
};

const REST_MUSIC_URL =
  "./assets/Timber Hearth - Andrew Prahlow - SoundLoadMate.com.mp3";

/** @type {Record<string, HTMLAudioElement>} */
const sfxCache = {};

/** @type {HTMLAudioElement | null} */
let restMusic = null;

/** 休息背景音乐默认音量（相对提示音更低） */
const REST_MUSIC_VOLUME = 0.38;

/** 提示音默认音量 */
const SFX_VOLUME = 0.85;

/**
 * 判断当前是否应屏蔽所有番茄钟声音。
 * @returns {boolean}
 */
function isAudioBlocked() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 将资源路径编码为可安全加载的 URL。
 * @param {string} path 相对路径
 * @returns {string}
 */
function encodeAssetPath(path) {
  return encodeURI(path);
}

/**
 * 获取或创建指定类型的提示音 Audio 实例。
 * @param {"focus-start"|"break-start"} type 提示音类型
 * @returns {HTMLAudioElement}
 */
function getSfx(type) {
  if (!sfxCache[type]) {
    const audio = new Audio(encodeAssetPath(SOUND_URLS[type]));
    audio.preload = "auto";
    audio.volume = SFX_VOLUME;
    sfxCache[type] = audio;
  }
  return sfxCache[type];
}

/**
 * 获取或创建休息背景音乐 Audio 实例（循环播放）。
 * @returns {HTMLAudioElement}
 */
function getRestMusic() {
  if (!restMusic) {
    restMusic = new Audio(encodeAssetPath(REST_MUSIC_URL));
    restMusic.preload = "auto";
    restMusic.loop = true;
    restMusic.volume = REST_MUSIC_VOLUME;
  }
  return restMusic;
}

/**
 * 预加载单个提示音资源。
 * @param {"focus-start"|"break-start"} type 提示音类型
 * @returns {void}
 */
function preloadSound(type) {
  const audio = getSfx(type);
  audio.load();
}

/**
 * 播放专注或休息开始提示音。
 * @param {"focus-start"|"break-start"} type 提示类型
 * @param {boolean} [enabled=true] 是否启用声音
 * @returns {void}
 */
export function playSound(type, enabled = true) {
  if (!enabled || isAudioBlocked()) {
    return;
  }

  const audio = getSfx(type);
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

/**
 * 开始循环播放休息背景音乐。
 * @param {boolean} [enabled=true] 是否启用声音
 * @returns {void}
 */
export function startRestMusic(enabled = true) {
  if (!enabled || isAudioBlocked()) {
    return;
  }

  const music = getRestMusic();
  if (music.paused) {
    music.play().catch(() => {});
  }
}

/**
 * 停止休息背景音乐并重置播放进度。
 * @returns {void}
 */
export function stopRestMusic() {
  if (!restMusic) {
    return;
  }
  restMusic.pause();
  restMusic.currentTime = 0;
}

/**
 * 根据番茄钟阶段同步休息背景音乐（短/长休息播放，其余阶段停止）。
 * @param {string} phase 当前阶段标识
 * @param {boolean} [enabled=true] 是否启用声音
 * @returns {void}
 */
export function syncRestMusicForPhase(phase, enabled = true) {
  const inBreak = phase === "short_break" || phase === "long_break";
  if (inBreak && enabled) {
    startRestMusic(true);
  } else {
    stopRestMusic();
  }
}

/**
 * 在用户首次交互时预加载全部音频资源。
 * @returns {void}
 */
export function warmupAudio() {
  if (isAudioBlocked()) {
    return;
  }
  preloadSound("focus-start");
  preloadSound("break-start");
  getRestMusic().load();
}
