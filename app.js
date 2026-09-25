/* ============================================================
   画面まわり。計算は core.js。
   ============================================================ */
const THUMB_SPEEDS = [0.1, 0.3, 0.6];
const METRIC_NAME = ['ratio_speed', 'ratio_vx', 'ratio_vw', 'decel_flag'];

const TUNING = [
  { k:'gain',  label:'slowdown_gain',     desc:'反力と減速の強さ。大きいほど早く減速', lo:0,   hi:1.7, unit:'' },
  { k:'gamma', label:'slowdown_gamma',    desc:'距離減衰の指数。大きいほど近距離で強く', lo:0.1, hi:4,   unit:'' },
  { k:'focus', label:'slowdown_focus',    desc:'前方への集中度。大きいほど回避を抑制', lo:0,   hi:1,   unit:'' },
  { k:'filt',  label:'vel_filter_weight', desc:'速度の平滑化。大きいほど過去を保持',   lo:0,   hi:1,   unit:'' },
  { k:'bias',  label:'velocity_bias',     desc:'停止時にも残す反力。0 で無効',         lo:0,   hi:0.5, unit:'m²/s²' },
];
const DISP = [
  { k:'speed',   label:'指令速度',        desc:'メインマップの指令速度',      lo:0.01, hi:1,   unit:'m/s' },
  { k:'heading', label:'指令方位',        desc:'0 = +x 方向',                lo:-180, hi:180, unit:'deg' },
  { k:'vw',      label:'指令角速度',      desc:'その場旋回の指令',            lo:-2,   hi:2,   unit:'rad/s' },
  { k:'thr',     label:'減速判定しきい値', desc:'これを下回ったら減速とみなす', lo:0.5,  hi:1,   unit:'' },
];

const CFG_KEY = { gain:'slowdown_gain', gamma:'slowdown_gamma', focus:'slowdown_focus',
                  filt:'vel_filter_weight', bias:'velocity_bias' };

const el = id => document.getElementById(id);
const rows = {};                 // k -> {range, number}
let mapSize = 520, thumbSize = 120;
let lastMs = 0, gridShown = 0;
let pending = false, pendingCoarse = false;

/* ---- 解像度の自動調整 ---------------------------------------------------
   機械の速さが分からないので、実測時間から次回のグリッドを決める。
   ドラッグ中は 30ms、離したあとは 200ms を目安にする。 */
const AUTO = { full: 160, coarse: 80, tFull: 200, tCoarse: 30 };
function tuneGrid(tier, ms) {
  const target = tier === 'coarse' ? AUTO.tCoarse : AUTO.tFull;
  const cur = AUTO[tier];
  if (ms < 1) return;
  const ideal = cur * Math.sqrt(target / ms);
  const next = cur + (ideal - cur) * 0.5;                       // 鈍らせて振動を防ぐ
  AUTO[tier] = Math.round(Math.max(tier === 'coarse' ? 32 : 48,
                                   Math.min(tier === 'coarse' ? 160 : 260, next)));
}

/* ---- パネルの組み立て ---- */
function buildRow(spec, host) {
  const wrap = document.createElement('div');
  wrap.className = 'row';
  wrap.innerHTML =
    `<div class="head"><span class="nm">${spec.label}</span><span class="ds">${spec.desc}</span>
       <span class="rng"></span></div>
     <div class="ctl"><input type="range"><input type="number"><span class="unit">${spec.unit}</span></div>`;
  const range = wrap.querySelector('input[type=range]');
  const num = wrap.querySelector('input[type=number]');
  rows[spec.k] = { spec, wrap, range, num };
  host.appendChild(wrap);

  const push = (v, coarse) => {
    v = Math.round(v * 100) / 100;                              // 表示・保存と一致させる
    S[spec.k] = v;
    range.value = v; num.value = v.toFixed(2);
    requestRender(coarse);
  };
  range.addEventListener('input', () => push(+range.value, true));
  range.addEventListener('change', () => push(+range.value, false));
  num.addEventListener('input', () => {
    const v = parseFloat(num.value);
    if (!isFinite(v)) return;                                   // 数値でなければ何もしない
    widenFor(spec.k, v);                                        // config 由来なら範囲を広げる
    const r = rows[spec.k];
    S[spec.k] = clamp(Math.round(v * 100) / 100, r.lo, r.hi);   // 広げても収まらなければ丸める
    range.value = S[spec.k];
    requestRender(false);
  });
  num.addEventListener('change', () => {                        // 欄を離れたら丸めた結果を見せる
    num.value = (+S[spec.k]).toFixed(2);
  });
  setRange(spec.k, spec.lo, spec.hi);
}

function setRange(k, lo, hi) {
  const r = rows[k];
  r.lo = lo; r.hi = hi;
  r.range.min = lo; r.range.max = hi; r.range.step = 0.01;
  r.num.step = 0.01; r.num.min = lo; r.num.max = hi;
  r.wrap.querySelector('.rng').textContent = `${lo.toFixed(2)} – ${hi.toFixed(2)}`;
}

/** config 由来の値は推奨範囲を超えることがあるので、範囲のほうを広げる。 */
function widenFor(k, v) {
  if (!CFG_KEY[k]) return;
  const r = rows[k];
  let { lo, hi } = r;
  if (v < lo) lo = Math.floor(v * 12) / 10;
  if (v > hi) hi = Math.ceil(v * 12) / 10;
  if (lo !== r.lo || hi !== r.hi) setRange(k, lo, hi);
}

function syncRow(k) {
  const r = rows[k];
  widenFor(k, S[k]);
  r.range.value = S[k];
  r.num.value = (+S[k]).toFixed(2);
}

/* ---- config ---- */
function loadCfg(json, name) {
  applyCfg(json, name);
  for (const s of TUNING) { setRange(s.k, s.lo, s.hi); syncRow(s.k); }
  el('cfgName').textContent = S.cfgName;
  el('cfgName').title = S.cfgName;
  el('cfgInfo').innerHTML =
    `ctrl_ms=${S.ctrlMs}　detect_radius=${S.detectRadiusM * 1000}mm　resolution=${S.resolutionMm}mm<br>` +
    `future_location_weight=${S.futureW.toFixed(2)}　map_decay=${S.mapDecay.toFixed(2)}　anker=${S.ankX.length}点`;
  resize();
  requestRender(false);
}

function tryLoadText(text, name) {
  let j;
  try { j = JSON.parse(text); }
  catch (e) { return showError('JSON として読めません', name); }
  if (!looksLikeCfg(j)) return showError('safe_run のパラメータファイルではありません', name);
  loadCfg(j, name);
  try { localStorage.setItem('srdv_cfg', JSON.stringify({ name, json: j })); } catch (e) {}
  toast(`読み込みました: ${name}（アンカー ${S.ankX.length} 点 / detect_radius ${S.detectRadiusM * 1000}mm）`);
}

function saveTuned() {
  const out = JSON.parse(JSON.stringify(S.cfg));
  for (const k of Object.keys(CFG_KEY)) out[CFG_KEY[k]] = Math.round(S[k] * 100) / 100;
  const base = S.cfgName.replace(/\.json$/i, '');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
  a.download = `${base}.tuned.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`保存しました: ${base}.tuned.json`);
}

/* ---- 通知 ---- */
let toastTimer = 0;
function toast(msg) {
  const t = el('toast');
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.display = 'none'; }, 6000);
}
function showError(head, body) {
  el('errHead').textContent = head;
  el('errBody').textContent = body || '';
  el('err').style.display = 'flex';
}
function hideError() { el('err').style.display = 'none'; }

/* ---- 描画 ---- */
const scratch = new Map();
function scratchCanvas(n) {
  let c = scratch.get(n);
  if (!c) { c = document.createElement('canvas'); c.width = c.height = n; scratch.set(n, c); }
  return c;
}

function drawField(cv, f, detail) {
  const w = cv.width, ctx = cv.getContext('2d');
  const sc = scratchCanvas(f.n);
  sc.getContext('2d').putImageData(f.img, 0, 0);
  ctx.clearRect(0, 0, w, w);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sc, 0, 0, w, w);

  const n = f.n, cw = w / n, px = Math.max(cw, 1) + 0.5;
  if (S.showContour && f.mode !== 3) {
    ctx.fillStyle = 'rgba(255,59,48,0.55)';                     // 実質停止の範囲
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
      if (f.stoppedC[j * n + i]) ctx.fillRect(i * cw, (n - 1 - j) * cw, px, px);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';                   // 減速開始の等高線
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
      const k = j * n + i;
      const b = f.belowC;
      if (!b[k]) continue;
      if (b[k-1] && b[k+1] && b[k-n] && b[k+n]) continue;
      ctx.fillRect(i * cw, (n - 1 - j) * cw, px, px);
    }
  }

  const r = S.detectRadiusM;
  const X = v => (v + r) / (2 * r) * w, Y = v => w - (v + r) / (2 * r) * w;
  ctx.lineWidth = detail ? 1.5 : 1;
  ctx.strokeStyle = 'rgba(80,80,88,0.55)';
  ctx.beginPath(); ctx.arc(w / 2, w / 2, w / 2 - 1, 0, 7); ctx.stroke();

  ctx.strokeStyle = getCSS('--robot'); ctx.lineWidth = detail ? 2 : 1.2;
  ctx.beginPath();
  for (let k = 0; k < S.ankX.length; k++) {
    const x = X(S.ankX[k]), y = Y(S.ankY[k]);
    k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.stroke();
  if (detail) {
    ctx.fillStyle = getCSS('--robot');
    for (let k = 0; k < S.ankX.length; k++)
      { ctx.beginPath(); ctx.arc(X(S.ankX[k]), Y(S.ankY[k]), 2.5, 0, 7); ctx.fill(); }
  }

  const hd = f.hdeg * Math.PI / 180, len = Math.min(f.spd, 1) * w * 0.22;
  const x0 = w / 2, y0 = w / 2, x1 = x0 + len * Math.cos(hd), y1 = y0 - len * Math.sin(hd);
  ctx.strokeStyle = getCSS('--arrow'); ctx.lineWidth = detail ? 2.5 : 1.5;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.save(); ctx.translate(x1, y1); ctx.rotate(-hd);
  ctx.fillStyle = getCSS('--arrow');
  const ah = detail ? 10 : 6, aw = detail ? 4 : 2.5;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-ah, aw); ctx.lineTo(-ah, -aw); ctx.fill();
  ctx.restore();
}

const cssCache = {};
function getCSS(v) {
  return cssCache[v] || (cssCache[v] = getComputedStyle(document.documentElement).getPropertyValue(v).trim());
}

/* ---- 再計算と再描画 ---- */
function requestRender(coarse) {
  pendingCoarse = coarse;
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; render(pendingCoarse); });
}

function render(coarse) {
  const tier = coarse ? 'coarse' : 'full';
  const n = AUTO[tier];
  const nt = Math.max(24, Math.round(n * 0.6));
  const t0 = performance.now();

  if (S.showThumbs) {
    const host = el('thumbs');
    for (let i = 0; i < 3; i++) {
      const f = computeField(nt, THUMB_SPEEDS[i], S.heading, 0, 0, S.thr);
      const cv = host.children[i].querySelector('canvas');
      drawField(cv, f, false);
      host.children[i].querySelector('figcaption').textContent =
        `減速 ${f.rangeM.toFixed(2)} / 停止 ${f.stopM > 0 ? f.stopM.toFixed(2) : '-'} m`;
    }
  }
  const f = computeField(n, S.speed, S.heading, S.vw, S.metric, S.thr);
  drawField(el('map'), f, true);

  lastMs = performance.now() - t0;
  gridShown = n;
  tuneGrid(tier, lastMs);
  updateReadout(f, coarse);
}

function updateReadout(f, coarse) {
  const mn = METRIC_NAME[S.metric];
  el('mapTitle').textContent = `スライダ連動（${S.speed.toFixed(2)} m/s / ${mn}）`;
  el('axis').textContent = `x [m] → / y [m] ↑ ・ detect_radius = ${S.detectRadiusM.toFixed(2)} m`;
  el('roMain').textContent =
    `指令方向  減速開始 ${f.rangeM.toFixed(3)} m  /  停止 ${f.stopM > 0 ? f.stopM.toFixed(3) + ' m' : 'なし'}`;
  const basis = (S.contactBasis && S.objectModel) ? '障害物の表面' : '障害物の中心';
  el('roSub').textContent =
    `（ロボット中心から${basis}まで。${mn} が ${S.thr.toFixed(2)} / ${STOP_EPS.toFixed(2)} を下回る最遠点）`;
  el('roMin').textContent = `場の最小 ${mn}: ${f.minVal.toFixed(2)}`;
  el('roPerf').textContent =
    `再計算 ${lastMs.toFixed(0)} ms / ${gridShown}×${gridShown}${coarse ? '（粗）' : ''} / アンカー ${S.ankX.length} 点`;
  el('note').textContent = S.objectModel
    ? `※ 直径 ${(S.obstacleRadiusM * 2).toFixed(2)} m の占有セル群を各位置に置いて合算している。合算のしかたは実機ノードと同じで、物体の形は円板で固定。`
    : '※ 障害物 1 セルだけを各位置に置いた場合の図。実機は占有マップの多数のセルを合算するので、実際とは差が出る。';
}

/* ---- レイアウト ---- */
function resize() {
  const left = el('left'), panel = el('panel');
  const availH = left.clientHeight
    - (S.showThumbs ? thumbSize + 34 : 0)
    - el('mapTitle').offsetHeight - el('legend').offsetHeight - 24;
  const availW = left.clientWidth;
  mapSize = Math.max(200, Math.min(availW, availH));
  const cv = el('map');
  cv.width = cv.height = Math.round(mapSize);
  cv.style.width = cv.style.height = Math.round(mapSize) + 'px';

  const host = el('thumbs');
  host.hidden = !S.showThumbs;
  if (S.showThumbs) {
    thumbSize = Math.max(90, Math.min(140, Math.floor((availW - 20) / 3)));
    if (host.children.length !== 3) {
      host.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const fig = document.createElement('figure');
        fig.innerHTML = `<span class="ttl">${THUMB_SPEEDS[i].toFixed(2)} m/s</span>
                         <canvas></canvas><figcaption></figcaption>`;
        host.appendChild(fig);
      }
    }
    for (const fig of host.children) {
      const c = fig.querySelector('canvas');
      c.width = c.height = thumbSize;
      c.style.width = c.style.height = thumbSize + 'px';
    }
  }
}

/* ---- 操作 ---- */
function refreshButtons() {
  el('thumbBtn').textContent = `小窓 ${S.showThumbs ? '表示' : '非表示'}`;
  el('thumbBtn').classList.toggle('on', S.showThumbs);
  el('contourBtn').textContent = `等高線 ${S.showContour ? '表示' : '非表示'}`;
  el('contourBtn').classList.toggle('on', S.showContour);
  el('filtBtn').textContent = `vel_filter ${S.steadyFilter ? '無効' : '有効'}`;
  el('filtBtn').classList.toggle('on', !S.steadyFilter);
  el('swapBtn').textContent = `anker xy入替 ${S.swapAnchors ? 'する' : 'しない'}`;
  el('swapBtn').classList.toggle('on', S.swapAnchors);
  el('basisBtn').textContent = `基準 ${S.contactBasis ? '障害物の表面' : '障害物の中心'}`;
  el('basisBtn').classList.toggle('on', S.contactBasis);
  el('modelBtn').textContent = S.objectModel
    ? `障害物モデル: 物体（直径 ${(S.obstacleRadiusM * 2).toFixed(2)} m の占有セル群）`
    : '障害物モデル: 単一点';
  el('modelBtn').classList.toggle('on', S.objectModel);
}

function init() {
  el('stopPct').textContent = (STOP_EPS * 100).toFixed(0);
  for (const s of TUNING) buildRow(s, el('tuning'));
  for (const s of DISP) buildRow(s, el('disp'));
  for (const s of DISP) syncRow(s.k);

  // 前回読んだ config があれば復元する
  let cfg = DEFAULT_CFG, name = (typeof DEFAULT_CFG_NAME !== 'undefined')
    ? DEFAULT_CFG_NAME : 'default.json';
  try {
    const saved = JSON.parse(localStorage.getItem('srdv_cfg') || 'null');
    if (saved && looksLikeCfg(saved.json)) { cfg = saved.json; name = saved.name; }
  } catch (e) {}
  loadCfg(cfg, name);

  el('openBtn').onclick = () => el('fileInput').click();
  el('saveBtn').onclick = saveTuned;
  el('resetBtn').onclick = () => {
    for (const k of Object.keys(CFG_KEY)) { S[k] = S.cfg[CFG_KEY[k]] ?? S[k]; syncRow(k); }
    requestRender(false);
  };
  el('helpBtn').onclick = () => el('help').showModal();
  el('helpClose').onclick = () => el('help').close();
  el('metric').onchange = e => { S.metric = +e.target.value; requestRender(false); };
  el('modelBtn').onclick = () => { S.objectModel = !S.objectModel; refreshButtons(); requestRender(false); };
  el('thumbBtn').onclick = () => { S.showThumbs = !S.showThumbs; refreshButtons(); resize(); requestRender(false); };
  el('contourBtn').onclick = () => { S.showContour = !S.showContour; refreshButtons(); requestRender(false); };
  el('filtBtn').onclick = () => { S.steadyFilter = !S.steadyFilter; refreshButtons(); requestRender(false); };
  el('swapBtn').onclick = () => { S.swapAnchors = !S.swapAnchors; applyAnchors(); refreshButtons(); requestRender(false); };
  el('basisBtn').onclick = () => { S.contactBasis = !S.contactBasis; refreshButtons(); requestRender(false); };

  const fi = el('fileInput');
  fi.onchange = () => {
    const f = fi.files[0];
    if (!f) return;
    f.text().then(t => tryLoadText(t, f.name)).catch(() => showError('ファイルを読めません', f.name));
    fi.value = '';
  };

  // ドラッグ＆ドロップ
  const hint = el('dropHint');
  document.addEventListener('dragover', e => { e.preventDefault(); hint.style.display = 'flex'; });
  document.addEventListener('dragleave', e => { if (e.relatedTarget === null) hint.style.display = 'none'; });
  document.addEventListener('drop', e => {
    e.preventDefault(); hint.style.display = 'none';
    const f = e.dataTransfer.files[0];
    if (f) f.text().then(t => tryLoadText(t, f.name)).catch(() => showError('ファイルを読めません', f.name));
  });

  el('err').onclick = hideError;
  document.addEventListener('keydown', e => {
    if (el('err').style.display === 'flex') { hideError(); e.preventDefault(); }
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    resize(); requestRender(true);
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => requestRender(false), 250);   // 粗いまま放置しない
  });
  refreshButtons();
  resize();
  requestRender(false);
}

/* 検証用: 場をそのまま取り出す（ヘッドレスでの照合に使う） */
window.__dumpField = (n, spd, hdeg, vw, mode, thr) => {
  const f = computeField(n, spd, hdeg || 0, vw || 0, mode || 0, thr || 0.9);
  return { val: Array.from(f.val), rangeM: f.rangeM, stopM: f.stopM, minVal: f.minVal };
};

document.addEventListener('DOMContentLoaded', init);
