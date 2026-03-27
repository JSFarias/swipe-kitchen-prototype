/**
 * Three.js restaurant room prototype — vanilla ES modules, GitHub Pages friendly.
 */

import * as THREE from 'three';
import { Burger } from './burgerData.js';
import { createPlate, BurgerStackView } from './burgerVisuals.js';
import { CustomerManager } from './customerManager.js';
import { SlingshotController } from './slingshot.js';
import { GameSession } from './gameCore.js';
import { FloatingBonusLayer } from './floatingBonusText.js';
import { ScreenShake, CoinFlyoutLayer, AmbientCameraDrift } from './juiceSystems.js';
import { GameAudio } from './audioSystem.js';
import { buildRestaurantRoom, applyAtmosphere, createRestaurantLights } from './environment.js';
import { configureForDevice, getRenderProfile } from './renderQuality.js';
import { BurgerDebrisSystem } from './burgerDebris.js';
import { WorldPickables } from './worldPickables.js';

const STAGE_SELECTOR = '#canvas-stage';
const CAMERA_REST = new THREE.Vector3(0, 8, 10);

function init() {
  configureForDevice();

  const stage = document.querySelector(STAGE_SELECTOR);
  if (!stage) {
    console.error(`Missing container: ${STAGE_SELECTOR}`);
    return;
  }

  const scene = new THREE.Scene();
  applyAtmosphere(scene);

  const camera = new THREE.PerspectiveCamera(50, 9 / 16, 0.1, 100);
  camera.position.copy(CAMERA_REST);
  camera.lookAt(0, 0, 0);

  const gameAudio = new GameAudio();
  gameAudio.init(camera);

  const unlockAudioOnce = () => {
    gameAudio.tryUnlock().then(() => gameAudio.startMusicIfNeeded());
  };
  window.addEventListener('pointerdown', unlockAudioOnce, { once: true, passive: true });

  THREE.ColorManagement.enabled = true;

  const { pixelRatioMax, mobileCoarse } = getRenderProfile();
  const renderer = new THREE.WebGLRenderer({
    antialias: !mobileCoarse,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioMax));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  stage.appendChild(renderer.domElement);

  createRestaurantLights(scene);

  const { group: roomGroup, backDoor } = buildRestaurantRoom();
  scene.add(roomGroup);

  const customerManager = new CustomerManager(scene, backDoor);
  customerManager.fillToMax();

  const burger = new Burger();
  const playArea = new THREE.Group();
  playArea.name = 'PlayArea';
  playArea.position.set(0, 0, 2.42);
  scene.add(playArea);

  const plate = createPlate();
  playArea.add(plate);

  const stackAnchor = new THREE.Group();
  stackAnchor.position.set(0, 0.13, 0);
  playArea.add(stackAnchor);

  const stackView = new BurgerStackView(stackAnchor);
  stackView.rebuildFromStack(burger.getStack(), { animateLast: false });

  const worldPickables = new WorldPickables(playArea);

  const clock = new THREE.Clock();
  const statusEl = document.getElementById('burger-status');
  const coinsDisplayEl = document.getElementById('coins-display');
  const coinsValueEl = document.getElementById('coins-value');
  const timerEl = document.getElementById('game-timer');
  const timerBlockEl = document.getElementById('game-timer-block');
  const comboEl = document.getElementById('game-combo');
  const gameOverOverlay = document.getElementById('game-over-overlay');
  const gameOverCoinsEl = document.getElementById('game-over-coins');
  const playAgainBtn = document.getElementById('play-again-btn');

  const gameSession = new GameSession();
  let prevCoins = gameSession.totalCoins;
  let gameOverOverlayShown = false;

  function refreshClockAndEconomy() {
    const total = gameSession.totalCoins;
    if (coinsValueEl) {
      if (total > prevCoins) {
        coinsValueEl.classList.remove('game-hud__coins-value--pop');
        void coinsValueEl.offsetWidth;
        coinsValueEl.classList.add('game-hud__coins-value--pop');
      }
      prevCoins = total;
      coinsValueEl.textContent = String(total);
    }
    if (timerEl) {
      const s = Math.max(0, Math.ceil(gameSession.timeLeft));
      timerEl.textContent = String(s);
    }
    if (timerBlockEl) {
      const s = Math.max(0, Math.ceil(gameSession.timeLeft));
      const live = !gameSession.gameOver && s > 0;
      timerBlockEl.classList.toggle('game-hud__timer--critical', live && s <= 5);
      timerBlockEl.classList.toggle('game-hud__timer--low', live && s <= 10 && s > 5);
    }
    if (comboEl) comboEl.textContent = `${gameSession.combo}×`;
  }

  function refreshHud() {
    refreshClockAndEconomy();
    if (!statusEl) return;
    if (gameSession.gameOver) {
      statusEl.textContent = '';
      return;
    }
    const n = burger.getStack().length;
    if (n === 0) {
      statusEl.textContent = 'Tap a pile to build — bun first. Trash can clears stack.';
    } else if (burger.isComplete()) {
      statusEl.textContent = 'Order complete — drag from burger to aim, release to throw.';
    } else if (n >= 6) {
      statusEl.textContent = 'Stack full — add top bun or trash.';
    } else {
      statusEl.textContent = `${n}/6 layers — tap piles or bun for top.`;
    }
  }
  refreshHud();

  const floatingLayer = new FloatingBonusLayer(stage, camera);
  const screenShake = new ScreenShake(camera, CAMERA_REST.clone());
  const cameraDrift = new AmbientCameraDrift(screenShake, CAMERA_REST);
  const coinFlyout = new CoinFlyoutLayer(stage);
  const debrisSystem = new BurgerDebrisSystem(scene);

  /** @type {import('./slingshot.js').SlingshotController | null} */
  let slingshotRef = null;

  function pickInterceptor(e) {
    if (gameSession.gameOver) return false;
    const pick = worldPickables.tryPick(e.clientX, e.clientY, camera, renderer.domElement);
    if (!pick) return false;
    if (pick.trash) {
      if (slingshotRef?.isBusy()) return true;
      gameAudio.playTrash();
      gameSession.resetCombo();
      gameSession.clearBurgerTiming();
      burger.reset();
      stackView.clearFeedbacks();
      stackView.rebuildFromStack(burger.getStack(), { animateLast: false });
      refreshHud();
      return true;
    }
    if (pick.ingredient) {
      if (slingshotRef?.isBusy()) return true;
      const result = burger.addIngredient(pick.ingredient);
      if (result.ok) {
        gameAudio.playTap();
        stackView.rebuildFromStack(burger.getStack(), { animateLast: true });
        if (burger.getStack().length === 1) {
          gameSession.notifyFirstIngredientPlaced();
        }
      }
      refreshHud();
      return true;
    }
    return false;
  }

  slingshotRef = new SlingshotController({
    camera,
    domElement: renderer.domElement,
    scene,
    burger,
    stackView,
    stackAnchor,
    customerManager,
    gameSession,
    floatingLayer,
    juice: {
      screenShake,
      coinFlyout,
      coinsHudEl: coinsDisplayEl,
    },
    gameAudio,
    debrisSystem,
    pickInterceptor,
    onSettled: refreshHud,
  });

  function showGameOverUI() {
    if (gameOverOverlayShown || !gameOverOverlay) return;
    gameOverOverlayShown = true;
    gameAudio.playTimeUp();
    if (gameOverCoinsEl) {
      gameOverCoinsEl.textContent = `${gameSession.totalCoins} coins`;
    }
    gameOverOverlay.classList.add('game-over-overlay--visible');
    gameOverOverlay.setAttribute('aria-hidden', 'false');
  }

  function resetFullGame() {
    gameSession.resetForNewGame();
    prevCoins = 0;
    gameOverOverlayShown = false;
    if (gameOverOverlay) {
      gameOverOverlay.classList.remove('game-over-overlay--visible');
      gameOverOverlay.setAttribute('aria-hidden', 'true');
    }
    burger.reset();
    stackView.clearFeedbacks();
    stackView.rebuildFromStack(burger.getStack(), { animateLast: false });
    stackView.stackRoot.visible = true;
    debrisSystem.clear();
    slingshotRef?.resetFlightState();
    customerManager.resetGame();
    refreshHud();
  }

  playAgainBtn?.addEventListener('click', () => {
    resetFullGame();
  });

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  window.addEventListener('resize', resize);
  resize();

  function tick() {
    requestAnimationFrame(tick);
    const dt = clock.getDelta();
    const wasLive = !gameSession.gameOver;

    if (!gameSession.gameOver) {
      gameSession.tick(dt);
    }

    if (wasLive && gameSession.gameOver) {
      showGameOverUI();
    }

    refreshClockAndEconomy();

    if (!gameSession.gameOver) {
      stackView.update(dt);
      customerManager.update(dt);
      slingshotRef?.update(dt);
      floatingLayer.update(dt);
      coinFlyout.update(dt);
      cameraDrift.update(dt);
      screenShake.update(dt);
    }

    debrisSystem.update(dt);
    renderer.render(scene, camera);
  }

  requestAnimationFrame(tick);
}

init();
