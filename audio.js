/**
 * 番茄钟音效：专注/休息开始提示音、休息背景音乐与专注白噪音。
 * “静音”仅控制专注白噪音，不影响提示音和休息音乐。
 */

const SOUND_URLS = {
  "focus-start": "./assets/floraphonic-short-punchy-sine-wave-ding-10-a-211748.mp3",
  "break-start": "./assets/floraphonic-minimal-pop-click-ui-1-198301.mp3",
};

const REST_MUSIC_URL =
  "./assets/Timber Hearth - Andrew Prahlow - SoundLoadMate.com.mp3";

const FOCUS_FIRE_URL = "./assets/mixkit-campfire-crackles-1330.mp3";

/** @type {Record<string, HTMLAudioElement>} */
const sfxCache = {};

/** @type {HTMLAudioElement | null} */
let restMusic = null;

/** @type {HTMLAudioElement | null} */
let focusFireSound = null;

/** @type {Set<(muted: boolean) => void>} */
const muteListeners = new Set();

/** @type {Set<(volume: number) => void>} */
const volumeListeners = new Set();

let audioMuted = loadAudioMuted();
let audioVolume = loadAudioVolume();

/** 休息背景音乐默认音量 */
const REST_MUSIC_VOLUME = 0.75;

/** 专注篝火背景音默认音量 */
const FOCUS_FIRE_VOLUME = 1;

/** 提示音默认音量 */
const SFX_VOLUME = 1;

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
 * 读取本地静音状态。
 * @returns {boolean}
 */
function loadAudioMuted() {
  try {
    return localStorage.getItem("pomodoroAudioMuted") === "true";
  } catch {
    return false;
  }
}

/**
 * 持久化本地静音状态。
 * @param {boolean} muted
 * @returns {void}
 */
function saveAudioMuted(muted) {
  try {
    localStorage.setItem("pomodoroAudioMuted", muted ? "true" : "false");
  } catch {}
}

/**
 * 读取本地音量状态。
 * @returns {number}
 */
function loadAudioVolume() {
  try {
    const value = Number(localStorage.getItem("pomodoroAudioVolume"));
    return Number.isFinite(value) ? clampVolume(value) : 1;
  } catch {
    return 1;
  }
}

/**
 * 持久化本地音量状态。
 * @param {number} volume
 * @returns {void}
 */
function saveAudioVolume(volume) {
  try {
    localStorage.setItem("pomodoroAudioVolume", String(volume));
  } catch {}
}

/**
 * 将音量限制在浏览器可接受范围。
 * @param {number} volume
 * @returns {number}
 */
function clampVolume(volume) {
  return Math.min(1, Math.max(0, Number(volume) || 0));
}

/**
 * 应用当前音量到所有已创建的音频实例。
 * @returns {void}
 */
function applyAudioVolume() {
  Object.entries(sfxCache).forEach(([type, audio]) => {
    audio.volume = type === "break-start" || type === "focus-start" ? SFX_VOLUME * audioVolume : audioVolume;
  });
  if (restMusic) {
    restMusic.volume = REST_MUSIC_VOLUME * audioVolume;
  }
  if (focusFireSound) {
    focusFireSound.volume = FOCUS_FIRE_VOLUME * audioVolume;
  }
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
    audio.volume = SFX_VOLUME * audioVolume;
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
    restMusic.preload = "none";
    restMusic.loop = true;
    restMusic.volume = REST_MUSIC_VOLUME * audioVolume;
  }
  return restMusic;
}

/**
 * 获取或创建专注篝火背景音实例（循环播放）。
 * @returns {HTMLAudioElement}
 */
function getFocusFireSound() {
  if (!focusFireSound) {
    focusFireSound = new Audio(encodeAssetPath(FOCUS_FIRE_URL));
    focusFireSound.preload = "none";
    focusFireSound.loop = true;
    focusFireSound.volume = FOCUS_FIRE_VOLUME * audioVolume;
  }

  return focusFireSound;
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
 * 开始播放专注篝火背景音。
 * @param {boolean} [enabled=true] 是否启用声音
 * @returns {void}
 */
export function startFocusFireSound(enabled = true) {
  if (!enabled || audioMuted || isAudioBlocked()) {
    stopFocusFireSound();
    return;
  }

  const fireSound = getFocusFireSound();
  if (fireSound.paused) {
    fireSound.play().catch(() => {});
  }
}

/**
 * 停止专注篝火背景音并重置播放进度。
 * @returns {void}
 */
export function stopFocusFireSound() {
  if (!focusFireSound) {
    return;
  }
  focusFireSound.pause();
  focusFireSound.currentTime = 0;
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
 * 根据番茄钟阶段同步专注篝火背景音（专注中播放，其余阶段停止）。
 * @param {string} phase 当前阶段标识
 * @param {boolean} [enabled=true] 是否启用声音
 * @returns {void}
 */
export function syncFocusFireSoundForPhase(phase, enabled = true) {
  if (phase === "focus" && enabled) {
    startFocusFireSound(true);
  } else {
    stopFocusFireSound();
  }
}

/**
 * 当前是否已关闭专注白噪音。
 * @returns {boolean}
 */
export function isAudioMuted() {
  return audioMuted;
}

/**
 * 设置专注白噪音静音状态。
 * @param {boolean} muted
 * @returns {void}
 */
export function setAudioMuted(muted) {
  audioMuted = muted;
  saveAudioMuted(muted);
  if (muted) {
    stopFocusFireSound();
  }
  muteListeners.forEach((listener) => listener(audioMuted));
}

/**
 * 监听静音状态变化。
 * @param {(muted: boolean) => void} listener
 * @returns {() => void}
 */
export function onAudioMutedChange(listener) {
  muteListeners.add(listener);
  return () => muteListeners.delete(listener);
}

/**
 * 获取当前全局音量。
 * @returns {number}
 */
export function getAudioVolume() {
  return audioVolume;
}

/**
 * 设置当前全局音量。
 * @param {number} volume
 * @returns {void}
 */
export function setAudioVolume(volume) {
  audioVolume = clampVolume(volume);
  saveAudioVolume(audioVolume);
  applyAudioVolume();
  volumeListeners.forEach((listener) => listener(audioVolume));
}

/**
 * 监听音量变化。
 * @param {(volume: number) => void} listener
 * @returns {() => void}
 */
export function onAudioVolumeChange(listener) {
  volumeListeners.add(listener);
  return () => volumeListeners.delete(listener);
}

/**
 * 在用户首次交互时预热短提示音；循环背景音等到真正进入对应阶段再加载。
 * @returns {void}
 */
export function warmupAudio() {
  if (isAudioBlocked()) {
    return;
  }
  preloadSound("focus-start");
  preloadSound("break-start");
}
