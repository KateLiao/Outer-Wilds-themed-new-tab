/**
 * 番茄钟提示音：篝火噼啪与柔和风铃，基于 Web Audio API 合成。
 */

let audioContext = null;

/**
 * 获取或创建 AudioContext（需用户交互后可用）。
 * @returns {AudioContext|null}
 */
function getContext() {
  if (audioContext) {
    return audioContext;
  }
  try {
    audioContext = new AudioContext();
    return audioContext;
  } catch {
    return null;
  }
}

/**
 * 播放指定类型的提示音。
 * @param {"focus-complete"|"break-complete"} type
 * @param {boolean} enabled 是否启用声音
 * @returns {void}
 */
export function playSound(type, enabled = true) {
  if (!enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const ctx = getContext();
  if (!ctx) {
    return;
  }
  if (ctx.state === "suspended") {
    ctx.resume();
  }

  if (type === "focus-complete") {
    playCrackle(ctx, 0.8);
  } else {
    playChime(ctx, 0.5);
  }
}

/**
 * 合成篝火噼啪声。
 * @param {AudioContext} ctx
 * @param {number} durationSec
 * @returns {void}
 */
function playCrackle(ctx, durationSec) {
  const bufferSize = ctx.sampleRate * durationSec;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i += 1) {
    const t = i / ctx.sampleRate;
    const env = Math.exp(-t * 2.5) * (0.6 + Math.random() * 0.4);
    data[i] = (Math.random() * 2 - 1) * env * 0.35;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 800;
  filter.Q.value = 0.8;

  const gain = ctx.createGain();
  gain.gain.value = 0.25;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

/**
 * 合成柔和风铃声。
 * @param {AudioContext} ctx
 * @param {number} durationSec
 * @returns {void}
 */
function playChime(ctx, durationSec) {
  const frequencies = [523.25, 659.25, 783.99];
  const now = ctx.currentTime;

  frequencies.forEach((freq, index) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec + index * 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + index * 0.06);
    osc.stop(now + durationSec + 0.3);
  });
}

/**
 * 在用户首次交互时预热 AudioContext。
 * @returns {void}
 */
export function warmupAudio() {
  const ctx = getContext();
  if (ctx?.state === "suspended") {
    ctx.resume();
  }
}
