/**
 * Three.js AudioListener + Audio, procedural buffers (no external files).
 * Call tryUnlockOnGesture() once after user interaction for browser autoplay policy.
 */

import * as THREE from 'three';

/** Global / group gains (0–1 typical). Per-effect gains multiply into SFX. */
export const AUDIO_LEVELS = {
  master: 1,
  /** Background jazz loop */
  music: 0.2,
  /** All one-shot SFX multiplier */
  sfx: 0.85,
  tap: 0.55,
  throw: 0.52,
  correct: 0.58,
  wrongSplat: 0.68,
  missThud: 0.32,
  trash: 0.52,
};

/**
 * @param {AudioContext} ctx
 * @param {number} durationSec
 */
function createTapBuffer(ctx, durationSec = 0.035) {
  const sr = ctx.sampleRate;
  const n = Math.max(1, Math.floor(sr * durationSec));
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 180);
    const click = (Math.random() * 2 - 1) * 0.35;
    const tone = Math.sin(2 * Math.PI * 1850 * t) * 0.25;
    d[i] = (click + tone) * env;
  }
  return buffer;
}

function createWhooshBuffer(ctx, durationSec = 0.38) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const env = Math.sin(t * Math.PI) * (1 - t * 0.2);
    const f = 400 + 2200 * (1 - t) * (1 - t);
    phase += (2 * Math.PI * f) / sr;
    const noise = (Math.random() * 2 - 1) * 0.55;
    d[i] = (noise * 0.65 + Math.sin(phase) * 0.18) * env * 0.45;
  }
  return buffer;
}

/** Short pleasant "plin" (two partials). */
function createPlinBuffer(ctx, durationSec = 0.22) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  const f1 = 523.25;
  const f2 = 783.99;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 9) * (1 - Math.min(1, t / durationSec) * 0.15);
    d[i] =
      env *
      0.22 *
      (Math.sin(2 * Math.PI * f1 * t) * 0.55 + Math.sin(2 * Math.PI * f2 * t) * 0.45);
  }
  return buffer;
}

function createSplatBuffer(ctx, durationSec = 0.32) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const env = Math.exp(-t * 5.5) * (1 - t);
    const nse = (Math.random() * 2 - 1) * 0.9;
    const thump = Math.sin(2 * Math.PI * 95 * (i / sr)) * Math.exp(-(i / sr) * 18) * 0.45;
    d[i] = (nse * 0.5 + thump) * env * 0.55;
  }
  return buffer;
}

function createThudBuffer(ctx, durationSec = 0.12) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 38);
    d[i] = env * 0.4 * Math.sin(2 * Math.PI * 120 * t);
  }
  return buffer;
}

function createTrashBuffer(ctx, durationSec = 0.2) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 12);
    const slide = Math.sin(2 * Math.PI * (420 - t * 900) * t) * 0.35;
    const scrape = (Math.random() * 2 - 1) * 0.25;
    d[i] = (slide + scrape) * env * 0.5;
  }
  return buffer;
}

/** Lo-fi jazz-style pad + walking bass (~3.2s loop). */
function createJazzLoopBuffer(ctx, durationSec = 3.2) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(2, n, sr);
  const bpm = 108;
  const beatDur = 60 / bpm;

  for (let ch = 0; ch < 2; ch++) {
    const d = buffer.getChannelData(ch);
    const pan = ch === 0 ? 0.92 : 1.08;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const beat = t / beatDur;
      const beatPhase = beat % 1;

      let s = 0;
      s += 0.045 * pan * Math.sin(2 * Math.PI * 220 * t);
      s += 0.038 * pan * Math.sin(2 * Math.PI * 261.63 * t);
      s += 0.032 * pan * Math.sin(2 * Math.PI * 329.63 * t);
      s += 0.028 * pan * Math.sin(2 * Math.PI * 392 * t);
      s += 0.022 * pan * Math.sin(2 * Math.PI * 493.88 * t);

      const bar = Math.floor(beat / 4) % 2;
      const step = Math.floor(beat) % 4;
      const bassLine =
        bar === 0
          ? [55, 73.42, 65.41, 49][step]
          : [58.27, 69.3, 61.74, 41.2][step];
      const bassAtk = Math.min(1, beatPhase * 28);
      const bassRel = (1 - beatPhase) * (1 - beatPhase);
      s +=
        0.11 *
        bassAtk *
        bassRel *
        Math.sin(2 * Math.PI * bassLine * t);

      if (beatPhase > 0.5 && beatPhase < 0.58) {
        s += (Math.random() * 2 - 1) * 0.018 * (ch === 0 ? 1 : -1);
      }
      if (beatPhase > 0.0 && beatPhase < 0.06) {
        s += (Math.random() * 2 - 1) * 0.012;
      }

      d[i] = Math.max(-1, Math.min(1, s * 0.75));
    }
  }
  return buffer;
}

function playOneShot(audio, vol) {
  if (!audio || !audio.buffer) return;
  try {
    audio.stop();
  } catch (_) {
    /* not started yet */
  }
  audio.setVolume(vol);
  audio.play();
}

export class GameAudio {
  constructor() {
    /** @type {THREE.AudioListener | null} */
    this.listener = null;
    this.levels = { ...AUDIO_LEVELS };
    /** @type {Record<string, AudioBuffer>} */
    this._buffers = {};
    /** @type {THREE.Audio[]} */
    this._tapPool = [];
    this._tapIdx = 0;
    /** @type {THREE.Audio | null} */
    this._throw = null;
    this._correct = null;
    this._wrong = null;
    this._thud = null;
    this._trash = null;
    /** @type {THREE.Audio | null} */
    this._music = null;
    this._musicStarted = false;
    this._unlocked = false;
  }

  /**
   * Attach listener, build all buffers (preload), create Audio nodes.
   * @param {THREE.Camera} camera
   */
  init(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);

    const ctx = this.listener.context;

    this._buffers = {
      tap: createTapBuffer(ctx),
      throw: createWhooshBuffer(ctx),
      correct: createPlinBuffer(ctx),
      wrongSplat: createSplatBuffer(ctx),
      missThud: createThudBuffer(ctx),
      trash: createTrashBuffer(ctx),
      jazz: createJazzLoopBuffer(ctx),
    };

    for (let i = 0; i < 3; i++) {
      const a = new THREE.Audio(this.listener);
      a.setBuffer(this._buffers.tap);
      this._tapPool.push(a);
    }

    this._throw = new THREE.Audio(this.listener);
    this._throw.setBuffer(this._buffers.throw);

    this._correct = new THREE.Audio(this.listener);
    this._correct.setBuffer(this._buffers.correct);

    this._wrong = new THREE.Audio(this.listener);
    this._wrong.setBuffer(this._buffers.wrongSplat);

    this._thud = new THREE.Audio(this.listener);
    this._thud.setBuffer(this._buffers.missThud);

    this._trash = new THREE.Audio(this.listener);
    this._trash.setBuffer(this._buffers.trash);

    this._music = new THREE.Audio(this.listener);
    this._music.setBuffer(this._buffers.jazz);
    this._music.setLoop(true);
    this._applyMusicVolume();
  }

  _sfxVol(key) {
    return this.levels.master * this.levels.sfx * this.levels[key];
  }

  _applyMusicVolume() {
    if (this._music) {
      this._music.setVolume(this.levels.master * this.levels.music);
    }
  }

  setMaster(v) {
    this.levels.master = Math.max(0, Math.min(1, v));
    this._applyMusicVolume();
  }

  setMusic(v) {
    this.levels.music = Math.max(0, Math.min(1, v));
    this._applyMusicVolume();
  }

  setSfx(v) {
    this.levels.sfx = Math.max(0, Math.min(1, v));
  }

  /** Resume AudioContext after user gesture (required on many browsers). */
  async tryUnlock() {
    if (!this.listener) return;
    const ctx = this.listener.context;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    this._unlocked = true;
  }

  /** Start jazz loop once context is running (call after tryUnlock). */
  startMusicIfNeeded() {
    if (!this._music || this._musicStarted) return;
    if (this.listener?.context?.state !== 'running') return;
    try {
      this._music.play();
      this._musicStarted = true;
    } catch (_) {
      /* ignore */
    }
  }

  playTap() {
    if (!this._tapPool.length) return;
    const a = this._tapPool[this._tapIdx % this._tapPool.length];
    this._tapIdx++;
    playOneShot(a, this._sfxVol('tap'));
  }

  playThrow() {
    playOneShot(this._throw, this._sfxVol('throw'));
  }

  playCorrect() {
    playOneShot(this._correct, this._sfxVol('correct'));
  }

  playWrongSplat() {
    playOneShot(this._wrong, this._sfxVol('wrongSplat'));
  }

  playMissThud() {
    playOneShot(this._thud, this._sfxVol('missThud'));
  }

  playTrash() {
    playOneShot(this._trash, this._sfxVol('trash'));
  }
}
