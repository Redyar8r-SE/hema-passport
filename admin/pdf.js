/* HEMA Space Passport — printable passport register (PDF, A4).
   Each page is drawn on a canvas (so Kurdish / Arabic names render correctly with the site's fonts),
   saved as JPEG and packed into a small hand-written PDF. No outside libraries. */
window.HEMA = window.HEMA || {};

(function (H) {
  'use strict';

  const DPI = 200;
  const MM = DPI / 25.4;                       // pixels per millimetre
  const PW = Math.round(210 * MM), PH = Math.round(297 * MM); // A4 portrait
  const C = {
    navy: '#0b1733', navy2: '#17295a', ink: '#14203d', text: '#3c4760', muted: '#7a8499', faint: '#b9c0cf',
    gold: '#b8914a', gold2: '#e9d3a0', goldDark: '#8a6a2e', paper: '#ffffff', card: '#fbf9f4', line: '#e7ddc6',
  };
  const SANS = '"Space Grotesk", "Noto Sans Arabic", system-ui, sans-serif';
  const MONO = '"IBM Plex Mono", ui-monospace, monospace';
  const PER_PAGE = 8;

  const mm = (v) => v * MM;
  const isRTL = (s) => /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(String(s || ''));
  const fullName = (r) => [r.first, r.second, r.third].filter(Boolean).join(' ');

  async function fontsReady() {
    if (!document.fonts) return;
    const want = ['700 40px "Space Grotesk"', '600 40px "Space Grotesk"', '500 40px "Space Grotesk"', '400 40px "Space Grotesk"',
      '500 20px "IBM Plex Mono"', '600 20px "IBM Plex Mono"'];
    try {
      await Promise.all([...want.map((f) => document.fonts.load(f)), document.fonts.load('700 40px "Noto Sans Arabic"', 'کوردی'), document.fonts.load('500 40px "Noto Sans Arabic"', 'کوردی')]);
    } catch (e) { /* system fonts */ }
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function spaced(ctx, text, x, y, spacing, align) {
    const chars = [...text];
    const width = chars.reduce((s, c) => s + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
    let cx = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    const prev = ctx.textAlign; ctx.textAlign = 'left';
    for (const c of chars) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + spacing; }
    ctx.textAlign = prev;
    return width;
  }
  // Draw text that fits maxW: shrink down to minSize, then cut with an ellipsis. Kurdish text is right-aligned to x + maxW.
  function fitText(ctx, text, x, y, maxW, size, minSize, weight, family, color) {
    text = String(text == null || text === '' ? '—' : text);
    const rtl = isRTL(text);
    let s = size;
    const setFont = () => { ctx.font = `${weight} ${s}px ${rtl ? '"Noto Sans Arabic", ' + family : family}`; };
    setFont();
    while (ctx.measureText(text).width > maxW && s > minSize) { s -= 1; setFont(); }
    let t = text;
    while (ctx.measureText(t).width > maxW && t.length > 1) t = t.slice(0, -2) + '…';
    ctx.save();
    ctx.fillStyle = color;
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = rtl ? 'right' : 'left';
    ctx.fillText(t, rtl ? x + maxW : x, y);
    ctx.restore();
  }

  // Like fitText, but uses up to two lines (split at a space) before cutting anything off.
  function fitText2(ctx, text, x, y, maxW, size, minSize, lineGap, weight, family, color) {
    text = String(text == null || text === '' ? '—' : text);
    const rtl = isRTL(text);
    const fam = rtl ? '"Noto Sans Arabic", ' + family : family;
    ctx.font = `${weight} ${minSize}px ${fam}`;
    if (ctx.measureText(text).width <= maxW || !/\s/.test(text.trim())) return fitText(ctx, text, x, y, maxW, size, minSize, weight, family, color);
    // best split point: the space that makes the longer line shortest
    const words = text.trim().split(/\s+/);
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
      const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
      if (!best || w < best.w) best = { a, b, w };
    }
    // both lines share one size, as large as possible (down to 60% of minSize) so the whole text fits
    let sz = minSize;
    const widest = () => { ctx.font = `${weight} ${sz}px ${fam}`; return Math.max(ctx.measureText(best.a).width, ctx.measureText(best.b).width); };
    while (widest() > maxW && sz > minSize * 0.6) sz -= 1;
    const gap = Math.max(lineGap * (sz / minSize), sz * 1.05);
    fitText(ctx, best.a, x, y - gap / 2, maxW, sz, sz * 0.9, weight, family, color);
    fitText(ctx, best.b, x, y + gap / 2, maxW, sz, sz * 0.9, weight, family, color);
  }

  function newPage() {
    const c = document.createElement('canvas');
    c.width = PW; c.height = PH;
    const ctx = c.getContext('2d');
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, PW, PH);
    ctx.textBaseline = 'alphabetic';
    return { c, ctx };
  }

  function stars(ctx, x, y, w, h, seed) {
    let a = seed >>> 0;
    const rand = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
    for (let i = 0; i < 260; i++) {
      const sx = x + rand() * w, sy = y + rand() * h, r = rand() < 0.92 ? rand() * 1.6 + 0.5 : rand() * 2.6 + 1.6;
      ctx.fillStyle = `rgba(230,238,255,${0.25 + rand() * 0.55})`;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function footer(ctx, page, pages) {
    const y = PH - mm(10);
    ctx.fillStyle = C.line; ctx.fillRect(mm(12), y - mm(5.5), PW - mm(24), 2);
    ctx.font = `500 ${mm(2.5)}px ${SANS}`; ctx.fillStyle = C.muted;
    ctx.textAlign = 'left';
    ctx.fillText('HEMA Astronomical Organization     Kurdistan Astronomy Festival 2026', mm(12), y);
    ctx.textAlign = 'right';
    ctx.fillText(`Page ${page} of ${pages}`, PW - mm(12), y);
    ctx.textAlign = 'left';
  }

  /* ---------- cover page ---------- */
  function coverPage(rows, withPhoto, logo, meta, pages) {
    const { c, ctx } = newPage();
    // navy band
    const bandH = mm(104);
    const g = ctx.createLinearGradient(0, 0, PW, bandH);
    g.addColorStop(0, C.navy2); g.addColorStop(1, C.navy);
    ctx.fillStyle = g; ctx.fillRect(0, 0, PW, bandH);
    stars(ctx, 0, 0, PW, bandH, 11);
    ctx.fillStyle = C.gold; ctx.fillRect(0, bandH, PW, mm(1.2));
    if (logo) {
      const L = mm(36);
      ctx.save(); ctx.shadowColor = 'rgba(58,143,208,0.55)'; ctx.shadowBlur = mm(6);
      ctx.drawImage(logo, (PW - L) / 2, mm(12), L, L); ctx.restore();
    }
    ctx.fillStyle = C.gold2; ctx.font = `600 ${mm(3.1)}px ${SANS}`;
    spaced(ctx, 'HEMA ASTRONOMICAL ORGANIZATION', PW / 2, mm(60), mm(0.9), 'center');
    ctx.fillStyle = '#ffffff'; ctx.font = `700 ${mm(11)}px ${SANS}`; ctx.textAlign = 'center';
    ctx.fillText('Passport Register', PW / 2, mm(75));
    ctx.fillStyle = '#c6cfe2'; ctx.font = `400 ${mm(3.8)}px ${SANS}`;
    ctx.fillText('Kurdistan Astronomy Festival 2026     25–26 September 2026     YouthHub, Erbil', PW / 2, mm(86));
    ctx.fillStyle = '#9fb0d0'; ctx.font = `400 ${mm(2.8)}px ${SANS}`;
    ctx.fillText(`Generated ${meta.generated}${meta.by ? '   by ' + meta.by : ''}`, PW / 2, mm(96));
    ctx.textAlign = 'left';

    // summary tiles
    const ages = rows.map((r) => r.age).filter(Boolean);
    const dates = rows.map((r) => r.createdAt).filter(Boolean).sort();
    const fmt = (iso) => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    const tiles = [
      ['Passports issued', String(rows.length)],
      ['With photo', String(withPhoto)],
      ['Average age', ages.length ? (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1).replace(/\.0$/, '') : '—'],
      ['Issue dates', dates.length ? (fmt(dates[0]) === fmt(dates[dates.length - 1]) ? fmt(dates[0]) : fmt(dates[0]) + ' – ' + fmt(dates[dates.length - 1])) : '—'],
    ];
    const tx = mm(12), ty = mm(118), tw = (PW - mm(24) - mm(3) * 3) / 4, th = mm(26);
    ctx.fillStyle = C.ink; ctx.font = `700 ${mm(4.6)}px ${SANS}`; ctx.fillText('Summary', tx, ty - mm(4));
    tiles.forEach(([label, value], i) => {
      const x = tx + i * (tw + mm(3));
      ctx.fillStyle = C.card; rr(ctx, x, ty, tw, th, mm(2.5)); ctx.fill();
      ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = C.gold; ctx.fillRect(x + mm(2.5), ty, tw - mm(5), mm(0.9));
      ctx.fillStyle = C.muted; ctx.font = `600 ${mm(2.3)}px ${SANS}`; spaced(ctx, label.toUpperCase(), x + mm(4), ty + mm(7.5), mm(0.35));
      fitText(ctx, value, x + mm(4), ty + mm(19), tw - mm(8), i === 3 ? mm(4.2) : mm(8.5), mm(3), 700, SANS, C.navy);
    });

    // breakdowns
    const panel = (title, labels, values, x, y, w) => {
      const counts = labels.map(() => 0);
      values.forEach((v) => { if (counts[v] != null) counts[v]++; });
      const items = labels.map((label, i) => ({ label, n: counts[i] })).sort((a, b) => b.n - a.n);
      const max = Math.max(1, ...items.map((i) => i.n));
      const h = mm(16) + items.length * mm(8.2);
      ctx.fillStyle = C.card; rr(ctx, x, y, w, h, mm(2.5)); ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = C.ink; ctx.font = `700 ${mm(4)}px ${SANS}`; ctx.fillText(title, x + mm(5), y + mm(9));
      items.forEach((it, i) => {
        const ly = y + mm(17) + i * mm(8.2);
        ctx.fillStyle = C.text; ctx.font = `500 ${mm(3)}px ${SANS}`; ctx.fillText(it.label, x + mm(5), ly + mm(1));
        const bx = x + mm(38), bw = w - mm(38) - mm(14);
        ctx.fillStyle = '#efe9da'; rr(ctx, bx, ly - mm(2), bw, mm(3), mm(1)); ctx.fill();
        if (it.n) { ctx.fillStyle = C.gold; rr(ctx, bx, ly - mm(2), Math.max(mm(1.5), bw * it.n / max), mm(3), mm(1)); ctx.fill(); }
        ctx.fillStyle = C.ink; ctx.font = `600 ${mm(3)}px ${MONO}`; ctx.textAlign = 'right';
        ctx.fillText(String(it.n), x + w - mm(5), ly + mm(1)); ctx.textAlign = 'left';
      });
      return h;
    };
    const py = mm(160), pw = (PW - mm(24) - mm(5)) / 2;
    ctx.fillStyle = C.ink; ctx.font = `700 ${mm(4.6)}px ${SANS}`; ctx.fillText('Choices', mm(12), py - mm(4));
    panel('Destinations', H.DESTINATIONS.map((d) => d.label), rows.map((r) => r.dest), mm(12), py, pw);
    panel('Mission roles', H.ROLES.map((r) => r.label), rows.map((r) => r.role), mm(12) + pw + mm(5), py, pw);

    footer(ctx, 1, pages);
    return c;
  }

  /* ---------- passport card pages ---------- */
  function listPage(slice, startIndex, photos, logo, page, pages) {
    const { c, ctx } = newPage();
    // header strip
    if (logo) ctx.drawImage(logo, mm(12), mm(8), mm(12), mm(12));
    ctx.fillStyle = C.ink; ctx.font = `700 ${mm(5)}px ${SANS}`; ctx.fillText('Passport Register', mm(27), mm(15.2));
    ctx.fillStyle = C.muted; ctx.font = `500 ${mm(2.6)}px ${SANS}`; ctx.fillText('HEMA Space Passport     Kurdistan Astronomy Festival 2026', mm(27), mm(19.5));
    ctx.textAlign = 'right'; ctx.fillStyle = C.goldDark; ctx.font = `600 ${mm(2.8)}px ${MONO}`;
    ctx.fillText(`${startIndex + 1}–${startIndex + slice.length}`, PW - mm(12), mm(15.2)); ctx.textAlign = 'left';
    ctx.fillStyle = C.gold; ctx.fillRect(mm(12), mm(23.5), PW - mm(24), mm(0.6));

    const cols = 2, gapX = mm(6), gapY = mm(5);
    const top = mm(29), left = mm(12);
    const cw = (PW - mm(24) - gapX) / cols;
    const ch = (PH - top - mm(17) - gapY * 3) / 4;
    slice.forEach((r, i) => {
      const x = left + (i % cols) * (cw + gapX), y = top + Math.floor(i / cols) * (ch + gapY);
      // card
      ctx.save(); ctx.shadowColor = 'rgba(20,32,61,0.08)'; ctx.shadowBlur = mm(2); ctx.shadowOffsetY = mm(0.6);
      ctx.fillStyle = C.card; rr(ctx, x, y, cw, ch, mm(3)); ctx.fill(); ctx.restore();
      ctx.strokeStyle = C.line; ctx.lineWidth = 2; rr(ctx, x, y, cw, ch, mm(3)); ctx.stroke();
      ctx.save(); rr(ctx, x, y, cw, ch, mm(3)); ctx.clip(); ctx.fillStyle = C.gold; ctx.fillRect(x, y, mm(1.3), ch); ctx.restore();

      // photo (3:4)
      const ph = ch - mm(10), pw = ph * 0.75, px = x + mm(5), py = y + mm(5);
      ctx.save(); rr(ctx, px, py, pw, ph, mm(2)); ctx.clip();
      const img = photos.get(r.id);
      if (img) {
        const s = Math.max(pw / img.width, ph / img.height);
        ctx.drawImage(img, px + (pw - img.width * s) / 2, py + (ph - img.height * s) / 2, img.width * s, img.height * s);
      } else {
        const g = ctx.createLinearGradient(px, py, px, py + ph); g.addColorStop(0, C.navy2); g.addColorStop(1, C.navy);
        ctx.fillStyle = g; ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = 'rgba(233,211,160,0.6)'; ctx.lineWidth = mm(0.4);
        ctx.beginPath(); ctx.arc(px + pw / 2, py + ph * 0.45, pw * 0.3, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = C.gold2; ctx.font = `700 ${pw * 0.34}px ${SANS}`; ctx.textAlign = 'center';
        ctx.fillText([...(r.callsign || r.first || 'H')][0].toUpperCase(), px + pw / 2, py + ph * 0.45 + pw * 0.12);
        ctx.font = `500 ${mm(2)}px ${SANS}`; ctx.fillStyle = 'rgba(233,211,160,0.75)';
        ctx.fillText('NO PHOTO', px + pw / 2, py + ph - mm(3)); ctx.textAlign = 'left';
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(184,145,74,0.55)'; ctx.lineWidth = 2; rr(ctx, px, py, pw, ph, mm(2)); ctx.stroke();

      // details
      const dx = px + pw + mm(4.5), dw = x + cw - mm(4.5) - dx;
      ctx.fillStyle = C.goldDark; ctx.font = `600 ${mm(2.6)}px ${MONO}`;
      ctx.fillText(`#${startIndex + i + 1}  ${H.CONFIG.NUMBER_PREFIX}${r.serial}`, dx, y + mm(8.5));
      fitText2(ctx, fullName(r), dx, y + mm(14.6), dw, mm(4.6), mm(3.2), mm(4), 700, SANS, C.navy);
      ctx.fillStyle = C.line; ctx.fillRect(dx, y + mm(18.6), dw, 2);
      const when = new Date(r.createdAt);
      const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const pad = (n) => String(n).padStart(2, '0');
      const issuedText = Number.isNaN(when.getTime()) ? H.formatDate(r.issued)
        : `${pad(when.getDate())} ${MON[when.getMonth()]} ${when.getFullYear()}  ${pad(when.getHours())}:${pad(when.getMinutes())}`;
      const rowsData = [
        ['Age', r.age],
        ['From', r.origin],
        ['Callsign', r.callsign],
        ['Destination', (H.DESTINATIONS[r.dest] || {}).label],
        ['Role', (H.ROLES[r.role] || {}).label],
        ['Mission', (H.MISSIONS[r.mission] || {}).label],
        ['Issued', issuedText],
      ];
      const step = (ch - mm(24)) / rowsData.length;
      rowsData.forEach(([label, value], k) => {
        const ly = y + mm(23.5) + k * step;
        ctx.fillStyle = C.muted; ctx.font = `600 ${mm(2.1)}px ${SANS}`; spaced(ctx, label.toUpperCase(), dx, ly, mm(0.25));
        fitText2(ctx, value, dx + mm(17), ly, dw - mm(17), mm(2.9), mm(2.3), mm(2.6), 500, SANS, C.ink);
      });
    });
    footer(ctx, page, pages);
    return c;
  }

  /* ---------- minimal PDF writer (one full-page JPEG per page) ---------- */
  async function toJpeg(canvas) {
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    return new Uint8Array(await blob.arrayBuffer());
  }
  function buildPdf(images, title) {
    const enc = new TextEncoder();
    const parts = []; let offset = 0; const offsets = [];
    const push = (d) => { const b = typeof d === 'string' ? enc.encode(d) : d; parts.push(b); offset += b.length; };
    const obj = (n, write) => { offsets[n] = offset; push(`${n} 0 obj\n`); write(); push('\nendobj\n'); };
    const W = 595.28, Hh = 841.89; // A4 in points
    push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // %PDF-1.4 + binary marker
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push(`<< /Type /Pages /Kids [${images.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${images.length} >>`));
    images.forEach((im, i) => {
      const p = 3 + i * 3;
      obj(p, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${Hh}] /Resources << /XObject << /Im${i} ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`));
      const content = `q ${W} 0 0 ${Hh} 0 0 cm /Im${i} Do Q`;
      obj(p + 1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
      obj(p + 2, () => {
        push(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n`);
        push(im.data); push('\nendstream');
      });
    });
    const info = 3 + images.length * 3;
    const safe = (s) => s.replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, '');
    obj(info, () => push(`<< /Title (${safe(title)}) /Author (HEMA Astronomical Organization) /Creator (HEMA Space Passport) >>`));
    const xref = offset;
    let table = `xref\n0 ${info + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= info; n++) table += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
    push(table + `trailer\n<< /Size ${info + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  /**
   * rows: admin rows (oldest first is best for a register). photos: Map(id → data URL).
   * onProgress(fraction 0..1). Returns a PDF Blob.
   */
  H.buildPassportPdf = async function (rows, photos, opts) {
    opts = opts || {};
    await fontsReady();
    const logo = opts.logo || null;
    const imgs = new Map();
    await Promise.all([...photos].map(async ([id, src]) => { if (/^data:image\/jpeg;base64,/.test(src)) { const im = await H.loadImage(src); if (im) imgs.set(id, im); } }));
    const listPages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
    const pages = 1 + (rows.length ? listPages : 0);
    const meta = { generated: new Date().toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), by: opts.by || '' };
    const images = [];
    const add = async (canvas) => { images.push({ data: await toJpeg(canvas), w: canvas.width, h: canvas.height }); canvas.width = canvas.height = 0; };
    await add(coverPage(rows, imgs.size, logo, meta, pages));
    if (opts.onProgress) opts.onProgress(1 / pages);
    if (rows.length) {
      for (let p = 0; p < listPages; p++) {
        const slice = rows.slice(p * PER_PAGE, (p + 1) * PER_PAGE);
        await add(listPage(slice, p * PER_PAGE, imgs, logo, p + 2, pages));
        if (opts.onProgress) opts.onProgress((p + 2) / pages);
        await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
      }
    }
    return buildPdf(images, 'HEMA Space Passport register');
  };
})(window.HEMA);
