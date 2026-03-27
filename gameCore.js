/**
 * Session timer, combo multiplier, and scoring rules.
 */

export const START_TIME_SECONDS = 45;
export const TIME_BONUS_CORRECT_DELIVERY = 1;
export const COMBO_MAX = 3;

/** Optional flat bonus when scoring at max multiplier (before combo steps up). */
export const BONUS_AT_MAX_COMBO = 1;

export class GameSession {
  constructor() {
    this.timeLeft = START_TIME_SECONDS;
    this.gameOver = false;
    /** 1, 2, or 3 — applies to the *current* delivery, then steps up on success. */
    this.combo = 1;
    this.totalCoins = 0;
  }

  /**
   * @param {number} dt
   */
  tick(dt) {
    if (this.gameOver) return;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.gameOver = true;
    }
  }

  resetCombo() {
    this.combo = 1;
  }

  /** Ground splat, wall splat, wrong customer hit path sets combo to 1 (wrong also handled here before 30% leave). */
  onComboBreakEvent() {
    this.resetCombo();
  }

  /**
   * Exact-match correct delivery (serve or thrown burger).
   * coins = floor(baseReward * combo) + bonuses, then +time, then combo increases (max 3).
   * @param {number} baseReward from customer mood (e.g. 2 happy / 1 other)
   * @param {number} [extraBonuses] additional flat coins
   * @returns {number} coins earned this delivery
   */
  applyCorrectDelivery(baseReward, extraBonuses = 0) {
    if (this.gameOver) return 0;
    const mult = Math.min(COMBO_MAX, Math.max(1, this.combo));
    const maxComboBonus = mult === COMBO_MAX ? BONUS_AT_MAX_COMBO : 0;
    const bonuses = extraBonuses + maxComboBonus;
    const earned = Math.floor(baseReward * mult) + bonuses;
    this.totalCoins += earned;
    this.timeLeft += TIME_BONUS_CORRECT_DELIVERY;
    this.combo = Math.min(COMBO_MAX, this.combo + 1);
    return earned;
  }

  /**
   * Thrown burger hit a customer: exact stack vs order.
   * @param {string[]} thrownStack
   * @param {number} entryIndex index into customerManager.entries
   * @param {import('./customerManager.js').CustomerManager} customerManager
   * @returns {{ correct: boolean }}
   */
  resolveThrowVsCustomer(thrownStack, entryIndex, customerManager) {
    const entry = customerManager.entries[entryIndex];
    if (!entry) {
      this.onComboBreakEvent();
      return { correct: false };
    }

    if (entry.customer.orderMatches(thrownStack)) {
      const base = entry.customer.getCoinReward();
      this.applyCorrectDelivery(base, 0);
      customerManager.removeAt(entryIndex);
      customerManager.spawnOneIfSpace();
      return { correct: true };
    }

    this.onComboBreakEvent();
    if (Math.random() < 0.3) {
      customerManager.removeAt(entryIndex);
      customerManager.spawnOneIfSpace();
    }
    return { correct: false };
  }

  canPlay() {
    return !this.gameOver;
  }
}
