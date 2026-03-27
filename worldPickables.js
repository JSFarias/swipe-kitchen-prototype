/**
 * 3D ingredient piles + trash can; raycast pick helper.
 */

import * as THREE from 'three';
import { createIngredientMesh } from './burgerVisuals.js';

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

function findPickRoot(obj) {
  let o = obj;
  while (o) {
    if (o.userData?.pickIngredient) return { kind: 'ingredient', type: o.userData.pickIngredient, root: o };
    if (o.userData?.isTrash) return { kind: 'trash', root: o };
    o = o.parent;
  }
  return null;
}

export class WorldPickables {
  /**
   * @param {THREE.Group} playArea
   */
  constructor(playArea) {
    this.playArea = playArea;
    this.group = new THREE.Group();
    this.group.name = 'WorldPickables';
    playArea.add(this.group);

    /** @type {THREE.Object3D[]} */
    this._meshes = [];

    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0x6a5a4e,
      roughness: 0.78,
      metalness: 0.06,
    });

    const leftShelf = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.42), shelfMat);
    leftShelf.position.set(-1.32, 0.88, -0.08);
    leftShelf.castShadow = true;
    leftShelf.receiveShadow = true;
    this.group.add(leftShelf);

    const rightShelf = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.42), shelfMat);
    rightShelf.position.set(1.32, 0.88, -0.08);
    rightShelf.castShadow = true;
    rightShelf.receiveShadow = true;
    this.group.add(rightShelf);

    this._addIngredientPile('bun', -1.22, -0.02);
    this._addIngredientPile('lettuce', -1.38, 0.12);
    this._addIngredientPile('tomato', -1.08, 0.12);

    this._addIngredientPile('cheese', 1.1, 0.12);
    this._addIngredientPile('meat', 1.32, -0.02);

    const trashMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a3a,
      roughness: 0.88,
      metalness: 0.25,
    });
    const trash = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.26, 0.42, 14),
      trashMat,
    );
    trash.position.set(0, 0.27, 0.08);
    trash.castShadow = true;
    trash.receiveShadow = true;
    trash.userData.isTrash = true;
    this.group.add(trash);
    this._meshes.push(trash);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.028, 8, 20),
      trashMat,
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 0.44, 0.08);
    rim.userData.isTrash = true;
    this.group.add(rim);
    this._meshes.push(rim);
  }

  /**
   * @param {string} pickKey `bun` | ingredient id
   * @param {number} lx
   * @param {number} lz
   */
  _addIngredientPile(pickKey, lx, lz) {
    const g = new THREE.Group();
    g.userData.pickIngredient = pickKey;
    const visualType = pickKey === 'bun' ? 'bun_bottom' : pickKey;
    const n = 4;
    for (let i = 0; i < n; i++) {
      const m = createIngredientMesh(visualType);
      m.scale.setScalar(0.38);
      m.position.y = i * 0.065;
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      this._meshes.push(m);
    }
    g.position.set(lx, 0.98, lz);
    this.group.add(g);
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @param {THREE.Camera} camera
   * @param {HTMLElement} domElement
   * @returns {{ trash?: boolean, ingredient?: string } | null}
   */
  tryPick(clientX, clientY, camera, domElement) {
    const rect = domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _ray.setFromCamera(_ndc, camera);
    const hits = _ray.intersectObjects(this._meshes, true);
    if (!hits.length) return null;
    const info = findPickRoot(hits[0].object);
    if (!info) return null;
    if (info.kind === 'trash') return { trash: true };
    if (info.kind === 'ingredient') return { ingredient: info.type };
    return null;
  }
}
