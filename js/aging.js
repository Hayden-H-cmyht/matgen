/* 做旧化（与 core/aging.py 对应）：污渍/苔藓/裂纹/磨损/划痕/褪色 */
'use strict';

const AGING_OPS = {

stain(m, k, seed) {
  const n = fbm(m.size, 4, 4, 5, seed + 31, true);
  for (let i = 0; i < n.length; i++) {
    const v = Math.pow(n[i], 1.8) * k, dk = 1 - 0.45 * v;
    m.albedo[i * 3] *= dk; m.albedo[i * 3 + 1] *= dk; m.albedo[i * 3 + 2] *= dk;
    m.rough[i] = clamp01(m.rough[i] + v * 0.2);
  }
},

moss(m, k, seed) {
  const nm = fbm(m.size, 5, 5, 5, seed + 43, true);
  const g0 = [0.15, 0.23, 0.09], g1 = [0.30, 0.42, 0.15];
  for (let i = 0; i < nm.length; i++) {
    const recess = Math.pow(clamp01(1 - m.height[i]), 1.5);
    const mk = clamp01(Math.pow(nm[i], 2.2) * recess * k * 1.5);
    const a = nm[i], iv = 1 - mk;
    for (let c = 0; c < 3; c++)
      m.albedo[i * 3 + c] = m.albedo[i * 3 + c] * iv + (g0[c] + (g1[c] - g0[c]) * a) * mk;
    m.height[i] = clamp01(m.height[i] + mk * 0.12);
    m.rough[i] = clamp01(m.rough[i] + mk * 0.2);
  }
},

cracks(m, k, seed) {
  const cells = Math.max(4, Math.round(5 + k * 9));
  const [f1, f2] = voronoi(m.size, cells, seed + 57);
  const patch = fbm(m.size, 3, 3, 3, seed + 58);
  for (let i = 0; i < f1.length; i++) {
    const pm = clamp01((patch[i] + 0.1) * 2.0);
    const line = (1 - smoothstep(0.0, 0.0025 + 0.003 * k, f2[i] - f1[i])) * pm * clamp01(k * 1.4);
    m.height[i] = clamp01(m.height[i] - line * 0.5);
    const dk = 1 - line * 0.55;
    m.albedo[i * 3] *= dk; m.albedo[i * 3 + 1] *= dk; m.albedo[i * 3 + 2] *= dk;
  }
},

wear(m, k, seed) {
  for (let i = 0; i < m.height.length; i++) {
    const hi = smoothstep(0.55, 0.88, m.height[i]) * k;
    if (hi <= 0) continue;
    for (let c = 0; c < 3; c++)
      m.albedo[i * 3 + c] = m.albedo[i * 3 + c] * (1 - hi) + clamp01(m.albedo[i * 3 + c] * 1.35 + 0.06) * hi;
    m.rough[i] = clamp01(m.rough[i] - hi * 0.3);
  }
},

scratch(m, k, seed) {
  const n = Math.round(k * 60);
  if (n <= 0) return;
  const S = m.size, rnd = mulberry32(seed + 91);
  const sc = new Float32Array(S * S);
  for (let li = 0; li < n; li++) {
    const x0 = rnd() * S, y0 = rnd() * S, ang = rnd() * Math.PI;
    const ln = S * (0.12 + rnd() * 0.35);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const w = Math.max(1.0, S * 0.0012);
    // 线段跨边界时在 ±S 偏移处重复画，保证平铺连续
    for (let oy = -S; oy <= S; oy += S)
      for (let ox = -S; ox <= S; ox += S) {
        const bx0 = x0 + ox, by0 = y0 + oy;
        const ex = bx0 + dx * ln, ey = by0 + dy * ln;
        const minx = Math.max(0, Math.floor(Math.min(bx0, ex) - w - 2));
        const maxx = Math.min(S - 1, Math.ceil(Math.max(bx0, ex) + w + 2));
        const miny = Math.max(0, Math.floor(Math.min(by0, ey) - w - 2));
        const maxy = Math.min(S - 1, Math.ceil(Math.max(by0, ey) + w + 2));
        if (minx > maxx || miny > maxy) continue;
        for (let y = miny; y <= maxy; y++)
          for (let x = minx; x <= maxx; x++) {
            const t = clamp01((x - bx0) * dx + (y - by0) * dy);
            const d = Math.hypot(x - (bx0 + t * dx), y - (by0 + t * dy));
            const v = Math.pow(clamp01(1 - d / w), 0.5);
            const i = y * S + x;
            if (v > sc[i]) sc[i] = v;
          }
      }
  }
  const kk = clamp01(k * 1.3);
  for (let i = 0; i < sc.length; i++) {
    if (sc[i] <= 0) continue;
    const s = sc[i] * kk;
    const dk = 1 - s * 0.4;
    m.albedo[i * 3] *= dk; m.albedo[i * 3 + 1] *= dk; m.albedo[i * 3 + 2] *= dk;
    m.rough[i] = clamp01(m.rough[i] - s * 0.25);
    m.height[i] = clamp01(m.height[i] - s * 0.04);
  }
},

fade(m, k, seed) {
  const n = fbm(m.size, 3, 3, 4, seed + 71, true);
  for (let i = 0; i < n.length; i++) {
    const mk = k * 0.65 * (0.4 + 0.6 * n[i]), iv = 1 - mk;
    const lum = (m.albedo[i * 3] + m.albedo[i * 3 + 1] + m.albedo[i * 3 + 2]) / 3;
    for (let c = 0; c < 3; c++)
      m.albedo[i * 3 + c] = m.albedo[i * 3 + c] * iv + (lum * 0.9 + 0.10) * mk;
    m.rough[i] = clamp01(m.rough[i] + mk * 0.1);
  }
},
};

const AGING_META = [
  { key: 'stain',   label: '污渍水痕', emoji: '💧' },
  { key: 'moss',    label: '苔藓滋生', emoji: '🌿' },
  { key: 'cracks',  label: '开裂破损', emoji: '🪨' },
  { key: 'wear',    label: '边缘磨损', emoji: '🧱' },
  { key: 'scratch', label: '划痕擦伤', emoji: '⚔️' },
  { key: 'fade',    label: '褪色风化', emoji: '☀️' },
];

function applyAging(m, specs, seed) {
  for (const { key } of AGING_META)
    for (const [k2, v] of specs)
      if (k2 === key && v > 0.02) AGING_OPS[key](m, Math.min(v, 1), seed);
}
