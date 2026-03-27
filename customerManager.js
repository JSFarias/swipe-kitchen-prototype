/**
 * Spawns and updates customers (data + views), door entrance walk-in.
 */

import * as THREE from 'three';
import {
  Customer,
  CUSTOMER_MAX_ACTIVE,
  generateCustomerOrder,
  pickRandomFreeSlot,
} from './customerData.js';
import { CustomerView } from './customerVisuals.js';
import { ROOM } from './roomConstants.js';

/** Left / center / right slots in the back (customer) zone. */
const SLOT_X = [-1.42, 0, 1.42];
const SLOT_Z = -3.22;
/** Start at door opening (walk into room). */
const DOOR_START_Z = ROOM.zBack + 0.12;
const WALK_DURATION = 1.25;

export class CustomerManager {
  /**
   * @param {import('three').Scene} scene
   * @param {{ setOpen: (t: number) => void } | null} [backDoor]
   */
  constructor(scene, backDoor = null) {
    this.scene = scene;
    this.backDoor = backDoor;
    this.group = new THREE.Group();
    this.group.name = 'Customers';
    scene.add(this.group);

    /** @type {Set<number>} */
    this.usedSlots = new Set();
    /** @type {{ customer: Customer, view: CustomerView }[]} */
    this.entries = [];

    /** @type {{ customer: Customer, view: CustomerView, slotIndex: number }[]} */
    this._walkQueue = [];
    /** @type {null | { customer: Customer, view: CustomerView, slotIndex: number, phase: string, t: number, walkT: number }} */
    this._activeWalk = null;

    /** When false, no walk-ins or seated updates. */
    this._gameplayActive = false;
  }

  /** Call when player taps Open — starts spawning / walk-ins. */
  beginGameplay() {
    this._gameplayActive = true;
    this.fillToMax();
  }

  _totalOccupied() {
    return this.entries.length + this._walkQueue.length + (this._activeWalk ? 1 : 0);
  }

  spawnOne() {
    if (!this._gameplayActive) return;
    if (this._totalOccupied() >= CUSTOMER_MAX_ACTIVE) return;
    const slot = pickRandomFreeSlot(this.usedSlots);
    if (slot === null) return;

    this.usedSlots.add(slot);
    const customer = new Customer({
      slotIndex: slot,
      position: { x: SLOT_X[slot], z: SLOT_Z },
      order: generateCustomerOrder(),
    });
    const view = new CustomerView(customer);
    view.syncFromCustomer();
    /* Begin centered at the door, then walk to slot X/Z */
    view.root.position.set(0, 0, DOOR_START_Z);
    this.group.add(view.root);
    this._walkQueue.push({ customer, view, slotIndex: slot });
  }

  fillToMax() {
    while (this._totalOccupied() < CUSTOMER_MAX_ACTIVE) {
      this.spawnOne();
    }
  }

  /**
   * @param {number} index
   */
  removeAt(index) {
    const e = this.entries[index];
    if (!e) return;
    this.usedSlots.delete(e.customer.slotIndex);
    this.group.remove(e.view.root);
    e.view.dispose();
    this.entries.splice(index, 1);
  }

  spawnOneIfSpace() {
    if (this._totalOccupied() < CUSTOMER_MAX_ACTIVE) {
      this.spawnOne();
    }
  }

  /**
   * @param {number} dt
   */
  update(dt) {
    if (!this._gameplayActive) return;

    this._updateWalkIn(dt);

    for (const e of this.entries) {
      e.customer.update(dt);
      e.view.updateSquash(dt);
      e.view.updateHitFlash(dt);
      e.view.syncFromCustomer();
      e.view.updateIdle(dt);
    }
  }

  /**
   * @param {number} dt
   */
  _updateWalkIn(dt) {
    if (this._activeWalk) {
      const w = this._activeWalk;
      if (w.phase === 'door_open') {
        w.t += dt;
        const u = Math.min(1, w.t / 0.34);
        this.backDoor?.setOpen(u);
        if (w.t >= 0.34) {
          w.phase = 'walk';
          w.walkT = 0;
        }
      } else if (w.phase === 'walk') {
        w.walkT += dt;
        const u = Math.min(1, w.walkT / WALK_DURATION);
        const sx = SLOT_X[w.slotIndex];
        w.view.root.position.x = THREE.MathUtils.lerp(0, sx, u);
        w.view.root.position.z = THREE.MathUtils.lerp(DOOR_START_Z, SLOT_Z, u);
        if (u >= 1) {
          w.view.root.position.x = sx;
          w.view.root.position.z = SLOT_Z;
          w.phase = 'door_close';
          w.t = 0;
        }
      } else if (w.phase === 'door_close') {
        w.t += dt;
        const u = Math.max(0, 1 - w.t / 0.32);
        this.backDoor?.setOpen(u);
        if (w.t >= 0.32) {
          this.backDoor?.setOpen(0);
          this.entries.push({ customer: w.customer, view: w.view });
          this._activeWalk = null;
        }
      }
    } else if (this._walkQueue.length > 0) {
      const next = this._walkQueue.shift();
      this._activeWalk = {
        customer: next.customer,
        view: next.view,
        slotIndex: next.slotIndex,
        phase: 'door_open',
        t: 0,
        walkT: 0,
      };
      this.backDoor?.setOpen(0);
    }
  }

  /**
   * @returns {{ center: THREE.Vector3, radius: number, index: number }[]}
   */
  getWorldColliders() {
    const p = new THREE.Vector3();
    return this.entries.map((e, index) => {
      e.view.root.getWorldPosition(p);
      p.y += 0.82;
      return { center: p.clone(), radius: 0.52, index };
    });
  }

  /** @param {number} index */
  notifyHit(index) {
    const e = this.entries[index];
    if (e) e.view.playHitFlash();
  }

  /** Wrong-order splat: flash + big squash. */
  notifyWrongHit(index) {
    const e = this.entries[index];
    if (!e) return;
    e.view.playHitSquash('hard');
    e.view.playHitFlash();
  }

  /** Correct delivery hit feedback. */
  notifyCorrectHit(index) {
    const e = this.entries[index];
    if (e) e.view.playHitSquash('light');
  }

  /** Play Again: clear customers; player must tap Open again. */
  resetGame() {
    for (const e of this.entries) {
      this.group.remove(e.view.root);
      e.view.dispose();
    }
    this.entries.length = 0;
    while (this._walkQueue.length) {
      const w = this._walkQueue.pop();
      this.group.remove(w.view.root);
      w.view.dispose();
    }
    if (this._activeWalk) {
      this.group.remove(this._activeWalk.view.root);
      this._activeWalk.view.dispose();
      this._activeWalk = null;
    }
    this.usedSlots.clear();
    this.backDoor?.setOpen(0);
    this._gameplayActive = false;
  }
}
