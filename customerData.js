/**
 * Customer model and procedural orders (no Three.js).
 */

/** @typedef {'happy' | 'neutral' | 'angry'} CustomerState */

export const CUSTOMER_MAX_ACTIVE = 3;

export const REWARD_COINS_HAPPY = 2;
export const REWARD_COINS_OTHER = 1;

const MIDDLE = ['lettuce', 'tomato', 'cheese', 'meat'];

/**
 * Valid random order: 4–6 ingredients, bun_bottom … bun_top.
 * 4 layers → two middle fillers, all distinct.
 * 5–6 layers → middle fillers may repeat.
 * @returns {string[]}
 */
export function generateCustomerOrder() {
  const totalLen = 4 + Math.floor(Math.random() * 3);
  const middleCount = totalLen - 2;
  /** @type {string[]} */
  const middle = [];

  if (totalLen === 4) {
    const pool = [...MIDDLE].sort(() => Math.random() - 0.5);
    middle.push(pool[0], pool[1]);
  } else {
    for (let i = 0; i < middleCount; i++) {
      middle.push(MIDDLE[Math.floor(Math.random() * MIDDLE.length)]);
    }
  }

  return ['bun_bottom', ...middle, 'bun_top'];
}

function shallowEqualStacks(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class Customer {
  /**
   * @param {object} opts
   * @param {number} opts.slotIndex 0..2 (left, center, right)
   * @param {{ x: number, z: number }} opts.position world XZ on floor
   * @param {string[]} opts.order
   */
  constructor(opts) {
    this.slotIndex = opts.slotIndex;
    /** @type {{ x: number, z: number }} */
    this.position = { ...opts.position };
    /** @type {string[]} */
    this.order = [...opts.order];
    /** @type {CustomerState} */
    this.state = 'happy';
    /** Elapsed seconds since spawn (drives mood). */
    this.patienceTimer = 0;

    /** Time until mood drops to neutral (seconds). */
    this._neutralAfter = 18 + Math.random() * 10;
    /** Time until mood drops to angry (seconds from spawn). */
    this._angryAfter = 40 + Math.random() * 18;
  }

  /**
   * @param {number} dt seconds
   */
  update(dt) {
    this.patienceTimer += dt;
    if (this.patienceTimer < this._neutralAfter) {
      this.state = 'happy';
    } else if (this.patienceTimer < this._angryAfter) {
      this.state = 'neutral';
    } else {
      this.state = 'angry';
    }
  }

  /** Coins when order is successfully served at current mood. */
  getCoinReward() {
    return this.state === 'happy' ? REWARD_COINS_HAPPY : REWARD_COINS_OTHER;
  }

  /**
   * @param {string[]} playerStack
   */
  orderMatches(playerStack) {
    return shallowEqualStacks(this.order, playerStack);
  }
}

/**
 * Picks a random free slot index from 0..2.
 * @param {Set<number>} usedSlots
 * @returns {number | null}
 */
export function pickRandomFreeSlot(usedSlots) {
  const free = [0, 1, 2].filter((i) => !usedSlots.has(i));
  if (free.length === 0) return null;
  return free[Math.floor(Math.random() * free.length)];
}
