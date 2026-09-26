/* HEMA Space Passport — canvas renderer.
   One renderer draws the on-screen passport, the downloadable PNG and the public digital passport. */
(function (H) {
  'use strict';

  const W = 1600, HT = 1120;
  const C = {
    bg0: '#060a15', bg1: '#0c1630', gold: '#d6b56e', gold2: '#f1dca6', cyan: '#74d4ff',
    text: '#eef2fa', muted: '#8d9ab8', faint: 'rgba(214,181,110,0.22)', navy: '#070d1c',
  };
  const SANS = '"Space Grotesk", "Noto Sans Arabic", system-ui, sans-serif';
  const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
  const ARABIC = '"Noto Sans Arabic", system-ui, sans-serif'; // Kurdish / Arabic-script names

  H.PASSPORT_SIZE = { w: W, h: HT };

  /* ---------- small helpers ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seedFrom(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // Letter-spaced text for fixed Latin labels (drawn per glyph so it works in every browser).
  function spaced(ctx, text, x, y, spacing, align) {
    const chars = [...text];
    const width = chars.reduce((s, c) => s + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
    let cx = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
    const prev = ctx.textAlign;
    ctx.textAlign = 'left';
    for (const c of chars) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + spacing; }
    ctx.textAlign = prev;
    return width;
  }
  // Shrink a font until the text fits; ellipsize as a last resort.
  function fit(ctx, text, maxW, size, weight, family, min) {
    let s = size;
    ctx.font = `${weight} ${s}px ${family}`;
    while (ctx.measureText(text).width > maxW && s > min) { s -= 1; ctx.font = `${weight} ${s}px ${family}`; }
    let t = text;
    while (ctx.measureText(t).width > maxW && t.length > 1) t = t.slice(0, -2) + '…';
    return t;
  }
  function label(ctx, text, x, y, color) {
    ctx.font = `500 15px ${MONO}`;
    ctx.fillStyle = color || C.muted;
    spaced(ctx, text, x, y, 2.4);
  }
  const isRTLText = (s) => /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(String(s || ''));
  // Latin values start at x; Kurdish / Arabic-script values (e.g. names) are right-aligned to the column end.
  function value(ctx, text, x, right, y, size, color) {
    const rtl = isRTLText(text);
    ctx.save();
    ctx.direction = rtl ? 'rtl' : 'ltr';
    const t = fit(ctx, text || '—', right - x, rtl ? Math.round(size * 0.92) : size, rtl ? 700 : 600, rtl ? ARABIC : SANS, 16);
    ctx.fillStyle = color || C.text;
    ctx.textAlign = rtl ? 'right' : 'left';
    ctx.fillText(t, rtl ? right : x, y);
    ctx.restore();
  }
  function loadImage(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  H.loadImage = loadImage;

  async function fontsReady() {
    if (!document.fonts) return;
    try {
      await Promise.all([
        document.fonts.load(`700 40px "Space Grotesk"`),
        document.fonts.load(`500 40px "Space Grotesk"`),
        document.fonts.load(`500 20px "IBM Plex Mono"`),
        document.fonts.load(`400 20px "IBM Plex Mono"`),
        // Arabic-script glyphs (Kurdish names) live in a separate unicode-range file, so ask for them explicitly.
        document.fonts.load(`700 40px "Noto Sans Arabic"`, 'پاسپۆرتی کوردی'),
        document.fonts.load(`500 20px "Noto Sans Arabic"`, 'پاسپۆرتی کوردی'),
      ]);
    } catch (e) { /* fall back to system fonts */ }
  }

  /* ---------- planets (also used for the destination cards) ---------- */
  function shade(ctx, cx, cy, r) {
    const g = ctx.createRadialGradient(cx - r * 0.45, cy - r * 0.45, r * 0.2, cx + r * 0.2, cy + r * 0.2, r * 1.25);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.15)');
    g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  function ball(ctx, cx, cy, r, stops) {
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.05, cx, cy, r);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  function glow(ctx, cx, cy, r, color) {
    const g = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.35);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2); ctx.fill();
  }
  function rings(ctx, cx, cy, r, tilt, front, colors) {
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(tilt);
    if (front) { ctx.beginPath(); ctx.rect(-r * 3, 0, r * 6, r * 3); ctx.clip(); }
    colors.forEach(([k, w, c]) => {
      ctx.strokeStyle = c; ctx.lineWidth = r * w;
      ctx.beginPath(); ctx.ellipse(0, 0, r * k, r * k * 0.24, 0, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.restore();
  }

  H.drawPlanet = function (ctx, id, cx, cy, r, seed) {
    const rand = rng(seed || 7);
    ctx.save();
    switch (id) {
      case 'moon': {
        glow(ctx, cx, cy, r, 'rgba(200,210,230,0.18)');
        ball(ctx, cx, cy, r, [[0, '#f2f2ee'], [0.6, '#a9abad'], [1, '#55585f']]);
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
        for (let i = 0; i < 14; i++) {
          const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r * 0.9, cr = r * (0.05 + rand() * 0.13);
          const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
          ctx.fillStyle = 'rgba(70,72,80,0.35)';
          ctx.beginPath(); ctx.arc(x, y, cr, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = Math.max(1, cr * 0.18);
          ctx.beginPath(); ctx.arc(x + cr * 0.12, y + cr * 0.12, cr, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
        }
        ctx.restore();
        shade(ctx, cx, cy, r);
        break;
      }
      case 'mars': {
        glow(ctx, cx, cy, r, 'rgba(255,120,70,0.20)');
        ball(ctx, cx, cy, r, [[0, '#ffb07a'], [0.55, '#c9532c'], [1, '#5a1a0c']]);
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
        for (let i = 0; i < 9; i++) {
          ctx.fillStyle = `rgba(90,25,10,${0.18 + rand() * 0.2})`;
          ctx.beginPath();
          ctx.ellipse(cx + (rand() - 0.5) * r * 1.6, cy + (rand() - 0.5) * r * 1.4, r * (0.15 + rand() * 0.3), r * (0.05 + rand() * 0.1), rand() * 0.6 - 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
        const cap = ctx.createRadialGradient(cx - r * 0.15, cy - r * 0.98, 0, cx - r * 0.15, cy - r * 0.98, r * 0.28);
        cap.addColorStop(0, 'rgba(255,245,235,0.75)'); cap.addColorStop(1, 'rgba(255,245,235,0)');
        ctx.fillStyle = cap;
        ctx.beginPath(); ctx.arc(cx - r * 0.15, cy - r * 0.98, r * 0.28, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        shade(ctx, cx, cy, r);
        break;
      }
      case 'saturn': {
        const ringCols = [[2.05, 0.1, 'rgba(210,185,140,0.55)'], [1.8, 0.2, 'rgba(235,210,160,0.75)'], [1.5, 0.12, 'rgba(180,150,105,0.55)']];
        glow(ctx, cx, cy, r, 'rgba(240,210,150,0.15)');
        rings(ctx, cx, cy, r, -0.32, false, ringCols);
        ball(ctx, cx, cy, r, [[0, '#fbe6b8'], [0.6, '#d0a868'], [1, '#6a4a1c']]);
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
        ctx.translate(cx, cy); ctx.rotate(-0.32);
        for (let i = -5; i <= 5; i++) {
          ctx.fillStyle = i % 2 ? 'rgba(120,80,30,0.16)' : 'rgba(255,240,200,0.10)';
          ctx.fillRect(-r * 1.2, i * r * 0.17, r * 2.4, r * 0.09);
        }
        ctx.restore();
        shade(ctx, cx, cy, r);
        rings(ctx, cx, cy, r, -0.32, true, ringCols);
        break;
      }
      case 'station': {
        glow(ctx, cx, cy, r, 'rgba(90,170,255,0.30)');
        ball(ctx, cx, cy, r, [[0, '#9fd3ff'], [0.5, '#2c6fc4'], [1, '#081c44']]);
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
        for (let i = 0; i < 7; i++) {
          ctx.fillStyle = `rgba(80,160,110,${0.35 + rand() * 0.2})`;
          ctx.beginPath();
          ctx.ellipse(cx + (rand() - 0.5) * r * 1.4, cy + (rand() - 0.5) * r * 1.4, r * (0.12 + rand() * 0.25), r * (0.08 + rand() * 0.15), rand() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        for (let i = 0; i < 6; i++) {
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = r * 0.04;
          ctx.beginPath(); ctx.ellipse(cx + (rand() - 0.5) * r * 1.4, cy + (rand() - 0.5) * r * 1.4, r * 0.3, r * 0.05, rand() * 0.4, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
        shade(ctx, cx, cy, r);
        // orbit + station
        ctx.strokeStyle = 'rgba(160,220,255,0.55)'; ctx.lineWidth = Math.max(1, r * 0.025);
        ctx.setLineDash([r * 0.08, r * 0.06]);
        ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.45, r * 0.42, -0.35, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        const a = -0.9, sx = cx + Math.cos(a) * r * 1.45 * Math.cos(-0.35) - Math.sin(a) * r * 0.42 * Math.sin(-0.35);
        const sy = cy + Math.cos(a) * r * 1.45 * Math.sin(-0.35) + Math.sin(a) * r * 0.42 * Math.cos(-0.35);
        const u = r * 0.07;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(-0.35);
        ctx.fillStyle = '#e8eef8'; ctx.fillRect(-u * 0.5, -u * 0.5, u, u);
        ctx.fillStyle = '#d6b56e';
        ctx.fillRect(-u * 3.2, -u * 0.9, u * 2.2, u * 1.8); ctx.fillRect(u, -u * 0.9, u * 2.2, u * 1.8);
        ctx.fillStyle = '#e8eef8'; ctx.fillRect(-u * 3.2, -u * 0.1, u * 6.4, u * 0.2);
        ctx.restore();
        break;
      }
      case 'deep': {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.3);
        g.addColorStop(0, 'rgba(255,240,220,0.95)'); g.addColorStop(0.12, 'rgba(210,170,255,0.55)');
        g.addColorStop(0.45, 'rgba(90,70,200,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2); ctx.fill();
        ctx.translate(cx, cy); ctx.rotate(-0.4); ctx.scale(1, 0.55);
        for (let arm = 0; arm < 2; arm++) {
          for (let i = 0; i < 260; i++) {
            const t = i / 260, ang = arm * Math.PI + t * Math.PI * 3.2, d = t * r * 1.15;
            const jx = (rand() - 0.5) * r * 0.16 * (0.4 + t), jy = (rand() - 0.5) * r * 0.16 * (0.4 + t);
            ctx.fillStyle = rand() < 0.25 ? `rgba(120,210,255,${0.9 - t * 0.6})` : `rgba(235,220,255,${0.9 - t * 0.6})`;
            const s = Math.max(0.6, r * 0.012 * (1.4 - t) * (0.5 + rand()));
            ctx.beginPath(); ctx.arc(Math.cos(ang) * d + jx, Math.sin(ang) * d + jy, s, 0, Math.PI * 2); ctx.fill();
          }
        }
        break;
      }
      default: { // unknown planet
        glow(ctx, cx, cy, r, 'rgba(120,240,220,0.22)');
        ball(ctx, cx, cy, r, [[0, '#9ff5e2'], [0.45, '#3f8fb0'], [0.8, '#40289a'], [1, '#150a36']]);
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
        ctx.translate(cx, cy); ctx.rotate(0.5);
        for (let i = -6; i <= 6; i++) {
          ctx.fillStyle = `rgba(${i % 2 ? '20,10,60' : '180,255,240'},${0.06 + rand() * 0.08})`;
          ctx.fillRect(-r * 1.2, i * r * 0.15 + (rand() - 0.5) * r * 0.05, r * 2.4, r * (0.05 + rand() * 0.07));
        }
        ctx.restore();
        shade(ctx, cx, cy, r);
        ctx.strokeStyle = 'rgba(160,255,235,0.5)'; ctx.lineWidth = Math.max(1, r * 0.02);
        ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.6, r * 0.3, 0.5, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
        ball(ctx, cx - r * 1.25, cy - r * 0.7, r * 0.14, [[0, '#e6e1ff'], [1, '#4a4470']]);
      }
    }
    ctx.restore();
  };

  // Radius that keeps a planet (incl. rings) inside a square icon of the given size.
  H.planetIconRadius = function (id, size) {
    return size * (id === 'saturn' ? 0.22 : id === 'station' || id === 'unknown' ? 0.28 : id === 'deep' ? 0.36 : 0.34);
  };

  /* ---------- emblem ---------- */
  function drawEmblem(ctx, cx, cy, r, logo) {
    if (logo) {
      const s = Math.min((r * 2) / logo.width, (r * 2) / logo.height);
      ctx.drawImage(logo, cx - (logo.width * s) / 2, cy - (logo.height * s) / 2, logo.width * s, logo.height * s);
      return;
    }
    ctx.save();
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, C.gold2); g.addColorStop(1, '#9c7a38');
    ctx.strokeStyle = g; ctx.lineWidth = r * 0.06;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.94, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = r * 0.02;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = r * 0.04;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.7, r * 0.26, -0.45, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2); ctx.fill();
    // four-point star
    const sx = cx + r * 0.42, sy = cy - r * 0.42, s = r * 0.17;
    ctx.beginPath();
    ctx.moveTo(sx, sy - s); ctx.quadraticCurveTo(sx, sy, sx + s, sy); ctx.quadraticCurveTo(sx, sy, sx, sy + s);
    ctx.quadraticCurveTo(sx, sy, sx - s, sy); ctx.quadraticCurveTo(sx, sy, sx, sy - s); ctx.fill();
    ctx.restore();
  }

  /* ---------- background & security printing ---------- */
  function drawBackground(ctx, rand, destId) {
    rr(ctx, 0, 0, W, HT, 34);
    ctx.save();
    ctx.clip();

    const bg = ctx.createLinearGradient(0, 0, W, HT);
    bg.addColorStop(0, C.bg1); bg.addColorStop(0.55, '#08112a'); bg.addColorStop(1, C.bg0);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, HT);

    // nebula haze
    const hz = ctx.createRadialGradient(1250, 420, 20, 1250, 420, 700);
    hz.addColorStop(0, 'rgba(80,110,220,0.20)'); hz.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hz; ctx.fillRect(0, 0, W, HT);

    // stars
    for (let i = 0; i < 420; i++) {
      const x = rand() * W, y = rand() * HT, s = rand() < 0.93 ? rand() * 1.1 + 0.3 : rand() * 1.8 + 1;
      ctx.fillStyle = `rgba(230,238,255,${0.15 + rand() * 0.55})`;
      ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
    }

    // destination planet, large and faint behind the data
    ctx.globalAlpha = 0.2;
    H.drawPlanet(ctx, destId, 1360, 470, destId === 'saturn' ? 190 : 250, 11);
    ctx.globalAlpha = 1;

    // guilloche waves
    ctx.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      ctx.strokeStyle = `rgba(214,181,110,${i % 2 ? 0.05 : 0.08})`;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const y = 700 + i * 9 + Math.sin(x * 0.006 + i * 0.35) * 38 + Math.sin(x * 0.017 + i) * 8;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // rosette behind the photo column
    ctx.strokeStyle = 'rgba(116,212,255,0.07)';
    for (let k = 0; k < 18; k++) {
      ctx.beginPath();
      for (let t = 0; t <= Math.PI * 2 + 0.01; t += 0.02) {
        const rad = 170 + 38 * Math.sin(9 * t + k * 0.35);
        const x = 235 + rad * Math.cos(t + k * 0.05), y = 470 + rad * Math.sin(t + k * 0.05);
        t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // MRZ band
    ctx.fillStyle = 'rgba(235,240,250,0.06)';
    ctx.fillRect(0, 958, W, HT - 958);
    ctx.fillStyle = 'rgba(214,181,110,0.35)';
    ctx.fillRect(0, 958, W, 1.5);

    ctx.restore();

    // card edge
    ctx.save();
    rr(ctx, 1.5, 1.5, W - 3, HT - 3, 33);
    const eg = ctx.createLinearGradient(0, 0, W, HT);
    eg.addColorStop(0, 'rgba(241,220,166,0.75)'); eg.addColorStop(0.5, 'rgba(214,181,110,0.25)'); eg.addColorStop(1, 'rgba(241,220,166,0.6)');
    ctx.strokeStyle = eg; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }

  function holoSeal(ctx, cx, cy, r) {
    ctx.save();
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, 'rgba(116,212,255,0.75)'); g.addColorStop(0.35, 'rgba(214,181,110,0.8)');
    g.addColorStop(0.65, 'rgba(210,150,255,0.7)'); g.addColorStop(1, 'rgba(116,255,210,0.7)');
    ctx.strokeStyle = g; ctx.fillStyle = g;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2); ctx.stroke();
    // text on circle
    const text = 'HEMA ASTRONOMICAL ORGANIZATION ✦ KAF 2026 ✦ ';
    ctx.font = `600 12px ${MONO}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const chars = [...text], step = (Math.PI * 2) / chars.length;
    chars.forEach((c, i) => {
      const a = -Math.PI / 2 + i * step;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillText(c, 0, 0);
      ctx.restore();
    });
    // center rays
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      ctx.globalAlpha = i % 2 ? 0.35 : 0.7;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3);
      ctx.lineTo(cx + Math.cos(a) * r * 0.66, cy + Math.sin(a) * r * 0.66);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.navy;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = g;
    ctx.font = `700 22px ${SANS}`;
    ctx.fillText('2026', cx, cy + 1);
    ctx.restore();
  }

  function coverImage(ctx, img, x, y, w, h) {
    const s = Math.max(w / img.width, h / img.height);
    const sw = w / s, sh = h / s;
    ctx.drawImage(img, (img.width - sw) / 2, Math.max(0, (img.height - sh) * 0.35), sw, sh, x, y, w, h);
  }

  function drawPhotoFrame(ctx, photo, x, y, w, h, callsign) {
    ctx.save();
    rr(ctx, x, y, w, h, 16);
    ctx.fillStyle = '#0a1428'; ctx.fill();
    ctx.clip();
    if (photo) {
      coverImage(ctx, photo, x, y, w, h);
      // subtle laminate sheen
      const sh = ctx.createLinearGradient(x, y, x + w, y + h);
      sh.addColorStop(0, 'rgba(255,255,255,0.10)'); sh.addColorStop(0.4, 'rgba(255,255,255,0)');
      sh.addColorStop(0.7, 'rgba(116,212,255,0.06)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sh; ctx.fillRect(x, y, w, h);
    } else {
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, '#14224a'); g.addColorStop(1, '#070d1e');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      // callsign monogram
      const mx = x + w / 2, my = y + h * 0.44;
      ctx.strokeStyle = 'rgba(214,181,110,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, my, w * 0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(116,212,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(mx, my, w * 0.42, w * 0.12, -0.4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = C.gold2;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 96px ${SANS}`;
      ctx.fillText([...(callsign || 'H')][0], mx, my + 4);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
    }
    ctx.restore();
    // frame + corner brackets
    ctx.save();
    rr(ctx, x, y, w, h, 16);
    ctx.strokeStyle = 'rgba(214,181,110,0.55)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = C.gold2; ctx.lineWidth = 3;
    const k = 26, o = 10;
    [[x - o, y - o, 1, 1], [x + w + o, y - o, -1, 1], [x - o, y + h + o, 1, -1], [x + w + o, y + h + o, -1, -1]].forEach(([px, py, sx, sy]) => {
      ctx.beginPath(); ctx.moveTo(px, py + sy * k); ctx.lineTo(px, py); ctx.lineTo(px + sx * k, py); ctx.stroke();
    });
    ctx.restore();
  }

  function kafBadge(ctx, cx, cy, r, logo) {
    if (logo) {
      const s = Math.min((r * 2) / logo.width, (r * 2) / logo.height);
      ctx.drawImage(logo, cx - (logo.width * s) / 2, cy - (logo.height * s) / 2, logo.width * s, logo.height * s);
      return;
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(116,212,255,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(116,212,255,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.25, r * 0.38, -0.3, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = C.text; ctx.textAlign = 'center';
    ctx.font = `700 26px ${SANS}`; ctx.fillText('KAF', cx, cy + 2);
    ctx.font = `500 13px ${MONO}`; ctx.fillStyle = C.cyan;
    spaced(ctx, '2026', cx, cy + 22, 3, 'center');
    ctx.restore();
  }

  // Classic visa-style entry stamp, slightly rotated like a real ink stamp.
  function entryStamp(ctx, cx, cy, date) {
    const w = 230, h = 132, ink = 'rgba(116,212,255,0.82)';
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.1);
    ctx.strokeStyle = ink; ctx.fillStyle = ink;
    ctx.lineWidth = 3; rr(ctx, -w / 2, -h / 2, w, h, 12); ctx.stroke();
    ctx.lineWidth = 1; rr(ctx, -w / 2 + 7, -h / 2 + 7, w - 14, h - 14, 8); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = `500 12px ${MONO}`;
    spaced(ctx, 'HEMA ENTRY CONTROL', 0, -h / 2 + 30, 2, 'center');
    ctx.font = `700 34px ${SANS}`;
    spaced(ctx, 'APPROVED', 0, 12, 3, 'center');
    ctx.fillRect(-w / 2 + 22, 24, w - 44, 1.5);
    ctx.font = `600 15px ${MONO}`;
    spaced(ctx, date || '', 0, 48, 2, 'center');
    ctx.restore();
  }

  function specimenMark(ctx) {
    ctx.save();
    ctx.translate(W / 2 + 100, HT / 2 - 40);
    ctx.rotate(-0.28);
    ctx.font = `700 150px ${SANS}`;
    ctx.fillStyle = 'rgba(241,220,166,0.07)';
    ctx.strokeStyle = 'rgba(241,220,166,0.22)';
    ctx.lineWidth = 2;
    ctx.textAlign = 'center';
    spaced(ctx, 'SPECIMEN', 0, 50, 18, 'center');
    ctx.restore();
  }

  /* ---------- main ---------- */
  /**
   * p: { name, age, origin, callsign, dest, role, mission, serial, issued }
   * opts: { photo: HTMLImageElement|Canvas, logos: {hema, kaf}, specimen: bool }
   */
  H.renderPassport = async function (canvas, p, opts) {
    opts = opts || {};
    await fontsReady();
    canvas.width = W; canvas.height = HT;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, HT);
    ctx.textBaseline = 'alphabetic';
    ctx.direction = 'ltr';

    const dest = H.DESTINATIONS[p.dest], role = H.ROLES[p.role], mission = H.MISSIONS[p.mission];
    const number = H.CONFIG.NUMBER_PREFIX + p.serial;
    const rand = rng(seedFrom(number));
    const logos = opts.logos || {};
    const up = (s) => String(s || '').toUpperCase();
    const issued = H.formatDate(p.issued);

    drawBackground(ctx, rand, dest.id);

    /* header */
    drawEmblem(ctx, 124, 112, 64, logos.hema);
    const HX = 216;
    ctx.fillStyle = C.gold;
    ctx.font = `500 19px ${MONO}`;
    spaced(ctx, 'HEMA ASTRONOMICAL ORGANIZATION', HX + 2, 70, 4);
    ctx.fillStyle = C.text;
    ctx.font = `700 66px ${SANS}`;
    spaced(ctx, 'SPACE PASSPORT', HX, 136, 3);
    ctx.fillStyle = C.muted;
    ctx.font = `400 17px ${MONO}`;
    spaced(ctx, 'INTERPLANETARY TRAVEL DOCUMENT', HX + 2, 174, 5.2);

    ctx.font = `500 15px ${MONO}`; ctx.fillStyle = C.muted;
    spaced(ctx, 'PASSPORT NO.', W - 70, 66, 2.4, 'right');
    ctx.textAlign = 'right';
    ctx.fillStyle = C.gold2;
    ctx.font = `600 32px ${MONO}`;
    ctx.fillText(number, W - 70, 110);
    ctx.font = `500 15px ${MONO}`; ctx.fillStyle = C.muted;
    ctx.fillText('TYPE P     ISSUING CODE HMA     SOL', W - 70, 146);
    ctx.textAlign = 'left';

    /* photo column */
    drawPhotoFrame(ctx, opts.photo, 70, 250, 330, 440, p.callsign);
    holoSeal(ctx, 235, 834, 96);

    /* data: two columns, each spanning [x, right] */
    const X1 = 470, R1 = 950, X2 = 1010, R2 = 1530;
    function section(text, x, right, y) {
      ctx.fillStyle = C.cyan; ctx.fillRect(x, y - 13, 4, 16);
      ctx.font = `600 16px ${MONO}`;
      spaced(ctx, text, x + 16, y, 3);
      ctx.fillStyle = 'rgba(116,212,255,0.25)';
      ctx.fillRect(x, y + 16, right - x, 1);
    }
    function field(lab, text, x, right, y, size, color) {
      label(ctx, lab, x, y);
      value(ctx, text, x, right, y + size + 8, size, color);
    }
    section('PERSONAL INFORMATION', X1, R1, 262);
    section('MISSION INFORMATION', X2, R2, 262);

    field('NAME', up(p.name), X1, R1, 320, 38);
    field('AGE', p.age ? String(p.age) : '—', X1, R1, 410, 34);
    field('ORIGIN', up(p.origin), X1, R1, 500, 34);
    field('CALLSIGN', up(p.callsign), X1, R1, 590, 44, C.gold2);

    field('DESTINATION', up(dest.label), X2, R2, 320, 38);
    field('MISSION ROLE', up(role.label), X2, R2, 410, 34);
    field('MISSION', up(mission.label), X2, R2, 500, 34);
    field('DATE OF ISSUE', issued, X2, R2, 590, 34);

    /* mission class banner (full width of the data area) */
    const bx = X1, by = 676, bw = R2 - X1, bh = 96;
    ctx.save();
    rr(ctx, bx, by, bw, bh, 14);
    const bg = ctx.createLinearGradient(bx, by, bx + bw, by);
    bg.addColorStop(0, 'rgba(214,181,110,0.22)'); bg.addColorStop(1, 'rgba(214,181,110,0.04)');
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = 'rgba(214,181,110,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    label(ctx, 'MISSION CLASS', bx + 28, by + 34, C.gold);
    value(ctx, H.missionClass(p.dest, p.role), bx + 28, bx + bw - 28, by + 78, 36, C.gold2);

    /* issue block + entry stamp */
    kafBadge(ctx, X1 + 46, 866, 44, logos.kaf);
    const ix = X1 + 116, mid = ix + 330, IR = 1250;
    field('ISSUED AT', up(H.CONFIG.EVENT.name), ix, IR, 818, 26);
    field('DATES', up(H.CONFIG.EVENT.dates), ix, mid - 30, 888, 20);
    field('VENUE', up(H.CONFIG.EVENT.venue), mid, IR, 888, 20);
    entryStamp(ctx, 1405, 866, issued);

    if (opts.specimen) specimenMark(ctx);

    /* MRZ */
    const [l1, l2] = H.mrz(p);
    ctx.font = `500 34px ${MONO}`;
    ctx.fillStyle = 'rgba(238,242,250,0.88)';
    ctx.textAlign = 'center';
    const adv = (W - 140) / 44;
    [l1, l2].forEach((line, li) => {
      for (let i = 0; i < line.length; i++) ctx.fillText(line[i], 70 + adv * (i + 0.5), 1022 + li * 56);
    });
    ctx.textAlign = 'left';

    return canvas;
  };
})(window.HEMA);
