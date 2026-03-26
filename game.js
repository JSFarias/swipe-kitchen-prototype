(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: true });

  const ui = {
    score: document.getElementById('score'),
    streak: document.getElementById('streak'),
    best: document.getElementById('best'),
    timeLeft: document.getElementById('timeLeft'),
    startBtn: document.getElementById('startBtn'),
    restartBtn: document.getElementById('restartBtn'),
    endScreen: document.getElementById('endScreen'),
    finalScore: document.getElementById('finalScore'),
    centerHelp: document.getElementById('centerHelp'),
    touchToast: document.getElementById('touchToast'),
  };

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const INGREDIENTS = [
    // Icon-only (no letters). Colors map to food ingredients.
    { id: 'tomato', top: '#FF3B4D', side: '#C9152A', accent: '#FFE7EC' },
    { id: 'lettuce', top: '#44FF8A', side: '#1CA85A', accent: '#E6FFD1' }, // salad
    { id: 'cucumber', top: '#2EE6D0', side: '#0A9D86', accent: '#E0FFFA' }, // pickles
    { id: 'cheese', top: '#FFD24A', side: '#C18A00', accent: '#FFF1A8' },
    { id: 'bun', top: '#F6D7A6', side: '#C6935D', accent: '#FFF1DA' }, // bread
    { id: 'meat', top: '#B86A4B', side: '#6C2F1B', accent: '#FFD0BA' }, // burger patty
    { id: 'ham', top: '#FF7BB0', side: '#C43B74', accent: '#FFE1EF' },
  ];

  const ingredientById = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));
  const randomIngredient = () => INGREDIENTS[(Math.random() * INGREDIENTS.length) | 0].id;

  const ORDER_LEN_BASE = 3;
  const ORDER_LEN_EXTRA_PER_LEVEL = 1;
  const MAX_LEVEL = 7;

  const SWIPE = {
    // Stretch from center below this counts as tap (reroll), not a slingshot shot.
    tapMaxMoveRatio: 0.038,
    maxCenterStartRatio: 0.155, // pointer down must start within center radius
  };

  const SLINGSHOT = {
    stretchMaxRatio: 0.42,
    speedMin: 520,
    speedMax: 1180,
    upwardBias: 380,
  };

  const PHYSICS = {
    gravity: 2400,
    maxFlightSec: 4,
  };

  const NUM_CUSTOMER_SLOTS = 3;

  const INGREDIENT_LABELS = {
    tomato: 'Tomato',
    lettuce: 'Salad',
    cucumber: 'Pickles',
    cheese: 'Cheese',
    bun: 'Bread',
    meat: 'Burger',
    ham: 'Ham',
  };

  window.gameAudio = window.gameAudio || {};
  if (typeof window.gameAudio.play !== 'function') {
    window.gameAudio.play = () => {};
  }

  function makeOrder(len) {
    const a = [];
    for (let i = 0; i < len; i++) a.push(randomIngredient());
    return a;
  }

  function ordersEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function generateOrder(len, slotIndex) {
    const peers = game.customers
      .filter((c, i) => i !== slotIndex && c.active && c.order && c.order.length)
      .map((c) => c.order);
    for (let attempt = 0; attempt < 45; attempt++) {
      const cand = makeOrder(len);
      if (!peers.some((po) => ordersEqual(po, cand))) return cand;
    }
    const cand = makeOrder(len);
    const firsts = new Set(peers.map((po) => po[0]));
    if (firsts.size && firsts.has(cand[0])) {
      const alt = INGREDIENTS.find((ing) => !firsts.has(ing.id));
      if (alt) cand[0] = alt.id;
    }
    return cand;
  }

  function orderLenForLevel(level) {
    return clamp(ORDER_LEN_BASE + (level - 1) * ORDER_LEN_EXTRA_PER_LEVEL, ORDER_LEN_BASE, ORDER_LEN_BASE + ORDER_LEN_EXTRA_PER_LEVEL * MAX_LEVEL);
  }

  function formatScore(n) {
    return String(n | 0);
  }

  function drawRoundedRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawIngredient(ingId, x, y, s, opts = {}) {
    const ing = ingredientById[ingId] || ingredientById.tomato;
    const t = opts.time || 0;

    ctx.save();
    ctx.translate(x, y);
    const rot = (opts.rotate || 0) + (opts.bob ? Math.sin(t * 7) * 0.05 : 0);
    ctx.rotate(rot);

    const unit = 46 * s;
    const R = unit * 0.52;

    // Ingredient silhouettes (no letters)
    if (ingId === 'tomato') {
      // Tomato slice
      const g = ctx.createRadialGradient(-R * 0.25, -R * 0.25, R * 0.15, 0, 0, R * 1.2);
      g.addColorStop(0, '#FF8A9A');
      g.addColorStop(0.55, ing.top);
      g.addColorStop(1, ing.side);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.fill();

      // Inner flesh
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.74, 0, TAU);
      ctx.fill();

      // Seeds pockets
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + 0.2;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * R * 0.35, Math.sin(a) * R * 0.30, R * 0.18, R * 0.14, a, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = ing.accent;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + 0.1;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * R * 0.38, Math.sin(a) * R * 0.33, R * 0.05, 0, TAU);
        ctx.fill();
      }
    } else if (ingId === 'cheese') {
      // Cheese wedge
      const w = unit * 0.95;
      const h = unit * 0.75;
      ctx.fillStyle = ing.side;
      ctx.beginPath();
      ctx.moveTo(-w * 0.35 + unit * 0.08, h * 0.10);
      ctx.lineTo(w * 0.40 + unit * 0.08, h * 0.22);
      ctx.lineTo(-w * 0.10 + unit * 0.08, -h * 0.40);
      ctx.closePath();
      ctx.fill();

      const g = ctx.createLinearGradient(0, -h, 0, h);
      g.addColorStop(0, '#FFF3B7');
      g.addColorStop(0.5, ing.top);
      g.addColorStop(1, '#E9A800');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-w * 0.45, h * 0.18);
      ctx.lineTo(w * 0.35, h * 0.30);
      ctx.lineTo(-w * 0.15, -h * 0.35);
      ctx.closePath();
      ctx.fill();

      // Holes
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      const holes = [
        [-0.05, 0.10, 0.10],
        [0.12, 0.05, 0.08],
        [-0.18, -0.02, 0.07],
        [0.00, -0.12, 0.06],
      ];
      for (const [hx, hy, hr] of holes) {
        ctx.beginPath();
        ctx.ellipse(hx * unit, hy * unit, hr * unit, hr * unit * 0.78, 0, 0, TAU);
        ctx.fill();
      }
    } else if (ingId === 'bun') {
      // Bun top + bottom
      const topG = ctx.createRadialGradient(-R * 0.25, -R * 0.55, R * 0.18, 0, 0, R * 1.35);
      topG.addColorStop(0, '#FFF8E8');
      topG.addColorStop(0.50, ing.top);
      topG.addColorStop(1, '#B98244');
      ctx.fillStyle = topG;
      ctx.beginPath();
      ctx.ellipse(0, -unit * 0.10, R * 1.05, R * 0.78, 0, Math.PI, TAU);
      ctx.lineTo(R * 1.02, unit * 0.02);
      ctx.ellipse(0, unit * 0.02, R * 1.05, R * 0.70, 0, 0, Math.PI);
      ctx.closePath();
      ctx.fill();

      // Bottom bun
      ctx.fillStyle = '#9A6837';
      ctx.beginPath();
      ctx.ellipse(0, unit * 0.34, R * 0.98, R * 0.38, 0, 0, TAU);
      ctx.fill();

      // Outline for stronger contrast
      ctx.strokeStyle = 'rgba(70,38,10,0.48)';
      ctx.lineWidth = Math.max(2, unit * 0.035);
      ctx.beginPath();
      ctx.ellipse(0, -unit * 0.02, R * 1.04, R * 0.72, 0, 0, TAU);
      ctx.stroke();

      // Sesame
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.4;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * R * 0.45, -unit * 0.20 + Math.sin(a) * R * 0.20, R * 0.10, R * 0.06, a, 0, TAU);
        ctx.fill();
      }
    } else if (ingId === 'meat') {
      // Burger patty
      const g = ctx.createRadialGradient(-R * 0.25, -R * 0.25, R * 0.15, 0, 0, R * 1.2);
      g.addColorStop(0, '#E9A284');
      g.addColorStop(0.55, ing.top);
      g.addColorStop(1, ing.side);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, unit * 0.05, R * 1.05, R * 0.75, 0, 0, TAU);
      ctx.fill();

      // Grill lines
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = Math.max(2, unit * 0.04);
      for (let i = -2; i <= 2; i++) {
        const yy = unit * 0.05 + i * unit * 0.10;
        ctx.beginPath();
        ctx.moveTo(-R * 0.75, yy);
        ctx.quadraticCurveTo(0, yy - unit * 0.04, R * 0.75, yy + unit * 0.02);
        ctx.stroke();
      }
    } else if (ingId === 'lettuce') {
      // Salad leaf
      const g = ctx.createRadialGradient(-R * 0.25, -R * 0.45, R * 0.12, 0, 0, R * 1.35);
      g.addColorStop(0, '#D9FF9E');
      g.addColorStop(0.55, ing.top);
      g.addColorStop(1, ing.side);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-R * 0.95, unit * 0.05);
      ctx.quadraticCurveTo(-R * 0.60, -R * 0.95, 0, -R * 0.80);
      ctx.quadraticCurveTo(R * 0.75, -R * 0.95, R * 0.92, unit * 0.05);
      ctx.quadraticCurveTo(R * 0.55, R * 0.65, 0, R * 0.85);
      ctx.quadraticCurveTo(-R * 0.55, R * 0.65, -R * 0.95, unit * 0.05);
      ctx.closePath();
      ctx.fill();

      // Veins
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = Math.max(2, unit * 0.03);
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.72);
      ctx.quadraticCurveTo(-unit * 0.06, 0, 0, R * 0.70);
      ctx.stroke();
      for (let i = -2; i <= 2; i++) {
        if (i === 0) continue;
        ctx.beginPath();
        ctx.moveTo(0, -R * 0.20);
        ctx.quadraticCurveTo(i * unit * 0.20, -R * 0.10, i * unit * 0.26, R * 0.25);
        ctx.stroke();
      }
    } else if (ingId === 'cucumber') {
      // Pickles: overlapping discs
      const discs = [
        { x: -unit * 0.18, y: unit * 0.02, r: R * 0.70, rot: -0.15 },
        { x: unit * 0.10, y: -unit * 0.10, r: R * 0.62, rot: 0.10 },
        { x: unit * 0.22, y: unit * 0.10, r: R * 0.55, rot: 0.24 },
      ];
      for (const d of discs) {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rot);
        const g = ctx.createRadialGradient(-d.r * 0.25, -d.r * 0.25, d.r * 0.12, 0, 0, d.r * 1.25);
        g.addColorStop(0, '#B6FFE8');
        g.addColorStop(0.55, ing.top);
        g.addColorStop(1, ing.side);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, d.r, d.r * 0.82, 0, 0, TAU);
        ctx.fill();
        // Seed ring
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = Math.max(2, unit * 0.03);
        ctx.beginPath();
        ctx.ellipse(0, 0, d.r * 0.62, d.r * 0.52, 0, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.10)';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * d.r * 0.30, Math.sin(a) * d.r * 0.24, d.r * 0.05, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    } else if (ingId === 'ham') {
      // Ham: two layered squared-ish slices
      const drawHamSlice = (offX, offY, scale, edgeAlpha) => {
        const g = ctx.createRadialGradient(-R * 0.30 + offX, -R * 0.45 + offY, R * 0.14, 0, 0, R * 1.35);
        g.addColorStop(0, '#FFE7F2');
        g.addColorStop(0.55, ing.top);
        g.addColorStop(1, ing.side);
        ctx.fillStyle = g;
        const w = R * 1.78 * scale;
        const h = R * 1.34 * scale;
        drawRoundedRect(offX - w / 2, unit * 0.02 + offY - h / 2, w, h, R * 0.26 * scale);
        ctx.fill();

        // Fold highlight
        ctx.strokeStyle = `rgba(255,255,255,${0.26 * edgeAlpha})`;
        ctx.lineWidth = Math.max(2, unit * 0.035 * scale);
        drawRoundedRect(
          offX - w * 0.36,
          unit * 0.02 + offY - h * 0.30,
          w * 0.72,
          h * 0.60,
          R * 0.18 * scale
        );
        ctx.stroke();

        // Fat edge
        ctx.strokeStyle = `rgba(255,255,255,${0.34 * edgeAlpha})`;
        ctx.lineWidth = Math.max(2, unit * 0.04 * scale);
        drawRoundedRect(
          offX - w * 0.45 + unit * 0.02,
          unit * 0.02 + offY - h * 0.36 + unit * 0.04,
          w * 0.90,
          h * 0.72,
          R * 0.22 * scale
        );
        ctx.stroke();
      };

      // Back slice
      drawHamSlice(-unit * 0.05, unit * 0.04, 1.0, 0.95);
      // Front slice
      drawHamSlice(unit * 0.06, -unit * 0.02, 0.98, 1.0);
    } else {
      // Generic fallback: simple 2.5D ingredient blob
      const g = ctx.createRadialGradient(-R * 0.25, -R * 0.35, R * 0.12, 0, 0, R * 1.35);
      g.addColorStop(0, '#FFFFFF');
      g.addColorStop(0.55, ing.top);
      g.addColorStop(1, ing.side);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, unit * 0.02, R * 1.05, R * 0.80, -0.08, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawCustomer(cust, x, y, r, t, pulse = 0) {
    const face = cust.face; // 0..2

    ctx.save();
    ctx.translate(x, y);

    // Body: 2.5D bubble
    const bob = Math.sin(t * 1.6 + cust.animPhase) * r * 0.03;
    ctx.translate(0, bob + pulse);

    const sideX = r * 0.10;
    const sideY = r * 0.09;

    // Side
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(sideX * 0.6, sideY * 1.15, r * 0.95, r * 0.72, 0, 0, TAU);
    ctx.fill();

    // Main body gradient
    const g = ctx.createRadialGradient(-r * 0.25, -r * 0.35, r * 0.25, 0, 0, r * 1.25);
    const c0 = cust.baseColor0;
    const c1 = cust.baseColor1;
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);

    // Side face
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    drawRoundedRect(-r + sideX, -r + sideY, r * 2, r * 2, r * 0.38);
    ctx.fill();

    // Front
    ctx.fillStyle = g;
    drawRoundedRect(-r, -r, r * 2, r * 2, r * 0.40);
    ctx.fill();

    // Outline
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = Math.max(2, r * 0.05);
    drawRoundedRect(-r, -r, r * 2, r * 2, r * 0.40);
    ctx.stroke();

    // Current order step only (sequential reveal)
    const pi = cust.progressIndex;
    if (pi < cust.order.length) {
      const ingId = cust.order[pi];
      const iconPx = r * 1.12;
      const iconScale = iconPx / 46;
      const yRow = r * 0.92;
      drawIngredient(ingId, 0, yRow, iconScale * 1.08, {
        time: t,
        rotate: Math.sin(t * 6 + cust.animPhase) * 0.06,
        bob: true,
      });
      ctx.strokeStyle = 'rgba(255,255,255,0.72)';
      ctx.lineWidth = Math.max(3, r * 0.06);
      ctx.beginPath();
      ctx.arc(0, yRow, iconPx * 0.58, 0, TAU);
      ctx.stroke();
    }

    // Face splash (wrong ingredient)
    if (cust.stunTimer > 0) {
      const splat = 1 - clamp(cust.stunTimer / 1.15, 0, 1);
      ctx.globalAlpha = 0.35 + splat * 0.35;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + cust.animPhase;
        const rr = r * (0.25 + (i % 3) * 0.08);
        ctx.fillStyle = i % 2 ? 'rgba(255,200,120,0.7)' : 'rgba(255,80,120,0.55)';
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.25 - r * 0.05, rr, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Face
    const eyeY = -r * 0.15;
    const eyeX = r * 0.26;
    const eyeW = r * 0.10;
    const eyeH = r * 0.14;

    // Eyes
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(-eyeX, eyeY, eyeW, eyeH, 0, 0, TAU);
    ctx.ellipse(eyeX, eyeY, eyeW, eyeH, 0, 0, TAU);
    ctx.fill();

    // Mouth expression
    ctx.strokeStyle = 'rgba(0,0,0,0.38)';
    ctx.lineWidth = Math.max(3, r * 0.06);
    ctx.lineCap = 'round';

    if (face === 2) {
      // happy: smile arc
      ctx.beginPath();
      ctx.arc(0, r * 0.18, r * 0.30, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    } else if (face === 1) {
      // angry: frown + brows
      ctx.beginPath();
      ctx.arc(0, r * 0.25, r * 0.28, 1.1 * Math.PI, 1.9 * Math.PI);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath();
      ctx.moveTo(-eyeX - r * 0.02, eyeY - r * 0.18);
      ctx.quadraticCurveTo(-eyeX, eyeY - r * 0.30, -eyeX + r * 0.10, eyeY - r * 0.22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(eyeX + r * 0.02, eyeY - r * 0.18);
      ctx.quadraticCurveTo(eyeX, eyeY - r * 0.30, eyeX - r * 0.10, eyeY - r * 0.22);
      ctx.stroke();
    } else {
      // neutral: small line
      ctx.beginPath();
      ctx.moveTo(-r * 0.20, r * 0.25);
      ctx.lineTo(r * 0.20, r * 0.25);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBackground(board, t) {
    const { w, h, yTop0, yCounter0, yBottom0, yBottom1 } = board;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const topH = yCounter0 - yTop0;
    const gTop = ctx.createLinearGradient(0, yTop0, 0, yCounter0);
    gTop.addColorStop(0, 'rgba(120,140,200,0.14)');
    gTop.addColorStop(1, 'rgba(40,55,95,0.10)');
    ctx.fillStyle = gTop;
    ctx.fillRect(0, yTop0, w, topH);

    const counterH = yBottom0 - yCounter0;
    const gMid = ctx.createLinearGradient(0, yCounter0, 0, yBottom0);
    gMid.addColorStop(0, 'rgba(95,72,52,0.55)');
    gMid.addColorStop(0.5, 'rgba(140,100,70,0.45)');
    gMid.addColorStop(1, 'rgba(60,44,32,0.50)');
    ctx.fillStyle = gMid;
    ctx.fillRect(0, yCounter0, w, counterH);

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(2, h * 0.006);
    ctx.beginPath();
    ctx.moveTo(0, yCounter0 + counterH * 0.5);
    ctx.lineTo(w, yCounter0 + counterH * 0.5);
    ctx.stroke();

    const gBot = ctx.createLinearGradient(0, yBottom0, 0, yBottom1);
    gBot.addColorStop(0, 'rgba(35,42,70,0.35)');
    gBot.addColorStop(1, 'rgba(18,22,40,0.55)');
    ctx.fillStyle = gBot;
    ctx.fillRect(0, yBottom0, w, yBottom1 - yBottom0);

    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, yBottom0, w, h * 0.02);
  }

  function drawTrashCan(board) {
    const r = board.trashRect;
    ctx.save();
    const rr = Math.min(14, r.w * 0.2);
    ctx.fillStyle = 'rgba(45,50,65,0.85)';
    drawRoundedRect(r.x, r.y, r.w, r.h, rr);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = Math.max(2, r.w * 0.06);
    drawRoundedRect(r.x, r.y, r.w, r.h, rr);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(2, r.w * 0.08);
    const lidY = r.y + r.h * 0.22;
    ctx.beginPath();
    ctx.moveTo(r.x + r.w * 0.12, lidY);
    ctx.lineTo(r.x + r.w * 0.88, lidY);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = `${Math.max(11, Math.floor(r.h * 0.28))}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Trash', r.x + r.w * 0.5, r.y + r.h * 0.62);
    ctx.restore();
  }

  const CUSTOMER_PALETTES = [
    ['#FF6A88', '#FF2E5E'],
    ['#6A7DFF', '#3E4BFF'],
    ['#3EF0A0', '#18C979'],
    ['#FFD35C', '#FFB703'],
    ['#7B6BFF', '#4D2CFF'],
    ['#2EE6D0', '#0BAE96'],
  ];

  function createCustomerSlot(slotIndex) {
    const p = CUSTOMER_PALETTES[slotIndex % CUSTOMER_PALETTES.length];
    return {
      slotIndex,
      active: false,
      phase: 'idle',
      x: 0,
      order: [],
      progressIndex: 0,
      face: 0,
      faceTimer: 0,
      stunTimer: 0,
      leaveTimer: 0,
      baseColor0: p[0],
      baseColor1: p[1],
      animPhase: Math.random() * 1000,
    };
  }

  function makeBallistic(ingId, x, y, vx, vy) {
    return {
      ingId,
      x,
      y,
      vx,
      vy,
      lastY: y,
      startMs: nowMs(),
      dead: false,
      wobble: Math.random() * TAU,
    };
  }

  function pointInTrash(px, py) {
    const r = board.trashRect;
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  function spawnParticleBurst(x, y, kind, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const sp = (0.35 + Math.random() * 0.85) * (kind === 'poof' ? 120 : 180);
      game.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (kind === 'poof' ? 40 : 20),
        life: 1,
        maxLife: 0.35 + Math.random() * 0.35,
        kind,
        color: color || 'rgba(255,255,255,0.7)',
        size: 3 + Math.random() * 5,
      });
    }
  }

  function spawnSplatParticles(x, y, color) {
    spawnParticleBurst(x, y, 'splat', color, 14);
  }

  function nowMs() {
    return performance.now();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = cssW;
    const h = cssH;
    board.w = w;
    board.h = h;
    board.cx = w / 2;
    board.size = Math.min(w, h);

    const topH = h * 0.42;
    const counterH = h * 0.08;
    const bottomH = h * 0.5;
    board.yTop0 = 0;
    board.yCounter0 = topH;
    board.yBottom0 = topH + counterH;
    board.yBottom1 = h;

    board.pivotX = w * 0.5;
    board.yPivot = board.yBottom0 + bottomH * 0.72;

    const margin = w * 0.07;
    const usableW = w - margin * 2;
    board.slotX = [margin + usableW * 0.2, w * 0.5, margin + usableW * 0.8];
    board.slotY = board.yTop0 + topH * 0.58;

    const tw = w * 0.2;
    const th = bottomH * 0.24;
    board.trashRect = {
      x: w - tw - Math.max(10, w * 0.03),
      y: h - th - Math.max(10, h * 0.04),
      w: tw,
      h: th,
    };

    board.customerDrawR = Math.min(w, h) * 0.072;
    board.customerHitR = board.customerDrawR * 1.35;
    board.pickupRadius = Math.min(w, h) * 0.085;
    board.projectileRadius = Math.min(w, h) * 0.065;
    board.floorY = h * 0.91;
    board.tapMaxDistance = Math.min(w, h) * SWIPE.tapMaxMoveRatio;
    board.centerStartMax = Math.min(w, h) * SWIPE.maxCenterStartRatio;
  }

  const board = {
    w: 0,
    h: 0,
    size: 0,
    cx: 0,
    yTop0: 0,
    yCounter0: 0,
    yBottom0: 0,
    yBottom1: 0,
    pivotX: 0,
    yPivot: 0,
    slotX: [0, 0, 0],
    slotY: 0,
    trashRect: { x: 0, y: 0, w: 0, h: 0 },
    customerDrawR: 0,
    customerHitR: 0,
    pickupRadius: 0,
    projectileRadius: 0,
    floorY: 0,
    tapMaxDistance: 0,
    centerStartMax: 0,
  };

  const game = {
    running: false,
    timeLimitSec: 60,
    startMs: 0,
    endMs: 0,
    score: 0,
    streak: 0,
    best: 0,
    level: 1,
    customers: [],
    activeIngredient: null, // {id, spawnMs}
    spawnDelayMs: 0,
    spawnRequestedAt: 0,
    inFlight: [],
    particles: [],
    swipeLock: false,
    swipeStart: null,
    swipeCurrent: null,
    aiming: false,
    aimPointerId: null,
    aimX: 0,
    aimY: 0,
    changeCooldownUntil: 0,
    touchToastUntil: 0,
    nextCustomerSpawnAt: 0,
  };

  function reset() {
    game.running = false;
    game.score = 0;
    game.streak = 0;
    game.level = 1;
    game.customers = Array.from({ length: NUM_CUSTOMER_SLOTS }, (_, i) => createCustomerSlot(i));
    game.activeIngredient = null;
    game.spawnDelayMs = 0;
    game.spawnRequestedAt = 0;
    game.inFlight = [];
    game.particles = [];
    game.startMs = 0;
    game.endMs = 0;
    game.swipeLock = false;
    game.swipeStart = null;
    game.swipeCurrent = null;
    game.aiming = false;
    game.aimPointerId = null;
    game.aimX = 0;
    game.aimY = 0;
    game.changeCooldownUntil = 0;
    game.nextCustomerSpawnAt = 0;
    ui.score.textContent = formatScore(game.score);
    ui.streak.textContent = formatScore(game.streak);
    ui.best.textContent = formatScore(game.best);
    ui.timeLeft.textContent = formatScore(game.timeLimitSec);
  }

  function getRemainingTimeSec(atMs = nowMs()) {
    if (!game.running) return game.timeLimitSec;
    return Math.max(0, Math.ceil((game.endMs - atMs) / 1000));
  }

  function updateHUD() {
    ui.score.textContent = formatScore(game.score);
    ui.streak.textContent = formatScore(game.streak);
    ui.best.textContent = formatScore(game.best);
    ui.timeLeft.textContent = formatScore(getRemainingTimeSec());
  }

  function spawnIngredient() {
    const pos = randomPickupPosition();
    game.activeIngredient = {
      id: randomIngredient(),
      spawnMs: nowMs(),
      x: pos.x,
      y: pos.y,
    };
  }

  function rerollIngredient() {
    if (!game.activeIngredient) return false;
    const currentId = game.activeIngredient.id;
    let nextId = currentId;
    // Try a few times to avoid replacing with the same ingredient.
    for (let i = 0; i < 8 && nextId === currentId; i++) {
      nextId = randomIngredient();
    }
    if (nextId === currentId) return false;
    const pos = randomPickupPosition();
    game.activeIngredient = { id: nextId, spawnMs: nowMs(), x: pos.x, y: pos.y };
    return true;
  }

  function randomPickupPosition() {
    const padX = board.w * 0.1;
    const padY = board.h * 0.04;
    const top = board.yBottom0 + board.h * 0.1;
    const bot = board.yBottom1 - padY;
    const left = padX;
    const right = board.w - padX;
    for (let k = 0; k < 25; k++) {
      const x = left + Math.random() * (right - left);
      const y = top + Math.random() * (bot - top);
      const tr = board.trashRect;
      const inTrash = x >= tr.x - 8 && x <= tr.x + tr.w + 8 && y >= tr.y - 8 && y <= tr.y + tr.h + 8;
      const dPivot = Math.hypot(x - board.pivotX, y - board.yPivot);
      if (!inTrash && dPivot > board.pickupRadius * 2.2) return { x, y };
    }
    return { x: board.pivotX - board.pickupRadius * 2.4, y: top + (bot - top) * 0.35 };
  }

  function spawnCustomer(slotIndex) {
    const cust = game.customers[slotIndex];
    if (cust.active) return;
    const len = orderLenForLevel(game.level);
    cust.active = true;
    cust.phase = 'enter';
    cust.x = -board.w * 0.14;
    cust.order = generateOrder(len, slotIndex);
    cust.progressIndex = 0;
    cust.face = 0;
    cust.faceTimer = 0;
    cust.stunTimer = 0;
    cust.leaveTimer = 0;
  }

  function activeCustomerCount() {
    return game.customers.filter((c) => c.active).length;
  }

  function showTouchToast(ms = 900) {
    ui.touchToast.hidden = false;
    game.touchToastUntil = nowMs() + ms;
  }

  function startGame() {
    reset();
    resize();
    game.running = true;
    game.startMs = nowMs();
    game.endMs = game.startMs + game.timeLimitSec * 1000;
    game.nextCustomerSpawnAt = nowMs() + 350;
    game.spawnDelayMs = 150;
    game.spawnRequestedAt = nowMs();
    ui.centerHelp.style.opacity = '1';
    ui.endScreen.hidden = true;
    ui.startBtn.hidden = true;
    updateHUD();
  }

  function endGame() {
    game.running = false;
    game.swipeStart = null;
    game.swipeCurrent = null;
    game.aiming = false;
    game.aimPointerId = null;
    ui.endScreen.hidden = false;
    ui.finalScore.textContent = formatScore(game.score);
    ui.startBtn.hidden = false;
    ui.centerHelp.style.opacity = '0';
    ui.timeLeft.textContent = '0';
  }

  function clearGestureState() {
    game.swipeStart = null;
    game.swipeCurrent = null;
    game.aiming = false;
    game.aimPointerId = null;
  }

  function resolveCustomerProjectileHit(cust, p) {
    const ingId = p.ingId;
    const expected = cust.order[cust.progressIndex];
    const success = ingId === expected;
    p.dead = true;
    window.gameAudio.play(success ? 'hit_ok' : 'hit_wrong');

    if (success) {
      game.streak += 1;
      game.best = Math.max(game.best, game.streak);
      const stepScore = 10 + (game.streak >= 10 ? 2 : 0) + Math.max(0, game.level - 1) * 2;
      game.score += stepScore;
      cust.progressIndex += 1;
      cust.face = 2;
      cust.faceTimer = 0.45;
      cust.stunTimer = 0;
      spawnParticleBurst(cust.x, board.slotY - board.customerDrawR * 0.5, 'splat', 'rgba(120,255,180,0.75)', 8);

      if (cust.progressIndex >= cust.order.length) {
        cust.phase = 'leaving';
        cust.leaveTimer = 0.85;
        game.score += 18 + Math.min(12, cust.order.length * 2);
        game.streak += 1;
        game.endMs += 15000;
      }
    } else {
      game.streak = 0;
      game.score = Math.max(0, game.score - 3);
      cust.face = 1;
      cust.faceTimer = 0.55;
      cust.stunTimer = 1.05;
      spawnSplatParticles(cust.x, board.slotY - board.customerDrawR * 0.35, 'rgba(255,200,120,0.85)');
    }
    updateHUD();
  }

  function launchFromSlingshotPull(pullX, pullY) {
    if (!game.running) return;
    if (!game.activeIngredient) return;
    if (game.swipeLock) return;

    const lx = -pullX;
    const ly = -pullY;
    const mag = Math.hypot(lx, ly);
    if (mag < 1e-6) return;

    const stretch = Math.hypot(pullX, pullY);
    const stretchMin = board.tapMaxDistance;
    const stretchMax = board.size * SLINGSHOT.stretchMaxRatio;
    const stretchT = clamp((stretch - stretchMin) / Math.max(1e-6, stretchMax - stretchMin), 0, 1);
    const speed = lerp(SLINGSHOT.speedMin, SLINGSHOT.speedMax, stretchT);

    const nx = lx / mag;
    const ny = ly / mag;
    const vx = nx * speed;
    const vy = ny * speed - SLINGSHOT.upwardBias * (0.35 + stretchT * 0.65);

    const ingId = game.activeIngredient.id;
    game.activeIngredient = null;
    game.spawnDelayMs = 110;
    game.spawnRequestedAt = nowMs();

    game.inFlight.push(makeBallistic(ingId, board.pivotX, board.yPivot, vx, vy));
    window.gameAudio.play('throw');
  }

  function updateBallistics(dtSec) {
    const t = nowMs();
    for (const p of game.inFlight) {
      if (p.dead) continue;
      if (t - p.startMs > PHYSICS.maxFlightSec * 1000) {
        p.dead = true;
        continue;
      }

      p.lastY = p.y;
      p.vy += PHYSICS.gravity * dtSec;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;

      if (pointInTrash(p.x, p.y)) {
        p.dead = true;
        spawnParticleBurst(p.x, p.y, 'poof', 'rgba(200,200,220,0.8)', 12);
        window.gameAudio.play('trash');
        continue;
      }

      if (p.y < board.yCounter0 - 2) {
        let best = null;
        let bestD = Infinity;
        for (const cust of game.customers) {
          if (!cust.active || cust.phase === 'leaving') continue;
          const dx = p.x - cust.x;
          const dy = p.y - board.slotY;
          const d = Math.hypot(dx, dy);
          const hitDist = board.customerHitR + board.projectileRadius;
          if (d < hitDist && d < bestD) {
            bestD = d;
            best = cust;
          }
        }
        if (best) resolveCustomerProjectileHit(best, p);
        if (p.dead) continue;
      }

      if (p.y > board.floorY && p.vy > 0) {
        p.dead = true;
        spawnParticleBurst(p.x, p.y, 'splat', 'rgba(180,200,255,0.55)', 10);
        window.gameAudio.play('splat');
        continue;
      }

      if (p.x < -board.w * 0.2 || p.x > board.w * 1.2 || p.y < -board.h * 0.3) {
        p.dead = true;
      }
    }
    game.inFlight = game.inFlight.filter((p) => !p.dead);
  }

  function updateParticles(dtSec) {
    for (const q of game.particles) {
      q.life -= dtSec / q.maxLife;
      q.x += q.vx * dtSec;
      q.y += q.vy * dtSec;
      q.vy += 420 * dtSec;
      q.vx *= 0.985;
    }
    game.particles = game.particles.filter((q) => q.life > 0);
  }

  function update(dtSec) {
    if (!game.running) return;
    const t = nowMs();
    updateHUD();

    // End timer
    if (t >= game.endMs) {
      endGame();
      return;
    }

    // Fade help after start
    if (ui.centerHelp && t - game.startMs > 800) {
      ui.centerHelp.style.opacity = String(clamp(1 - (t - game.startMs - 800) / 3500, 0, 1));
    }

    // Spawn ingredient
    if (!game.activeIngredient && game.spawnDelayMs > 0) {
      if (t - game.spawnRequestedAt >= game.spawnDelayMs) {
        spawnIngredient();
        game.spawnDelayMs = 0;
      }
    }

    for (const cust of game.customers) {
      if (!cust.active) continue;
      if (cust.stunTimer > 0) cust.stunTimer = Math.max(0, cust.stunTimer - dtSec);

      if (cust.phase === 'enter') {
        const tx = board.slotX[cust.slotIndex];
        cust.x += (tx - cust.x) * Math.min(1, dtSec * 3.4);
        if (Math.abs(tx - cust.x) < 1.5) {
          cust.x = tx;
          cust.phase = 'waiting';
        }
      }

      if (cust.faceTimer > 0) cust.faceTimer = Math.max(0, cust.faceTimer - dtSec);
      if (cust.faceTimer === 0 && cust.face !== 0 && cust.phase === 'waiting') cust.face = 0;

      if (cust.phase === 'leaving') {
        cust.leaveTimer = Math.max(0, cust.leaveTimer - dtSec);
        cust.x += board.w * 2.0 * dtSec;
        if (cust.leaveTimer <= 0 || cust.x > board.w * 1.25) {
          cust.active = false;
          cust.phase = 'idle';
          cust.order = [];
          game.nextCustomerSpawnAt = Math.min(game.nextCustomerSpawnAt, t + 350);
        }
      }
    }

    if (activeCustomerCount() < NUM_CUSTOMER_SLOTS && t >= game.nextCustomerSpawnAt) {
      const idx = game.customers.findIndex((c) => !c.active);
      if (idx >= 0) {
        spawnCustomer(idx);
        game.nextCustomerSpawnAt = t + 500;
      }
    }

    updateBallistics(dtSec);
    updateParticles(dtSec);

    // Touch toast auto-hide
    if (ui.touchToast && game.touchToastUntil > 0 && t > game.touchToastUntil) {
      ui.touchToast.hidden = true;
      game.touchToastUntil = 0;
    }

    // Level up lightly based on score
    const newLevel = clamp(1 + Math.floor(game.score / 160), 1, MAX_LEVEL);
    if (newLevel !== game.level) {
      game.level = newLevel;
    }
  }

  function drawParticles() {
    for (const q of game.particles) {
      const a = clamp(q.life, 0, 1);
      ctx.save();
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.size * (0.6 + 0.4 * a), 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function draw() {
    if (!board.w || !board.h) return;
    const t = nowMs() / 1000;

    drawBackground(board, t);

    for (const cust of game.customers) {
      if (!cust.active) continue;
      const baseR = board.customerDrawR;
      const leavePulse = cust.phase === 'leaving' ? 0.6 + 0.4 * Math.sin(t * 12 + cust.animPhase) : 0;
      const scale = cust.phase === 'leaving' ? 1 - (1 - (cust.leaveTimer || 0)) * 0.45 : 1;
      const r = baseR * scale;
      drawCustomer(cust, cust.x, board.slotY, r, t, leavePulse);
    }

    drawTrashCan(board);

    if (game.activeIngredient) {
      const bounce = Math.sin(t * 6.5) * board.size * 0.008;
      const ix = game.activeIngredient.x;
      const iy = game.activeIngredient.y + bounce;
      const centerScale = board.size * 0.0036;
      drawIngredient(game.activeIngredient.id, ix, iy, centerScale, {
        time: nowMs(),
        bob: true,
        rotate: Math.sin(t * 4) * 0.08,
      });
      const label = INGREDIENT_LABELS[game.activeIngredient.id] || game.activeIngredient.id;
      ctx.save();
      ctx.fillStyle = 'rgba(234,242,255,0.94)';
      ctx.font = `${Math.max(12, Math.floor(board.size * 0.03))}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 6;
      ctx.fillText(label, ix, iy + board.pickupRadius * 1.35);
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(board.pivotX, board.yPivot, Math.max(5, board.size * 0.018), 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (game.aiming && game.activeIngredient) {
      const px = board.pivotX;
      const py = board.yPivot;
      const ax = game.aimX;
      const ay = game.aimY;
      const mx = (px + ax) * 0.5;
      const my = (py + ay) * 0.5;
      const nx = -(ay - py);
      const ny = ax - px;
      const nlen = Math.hypot(nx, ny) || 1;
      const bow = board.size * 0.035;
      const bx = mx + (nx / nlen) * bow;
      const by = my + (ny / nlen) * bow;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.36)';
      ctx.lineWidth = Math.max(2.5, board.size * 0.006);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(bx, by, ax, ay);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(180,230,255,0.32)';
      ctx.lineWidth = Math.max(1.5, board.size * 0.0035);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(ax, ay, Math.max(4, board.size * 0.014), 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    for (const p of game.inFlight) {
      if (p.dead) continue;
      const flightT = (nowMs() - p.startMs) / 1000;
      const rot = Math.sin((flightT * 10 + p.wobble) * TAU) * 0.18;
      drawIngredient(p.ingId, p.x, p.y, board.size * 0.0033, {
        time: nowMs(),
        rotate: rot,
        bob: false,
      });
    }

    drawParticles();

    ctx.save();
    const cx = board.w * 0.5;
    const cy = board.h * 0.45;
    const vign = ctx.createRadialGradient(cx, cy, board.size * 0.12, cx, cy, board.size * 0.95);
    vign.addColorStop(0, 'rgba(0,0,0,0)');
    vign.addColorStop(1, 'rgba(0,0,0,0.32)');
    ctx.fillStyle = vign;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // Input: slingshot from center (pivot), release to launch opposite pull
  function pointerToCanvas(e) {
    const rect = canvas.getBoundingClientRect();
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;
    return { x: xCss, y: yCss };
  }

  function onPointerDown(e) {
    if (!game.running) return;
    if (game.swipeStart) return;

    const { x, y } = pointerToCanvas(e);
    if (y < board.yBottom0 - 4) return;

    const distPivot = Math.hypot(x - board.pivotX, y - board.yPivot);
    if (distPivot > board.centerStartMax) return;

    canvas.setPointerCapture?.(e.pointerId);
    const t = nowMs();
    game.swipeStart = { id: e.pointerId, x, y, t };
    game.swipeCurrent = { id: e.pointerId, x, y, t };
    game.aiming = true;
    game.aimPointerId = e.pointerId;
    game.aimX = x;
    game.aimY = y;
  }

  function onPointerMove(e) {
    if (!game.running) return;
    if (!game.swipeStart) return;
    if (e.pointerId !== game.swipeStart.id) return;
    const { x, y } = pointerToCanvas(e);
    game.swipeCurrent = { id: e.pointerId, x, y, t: nowMs() };
    if (game.aiming && e.pointerId === game.aimPointerId) {
      game.aimX = x;
      game.aimY = y;
    }
  }

  function onPointerUp(e) {
    if (!game.running) return;
    if (!game.swipeStart) return;
    if (e.pointerId !== game.swipeStart.id) return;

    const { x, y } = pointerToCanvas(e);
    const pullX = x - board.pivotX;
    const pullY = y - board.yPivot;
    const stretch = Math.hypot(pullX, pullY);

    if (stretch <= board.tapMaxDistance) {
      const t = nowMs();
      const ing = game.activeIngredient;
      let nearPickup = false;
      if (ing && typeof ing.x === 'number') {
        nearPickup = Math.hypot(x - ing.x, y - ing.y) <= board.pickupRadius * 1.35;
      }
      if (nearPickup && t >= game.changeCooldownUntil) {
        if (rerollIngredient()) game.changeCooldownUntil = t + 700;
      } else {
        showTouchToast(700);
      }

      clearGestureState();
      game.swipeLock = true;
      setTimeout(() => {
        game.swipeLock = false;
      }, 35);
      return;
    }

    launchFromSlingshotPull(pullX, pullY);

    clearGestureState();

    game.swipeLock = true;
    setTimeout(() => {
      game.swipeLock = false;
    }, 35);
  }

  function bindUI() {
    ui.startBtn.addEventListener('click', startGame);
    ui.restartBtn.addEventListener('click', startGame);

    window.addEventListener('resize', () => {
      resize();
    });

    canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerup', onPointerUp, { passive: true });
    canvas.addEventListener(
      'pointercancel',
      () => {
        clearGestureState();
      },
      { passive: true }
    );
  }

  function loop(last) {
    const t = nowMs();
    const dtSec = Math.min(0.033, (t - last) / 1000);
    update(dtSec);
    draw();
    requestAnimationFrame(() => loop(t));
  }

  // Start
  reset();
  bindUI();
  resize();
  requestAnimationFrame(() => loop(nowMs()));
})();

