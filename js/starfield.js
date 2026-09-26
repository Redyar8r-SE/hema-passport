/* Subtle animated starfield behind the UI. Static when the visitor prefers reduced motion. */
(function () {
  'use strict';
  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let stars = [], w = 0, h = 0, dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round((w * h) / 5200);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() < 0.94 ? Math.random() * 0.9 + 0.25 : Math.random() * 1.4 + 0.9,
      a: Math.random() * 0.6 + 0.15, p: Math.random() * Math.PI * 2, s: Math.random() * 0.8 + 0.2,
      v: Math.random() * 0.04 + 0.01,
    }));
    if (still) draw(0);
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const a = still ? s.a : s.a * (0.65 + 0.35 * Math.sin(t * 0.001 * s.s + s.p));
      if (!still) { s.x -= s.v; if (s.x < -2) s.x = w + 2; }
      ctx.globalAlpha = a;
      ctx.fillStyle = s.r > 1 ? '#f1e4c0' : '#dfe8ff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function loop(t) { draw(t); requestAnimationFrame(loop); }

  window.addEventListener('resize', resize);
  resize();
  if (!still) requestAnimationFrame(loop);
})();
