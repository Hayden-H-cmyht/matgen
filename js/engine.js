/* 生成引擎入口：既作为 Worker 运行，也作为主线程的兜底直接调用。 */
'use strict';

if (typeof importScripts === 'function') {
  importScripts('noise.js', 'pbr.js', 'aging.js', 'materials.js', 'tileable.js', 'zip.js');
}

function runGenerate(p) {
  const [params] = matDefaults(p.type, p.preset);
  Object.assign(params, p.params || {});
  const m = MATS[p.type].generate(p.size, p.seed, params);
  m.size = p.size;                       // 生成器返回值不带尺寸，这里统一补
  const specs = Object.entries(p.aging || {}).map(([k, v]) => [k, +v]);
  if (specs.length) applyAging(m, specs, p.seed);
  return m;
}

async function runProcess(p) {
  const bmp = await createImageBitmap(p.blob);
  const s = p.size;
  const side = Math.min(bmp.width, bmp.height);
  const cv = new OffscreenCanvas(s, s);
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, s, s);
  return processPhoto(ctx.getImageData(0, 0, s, s), s);
}

/* Mat → 各通道 RGBA Uint8ClampedArray */
function engineMaps(m) {
  const size = m.size, n = size * size;
  const strength = 2.0 * size / 512;
  const d = {
    albedo: m.albedo,
    normal: normalMap(m.height, size, strength),
    roughness: m.rough,
    height: m.height,
    ao: aoMap(m.height, size),
  };
  if (m.metal) d.metal = m.metal;
  const maps = {}, transfer = [];
  for (const [k, f] of Object.entries(d)) {
    const rgba = new Uint8ClampedArray(n * 4);
    if (k === 'albedo') {
      for (let i = 0; i < n; i++) {
        rgba[i * 4] = f[i * 3] * 255 + 0.5;
        rgba[i * 4 + 1] = f[i * 3 + 1] * 255 + 0.5;
        rgba[i * 4 + 2] = f[i * 3 + 2] * 255 + 0.5;
        rgba[i * 4 + 3] = 255;
      }
    } else {
      for (let i = 0; i < n; i++) {
        const v = clamp01(f[i]) * 255 + 0.5;
        rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255;
      }
    }
    maps[k] = rgba;
    transfer.push(rgba.buffer);
  }
  return { size, maps, transfer };
}

async function engineRun(kind, payload) {
  if (kind === 'generate') return engineMaps(runGenerate(payload));
  if (kind === 'process') return engineMaps(await runProcess(payload));
  throw new Error('unknown kind ' + kind);
}

if (typeof importScripts === 'function') {
  self.onmessage = async (e) => {
    const { id, kind, payload } = e.data;
    try {
      if (kind === 'zip') {
        const data = makeZip(payload.entries);
        postMessage({ id, kind: 'zip', data }, [data.buffer]);
        return;
      }
      const r = await engineRun(kind, payload);
      postMessage({ id, kind: 'maps', size: r.size, maps: r.maps }, r.transfer);
    } catch (err) {
      postMessage({ id, error: (err && err.message) || String(err) });
    }
  };
}
