/* ASCII layer of the page: the hero portrait (photo -> characters, LED visor, orbit),
   the chapter scenes and the terminal panels. No dependencies. */

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const RAMP = ' .,:;-=+/<>{}[]#0@';             // light -> dark, drawn from log and terminal glyphs
const NOISE = '01<>/\\[]{}#*+=?!';
const rnd = s => NOISE[(Math.random() * NOISE.length) | 0] ?? s;
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';

// one shared pause switch: the hero's button stops every loop on the page
const loops = new Set();
let paused = false;
export function setPaused(p) { paused = p; loops.forEach(l => l.sync()); }

function loop(el, frame) {
  let raf = 0, seen = false, t0 = performance.now();
  const tick = now => { frame(now - t0); raf = requestAnimationFrame(tick); };
  const L = {
    sync() {
      const run = seen && !paused && !document.hidden && !reduced();
      if (run && !raf) raf = requestAnimationFrame(tick);
      if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
    },
  };
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; L.sync(); }).observe(el);
  document.addEventListener('visibilitychange', L.sync);
  loops.add(L);
  return L;
}

function fit(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}

/* ---------- hero portrait ---------- */

export function portrait(canvas, src) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  let S = null;                                   // the built state for the current size
  const mouse = { x: -1e4, y: -1e4, on: false };
  // the ring carries the page's own facts, in the page's language (data-orbit)
  const ORBIT = (canvas.dataset.orbit || '9 years of L2/L3 support · zero SLA breaches · ') + ' ';

  function build() {
    const { ctx, w, h } = fit(canvas);
    const wide = w >= 1024;
    const font = wide ? 11 : 8;
    ctx.font = `${font}px ${MONO}`;
    const cw = ctx.measureText('M').width, ch = Math.round(font * 1.12);
    const top = wide ? (parseFloat(css('--nav')) || 72) + 8 : 8;
    const ph = h - top - (wide ? 150 : 8);        // ends above the facts row on a desktop
    const VMAX = 0.84;                            // draw the head and neck only, so the head is larger
    const fh = ph / VMAX;                         // the height the whole photograph would take
    const pw = fh * img.width / img.height;
    const cx = wide ? w * 0.68 : w / 2;
    const px = cx - pw / 2;
    const cols = Math.floor(pw / cw), rows = Math.floor(ph / ch);

    // sample the photograph at one pixel per cell
    const off = document.createElement('canvas');
    off.width = cols; off.height = rows;
    const o = off.getContext('2d', { willReadFrequently: true });
    o.drawImage(img, 0, 0, img.width, img.height * VMAX, 0, 0, cols, rows);
    const d = o.getImageData(0, 0, cols, rows).data;
    const L = new Float32Array(cols * rows);
    for (let i = 0; i < L.length; i++) L[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;

    const cells = [];                             // {x,y,c,col,t0,kind}
    const V = { u0: 0.245, u1: 0.745, v0: 0.29, v1: 0.43 };   // the visor, in photo units
    const inVisor = (u, v) => {
      const nx = (u - (V.u0 + V.u1) / 2) / ((V.u1 - V.u0) / 2), ny = (v - (V.v0 + V.v1) / 2) / ((V.v1 - V.v0) / 2);
      return Math.pow(Math.abs(nx), 4) + Math.pow(Math.abs(ny), 4) < 1;
    };
    const head = (u, v) => ((u - 0.49) / 0.255) ** 2 + ((v - 0.36) / 0.31) ** 2;
    const body = (u, v) => v > 0.6 && Math.abs(u - 0.5) < 0.16 + (v - 0.6) * 1.6;
    // stretch the face's own range: the wall and the skin are close in brightness
    const inFace = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (head(c / cols, r / rows * VMAX) < 1) inFace.push(L[r * cols + c]);
    inFace.sort((a, b) => a - b);
    const lo = inFace[Math.floor(inFace.length * 0.04)] ?? 0, hi = inFace[Math.floor(inFace.length * 0.9)] ?? 1;

    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const u = c / cols, v = r / rows * VMAX, i = r * cols + c;
      const x = px + c * cw, y = top + r * ch;
      const t0 = 150 + v * 900 + Math.random() * 450;
      if (inVisor(u, v)) { cells.push({ x, y, u, v, kind: 'visor', t0 }); continue; }

      // helmet shell: a segmented ring over the top of the head, glyph follows the tangent
      const a = Math.atan2((v - 0.355) / 0.345, (u - 0.49) / 0.3);
      const rr = Math.hypot((u - 0.49) / 0.3, (v - 0.355) / 0.345);
      if (v < 0.47 && Math.abs(rr - 1) < 0.035 && Math.sin(a * 14) > -0.55) {
        const tang = a + Math.PI / 2, k = ((tang % Math.PI) + Math.PI) % Math.PI;
        const g = k < 0.39 || k > 2.75 ? '-' : k < 1.18 ? '\\' : k < 1.96 ? '|' : '/';
        cells.push({ x, y, u, v, kind: 'ink', c: g, t0 }); continue;
      }
      if (v < 0.45 && Math.abs(rr - 0.93) < 0.02) { cells.push({ x, y, u, v, kind: 'mute', c: '.', t0 }); continue; }
      // ear pods with a light
      const pu = [0.235, 0.745].find(p => Math.abs(u - p) < 0.03);
      if (pu !== undefined && v > 0.38 && v < 0.5) {
        const side = Math.abs(u - pu) > 0.022, edge = side || v < 0.388 || v > 0.49;
        cells.push({ x, y, u, v, kind: edge ? 'ink' : 'pod', c: edge ? (side ? '|' : '=') : '#', t0 });
        continue;
      }
      // antenna and cable
      if (v > 0.12 && v < 0.38 && Math.abs(u - (0.235 - (0.38 - v) * 0.3)) < 0.008) { cells.push({ x, y, u, v, kind: 'ink', c: '/', t0 }); continue; }
      if (v > 0.5 && Math.abs(u - (0.745 + (v - 0.5) ** 2 * 0.5)) < 0.009) { cells.push({ x, y, u, v, kind: 'cable', c: '|', t0 }); continue; }

      // the face: darkness plus edges, kept inside the head and shoulders
      let m = head(u, v) < 1 ? 1 : body(u, v) ? 1 : head(u, v) < 1.15 ? 0.5 : 0;
      if (v > 0.7) m *= clamp(1 - (v - 0.7) / 0.14);  // the neck dissolves before the bottom edge
      if (!m) continue;
      const n = clamp((L[i] - lo) / (hi - lo || 1));
      const at = k => clamp(((L[k] ?? L[i]) - lo) / (hi - lo || 1));
      const edge = Math.hypot(at(i + 1) - at(i - 1), at(i + cols) - at(i - cols));
      const dk = clamp(Math.pow(1 - n, 1.6) + edge * 0.5) * m;
      if (m < 1 && Math.random() > m) continue;
      const g = RAMP[Math.round(dk * (RAMP.length - 1))];
      if (g !== ' ') cells.push({ x, y, u, v, kind: dk > 0.62 ? 'ink' : 'soft', c: g, t0 });
    }

    // visor grid
    const vis = cells.filter(c => c.kind === 'visor');
    const vx0 = Math.min(...vis.map(c => c.x)), vx1 = Math.max(...vis.map(c => c.x)) + cw;
    const vy0 = Math.min(...vis.map(c => c.y)), vy1 = Math.max(...vis.map(c => c.y)) + ch;

    // the ground: a field of dots that drifts like cloud, redrawn ten times a second into its own bitmap
    const field = document.createElement('canvas');
    field.width = canvas.width; field.height = canvas.height;

    S = { ctx, w, h, wide, font, cw, ch, top, px, pw, ph, fh, cols, rows, cells, vis, vx0, vx1, vy0, vy1, field, fieldT: -1e9,
      hc: { x: px + pw * 0.49, y: top + fh * 0.36 }, base: null, settled: false };
  }

  function colors() {
    return { ink: css('--p-ink') || '#0b0c0e', bg: css('--p-bg') || '#eef0f3', mute: css('--p-muted') || '#5d6470', acc: css('--p-accent') || '#1f2de6' };
  }

  // eyes on the LED visor: u,v in 0..1 of the visor; returns 0..1 lit
  function eyes(u, v, t, look, mood) {
    const blink = (t % 4200) < 140 ? 0.12 : 1;
    let lit = 0;
    for (const ex of [0.29, 0.71]) {
      const cx = ex + look.x * 0.05, cy = 0.5 + look.y * 0.14;
      const dx = (u - cx) / 0.085, dy = (v - cy) / (0.3 * blink);
      if (mood === 'happy') {                     // an upturned arc: ^ ^
        const arc = Math.abs(Math.hypot(dx * 0.9, (v - cy - 0.2) / 0.3) - 1) < 0.28 && v < cy + 0.2;
        if (arc) lit = 1;
      } else if (dx * dx + dy * dy < 1) lit = Math.abs(dx) > 0.55 || Math.abs(dy) > 0.6 ? 0.7 : 1;
    }
    return lit;
  }

  // flowing cloud of dots behind the portrait: clear of the words on the left, of the head, and of the facts row
  function drawField(T, C) {
    const f = S.field, x0 = f.getContext('2d'), { w, h, wide, hc, pw, ph, top } = S;
    x0.setTransform(f.width / w, 0, 0, f.height / h, 0, 0);
    x0.clearRect(0, 0, w, h);
    const gx = wide ? 13 : 10, gy = wide ? 15 : 12, fs = wide ? 11 : 9;
    x0.font = `${fs}px ${MONO}`; x0.textBaseline = 'top'; x0.fillStyle = C.acc;
    const G = ' ··::+*';
    for (let y = top; y < h; y += gy) for (let x = (y / gy % 2) * gx / 2; x < w; x += gx) {
      // a faint texture under the words, full strength from the middle of the screen
      let a = wide ? (0.16 + 0.84 * clamp((x - w * 0.46) / (w * 0.12))) * clamp((h - 150 - y) / 90) : clamp((h - y) / 60);
      const e = ((x - hc.x) / (pw * 0.4)) ** 2 + ((y - (top + ph * 0.44)) / (ph * 0.56)) ** 2;
      a *= clamp((e - 0.8) / 0.3);
      if (a <= 0.02) continue;
      const n = 0.5 + 0.28 * Math.sin(x * 0.011 + T * 0.00022) * Math.cos(y * 0.016 - T * 0.00017)
        + 0.22 * Math.sin((x * 0.55 + y) * 0.009 + T * 0.0003);
      const k = Math.floor(clamp((n - 0.42) / 0.5) * (G.length - 1));
      if (!k) continue;
      x0.globalAlpha = a * (0.2 + k * 0.08);
      x0.fillText(G[k], x, y);
    }
    x0.globalAlpha = 1;
  }

  function draw(t) {
    if (!S) return;
    const { ctx, w, h, cw, ch, font } = S, C = colors();
    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = 'top';
    const still = reduced() || paused;
    const T = still ? 1e9 : t;

    if (T - S.fieldT > 100 || T < S.fieldT) { drawField(T, C); S.fieldT = T; }
    ctx.drawImage(S.field, 0, 0, w, h);

    // orbit, back half (drawn before the face)
    const orbit = front => {
      // on a desktop the ring stays clear of the words on the left half
      const rx = S.wide ? clamp(S.hc.x - (w * 0.5 + 24), 150, S.pw * 0.6) : S.pw * 0.62, ry = S.pw * 0.12, tilt = -0.2;
      const n = ORBIT.length;
      const ring = 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2);
      const fs = Math.min(font + 1, ring / n / 0.62);   // the whole sentence fits once round the ring
      for (let k = 0; k < n; k++) {
        // k runs against the angle, so the front half reads left to right; the ring turns like a ticker
        const th = T / 9000 - k / n * Math.PI * 2;
        const z = Math.sin(th);
        if ((z > 0) !== front) continue;
        const ox = Math.cos(th) * rx, oy = z * ry;
        const x = S.hc.x + ox * Math.cos(tilt) - oy * Math.sin(tilt);
        const y = S.hc.y + 0.1 * S.fh + ox * Math.sin(tilt) + oy * Math.cos(tilt);
        const size = fs * (1 + z * 0.3);
        ctx.font = `${size}px ${MONO}`;
        const g = ORBIT[k % ORBIT.length];
        if (front && g !== ' ') { ctx.globalAlpha = 1; ctx.fillStyle = C.bg; ctx.fillRect(x - 1, y - 1, size * 0.62 + 2, size + 2); }   // knock the face out behind a front letter
        ctx.globalAlpha = front ? 1 : 0.3;
        ctx.fillStyle = front ? C.acc : C.mute;
        ctx.fillText(g, x, y);
      }
      ctx.globalAlpha = 1;
      ctx.font = `${font}px ${MONO}`;
    };
    orbit(false);

    // face and helmet: live while decoding, then from one cached bitmap
    const intro = !S.settled;
    if (intro) {
      let all = true;
      for (const c of S.cells) {
        if (c.kind === 'visor') continue;
        if (T < c.t0) { all = false; if (T > c.t0 - 320) { ctx.fillStyle = C.acc; ctx.fillText(rnd(), c.x, c.y); } continue; }
        ctx.fillStyle = c.kind === 'soft' ? C.mute : c.kind === 'mute' ? C.mute : c.kind === 'cable' ? C.ink : c.kind === 'pod' ? C.ink : C.ink;
        ctx.fillText(c.c, c.x, c.y);
      }
      if (all) {
        const b = document.createElement('canvas');
        b.width = canvas.width; b.height = canvas.height;
        const bx = b.getContext('2d');
        bx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
        bx.font = `${font}px ${MONO}`; bx.textBaseline = 'top';
        for (const c of S.cells) {
          if (c.kind === 'visor') continue;
          bx.fillStyle = c.kind === 'soft' || c.kind === 'mute' ? C.mute : C.ink;
          bx.fillText(c.c, c.x, c.y);
        }
        S.base = b; S.settled = true;
      }
    } else ctx.drawImage(S.base, 0, 0, w, h);

    // the cursor: cells near it scramble, turn blue and step aside
    if (mouse.on && !still) {
      const R = S.wide ? 90 : 60;
      for (const c of S.cells) {
        if (c.kind === 'visor') continue;
        const dx = c.x - mouse.x, dy = c.y - mouse.y, dd = Math.hypot(dx, dy);
        if (dd > R) continue;
        const f = 1 - dd / R;
        ctx.fillStyle = C.bg; ctx.fillRect(c.x - 1, c.y - 1, cw + 2, ch + 2);
        ctx.fillStyle = f > 0.35 ? C.acc : C.ink;
        ctx.fillText(Math.random() < f * 0.6 ? rnd() : c.c, c.x + dx / dd * f * 7 || c.x, c.y + dy / dd * f * 7 || c.y);
      }
    }

    // a glitch band every few seconds
    const gp = T % 2900;
    if (!intro && gp < 130) {
      const r0 = S.top + ((Math.floor(T / 2900) * 7919) % S.rows) * ch;
      ctx.fillStyle = C.bg; ctx.fillRect(S.px, r0, S.pw, ch * 2);
      ctx.fillStyle = C.acc;
      for (const c of S.cells) if (c.y >= r0 && c.y < r0 + ch * 2 && c.kind !== 'visor') ctx.fillText(c.c ?? '', c.x + cw * 3, c.y);
    }

    // pod lights and the pulse down the cable
    const blinkOn = (T % 1600) < 900;
    ctx.fillStyle = C.acc;
    for (const c of S.cells) {
      if (c.kind === 'pod' && blinkOn && Math.abs(c.v - 0.44) < 0.012) ctx.fillText('o', c.x, c.y);
      if (c.kind === 'cable' && Math.abs(c.v - (0.5 + ((T / 2600) % 1) * 0.5)) < 0.02) { ctx.fillStyle = C.bg; ctx.fillRect(c.x, c.y, cw, ch); ctx.fillStyle = C.acc; ctx.fillText('*', c.x, c.y); }
    }
    // antenna tip
    if (blinkOn) {
      const tx = S.px + S.pw * (0.235 - 0.26 * 0.3), ty = S.top + S.fh * 0.11;
      ctx.fillText('@', tx - cw / 2, ty - ch / 2);
    }

    // the visor: dark glass with an LED grid
    const { vx0, vx1, vy0, vy1 } = S;
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.roundRect(vx0 - 2, vy0 - 2, vx1 - vx0 + 4, vy1 - vy0 + 4, ch * 1.6); ctx.fill();
    const look = { x: 0, y: 0 };
    if (mouse.on) { look.x = clamp((mouse.x - S.hc.x) / (w * 0.35), -1, 1); look.y = clamp((mouse.y - (vy0 + vy1) / 2) / (h * 0.4), -1, 1); }
    else if (!still) { look.x = Math.sin(T / 1700) * 0.6; look.y = Math.sin(T / 2300) * 0.3; }
    const near = mouse.on && Math.hypot(mouse.x - S.hc.x, mouse.y - S.hc.y) < S.pw * 0.35;
    const mood = near || (T % 11000) > 9200 ? 'happy' : 'open';
    const scan = ((T / 1800) % 1.4) - 0.2;
    const live = !intro || T > 900;
    for (const c of S.vis) {
      const u = (c.x - vx0) / (vx1 - vx0), v = (c.y - vy0) / (vy1 - vy0);
      const lit = live ? eyes(u, v, T, look, mood) : 0;
      if (lit) {
        ctx.fillStyle = C.acc; ctx.globalAlpha = 1;
        ctx.fillStyle = '#5b72ff';
        ctx.fillText('■', c.x, c.y);
      } else {
        ctx.globalAlpha = Math.abs(u - scan) < 0.04 ? 0.9 : 0.28;
        ctx.fillStyle = '#5b72ff';
        ctx.fillText('·', c.x, c.y);
      }
    }
    ctx.globalAlpha = 1;
    orbit(true);
  }

  const L = loop(canvas, draw);
  // if frames never come (a hidden tab, a screenshot tool), the face still settles
  const rebuild = () => { if (img.complete && img.naturalWidth) { build(); draw(reduced() || paused ? 1e9 : 0); L.sync(); setTimeout(() => { if (!S.settled) draw(5000); }, 2200); } };
  img.onload = rebuild;
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(rebuild, 150); });
  const hero = canvas.closest('section') || canvas;
  hero.addEventListener('pointermove', e => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.on = true; });
  hero.addEventListener('pointerleave', () => { mouse.on = false; });
  L.redraw = () => draw(1e9);
  return L;
}

/* ---------- chapter scenes: one density field per job, drawn as characters ---------- */

const SCENES = {
  // voice AI: a call waveform with rings from the speaker
  voice(u, v, t) {
    const env = Math.exp(-((u - 0.5) ** 2) / 0.09);
    const amp = 0.28 * env * (0.55 + 0.45 * Math.sin(u * 23 + t * 3.1) * Math.sin(u * 7 - t * 1.7));
    const bar = Math.abs(v - 0.5) < Math.abs(amp) && (Math.floor(u * 64) % 2 === 0) ? 1 : 0;
    const ring = Math.max(0, Math.sin(Math.hypot(u - 0.5, (v - 0.5) * 0.75) * 40 - t * 4)) * 0.22;
    return Math.max(bar, ring * (1 - env * 0.6));
  },
  // a match-three board: tiles of four shapes that pop in turn
  game(u, v, t) {
    const gx = 8, gy = 6, cx = Math.floor(u * gx), cy = Math.floor(v * gy);
    const lu = (u * gx % 1) - 0.5, lv = (v * gy % 1) - 0.5;
    const id = (cx * 7 + cy * 13 + Math.floor(t / 2.8) * (cx === (Math.floor(t / 0.7) % gx) ? 3 : 0)) % 4;
    const pop = cx === (Math.floor(t * 1.4) % gx) && cy === ((Math.floor(t * 1.4) * 5) % gy) ? 1.25 - (t * 1.4 % 1) * 0.5 : 1;
    const s = 0.34 * pop, x = lu, y = lv * 1.1;
    const inside = id === 0 ? Math.hypot(x, y) < s : id === 1 ? Math.abs(x) + Math.abs(y) < s * 1.25
      : id === 2 ? Math.max(Math.abs(x), Math.abs(y)) < s * 0.85 : (y > -s && Math.abs(x) < (y + s) * 0.6);
    return inside ? (id === 0 ? 0.95 : id === 1 ? 0.7 : id === 2 ? 0.5 : 0.85) : 0.04;
  },
  // a turning globe with Novi Sad marked
  globe(u, v, t, ar) {
    const x = (u - 0.5) * ar, y = v - 0.5, R = 0.42, rr = Math.hypot(x, y);
    if (rr > R) return Math.abs(rr - R - 0.03) < 0.006 ? 0.3 : 0;
    const z = Math.sqrt(R * R - rr * rr), rot = t * 0.25;
    const lat = -Math.asin(y / R), lon = Math.atan2(x, z) + rot;
    const pin = Math.hypot(lat - 0.79, Math.atan2(Math.sin(lon - 0.35), Math.cos(lon - 0.35)));
    if (pin < 0.07) return 1;
    if (pin < 0.16 && Math.sin(t * 5) > 0) return 0.75;
    const grid = Math.abs(Math.sin(lat * 6)) < 0.07 || Math.abs(Math.sin(lon * 6)) < 0.07 ? 0.55 : 0;
    return Math.max(grid, 0.08 + 0.18 * (z / R));
  },
  // the tools: four stations on one line, pulses run from monitoring to code
  network(u, v, t, ar) {
    const y = (v - 0.5);
    let d = Math.abs(y) < 0.025 && Math.floor(u * 140) % 2 === 0 ? 0.35 : 0;
    for (const nx of [0.115, 0.372, 0.628, 0.885]) {
      const r = Math.hypot((u - nx) * ar, y);
      if (r < 0.2) d = Math.max(d, 0.95);
      else if (Math.abs(r - 0.32) < 0.03) d = Math.max(d, 0.4);
    }
    for (let k = 0; k < 3; k++) {
      const pu = 0.115 + (((t * 0.22 + k / 3) % 1) * 0.77);
      const r = Math.hypot((u - pu) * ar, y);
      if (r < 0.14) d = Math.max(d, 1 - r * 3);
    }
    return d;
  },
  // monitoring: a latency line that scrolls left, a spike crosses the alert line
  monitor(u, v, t) {
    const x = u * 6 + t * 0.6;
    let y = 0.62 - 0.08 * Math.sin(x * 2.1) - 0.05 * Math.sin(x * 5.3 + 1);
    const sp = ((x % 6) + 6) % 6;
    if (sp > 3.6 && sp < 4.2) y -= 0.38 * Math.sin((sp - 3.6) / 0.6 * Math.PI);
    const line = Math.abs(v - y) < 0.022 ? 1 : 0;
    const area = v > y ? 0.12 : 0;
    const alert = Math.abs(v - 0.34) < 0.008 && (Math.floor(u * 60) % 3 !== 0) ? 0.45 : 0;
    const grid = Math.floor(u * 60) % 10 === 0 && v > 0.15 ? 0.08 : 0;
    return Math.max(line, area, alert, grid);
  },
};

const LEDGER = [
  'TX 41207  card top-up       350.00  ok',
  'TX 41208  metro fare         60.00  ok',
  'TX 41209  card top-up      1200.00  ok',
  'TX 41210  bus fare           60.00  FAILED',
  'TX 41211  card top-up       500.00  ok',
  'TX 41212  metro fare         60.00  ok',
  'TX 41213  refund            -60.00  ok',
  'TX 41214  card top-up       300.00  ok',
];

export function scene(canvas, kind) {
  let S = null;
  const build = () => {
    const { ctx, w, h } = fit(canvas);
    const font = w > 420 ? 11 : 9;
    ctx.font = `${font}px ${MONO}`;
    const cw = ctx.measureText('M').width, ch = Math.round(font * 1.2);
    S = { ctx, w, h, font, cw, ch, cols: Math.floor(w / cw), rows: Math.floor(h / ch) };
  };
  const draw = ms => {
    if (!S) return;
    const { ctx, w, h, font, cw, ch, cols, rows } = S, t = ms / 1000;
    const ink = css('--p-accent') || '#1f2de6', bg = css('--p-surface') || '#e2e5ea', text = css('--p-ink');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.font = `${font}px ${MONO}`; ctx.textBaseline = 'top';
    const ox = (w - cols * cw) / 2, oy = (h - rows * ch) / 2;
    if (kind === 'ledger') {
      const shift = (t * 0.9) % LEDGER.length, pad = Math.max(1, Math.floor((cols - 40) / 2));
      for (let r = 1; r < rows - 1; r++) {
        const k = Math.floor(r / 2 + shift) % LEDGER.length;
        if (r % 2) continue;
        const line = LEDGER[k], bad = line.endsWith('FAILED');
        ctx.fillStyle = bad ? ink : text; ctx.globalAlpha = bad ? 1 : 0.55;
        if (bad) { ctx.globalAlpha = 0.12; ctx.fillStyle = ink; ctx.fillRect(ox + (pad - 1) * cw, oy + r * ch - 2, (line.length + 2) * cw, ch + 2); ctx.globalAlpha = 1; ctx.fillStyle = ink; }
        ctx.fillText(line.slice(0, cols - pad), ox + pad * cw, oy + r * ch);
      }
      ctx.globalAlpha = 1;
      return;
    }
    const f = SCENES[kind];
    ctx.fillStyle = ink;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const dk = clamp(f(c / cols, r / rows, t, w / h));
      const g = RAMP[Math.round(dk * (RAMP.length - 1))];
      if (g !== ' ') ctx.fillText(g, ox + c * cw, oy + r * ch);
    }
  };
  const L = loop(canvas, draw);
  const rebuild = () => { build(); draw(reduced() ? 2400 : 0); };
  rebuild();
  new ResizeObserver(rebuild).observe(canvas);
  return L;
}

/* ---------- terminal panels: lines appear in turn, a 3.6 s cycle that restarts on hover ---------- */

export function terminal(pre) {
  const items = [...pre.querySelectorAll('[data-at]')];
  const last = Math.max(...items.map(i => +i.dataset.at)) + 2;
  const STEP = 3600 / last;
  let start = performance.now();
  const show = step => items.forEach(i => {
    const on = step >= +i.dataset.at && (i.dataset.until == null || step < +i.dataset.until);
    i.classList.toggle('is-off', !on);
  });
  const L = loop(pre, () => show(Math.floor(((performance.now() - start) % 3600) / STEP)));
  pre.closest('.card')?.addEventListener('pointerenter', () => { start = performance.now(); });
  L.rest = () => show(last);
  return L;
}

/* ---------- boot ---------- */

export function boot() {
  const hero = document.querySelector('[data-ascii-portrait]');
  if (hero) portrait(hero, hero.dataset.src);
  document.querySelectorAll('[data-ascii-scene]').forEach(c => scene(c, c.dataset.asciiScene));
  const terms = [...document.querySelectorAll('[data-term]')].map(terminal);
  const btn = document.querySelector('[data-ascii-pause]');
  const rest = () => terms.forEach(t => t.rest());
  if (reduced()) rest();
  btn?.addEventListener('click', () => {
    const p = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(p));
    btn.querySelector('span').textContent = p ? btn.dataset.play : btn.dataset.pause;
    setPaused(p);
    if (p) rest();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
