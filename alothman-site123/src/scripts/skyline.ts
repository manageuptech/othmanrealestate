// Generative "golden hour over the Gulf" skyline, drawn on canvas.
// Used behind the hero until (or instead of) the intro video.

type Opts = { reduce?: boolean };
type B = { x: number; w: number; h: number; top: number; layer: number; windows: { x: number; y: number; on: number; speed: number }[] };

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function skyline(canvas: HTMLCanvasElement, opts: Opts = {}) {
  const ctx = canvas.getContext('2d')!;
  let W = 0, H = 0, dpr = 1, horizon = 0;
  let buildings: B[] = [];
  let stars: { x: number; y: number; r: number; p: number }[] = [];
  let raf = 0, running = true, t0 = performance.now();
  let mx = 0, my = 0, tmx = 0, tmy = 0;

  function build() {
    const r = rng(7);
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    horizon = H * (W < 760 ? 0.66 : 0.7);
    buildings = [];
    for (let layer = 0; layer < 3; layer++) {
      let x = -60;
      const scale = [0.55, 0.8, 1][layer];
      while (x < W + 60) {
        const w = (28 + r() * 70) * scale * (W < 760 ? 0.7 : 1);
        // a cluster of towers in the middle-left, like a waterfront
        const centre = 1 - Math.min(1, Math.abs(x / W - 0.38) * 1.6);
        const h = (40 + r() * 120 + centre * r() * (layer === 2 ? 300 : 220)) * scale * (H / 900);
        const top = r() < 0.18 ? 1 : r() < 0.3 ? 2 : 0; // 0 flat, 1 spire, 2 stepped
        const windows: B['windows'] = [];
        const cols = Math.max(1, Math.floor(w / 9)), rows = Math.max(1, Math.floor(h / 11));
        for (let c = 0; c < cols; c++) for (let rr = 0; rr < rows; rr++) {
          if (r() < 0.32) windows.push({ x: 4 + c * 9, y: 6 + rr * 11, on: r(), speed: 0.2 + r() * 0.8 });
        }
        buildings.push({ x, w, h, top, layer, windows });
        x += w + (layer === 0 ? r() * 6 : r() * 16 - 2);
      }
    }
    stars = Array.from({ length: Math.round(W / 9) }, () => ({ x: r() * W, y: r() * horizon * 0.65, r: r() * 1.1 + 0.2, p: r() * 6.28 }));
  }

  function drawBuilding(b: B, baseY: number, px: number, time: number, mirror = false) {
    const x = b.x + px, y = baseY - b.h;
    const col = ['#1d3150', '#14243c', '#0b1525'][b.layer];
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.rect(x, y, b.w, b.h);
    if (b.top === 1) { ctx.moveTo(x + b.w * 0.35, y); ctx.lineTo(x + b.w * 0.5, y - b.h * 0.22); ctx.lineTo(x + b.w * 0.65, y); }
    if (b.top === 2) { ctx.rect(x + b.w * 0.15, y - b.h * 0.08, b.w * 0.7, b.h * 0.08); ctx.rect(x + b.w * 0.32, y - b.h * 0.15, b.w * 0.36, b.h * 0.07); }
    ctx.fill();
    // gold rim light on the sun side
    if (b.layer > 0) {
      const g = ctx.createLinearGradient(x, 0, x + b.w, 0);
      g.addColorStop(0, 'rgba(226,188,102,0)'); g.addColorStop(1, `rgba(226,188,102,${b.layer === 2 ? 0.16 : 0.1})`);
      ctx.fillStyle = g; ctx.fillRect(x, y, b.w, b.h);
    }
    if (mirror) return;
    for (const w of b.windows) {
      const v = 0.5 + 0.5 * Math.sin(time * w.speed + w.on * 40);
      if (w.on < 0.55 && v < 0.82) continue;
      const a = (b.layer === 2 ? 0.85 : 0.5) * (0.35 + 0.65 * v);
      ctx.fillStyle = w.on > 0.8 ? `rgba(255,246,229,${a * 0.8})` : `rgba(226,188,102,${a})`;
      if (y + w.y < baseY - 4) ctx.fillRect(x + w.x, y + w.y, 3, 4.5);
    }
  }

  function frame(now: number) {
    const time = (now - t0) / 1000;
    mx += (tmx - mx) * 0.04; my += (tmy - my) * 0.04;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#070d18'); sky.addColorStop(0.45, '#142238'); sky.addColorStop(0.7, '#3b3a4c'); sky.addColorStop(0.9, '#8a6436'); sky.addColorStop(1, '#c9934a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon + 1);

    // sun glow
    const sx = W * 0.27 + mx * 20, sy = horizon - H * 0.09;
    const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.55);
    sun.addColorStop(0, 'rgba(255,236,190,1)'); sun.addColorStop(0.035, 'rgba(255,214,140,0.95)'); sun.addColorStop(0.1, 'rgba(226,188,102,0.45)'); sun.addColorStop(0.35, 'rgba(195,148,45,0.16)'); sun.addColorStop(1, 'rgba(195,148,45,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, horizon);

    // stars
    for (const s of stars) {
      ctx.fillStyle = `rgba(255,246,229,${0.15 + 0.35 * (0.5 + 0.5 * Math.sin(time * 0.8 + s.p))})`;
      ctx.beginPath(); ctx.arc(s.x + mx * 4, s.y + my * 3, s.r, 0, 6.283); ctx.fill();
    }

    // skyline layers with parallax
    for (const b of buildings) drawBuilding(b, horizon, mx * [8, 18, 34][b.layer] + Math.sin(time * 0.05) * 6 * b.layer, time);

    // sea
    const sea = ctx.createLinearGradient(0, horizon, 0, H);
    sea.addColorStop(0, '#2a2a33'); sea.addColorStop(0.15, '#121e33'); sea.addColorStop(1, '#070d18');
    ctx.fillStyle = sea; ctx.fillRect(0, horizon, W, H - horizon);

    // reflection of the skyline
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.translate(0, horizon * 2); ctx.scale(1, -1);
    for (const b of buildings) if (b.layer === 2) drawBuilding(b, horizon, mx * 34, time, true);
    ctx.restore();

    // shimmering sun path on water
    for (let i = 0; i < 46; i++) {
      const yy = horizon + 4 + Math.pow(i / 46, 1.6) * (H - horizon);
      const spread = 12 + (yy - horizon) * 0.9;
      const off = Math.sin(time * 1.4 + i * 1.7) * spread * 0.4;
      const len = spread * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(time * 2 + i)));
      ctx.fillStyle = `rgba(226,188,102,${0.5 * (1 - i / 46)})`;
      ctx.fillRect(sx - len / 2 + off, yy, len, 1.2 + i * 0.04);
    }
    // horizon line
    ctx.fillStyle = 'rgba(255,214,140,0.5)'; ctx.fillRect(0, horizon, W, 1);

    if (running && !opts.reduce) raf = requestAnimationFrame(frame);
  }

  const onMove = (e: PointerEvent) => { tmx = e.clientX / W - 0.5; tmy = e.clientY / H - 0.5; };
  const onResize = () => { build(); if (!running || opts.reduce) frame(performance.now()); };
  build();
  frame(performance.now());
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('resize', onResize);

  // pause when off-screen
  const io = new IntersectionObserver(([e]) => {
    if (opts.reduce) return;
    if (e.isIntersecting && running) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } else cancelAnimationFrame(raf);
  });
  io.observe(canvas);

  return {
    pause() { running = false; cancelAnimationFrame(raf); },
    destroy() { running = false; cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener('pointermove', onMove); window.removeEventListener('resize', onResize); },
  };
}
