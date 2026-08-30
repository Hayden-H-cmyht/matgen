/* 周期化噪声库（与 core/noise.py 同一套数学），所有输出保证无缝平铺。
   既在 Worker 里跑生成，也在主线程提供元信息。 */
'use strict';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function clampR(x, a, b) { return x < a ? a : x > b ? b : x; }
function smoothf(t) { return t * t * (3 - 2 * t); }
function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0 + 1e-9));
  return t * t * (3 - 2 * t);
}

function fit(size, fx, fy) {
  const m = Math.max(1, size >> 2);
  return [Math.max(1, Math.min(fx | 0, m)), Math.max(1, Math.min(fy | 0, m))];
}

function valueNoise(size, fx, fy, seed) {
  const rnd = mulberry32(seed);
  const grid = new Float32Array(fx * fy);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const out = new Float32Array(size * size);
  const ix0 = new Int32Array(size), ix1 = new Int32Array(size), tx = new Float32Array(size);
  const dxf = fx / size;
  for (let x = 0; x < size; x++) {
    const g = x * dxf, f = Math.floor(g);
    ix0[x] = f % fx; ix1[x] = (f + 1) % fx; tx[x] = smoothf(g - f);
  }
  const dyf = fy / size;
  for (let y = 0; y < size; y++) {
    const g = y * dyf, f = Math.floor(g);
    const iy0 = f % fy, iy1 = (f + 1) % fy, ty = smoothf(g - f);
    const r00 = iy0 * fx, r10 = iy1 * fx, row = y * size;
    for (let x = 0; x < size; x++) {
      const a = grid[r00 + ix0[x]], b = grid[r00 + ix1[x]];
      const c = grid[r10 + ix0[x]], d = grid[r10 + ix1[x]];
      out[row + x] = (a + (b - a) * tx[x]) * (1 - ty) + (c + (d - c) * tx[x]) * ty;
    }
  }
  return out;
}

function fbm(size, fx, fy, octaves, seed, to01) {
  const out = new Float32Array(size * size);
  let amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(size, fx, fy, (seed * 101 + o * 17 + 3) | 0);
    for (let i = 0; i < out.length; i++) out[i] += amp * (n[i] * 2 - 1);
    norm += amp; amp *= 0.5; fx *= 2; fy *= 2;
  }
  const inv = 1 / norm;
  for (let i = 0; i < out.length; i++) out[i] = to01 ? out[i] * inv * 0.5 + 0.5 : out[i] * inv;
  return out;
}

function voronoi(size, cells, seed) {
  const rnd = mulberry32((seed * 100003 + 977) >>> 0);
  const px = new Float32Array(cells * cells), py = new Float32Array(cells * cells);
  for (let i = 0; i < px.length; i++) { px[i] = rnd(); py[i] = rnd(); }
  const f1 = new Float32Array(size * size), f2 = new Float32Array(size * size);
  const cid = new Int32Array(size * size);
  const scale = cells / size;
  for (let y = 0; y < size; y++) {
    const pv = y * scale, cy = Math.floor(pv), fy_ = pv - cy;
    for (let x = 0; x < size; x++) {
      const pu = x * scale, cx = Math.floor(pu), fx_ = pu - cx;
      let b1 = 81, b2 = 81, bc = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = (((cy + dy) % cells) + cells) % cells;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = (((cx + dx) % cells) + cells) % cells;
          const idx = ny * cells + nx;
          let ddx = fx_ - dx - px[idx];
          let ddy = fy_ - dy - py[idx];
          ddx -= cells * Math.round(ddx / cells);
          ddy -= cells * Math.round(ddy / cells);
          const d = ddx * ddx + ddy * ddy;
          if (d < b1) { b2 = b1; b1 = d; bc = idx; }
          else if (d < b2) { b2 = d; }
        }
      }
      const i = y * size + x;
      f1[i] = Math.sqrt(b1) / cells;
      f2[i] = Math.sqrt(b2) / cells;
      cid[i] = bc;
    }
  }
  return [f1, f2, cid];
}

/* 色带上色：stops=[[pos,[r,g,b]],...]，输出 RGB 交错 Float32Array */
function ramp(t, w, stops) {
  const out = new Float32Array(w * w * 3);
  const n = w * w;
  for (let i = 0; i < n; i++) {
    const v = clamp01(t[i]);
    let c0 = stops[0][1], c1 = stops[0][1], a = 0;
    for (let s = 0; s < stops.length - 1; s++) {
      if (v <= stops[s + 1][0] || s === stops.length - 2) {
        c0 = stops[s][1]; c1 = stops[s + 1][1];
        a = clamp01((v - stops[s][0]) / Math.max(stops[s + 1][0] - stops[s][0], 1e-6));
        break;
      }
    }
    out[i * 3] = c0[0] + (c1[0] - c0[0]) * a;
    out[i * 3 + 1] = c0[1] + (c1[1] - c0[1]) * a;
    out[i * 3 + 2] = c0[2] + (c1[2] - c0[2]) * a;
  }
  return out;
}
