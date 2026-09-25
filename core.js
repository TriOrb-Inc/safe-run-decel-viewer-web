/* ============================================================
   safe_run 減速範囲の計算
   Processing 版 safe_run_decel_viewer.pde からの移植で、元は
   tools/plot_safe_run_decel_range.py。式は一切変えていない。
   ============================================================ */
const EPS = 1e-6;
const HALF_PI = Math.PI / 2;
const STOP_EPS = 0.05;   // 実質停止とみなす出力速度比（指令の 5%）

const S = {
  cfg: null, cfgName: '',
  detectRadiusM: 2.5, ctrlMs: 100, futureW: 1, mapDecay: 0, resolutionMm: 20,
  ankXcfg: [], ankYcfg: [], ankX: [], ankY: [], swapAnchors: false,
  gain: 1, gamma: 1.5, focus: 0.8, filt: 0.5, bias: 0,
  speed: 0.3, heading: 0, vw: 0, thr: 0.9,
  metric: 0, objectModel: true, steadyFilter: true,
  showThumbs: true, showContour: true, contactBasis: true,
  obstacleRadiusM: 0.15,
  N: 160, NT: 96, coarse: false,
};

/* ---- 事前算出（Processing 版 prepareParams と同じ） ---- */
const P = {};
function prepareParams(spd, hdeg, vw) {
  const focus = clamp(S.focus, 0, 100);
  P.fcl = Math.max(S.gain, EPS);
  P.fcg = Math.max(S.gamma, EPS);
  P.wac = 0.5 + 0.5 * focus;
  P.wag = 1.0 + focus;
  P.avoidW = clamp(1.0 - 0.7 * focus, 0.3, 1.0);

  const hd = hdeg * Math.PI / 180;
  P.vx = spd * Math.cos(hd);
  P.vy = spd * Math.sin(hd);
  P.vw = vw;

  const fw = clamp(S.filt, 0, 1);
  const nvx = S.steadyFilter ? P.vx : P.vx * (1 - fw);
  const nvy = S.steadyFilter ? P.vy : P.vy * (1 - fw);

  P.mDist = Math.hypot(nvx, nvy);
  P.mAng = P.mDist > EPS ? Math.atan2(nvy, nvx) : 0;
  P.stationary = P.mDist < EPS;
  P.rDist = Math.hypot(P.vx, P.vy);
  P.rAng = P.rDist > EPS ? Math.atan2(P.vy, P.vx) : 0;

  const dt = (S.ctrlMs + S.ctrlMs) / 1000;   // last acc/dec は ctrl_ms と仮定
  const flw = clamp(S.futureW, 0, 1);
  P.psx = flw * nvx * dt;
  P.psy = flw * nvy * dt;

  const bias = Math.max(S.bias, 0);
  P.velTerm = P.mDist * P.mDist + bias;
  P.angVelTerm = Math.abs(P.vw) * Math.abs(P.vw) + bias;

  let maxAnk = 0;
  for (let k = 0; k < S.ankX.length; k++) maxAnk = Math.max(maxAnk, Math.hypot(S.ankX[k], S.ankY[k]));
  P.angRadius = maxAnk + 0.05 + (P.stationary ? 0 : Math.abs(P.mDist));
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/* ---- 障害物 1 セル分のアンカー合算 ---- */
const A = { nx: 0, ny: 0, d: 0, wt: 0, ws: 0 };
function accumulate(px, py) {
  let lwfx = 0, lwfy = 0, lms = 0;
  const ankX = S.ankX, ankY = S.ankY, n = ankX.length;
  for (let k = 0; k < n; k++) {
    const ox = px - (ankX[k] + P.psx), oy = py - (ankY[k] + P.psy);
    const od = Math.sqrt(ox * ox + oy * oy);
    let wc;
    if (P.stationary) {
      wc = 1;
    } else {
      const wa = angDiff(Math.atan2(oy, ox), P.mAng) * P.wac;
      if (Math.abs(wa) > HALF_PI) continue;
      wc = Math.pow(Math.cos(wa), P.wag);
    }
    const mag = P.velTerm * (P.fcl * wc) / (Math.pow(od, P.fcg) + EPS);
    const fdx = -ox / (od + EPS), fdy = -oy / (od + EPS);
    lwfx += fdx * mag * mag;
    lwfy += fdy * mag * mag;
    lms += mag;
  }
  A.nx = lwfx; A.ny = lwfy; A.d = lms;

  A.wt = 0; A.ws = 0;
  if (Math.abs(P.vw) > EPS && Math.sqrt(px * px + py * py) <= P.angRadius) {
    for (let k = 0; k < n; k++) {
      const ax = ankX[k] + P.psx, ay = ankY[k] + P.psy;
      const ox = px - ax, oy = py - ay;
      const od = Math.sqrt(ox * ox + oy * oy);
      const fdx = -ox / (od + EPS), fdy = -oy / (od + EPS);
      const mag = P.angVelTerm * P.fcl / (Math.pow(od, P.fcg) + EPS);
      A.wt += (ax * (fdy * mag) - ay * (fdx * mag)) * mag;
      A.ws += Math.abs(mag);
    }
  }
}

/* ---- 合算値から出力速度比を出す ---- */
const O = { rs: 1, rvx: 1, rvy: 1, rvw: 1 };
function finish(nx, ny, d, wt, ws) {
  let ovx = P.vx, ovy = P.vy;
  if (P.rDist > EPS) {
    let tfx = 0, tfy = 0;
    if (d > EPS) { tfx = nx / (d + EPS); tfy = ny / (d + EPS); }
    const tfd = Math.min(Math.hypot(tfx, tfy), P.mDist);
    const tfa = Math.atan2(tfy, tfx);
    const cvx = P.mDist * Math.cos(P.mAng) + tfd * Math.cos(tfa);
    const cvy = P.mDist * Math.sin(P.mAng) + tfd * Math.sin(tfa);
    const cd = Math.min(Math.hypot(cvx, cvy), P.rDist);
    const ca = Math.atan2(cvy, cvx);
    const fd = cd * Math.abs(Math.cos(angDiff(ca, P.rAng) * (1 - P.avoidW)));
    ovx = fd * Math.cos(ca); ovy = fd * Math.sin(ca);
  }
  O.rs = P.rDist > EPS ? Math.hypot(ovx, ovy) / P.rDist : 1;
  O.rvx = Math.abs(P.vx) > EPS ? ovx / P.vx : 1;
  O.rvy = Math.abs(P.vy) > EPS ? ovy / P.vy : 1;
  O.rvw = 1;
  if (Math.abs(P.vw) > EPS && ws > EPS) {
    O.rvw = clamp(1 - Math.tanh(Math.abs(wt / (ws + EPS)) * P.fcl), 0, 1);
  }
}

function metricOf(thr, mode) {
  if (mode === 0) return O.rs;
  if (mode === 1) return O.rvx;
  if (mode === 2) return O.rvw;
  return (Math.abs(O.rvx) < thr || Math.abs(O.rvy) < thr || Math.abs(O.rvw) < thr) ? 1 : 0;
}

/* ---- 障害物を置けない範囲 --------------------------------------------
   占有マップは 2D ライダーの点群から作られるので、自機の輪郭の内側にセルは立たない。
   物体モデルでは「円板が輪郭に重なる中心位置」も同様に起こり得ないので、
   輪郭を障害物半径だけ膨らませた範囲を計算対象から外す。
   ここを描くと、1/距離^γ の特異点でアンカー点ごとに円形の抜けが出てしまう。 */
const maskCache = new Map();

function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}

function insidePolygon(px, py) {
  const X = S.ankX, Y = S.ankY, m = X.length;
  if (m < 3) return false;
  let inside = false;
  for (let i = 0, j = m - 1; i < m; j = i++) {
    if ((Y[i] > py) !== (Y[j] > py) &&
        px < (X[j] - X[i]) * (py - Y[i]) / (Y[j] - Y[i]) + X[i]) inside = !inside;
  }
  return inside;
}

function buildMask(n, margin) {
  const r = S.detectRadiusM, step = 2 * r / (n - 1);
  const X = S.ankX, Y = S.ankY, m = X.length;
  const mask = new Uint8Array(n * n);
  // 輪郭の外接矩形を margin だけ広げて、遠いセルは即座に除外する
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let k = 0; k < m; k++) {
    x0 = Math.min(x0, X[k]); x1 = Math.max(x1, X[k]);
    y0 = Math.min(y0, Y[k]); y1 = Math.max(y1, Y[k]);
  }
  x0 -= margin; x1 += margin; y0 -= margin; y1 += margin;
  const mg2 = margin * margin;
  for (let j = 0; j < n; j++) {
    const py = -r + j * step;
    if (py < y0 || py > y1) continue;
    for (let i = 0; i < n; i++) {
      const px = -r + i * step;
      if (px < x0 || px > x1) continue;
      let hit = insidePolygon(px, py);
      if (!hit && margin > 0) {
        for (let k = 0, q = m - 1; k < m; q = k++) {
          if (segDist2(px, py, X[q], Y[q], X[k], Y[k]) <= mg2) { hit = true; break; }
        }
      }
      if (hit) mask[j * n + i] = 1;
    }
  }
  return mask;
}

function getMaskM(n, margin) {
  const key = n + '|' + margin.toFixed(4);
  let m = maskCache.get(key);
  if (!m) { m = buildMask(n, margin); maskCache.set(key, m); }
  return m;
}

/** 障害物の中心を置けない範囲（輪郭を障害物半径だけ膨らませたもの） */
function getMask(n) { return getMaskM(n, S.objectModel ? S.obstacleRadiusM : 0); }

/**
 * 「障害物の表面がここに触れたら」基準の領域を作る。
 *
 * 障害物は外から近づくので、方向ごとに中心基準の外縁を求め、そこから障害物半径だけ
 * 内側に引いた範囲を塗る。モルフォロジーの収縮だと帯の幅にも引っかかって縮みすぎる。
 * 半径方向の近づき方を仮定した近似で、読み出しの距離（外縁 − 半径）と一致する。
 */
const CONTACT_BINS = 180;
function contactRegion(src, n, step, radius, body) {
  const r = S.detectRadiusM;
  const TAU = 2 * Math.PI;
  const outer = new Float32Array(CONTACT_BINS);

  for (let j = 0; j < n; j++) {
    const py = -r + j * step;
    for (let i = 0; i < n; i++) {
      if (!src[j * n + i]) continue;
      const px = -r + i * step;
      const d = Math.hypot(px, py);
      let a = Math.atan2(py, px); if (a < 0) a += TAU;
      const b = Math.min(CONTACT_BINS - 1, (a / TAU * CONTACT_BINS) | 0);
      if (d > outer[b]) outer[b] = d;
    }
  }
  // 量子化で空になった方位を隣から埋める
  const sm = new Float32Array(CONTACT_BINS);
  for (let b = 0; b < CONTACT_BINS; b++) {
    const p = (b - 1 + CONTACT_BINS) % CONTACT_BINS, q = (b + 1) % CONTACT_BINS;
    sm[b] = Math.max(outer[b], Math.min(outer[p], outer[q]));
  }

  const out = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    const py = -r + j * step;
    for (let i = 0; i < n; i++) {
      const idx = j * n + i;
      if (body[idx]) continue;                     // 自機の内部は対象外
      const px = -r + i * step;
      const d = Math.hypot(px, py);
      let a = Math.atan2(py, px); if (a < 0) a += TAU;
      const b = Math.min(CONTACT_BINS - 1, (a / TAU * CONTACT_BINS) | 0);
      if (sm[b] > 0 && d <= sm[b] - radius) out[idx] = 1;
    }
  }
  return out;
}

/* ---- 場 ---- */
const fieldCache = new Map();
function getField(n) {
  let f = fieldCache.get(n);
  if (!f) {
    const c = n * n;
    f = { n, val: new Float32Array(c), below: new Uint8Array(c), stopped: new Uint8Array(c),
          nx: new Float32Array(c), ny: new Float32Array(c), dd: new Float32Array(c),
          wt: new Float32Array(c), ws: new Float32Array(c),
          cnx: new Float32Array(c), cny: new Float32Array(c), cdd: new Float32Array(c),
          cwt: new Float32Array(c), cws: new Float32Array(c),
          belowC: null, stoppedC: null,
          img: null, rangeM: 0, stopM: 0, minVal: 1, spd: 0, hdeg: 0, mode: 0 };
    fieldCache.set(n, f);
  }
  return f;
}

function buildKernel(step) {
  if (!S.objectModel) return [[0, 0]];
  const R = Math.max(1, Math.round(S.obstacleRadiusM / step));
  const k = [];
  for (let j = -R; j <= R; j++)
    for (let i = -R; i <= R; i++)
      if (i * i + j * j <= R * R) k.push([i, j]);
  return k;
}

function computeField(n, spd, hdeg, vw, mode, thr) {
  const f = getField(n);
  prepareParams(spd, hdeg, vw);
  f.spd = spd; f.hdeg = hdeg; f.mode = mode;
  const r = S.detectRadiusM, step = 2 * r / (n - 1);

  // 1) 占有セル 1 個分のアンカー合算（検出円の外も占有マップ内なので全セル）
  for (let j = 0; j < n; j++) {
    const py = -r + j * step;
    for (let i = 0; i < n; i++) {
      accumulate(-r + i * step, py);
      const idx = j * n + i;
      f.nx[idx] = A.nx; f.ny[idx] = A.ny; f.dd[idx] = A.d;
      f.wt[idx] = A.wt; f.ws[idx] = A.ws;
    }
  }

  // 2) 物体の形と畳み込む
  let cnx = f.nx, cny = f.ny, cdd = f.dd, cwt = f.wt, cws = f.ws;
  if (S.objectModel) {
    const kern = buildKernel(step);
    cnx = f.cnx; cny = f.cny; cdd = f.cdd; cwt = f.cwt; cws = f.cws;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        let sx = 0, sy = 0, sd = 0, st = 0, sw = 0;
        for (let q = 0; q < kern.length; q++) {
          const ii = i + kern[q][0], jj = j + kern[q][1];
          if (ii < 0 || ii >= n || jj < 0 || jj >= n) continue;
          const p = jj * n + ii;
          sx += f.nx[p]; sy += f.ny[p]; sd += f.dd[p]; st += f.wt[p]; sw += f.ws[p];
        }
        const idx = j * n + i;
        cnx[idx] = sx; cny[idx] = sy; cdd[idx] = sd; cwt[idx] = st; cws[idx] = sw;
      }
    }
  }

  // 3) 比を出して画素にする
  if (!f.img || f.img.width !== n) f.img = new ImageData(n, n);
  const px32 = new Uint32Array(f.img.data.buffer);
  f.minVal = 1;
  const r2 = r * r;
  const mask = getMask(n);
  for (let j = 0; j < n; j++) {
    const py = -r + j * step;
    for (let i = 0; i < n; i++) {
      const pxx = -r + i * step;
      const idx = j * n + i, pix = (n - 1 - j) * n + i;
      if (pxx * pxx + py * py > r2) {
        f.val[idx] = 1; f.below[idx] = 0; f.stopped[idx] = 0;
        px32[pix] = OUTSIDE_RGBA;
        continue;
      }
      finish(cnx[idx], cny[idx], cdd[idx], cwt[idx], cws[idx]);
      const m = metricOf(thr, mode);
      f.val[idx] = m;                       // 真値は残す（Python 版との照合のため）
      if (mask[idx]) {                      // 障害物を置けない範囲は集計と描画から外す
        f.below[idx] = 0; f.stopped[idx] = 0;
        px32[pix] = OUTSIDE_RGBA;
        continue;
      }
      f.below[idx] = (mode !== 3 && m < thr) ? 1 : 0;
      f.stopped[idx] = (mode !== 3 && Math.abs(m) <= STOP_EPS) ? 1 : 0;
      if (mode !== 3) f.minVal = Math.min(f.minVal, m);
      px32[pix] = viridis32(clamp(m, 0, 1));
    }
  }

  // 「障害物の表面がここに触れたら」基準の領域
  if (S.contactBasis && S.objectModel) {
    const body = getMaskM(n, 0);
    f.belowC = contactRegion(f.below, n, step, S.obstacleRadiusM, body);
    f.stoppedC = contactRegion(f.stopped, n, step, S.obstacleRadiusM, body);
  } else {
    f.belowC = f.below;
    f.stoppedC = f.stopped;
  }

  f.rangeM = rayCross(f, hdeg, step, thr, mode);
  f.stopM = mode === 3 ? 0 : rayCross(f, hdeg, step, STOP_EPS, mode);
  // 表面基準では障害物半径ぶん手前になる
  if (S.contactBasis && S.objectModel) {
    f.rangeM = Math.max(0, f.rangeM - S.obstacleRadiusM);
    f.stopM = f.stopM > 0 ? Math.max(0, f.stopM - S.obstacleRadiusM) : 0;
  }
  return f;
}

/** 場を実座標で双一次補間して読む。格子外は 1。 */
function sampleVal(f, x, y, step) {
  const r = S.detectRadiusM;
  const fi = (x + r) / step, fj = (y + r) / step;
  const i0 = Math.floor(fi), j0 = Math.floor(fj);
  if (i0 < 0 || i0 + 1 >= f.n || j0 < 0 || j0 + 1 >= f.n) return 1;
  const u = fi - i0, v = fj - j0;
  const a = f.val[j0 * f.n + i0], b = f.val[j0 * f.n + i0 + 1];
  const c = f.val[(j0 + 1) * f.n + i0], d = f.val[(j0 + 1) * f.n + i0 + 1];
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}

/** 指令方向に沿って lim を下回る最遠点までの距離。 */
function rayCross(f, hdeg, step, lim, mode) {
  const r = S.detectRadiusM, hd = hdeg * Math.PI / 180;
  const cx = Math.cos(hd), cy = Math.sin(hd), fine = step * 0.25;
  let prevD = r, prevM = sampleVal(f, r * cx, r * cy, step);
  for (let d = r - fine; d > 0; d -= fine) {
    const m = sampleVal(f, d * cx, d * cy, step);
    const hit = mode === 3 ? (m > 0.5) : (m < lim);
    if (hit) {
      const t = Math.abs(prevM - m) > EPS ? (prevM - lim) / (prevM - m) : 1;
      return prevD + (d - prevD) * clamp(t, 0, 1);
    }
    prevD = d; prevM = m;
  }
  return 0;
}

/* ---- 配色 ---- */
const OUTSIDE_RGBA = 0xFFE0DCDC | 0;   // ABGR（リトルエンディアン）= 背景の灰
const VIRIDIS = [[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]];
function viridis32(t) {
  const fpos = clamp(t, 0, 1) * (VIRIDIS.length - 1);
  const i = Math.min(fpos | 0, VIRIDIS.length - 2), u = fpos - i;
  const a = VIRIDIS[i], b = VIRIDIS[i + 1];
  const R = (a[0] + (b[0] - a[0]) * u) | 0;
  const G = (a[1] + (b[1] - a[1]) * u) | 0;
  const B = (a[2] + (b[2] - a[2]) * u) | 0;
  return (255 << 24) | (B << 16) | (G << 8) | R;
}

/* ---- config の反映 ---- */
function applyCfg(json, name) {
  S.cfg = json;
  S.cfgName = name || S.cfgName;
  S.detectRadiusM = (json.detect_radius ?? 2500) / 1000;
  S.ctrlMs        = json.ctrl_ms ?? 100;
  S.futureW       = json.future_location_weight ?? 1.0;
  S.mapDecay      = json.map_decay ?? 0.0;
  S.resolutionMm  = json.resolution ?? 20;
  S.gain  = json.slowdown_gain ?? 1.0;
  S.gamma = json.slowdown_gamma ?? 1.5;
  S.focus = json.slowdown_focus ?? 0.8;
  S.filt  = json.vel_filter_weight ?? 0.5;
  S.bias  = json.velocity_bias ?? 0.0;

  const a = json.anker_points || json.anchor_points || [];
  S.ankXcfg = a.length ? a.map(p => (p.x || 0) / 1000) : [0];
  S.ankYcfg = a.length ? a.map(p => (p.y || 0) / 1000) : [0];
  applyAnchors();
  fieldCache.clear();
  maskCache.clear();
}

function applyAnchors() {
  S.ankX = S.swapAnchors ? S.ankYcfg.slice() : S.ankXcfg.slice();
  S.ankY = S.swapAnchors ? S.ankXcfg.slice() : S.ankYcfg.slice();
  maskCache.clear();
}

/** safe_run の config らしいか（読み込み時の判定） */
function looksLikeCfg(j) {
  return j && typeof j === 'object' &&
    ('detect_radius' in j || 'anker_points' in j || 'anchor_points' in j || 'slowdown_gain' in j);
}
