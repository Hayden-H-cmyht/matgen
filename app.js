/* matgen 前端：浏览器本地引擎（Worker），线上/本地同一套 */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const cur = { type: null, maps: {}, size: 0, busy: false };

const MAP_LABEL = { albedo: '固有色', normal: '法线', roughness: '粗糙度',
                    height: '高度', ao: '环境光遮蔽', metal: '金属度' };
const MAP_ORDER = ['albedo', 'normal', 'roughness', 'height', 'ao', 'metal'];

/* ---------- 引擎封装：优先 Worker，失败则主线程直跑 ---------- */
const Engine = (() => {
  let worker = null;
  try { worker = new Worker('js/engine.js'); } catch (e) { worker = null; }
  let seq = 0;
  const pending = new Map();
  if (worker) worker.onmessage = (e) => {
    const { id, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error) p.reject(new Error(error));
    else if (e.data.kind === 'zip') p.resolve(e.data.data);
    else p.resolve({ size: e.data.size, maps: e.data.maps });
  };
  function run(kind, payload) {
    if (worker) return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, kind, payload });
    });
    if (kind === 'zip') return Promise.resolve(makeZip(payload.entries));
    return engineRun(kind, payload);
  }
  return { run };
})();

async function init() {
  const matsEl = $('#mats');
  for (const [key, m] of Object.entries(MATS)) {
    const b = document.createElement('button');
    b.className = 'mat'; b.dataset.key = key;
    b.innerHTML = `<span>${m.emoji}</span>${m.label}`;
    b.onclick = () => selectMat(key);
    matsEl.appendChild(b);
  }
  for (const a of AGING_META) {
    const row = document.createElement('div');
    row.className = 'agerow';
    row.innerHTML = `<label><input type="checkbox" data-key="${a.key}"> ${a.emoji} ${a.label}</label>
      <input type="range" min="0.1" max="1" step="0.05" value="0.5" data-k="${a.key}" disabled>`;
    const cb = row.querySelector('input[type=checkbox]');
    const rg = row.querySelector('input[type=range]');
    cb.onchange = () => { rg.disabled = !cb.checked; };
    $('#aging').appendChild(row);
  }
  selectMat(Object.keys(MATS)[0]);
  $('#gen').onclick = generate;
  $('#zip').onclick = downloadZip;
  $('#randseed').onclick = () => { $('#seed').value = Math.floor(Math.random() * 9999) + 1; };
  $('#file').onchange = upload;
  $('#seed').addEventListener('keydown', e => { if (e.key === 'Enter') generate(); });
  $$('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  ['rep', 'lang', 'lhi'].forEach(id => {
    $('#' + id).oninput = e => { $('#' + id + 'v').textContent = e.target.value; draw3D(); };
  });
  initGL();
  window.addEventListener('resize', () => { if ($('#tab-3d').classList.contains('on')) draw3D(); });
}

function selectMat(key) {
  cur.type = key;
  $$('.mat').forEach(b => b.classList.toggle('on', b.dataset.key === key));
  const m = MATS[key];
  const sel = $('#preset');
  sel.innerHTML = m.presets ? Object.keys(m.presets).map(p => `<option>${p}</option>`).join('') : '';
  sel.onchange = renderParams;
  renderParams();
}

/* 参数滑条默认值 = 参数默认 ← 预设覆盖（与引擎 matDefaults 同一逻辑） */
function renderParams() {
  const m = MATS[cur.type];
  const [merged] = matDefaults(cur.type, $('#preset').value);
  $('#params').innerHTML = m.params.map(d => {
    const v = merged[d.key];
    return `<label class="prow"><span>${d.label}</span>
      <input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}" data-key="${d.key}">
      <b class="pv">${v}</b></label>`;
  }).join('');
  $$('#params input[type=range]').forEach(r => {
    r.oninput = () => { r.parentElement.querySelector('.pv').textContent = r.value; };
  });
}

function collectBody() {
  const params = {};
  $$('#params input[type=range]').forEach(r => { params[r.dataset.key] = parseFloat(r.value); });
  const aging = {};
  $$('#aging input[type=checkbox]').forEach(cb => {
    if (cb.checked) aging[cb.dataset.key] = parseFloat($(`#aging input[data-k="${cb.dataset.key}"]`).value);
  });
  return {
    type: cur.type, preset: $('#preset').value, size: +$('#size').value,
    seed: $('#seed').value ? +$('#seed').value : Math.floor(Math.random() * 9999) + 1,
    params, aging,
  };
}

function toast(msg, sticky = false, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(t._tm);
  if (!sticky) t._tm = setTimeout(() => { t.className = ''; }, 2600);
}

async function generate() {
  if (cur.busy) return;
  const body = collectBody();
  cur.busy = true;
  $('#gen').disabled = true;
  $('#gen').textContent = '生成中…';
  const t0 = performance.now();
  try {
    const r = await Engine.run('generate', body);
    $('#seed').value = body.seed;
    applyMaps(r);
    toast(`完成 ✓  ${body.size}px  ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    toast('失败：' + e.message, false, true);
  } finally {
    cur.busy = false;
    $('#gen').disabled = false;
    $('#gen').textContent = '生成材质';
  }
}

async function upload(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (cur.busy) { e.target.value = ''; return; }
  cur.busy = true;
  toast('照片处理中…', true);
  try {
    const r = await Engine.run('process', { blob: f, size: +$('#size').value });
    applyMaps(r);
    toast('照片已转为无缝 PBR 材质 ✓');
  } catch (err) {
    toast('失败：' + err.message, false, true);
  } finally {
    cur.busy = false;
    e.target.value = '';
  }
}

function applyMaps(r) {
  cur.size = r.size;
  cur.maps = {};
  for (const [k, rgba] of Object.entries(r.maps)) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = r.size;
    cv.getContext('2d').putImageData(new ImageData(rgba, r.size, r.size), 0, 0);
    cur.maps[k] = cv;
  }
  $('#zip').disabled = false;
  drawTile();
  renderMaps();
  uploadGLTextures();
  const on = $('#tabs button.on').dataset.tab;
  if (on === '3d') draw3D();
}

/* ---------- 下载全套 ZIP（浏览器端打包） ---------- */
async function downloadZip() {
  const keys = MAP_ORDER.filter(k => cur.maps[k]);
  if (!keys.length) return;
  toast('打包中…', true);
  const base = `${cur.type}_${$('#seed').value || 'matgen'}_${cur.size}`;
  const entries = [];
  const cvToU8 = async (cv) => new Uint8Array(await (await cvToBlob(cv, 'image/png')).arrayBuffer());
  for (const k of keys) entries.push({ name: `${base}_${k}.png`, data: await cvToU8(cur.maps[k]) });
  entries.push({ name: `${base}_preview.jpg`, data: await cvToU8(tileCanvas(512)) });
  entries.push({ name: `${base}.mtl`, data: new TextEncoder().encode(mtlText(base)) });
  entries.push({ name: `${base}.obj`, data: new TextEncoder().encode(objText(base)) });
  const zip = await Engine.run('zip', { entries });
  const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url; a.download = `matgen_${base}.zip`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('已下载 ✓');
}

function cvToBlob(cv, type) {
  return new Promise(res => cv.toBlob(res, type, 0.9));
}

function tileCanvas(cell) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = cell * 3;
  const ctx = cv.getContext('2d');
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      ctx.drawImage(cur.maps.albedo, c * cell, r * cell, cell, cell);
  return cv;
}

function mtlText(base) {
  return `newmtl ${base}\nKa 1 1 1\nKd 1 1 1\n` +
    `map_Kd ${base}_albedo.png\nmap_Bump -bm 1.0 ${base}_normal.png\n` +
    `map_d ${base}_ao.png\n# roughness: ${base}_roughness.png  height: ${base}_height.png\n`;
}
function objText(base) {
  return `mtllib ${base}.mtl\nusemtl ${base}\n` +
    'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\n' +
    'f 1/1 2/2 3/3\nf 1/1 3/3 4/4\n';
}

/* ---------- 平铺预览 ---------- */
function drawTile() {
  if (!cur.maps.albedo) return;
  const cv = $('#tilecv'), ctx = cv.getContext('2d');
  const cell = cv.width / 3;
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      ctx.drawImage(cur.maps.albedo, c * cell, r * cell, cell, cell);
}

/* ---------- PBR 通道 ---------- */
function renderMaps() {
  const keys = MAP_ORDER.filter(k => cur.maps[k]);
  const strip = $('#mapstrip');
  strip.innerHTML = '';
  keys.forEach((k, i) => {
    const d = document.createElement('div');
    d.className = 'thumb' + (i === 0 ? ' on' : '');
    const cv = document.createElement('canvas');
    cv.width = cv.height = 84;
    cv.getContext('2d').drawImage(cur.maps[k], 0, 0, 84, 84);
    d.appendChild(cv);
    const lab = document.createElement('i');
    lab.textContent = MAP_LABEL[k];
    d.appendChild(lab);
    d.onclick = () => {
      $$('#mapstrip .thumb').forEach(x => x.classList.remove('on'));
      d.classList.add('on');
      drawBig(k);
    };
    strip.appendChild(d);
  });
  drawBig(keys[0]);
}

function drawBig(k) {
  const cv = $('#bigmap');
  cv.width = cv.height = cur.size;
  cv.getContext('2d').drawImage(cur.maps[k], 0, 0);
}

function showTab(name) {
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  $$('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + name));
  if (name === '3d') draw3D();
  if (name === 'tile') drawTile();
}

/* ---------- WebGL 3D 光照预览 ---------- */
const VS = `attribute vec2 p; varying vec2 v;
void main(){ v = p; gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `
precision highp float;
varying vec2 v;
uniform sampler2D uAlbedo, uNormal, uRough, uAO;
uniform float uRep, uLang, uLhi;

void main(){
  vec3 ro = vec3(0.0, 1.55, 3.1);
  vec3 ta = vec3(0.0, 0.72, 0.0);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(fw * 1.7 + rt * v.x * 1.55 + up * v.y * 1.55);

  float tmin = 1e9; int hit = 0; vec3 n; vec2 tuv;
  if (rd.y < -0.001) {
    float t = -ro.y / rd.y;
    if (t > 0.0 && t < tmin) { tmin = t; hit = 1; n = vec3(0.0, 1.0, 0.0);
      tuv = (ro + rd * t).xz; }
  }
  vec3 sc = vec3(0.0, 0.92, 0.0);
  vec3 oc = ro - sc;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - 0.8464;
  float disc = b * b - c;
  if (disc > 0.0) {
    float t = -b - sqrt(disc);
    if (t > 0.0 && t < tmin) { tmin = t; hit = 2;
      n = normalize(ro + rd * t - sc);
      tuv = vec2(atan(n.z, n.x) / 6.2831853 + 0.5,
                 acos(clamp(n.y, -1.0, 1.0)) / 3.14159265); }
  }
  vec3 bg = vec3(0.10, 0.11, 0.13);
  if (hit == 0) { gl_FragColor = vec4(bg, 1.0); return; }

  vec2 uv = tuv * uRep;
  vec3 alb = texture2D(uAlbedo, uv).rgb;
  vec3 nmt = texture2D(uNormal, uv).rgb * 2.0 - 1.0;
  float rgh = texture2D(uRough, uv).r;
  float ao  = texture2D(uAO, uv).r;

  vec3 T, B;
  if (hit == 2) {
    T = normalize(vec3(-n.z, 0.0, n.x));
    if (abs(n.y) > 0.99) T = vec3(1.0, 0.0, 0.0);
    B = cross(n, T);
  } else { T = vec3(1.0, 0.0, 0.0); B = vec3(0.0, 0.0, 1.0); }
  vec3 N = normalize(T * nmt.x + B * nmt.y + n * nmt.z);

  float la = radians(uLang);
  vec3 L = normalize(vec3(cos(la) * 2.0, uLhi, sin(la) * 2.0));
  float diff = max(dot(N, L), 0.0);
  vec3 H = normalize(L - rd);
  float shin = mix(240.0, 6.0, clamp(rgh, 0.0, 1.0));
  float spec = pow(max(dot(N, H), 0.0), shin) * (1.0 - rgh) * 1.5;
  float fres = pow(1.0 - max(dot(N, -rd), 0.0), 4.0) * 0.12;

  vec3 col = alb * (0.32 * ao + diff * ao) + vec3(spec + fres) * (0.3 + 0.7 * ao);
  float fg = 1.0 - exp(-max(tmin - 2.3, 0.0) * 0.32);
  gl_FragColor = vec4(mix(col, bg, fg), 1.0);
}`;

let gl = null, prog = null;
const tex = {};
const uni = {};

function initGL() {
  const cv = $('#glcv');
  gl = cv.getContext('webgl', { antialias: true });
  if (!gl) { cv.replaceWith(Object.assign(document.createElement('div'),
             { textContent: '此浏览器不支持 WebGL', className: 'hint' })); return; }
  const mk = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      console.error(gl.getShaderInfoLog(s));
    return s;
  };
  prog = gl.createProgram();
  gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  for (const [name, unit] of [['uAlbedo', 0], ['uNormal', 1], ['uRough', 2], ['uAO', 3]]) {
    uni[name] = gl.getUniformLocation(prog, name);
    gl.uniform1i(uni[name], unit);
  }
  uni.uRep = gl.getUniformLocation(prog, 'uRep');
  uni.uLang = gl.getUniformLocation(prog, 'uLang');
  uni.uLhi = gl.getUniformLocation(prog, 'uLhi');

  for (const k of ['albedo', 'normal', 'rough', 'ao']) {
    tex[k] = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex[k]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([80, 80, 80]));
  }
}

function uploadGLTextures() {
  if (!gl || !cur.maps.albedo) return;
  const put = (key, cv, unit) => {
    if (!cv) return;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex[key]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  };
  put('albedo', cur.maps.albedo, 0);
  put('normal', cur.maps.normal, 1);
  put('rough', cur.maps.roughness, 2);
  put('ao', cur.maps.ao, 3);
}

function draw3D() {
  if (!gl || !cur.maps.albedo) return;
  const cv = $('#glcv');
  const dpr = window.devicePixelRatio || 1;
  const w = Math.floor(cv.clientWidth * dpr), h = Math.floor(cv.clientHeight * dpr);
  if (w === 0 || h === 0) return;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  gl.viewport(0, 0, w, h);
  gl.useProgram(prog);
  gl.uniform1f(uni.uRep, +$('#rep').value);
  gl.uniform1f(uni.uLang, +$('#lang').value);
  gl.uniform1f(uni.uLhi, +$('#lhi').value);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.albedo);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex.normal);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tex.rough);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, tex.ao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

init();
