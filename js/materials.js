/* 9 种程序化材质（与 core/materials/ 逐条对应），注册表同时供主线程读元信息。 */
'use strict';

const MATS = {

/* ---------------- 木纹 ---------------- */
wood: {
  label: '木纹', emoji: '🪵',
  presets: {
    '橡木':     { light: [0.82, 0.66, 0.44], dark: [0.55, 0.38, 0.22], ring: 9,  planks: 0 },
    '胡桃木':   { light: [0.52, 0.35, 0.22], dark: [0.28, 0.17, 0.10], ring: 11, planks: 0 },
    '樱桃木':   { light: [0.66, 0.38, 0.25], dark: [0.42, 0.20, 0.12], ring: 8,  planks: 0 },
    '橡木地板': { light: [0.80, 0.64, 0.42], dark: [0.52, 0.36, 0.20], ring: 10, planks: 5 },
    '胡桃地板': { light: [0.46, 0.31, 0.20], dark: [0.24, 0.15, 0.09], ring: 12, planks: 6 },
    '风化灰木': { light: [0.62, 0.60, 0.56], dark: [0.42, 0.41, 0.38], ring: 9,  planks: 4 },
  },
  params: [
    { key: 'ring',   label: '年轮密度',       min: 4, max: 18,  step: 1,    default: 9 },
    { key: 'planks', label: '拼板数(0=整板)', min: 0, max: 8,   step: 1,    default: 0 },
    { key: 'warp',   label: '纹理扭曲',       min: 0, max: 2,   step: 0.05, default: 0.9 },
    { key: 'grain',  label: '木纹肌理',       min: 0, max: 1.5, step: 0.05, default: 0.7 },
  ],
  generate(size, seed, p) {
    const N = size * size;
    const nPl = Math.round(p.planks), nl = nPl || 1;
    const wcell = nPl > 0 ? 1 / nPl : 1;
    const rnd = mulberry32(seed + 41);
    const cyv = new Float32Array(nl), cxv = new Float32Array(nl);
    const phv = new Float32Array(nl), brv = new Float32Array(nl);
    for (let i = 0; i < nl; i++) {
      cyv[i] = rnd(); cxv[i] = rnd(); phv[i] = rnd() * 6.2832;
      brv[i] = 1 + (rnd() - 0.5) * 0.12;
    }
    const turb = fbm(size, 6, 3, 4, seed + 7);
    const [gxf, gyf] = fit(size, 150, 4);
    const g = fbm(size, gxf, gyf, 3, seed + 13);
    const alb = new Float32Array(N * 3), h = new Float32Array(N), r = new Float32Array(N);
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size, i = y * size + x;
        let pid = 0, su = u;
        if (nPl > 0) { pid = Math.min(Math.floor(u / wcell), nPl - 1); su = u / wcell - pid; }
        let dxx = su - cxv[pid]; dxx -= Math.round(dxx);
        dxx *= (nPl > 0 ? wcell * 1.6 : 1);
        let dyy = v - cyv[pid]; dyy -= Math.round(dyy); dyy *= 0.4;
        const d = Math.hypot(dxx, dyy);
        const rp = d * p.ring * 6.2832 + turb[i] * p.warp * 2.5 + phv[pid];
        const rings = 0.5 + 0.5 * Math.sin(rp);
        const r2 = 0.5 + 0.5 * Math.sin(rp * 2.7 + 1.3);
        const grain = 1 - Math.abs(g[i]);
        const t = clamp01(rings * 0.68 + r2 * 0.22 + (grain - 0.5) * p.grain * 0.7 + 0.1);
        const dk = p.dark, lt = p.light;
        const mid = [(dk[0] + lt[0]) / 2, (dk[1] + lt[1]) / 2, (dk[2] + lt[2]) / 2];
        let c0, c1, a;
        if (t < 0.5) { c0 = dk; c1 = mid; a = t * 2; } else { c0 = mid; c1 = lt; a = (t - 0.5) * 2; }
        const shade = (0.90 + 0.18 * Math.min(d * 1.8, 1)) * brv[pid];
        let R = (c0[0] + (c1[0] - c0[0]) * a) * shade;
        let G = (c0[1] + (c1[1] - c0[1]) * a) * shade;
        let B = (c0[2] + (c1[2] - c0[2]) * a) * shade;
        const e = Math.min(su, 1 - su);
        const gap = nPl > 0 ? smoothstep(0.02, 0.002, e) : 0;
        R = R * (1 - gap) + 0.10 * gap;
        G = G * (1 - gap) + 0.08 * gap;
        B = B * (1 - gap) + 0.07 * gap;
        alb[i * 3] = R; alb[i * 3 + 1] = G; alb[i * 3 + 2] = B;
        let hh = rings * 0.28 + grain * 0.22 + 0.45;
        hh = hh * (1 - gap * 0.85) + gap * 0.08;
        h[i] = clamp01(hh);
        r[i] = clampR(0.50 + grain * 0.10 + gap * 0.15 + turb[i] * p.warp * 0.03, 0.3, 0.95);
      }
    }
    return { albedo: alb, height: h, rough: r, metal: null };
  },
},

/* ---------------- 大理石 ---------------- */
marble: {
  label: '大理石', emoji: '🏛️',
  presets: {
    '卡拉拉白': { base: [[0, [0.94, 0.93, 0.91]], [1, [0.80, 0.79, 0.77]]], vein: [0.45, 0.47, 0.50], sharp: 3.2 },
    '爵士白':   { base: [[0, [0.91, 0.90, 0.87]], [1, [0.78, 0.78, 0.76]]], vein: [0.55, 0.56, 0.58], sharp: 2.6 },
    '黑金花':   { base: [[0, [0.09, 0.08, 0.09]], [1, [0.19, 0.17, 0.16]]], vein: [0.74, 0.60, 0.30], sharp: 2.6 },
    '大花绿':   { base: [[0, [0.14, 0.30, 0.24]], [1, [0.06, 0.16, 0.12]]], vein: [0.85, 0.87, 0.80], sharp: 2.4 },
  },
  params: [
    { key: 'vf',    label: '纹理频率', min: 1,   max: 6, step: 0.5,  default: 2.0 },
    { key: 'gain',  label: '纹理扭曲', min: 0.5, max: 4, step: 0.1,  default: 2.2 },
    { key: 'cloud', label: '云雾深浅', min: 0,   max: 1, step: 0.05, default: 0.7 },
  ],
  generate(size, seed, p) {
    const N = size * size;
    const turb = fbm(size, 3, 3, 5, seed + 2);
    const turb2 = fbm(size, 4, 4, 5, seed + 3);
    const [fx2, fy2] = fit(size, 200, 200);
    const fine = valueNoise(size, fx2, fy2, seed + 5);
    const alb = new Float32Array(N * 3), h = new Float32Array(N), r = new Float32Array(N);
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size, i = y * size + x;
        const s1 = Math.sin(6.2832 * u * p.vf + turb[i] * p.gain * 2.6 + 0.7);
        const w1 = Math.pow(1 - Math.abs(s1), p.sharp * 1.4);
        const s2 = Math.sin(6.2832 * (u * 0.3 + v) * p.vf * 0.7 + turb2[i] * p.gain * 1.4 + 3.1);
        const w2 = Math.pow(1 - Math.abs(s2), p.sharp * 1.8);
        const s3 = Math.sin(6.2832 * u * p.vf * 3.1 + turb[i] * 4.5 + 2.0);
        const w3 = Math.pow(1 - Math.abs(s3), 7);
        const vein = Math.min(w1 + w2 * 0.3 + w3 * 0.5, 1);
        const cloud = turb2[i] * 0.5 + 0.5;
        const st = p.base, vv = clamp01(cloud * p.cloud);
        const a = clamp01((vv - st[0][0]) / Math.max(st[1][0] - st[0][0], 1e-6));
        const c0 = st[0][1], c1 = st[1][1];
        const iv = 1 - vein;
        alb[i * 3]     = (c0[0] + (c1[0] - c0[0]) * a) * iv + p.vein[0] * vein;
        alb[i * 3 + 1] = (c0[1] + (c1[1] - c0[1]) * a) * iv + p.vein[1] * vein;
        alb[i * 3 + 2] = (c0[2] + (c1[2] - c0[2]) * a) * iv + p.vein[2] * vein;
        h[i] = clamp01(0.92 - vein * 0.18 + fine[i] * 0.05);
        r[i] = clampR(0.20 + vein * 0.30 + (1 - cloud) * 0.06, 0.12, 0.75);
      }
    }
    return { albedo: alb, height: h, rough: r, metal: null };
  },
},

/* ---------------- 花岗岩 ---------------- */
granite: {
  label: '花岗岩', emoji: '🪨',
  presets: {
    '灰麻':   { palette: [[0.72, 0.72, 0.70], [0.30, 0.30, 0.32], [0.93, 0.92, 0.90], [0.12, 0.12, 0.13]] },
    '红麻':   { palette: [[0.74, 0.46, 0.36], [0.36, 0.19, 0.15], [0.92, 0.87, 0.82], [0.15, 0.10, 0.09]] },
    '黑金沙': { palette: [[0.16, 0.15, 0.16], [0.38, 0.33, 0.27], [0.60, 0.57, 0.52], [0.08, 0.08, 0.09]] },
  },
  params: [
    { key: 'cells',   label: '晶粒数量', min: 8, max: 60, step: 1,    default: 20 },
    { key: 'sparkle', label: '闪光点',   min: 0, max: 1,  step: 0.05, default: 0.4 },
  ],
  generate(size, seed, p) {
    const N = size * size;
    const cells = Math.round(p.cells), n2 = cells * 3;
    const [f1a, f2a, cida] = voronoi(size, cells, seed);
    const [f1b, f2b, cidb] = voronoi(size, n2, seed + 3);
    const rnd = mulberry32(seed + 5);
    const pal = p.palette;
    const palA = pal.map(c => [c[0] * 0.45 + 0.33, c[1] * 0.45 + 0.33, c[2] * 0.45 + 0.33]);
    const la = new Int32Array(cells * cells), lb = new Float32Array(cells * cells);
    for (let i = 0; i < la.length; i++) { la[i] = (rnd() * pal.length) | 0; lb[i] = 0.90 + rnd() * 0.22; }
    const l2 = new Int32Array(n2 * n2), lb2 = new Float32Array(n2 * n2);
    for (let i = 0; i < l2.length; i++) { l2[i] = (rnd() * pal.length) | 0; lb2[i] = 0.92 + rnd() * 0.18; }
    const [fx2, fy2] = fit(size, 160, 160);
    const fine = fbm(size, fx2, fy2, 2, seed + 5, true);
    const [sx, sy] = fit(size, 300, 300);
    const sp = valueNoise(size, sx, sy, seed + 9);
    const alb = new Float32Array(N * 3), h = new Float32Array(N), r = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const ca = palA[la[cida[i]]], cb = pal[l2[cidb[i]]];
      const edgeA = clamp01((f2a[i] - f1a[i]) * 30);
      const eShade = (0.76 + 0.24 * edgeA) * lb[cida[i]] * (0.85 + 0.15 * fine[i]) * 0.62;
      alb[i * 3]     = ca[0] * eShade + cb[0] * lb2[cidb[i]] * 0.38;
      alb[i * 3 + 1] = ca[1] * eShade + cb[1] * lb2[cidb[i]] * 0.38;
      alb[i * 3 + 2] = ca[2] * eShade + cb[2] * lb2[cidb[i]] * 0.38;
      if (sp[i] > 0.93) { const add = 0.5 * p.sparkle; alb[i * 3] += add; alb[i * 3 + 1] += add; alb[i * 3 + 2] += add; }
      h[i] = clamp01(0.58 + fine[i] * 0.3 - (1 - edgeA) * 0.10 + (f2b[i] - f1b[i]) * 0.35);
      r[i] = clampR(0.55 + fine[i] * 0.15, 0.3, 0.9);
    }
    return { albedo: alb, height: h, rough: r, metal: null };
  },
},

/* ---------------- 砖墙 ---------------- */
brick: {
  label: '砖墙', emoji: '🧱',
  presets: {
    '红砖':   { base: [0.62, 0.29, 0.20] },
    '青砖':   { base: [0.44, 0.47, 0.44] },
    '黄砖':   { base: [0.74, 0.56, 0.30] },
    '白砖':   { base: [0.80, 0.76, 0.70] },
    '深灰砖': { base: [0.30, 0.30, 0.32] },
  },
  params: [
    { key: 'cols',   label: '横向砖数', min: 4,    max: 12,   step: 1,    default: 6 },
    { key: 'mortar', label: '灰缝宽度', min: 0.04, max: 0.14, step: 0.01, default: 0.07 },
  ],
  generate(size, seed, p) {
    const N = size * size;
    const cols = Math.round(p.cols), rows = Math.max(2, Math.round(cols * 0.52));
    const mw = p.mortar;
    const rnd = mulberry32(seed + 11);
    const lut = new Float32Array(rows * cols);
    for (let i = 0; i < lut.length; i++) lut[i] = rnd();
    const fine = fbm(size, 90, 90, 3, seed + 3, true);
    const spots = fbm(size, 10, 10, 4, seed + 8, true);
    const fine2 = fbm(size, 60, 60, 3, seed + 9, true);
    const alb = new Float32Array(N * 3), h = new Float32Array(N), r = new Float32Array(N);
    const b = p.base;
    for (let y = 0; y < size; y++) {
      const rowf = (y / size) * rows, row = Math.floor(rowf), fr = rowf - row;
      const off = (row % 2) * 0.5;
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const bu = (x / size) * cols + off, col = Math.floor(bu), fu = bu - col;
        const inb = fu > mw && fu < 1 - mw && fr > mw && fr < 1 - mw;
        let R, G, B, hh, rr;
        if (inb) {
          const bid = (row % rows) * cols + (((col % cols) + cols) % cols);
          const k = 0.82 + 0.36 * lut[bid];
          const fire = clamp01((spots[i] - 0.60) * 1.6);
          const shade = (0.90 + 0.20 * fine[i]) * (1 - fire * 0.45) * k;
          R = b[0] * shade; G = b[1] * shade; B = b[2] * shade;
          const ed = Math.min(Math.min(fu, 1 - fu), Math.min(fr, 1 - fr));
          const cham = Math.min(ed / 0.09, 1);
          hh = clamp01(0.42 + 0.38 * cham + fine[i] * 0.14 - fire * 0.05);
          rr = clamp01(0.70 + fire * 0.08);
        } else {
          const mk = 0.88 + 0.24 * fine2[i];
          R = 0.60 * mk; G = 0.58 * mk; B = 0.54 * mk;
          hh = clamp01(0.14 + fine2[i] * 0.08);
          rr = 0.90;
        }
        alb[i * 3] = R; alb[i * 3 + 1] = G; alb[i * 3 + 2] = B;
        h[i] = hh; r[i] = rr;
      }
    }
    return { albedo: alb, height: h, rough: r, metal: null };
  },
},

/* ---------------- 混凝土 ---------------- */
concrete: {
  label: '混凝土', emoji: '🏗️',
  presets: {
    '清水混凝土': { base: 0.60, panels: 5, tie: 1, pores: 0.35, weather: 0 },
    '普通水泥':   { base: 0.56, panels: 0, tie: 0, pores: 0.50, weather: 0 },
    '风化水泥':   { base: 0.52, panels: 0, tie: 0, pores: 0.80, weather: 1 },
  },
  params: [
    { key: 'pores',   label: '气孔',           min: 0, max: 1, step: 0.05, default: 0.4 },
    { key: 'panels',  label: '模板分缝(0=无)', min: 0, max: 8, step: 1,    default: 5 },
    { key: 'tie',     label: '对拉螺栓孔',     min: 0, max: 1, step: 1,    default: 1 },
    { key: 'weather', label: '水渍风化',       min: 0, max: 1, step: 0.05, default: 0.15 },
  ],
  generate(size, seed, p) {
    const N = size * size;
    const big = fbm(size, 5, 5, 5, seed, true);
    const med = fbm(size, 20, 20, 3, seed + 1, true);
    const stain = fbm(size, 5, 2, 4, seed + 6, true);
    const [pxf, pyf] = fit(size, 230, 230);
    const pn = valueNoise(size, pxf, pyf, seed + 4);
    const [fxf, fyf] = fit(size, 200, 200);
    const fine = valueNoise(size, fxf, fyf, seed + 5);
    const alb = new Float32Array(N * 3), h = new Float32Array(N), r = new Float32Array(N);
    const panels = Math.round(p.panels);
    const rlut = new Float32Array(Math.max(panels, 1));
    const rl = mulberry32(seed + 21);
    for (let i = 0; i < rlut.length; i++) rlut[i] = rl();
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const lum = clampR(p.base * (0.85 + 0.30 * (big[i] - 0.5) + 0.12 * (med[i] - 0.5)), 0.1, 1);
        const st = stain[i] * p.weather;
        const pm = clamp01((pn[i] - 0.80) / 0.18) * p.pores;
        let R = lum * 0.99, G = lum, B = lum * 1.01;
        R = R * (1 - st) + R * 0.90 * st;
        G = G * (1 - st) + G * 0.86 * st;
        B = B * (1 - st) + B * 0.78 * st;
        const dk = 1 - pm * 0.5;
        R *= dk; G *= dk; B *= dk;
        let hh = 0.62 + (big[i] - 0.5) * 0.25 + (med[i] - 0.5) * 0.15 - pm * 0.4;
        if (panels > 0) {
          const ph = v * panels, dl = Math.abs(ph - Math.round(ph));
          const line = clamp01((0.012 - dl) / 0.012);
          const ln = 1 - line * 0.28;
          R *= ln; G *= ln; B *= ln;
          hh -= line * 0.25;
          const tone = 1 + (rlut[Math.min(Math.floor(ph), panels - 1) % panels] - 0.5) * 0.07;
          R *= tone; G *= tone; B *= tone;
          if (p.tie > 0.5) {
            const nt = Math.max(2, panels - 1);
            for (let ti = 0; ti < nt; ti++) {
              const cy = (ti + 0.5) / nt;
              for (let tj = 0; tj < nt; tj++) {
                const cx = ((tj + 0.5 + 0.25 * ((ti + tj) % 2)) % 1);
                let ddx = x / size - cx; ddx -= Math.round(ddx); ddx *= size;
                let ddy = v - cy; ddy -= Math.round(ddy); ddy *= size;
                const d = Math.hypot(ddx, ddy), rad = size * 0.014;
                const ring = clamp01(1 - Math.abs(d - rad) / (rad * 0.7));
                const disc = clamp01(1 - d / (rad * 0.8));
                const s = 1 - (ring * 0.45 + disc * 0.30);
                R *= s; G *= s; B *= s;
                hh -= ring * 0.3 + disc * 0.35;
              }
            }
          }
        }
        alb[i * 3] = clamp01(R); alb[i * 3 + 1] = clamp01(G); alb[i * 3 + 2] = clamp01(B);
        h[i] = clamp01(hh + (fine[i] - 0.5) * 0.10);
        r[i] = clampR(0.78 + (med[i] - 0.5) * 0.12 + pm * 0.1, 0.4, 0.95);
      }
    }
    return { albedo: alb, height: h, rough: r, metal: null };
  },
},

/* ---------------- 抹灰墙面 ---------------- */
plaster: {
  label: '抹灰墙面', emoji: '🎨',
  presets: {
    '白灰': { base: [0.88, 0.87, 0.84] },
    '米黄': { base: [0.87, 0.80, 0.66] },
    '浅灰': { base: [0.74, 0.74, 0.73] },
    '赭石': { base: [0.72, 0.52, 0.38] },
  },
  params: [
    { key: 'relief', label: '颗粒起伏', min: 0, max: 2, step: 0.05, default: 0.9 },
    { key: 'trowel', label: '抹刀痕',   min: 0, max: 1, step: 0.05, default: 0.4 },
  ],
  generate(size, seed, p) {
    const N = size * size;
    const [fx1, fy1] = fit(size, 120, 120);
    const fine = fbm(size, fx1, fy1, 3, seed, true);
    const med = fbm(size, 18, 18, 4, seed + 2, true);
    const swirl = fbm(size, 28, 6, 3, seed + 3);
    const b = p.base;
    const alb = new Float32Array(N * 3), h = new Float32Array(N), r = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const k = 0.92 + 0.16 * med[i] + 0.05 * swirl[i] * p.trowel;
      alb[i * 3] = b[0] * k; alb[i * 3 + 1] = b[1] * k; alb[i * 3 + 2] = b[2] * k;
      h[i] = clamp01(0.5 + (fine[i] - 0.5) * 0.9 * p.relief + (med[i] - 0.5) * 0.35);
      r[i] = clampR(0.85 + (med[i] - 0.5) * 0.1, 0.5, 1);
    }
    return { albedo: alb, height: h, rough: r, metal: null };
  },
},

/* ---------------- 草地 ---------------- */
grass: {
  label: '草地', emoji: '🌿',
  presets: {
    '草坪': { green: [[0, [0.24, 0.38, 0.14]], [1, [0.44, 0.58, 0.20]]], blade: 90 },
    '干草': { green: [[0, [0.50, 0.47, 0.20]], [1, [0.70, 0.65, 0.32]]], blade: 70 },
    '苔藓': { green: [[0, [0.16, 0.30, 0.10]], [1, [0.30, 0.44, 0.14]]], blade: 130 },
  },
  params: [
    { key: 'blade',  label: '草叶密度', min: 40, max: 180, step: 5,    default: 90 },
    { key: 'clumps', label: '簇状斑驳', min: 0,  max: 1,   step: 0.05, default: 0.7 },
  ],
  generate(size, seed, p) {
    const N = size * size;
    const [bx, by] = fit(size, Math.round(p.blade), 4);
    const streak = fbm(size, bx, by, 3, seed + 1);
    const clump = fbm(size, 6, 6, 4, seed, true);
    const [fx2, fy2] = fit(size, 200, 200);
    const fine = fbm(size, fx2, fy2, 2, seed + 3, true);
    const hue = fbm(size, 30, 30, 2, seed + 7, true);
    const st = p.green;
    const alb = new Float32Array(N * 3), h = new Float32Array(N), r = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const strand = Math.pow(1 - Math.abs(streak[i]), 2.0);
      const mask = clamp01(clump[i] * 1.5 - 0.15) * (0.5 + 0.5 * p.clumps);
      const sm = clamp01(strand * mask * 2.0);
      const cv = clamp01(clump[i] * 0.5 + hue[i] * 0.3 + 0.25);
      const a = clamp01((cv - st[0][0]) / Math.max(st[1][0] - st[0][0], 1e-6));
      const c0 = st[0][1], c1 = st[1][1];
      const fk = 0.85 + 0.3 * fine[i];
      const gr = (c0[0] + (c1[0] - c0[0]) * a) * fk;
      const gg = (c0[1] + (c1[1] - c0[1]) * a) * fk;
      const gb = (c0[2] + (c1[2] - c0[2]) * a) * fk;
      const sk = (0.8 + 0.4 * fine[i]) * (1 - sm);
      alb[i * 3]     = 0.14 * sk + gr * sm;
      alb[i * 3 + 1] = 0.11 * sk + gg * sm;
      alb[i * 3 + 2] = 0.07 * sk + gb * sm;
      h[i] = clamp01(0.35 + sm * 0.5 + fine[i] * 0.15);
      r[i] = 0.9;
    }
    return { albedo: alb, height: h, rough: r, metal: null };
  },
},

/* ---------------- 沙地 ---------------- */
sand: {
  label: '沙地', emoji: '🏖️',
  presets: {
    '河沙': { stops: [[0, [0.72, 0.64, 0.52]], [0.5, [0.80, 0.72, 0.58]], [1, [0.86, 0.79, 0.65]]], dir: 20, waves: 14 },
    '沙漠': { stops: [[0, [0.78, 0.60, 0.36]], [0.5, [0.86, 0.69, 0.44]], [1, [0.92, 0.77, 0.52]]], dir: 70, waves: 10 },
    '白沙': { stops: [[0, [0.86, 0.85, 0.80]], [0.5, [0.90, 0.89, 0.85]], [1, [0.94, 0.93, 0.90]]], dir: 0,  waves: 18 },
  },
  params: [
    { key: 'waves', label: '沙纹密度', min: 4, max: 40,  step: 1, default: 14 },
    { key: 'dir',   label: '沙纹角度', min: 0, max: 180, step: 5, default: 20 },
  ],
  generate(size, seed, p) {
    const N = size * size;
    const th = p.dir * Math.PI / 180;
    const a = Math.max(1, Math.round(p.waves * Math.cos(th)));
    const bb = Math.max(1, Math.round(p.waves * Math.sin(th)));
    const turb = fbm(size, 3, 3, 4, seed);
    const [fx2, fy2] = fit(size, 250, 250);
    const fine = fbm(size, fx2, fy2, 2, seed + 2, true);
    const med = fbm(size, 8, 8, 4, seed + 3, true);
    const alb = new Float32Array(N * 3), h = new Float32Array(N), r = new Float32Array(N);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const ripple01 = 0.5 + 0.5 * Math.sin(6.2832 * (x * a + y * bb) / size + turb[i] * 3.5);
        const c = rampColor(clamp01(ripple01 * 0.65 + med[i] * 0.35), p.stops);
        const k = 0.92 + 0.16 * fine[i];
        alb[i * 3] = c[0] * k; alb[i * 3 + 1] = c[1] * k; alb[i * 3 + 2] = c[2] * k;
        h[i] = clamp01(ripple01 * 0.7 + fine[i] * 0.3);
        r[i] = 0.86;
      }
    }
    return { albedo: alb, height: h, rough: r, metal: null };
  },
},

/* ---------------- 金属 ---------------- */
metal: {
  label: '金属', emoji: '⚙️',
  presets: {
    '拉丝不锈钢': { stops: [[0, [0.52, 0.53, 0.55]], [0.5, [0.62, 0.63, 0.65]], [1, [0.72, 0.73, 0.75]]], brush: 240, rust: 0 },
    '哑光铝':     { stops: [[0, [0.62, 0.63, 0.65]], [0.5, [0.68, 0.69, 0.71]], [1, [0.74, 0.75, 0.77]]], brush: 120, rust: 0 },
    '黄铜':       { stops: [[0, [0.55, 0.42, 0.18]], [0.5, [0.68, 0.54, 0.26]], [1, [0.80, 0.65, 0.34]]], brush: 200, rust: 0 },
    '锈蚀铁':     { stops: [[0, [0.35, 0.33, 0.32]], [0.5, [0.45, 0.43, 0.42]], [1, [0.55, 0.53, 0.52]]], brush: 160, rust: 0.85 },
  },
  params: [
    { key: 'brush', label: '拉丝密度', min: 60, max: 400, step: 10,   default: 240 },
    { key: 'rust',  label: '锈蚀程度', min: 0,  max: 1,   step: 0.05, default: 0.0 },
  ],
  generate(size, seed, p) {
    const N = size * size;
    const [bx, by] = fit(size, 3, Math.round(p.brush));
    const streak = fbm(size, bx, by, 3, seed);
    const [fx2, fy2] = fit(size, 150, 150);
    const fine = fbm(size, fx2, fy2, 2, seed + 2, true);
    const m1 = fbm(size, 6, 6, 5, seed + 4, true);
    const m2 = fbm(size, 40, 40, 3, seed + 7, true);
    const rstop = [[0, [0.36, 0.16, 0.07]], [0.5, [0.55, 0.28, 0.10]], [1, [0.70, 0.42, 0.16]]];
    const alb = new Float32Array(N * 3), h = new Float32Array(N), r = new Float32Array(N);
    const met = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let mask = clamp01((m1[i] - (1 - p.rust) * 0.85) / 0.3);
      mask = clamp01(mask + (m2[i] - 0.5) * 0.2 * mask);
      const bt = clamp01(0.5 + streak[i] * 0.4);
      const base = rampColor(bt, p.stops);
      const rc = rampColor(clamp01(fine[i]), rstop);
      alb[i * 3]     = base[0] * (1 - mask) + rc[0] * mask;
      alb[i * 3 + 1] = base[1] * (1 - mask) + rc[1] * mask;
      alb[i * 3 + 2] = base[2] * (1 - mask) + rc[2] * mask;
      h[i] = clamp01(0.55 + streak[i] * 0.15 + fine[i] * 0.15 - mask * 0.08);
      let rr = clampR(0.32 + Math.abs(streak[i]) * 0.12, 0.15, 0.6);
      rr = rr * (1 - mask) + 0.9 * mask;
      r[i] = rr;
      met[i] = clamp01(1 - mask * 1.2);
    }
    return { albedo: alb, height: h, rough: r, metal: met };
  },
},
};

/* 沙纹/色带逐像素求值辅助 */
function rampColor(v, stops) {
  v = clamp01(v);
  for (let s = 0; s < stops.length - 1; s++) {
    if (v <= stops[s + 1][0] || s === stops.length - 2) {
      const a = clamp01((v - stops[s][0]) / Math.max(stops[s + 1][0] - stops[s][0], 1e-6));
      const c0 = stops[s][1], c1 = stops[s + 1][1];
      return [c0[0] + (c1[0] - c0[0]) * a, c0[1] + (c1[1] - c0[1]) * a, c0[2] + (c1[2] - c0[2]) * a];
    }
  }
  return stops[stops.length - 1][1];
}

/* 预设/参数合并（对应 Python materials.defaults） */
function matDefaults(key, preset) {
  const m = MATS[key];
  const pn = preset || Object.keys(m.presets)[0];
  const p = {};
  for (const d of m.params) p[d.key] = d.default;
  Object.assign(p, m.presets[pn]);
  return [p, pn];
}
