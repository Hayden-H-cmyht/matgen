/* 照片 → 无缝 PBR（对应 core/tileable.py）：居中裁方 + 半移羽化 + 高频高度 */
'use strict';

function makeSeamlessRGBA(rgba, w, h, feather) {
  feather = feather || 0.22;
  const hy = h >> 1, hx = w >> 1;
  const out = new Float32Array(rgba.length);
  const ay = new Float32Array(h), ax = new Float32Array(w);
  for (let y = 0; y < h; y++)
    ay[y] = clamp01((Math.abs(y - hy) - hy * (1 - feather)) / (hy * feather));
  for (let x = 0; x < w; x++)
    ax[x] = clamp01((Math.abs(x - hx) - hx * (1 - feather)) / (hx * feather));
  for (let y = 0; y < h; y++) {
    const sy = (y + hy) % h;
    for (let x = 0; x < w; x++) {
      const sx = (x + hx) % w;
      const a = Math.max(ay[y], ax[x]), iv = 1 - a;
      const di = (y * w + x) * 4, si = (sy * w + sx) * 4;
      for (let c = 0; c < 3; c++)
        out[di + c] = rgba[si + c] * iv + rgba[di + c] * a;
      out[di + 3] = 255;
    }
  }
  return out;
}

/* imgData: 由调用方提供的已裁方已缩放的 ImageData.data */
function processPhoto(imgData, size) {
  const N = size * size;
  const seam = makeSeamlessRGBA(imgData.data, size, size);
  const lum = new Float32Array(N);
  for (let i = 0; i < N; i++) lum[i] = (seam[i * 4] + seam[i * 4 + 1] + seam[i * 4 + 2]) / 765;
  const low = blurField(lum, size, Math.max(2, size >> 5));
  const height = new Float32Array(N);
  for (let i = 0; i < N; i++) height[i] = clamp01(0.5 + (lum[i] - low[i]) * 2.2);
  const hb = blurField(height, size, Math.max(1, size >> 6));
  const rough = new Float32Array(N);
  for (let i = 0; i < N; i++) rough[i] = clampR(0.65 + (hb[i] - height[i]) * 0.5, 0.05, 1);
  const albedo = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    albedo[i * 3] = seam[i * 4] / 255;
    albedo[i * 3 + 1] = seam[i * 4 + 1] / 255;
    albedo[i * 3 + 2] = seam[i * 4 + 2] / 255;
  }
  return { size, albedo, height, rough, metal: null };
}
