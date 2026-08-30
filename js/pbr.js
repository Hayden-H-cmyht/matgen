/* PBR 派生（对应 core/pbr.py）：height → 法线 / AO。环形差分保证无缝。 */
'use strict';

function boxBlur1(src, w, r) {
  const out = new Float32Array(w * w), tmp = new Float32Array(w * w);
  const win = 2 * r + 1;
  for (let y = 0; y < w; y++) {
    const row = y * w;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[row + Math.min(w - 1, Math.max(0, i))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / win;
      sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += tmp[Math.min(w - 1, Math.max(0, i)) * w + x];
    for (let y = 0; y < w; y++) {
      out[y * w + x] = sum / win;
      sum += tmp[Math.min(w - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

function blurField(src, w, r) {
  let a = src;
  for (let i = 0; i < 3; i++) a = boxBlur1(a, w, Math.max(1, r | 0));
  return a;
}

function normalMap(h, size, strength) {
  const out = new Float32Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    const yu = ((y + 1) % size) * size, yd = ((y - 1 + size) % size) * size, row = y * size;
    for (let x = 0; x < size; x++) {
      const gx = (h[row + ((x + 1) % size)] - h[row + ((x - 1 + size) % size)]) * 0.5 * strength;
      const gy = (h[yu + x] - h[yd + x]) * 0.5 * strength;
      const inv = 1 / Math.hypot(gx, gy, 1);
      const i = (row + x) * 3;
      out[i] = (-gx * inv) * 0.5 + 0.5;
      out[i + 1] = (gy * inv) * 0.5 + 0.5;
      out[i + 2] = inv * 0.5 + 0.5;
    }
  }
  return out;
}

function aoMap(h, size) {
  const b = blurField(h, size, Math.max(2, size >> 7));
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = clamp01(1 - 2.6 * (b[i] - h[i]));
  return out;
}
