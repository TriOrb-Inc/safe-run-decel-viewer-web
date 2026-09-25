# safe_run 減速範囲ビューア

TriOrb AMR の `safe_run`（障害物に応じて速度を落とす機能）の減速範囲を、
パラメータを調整しながらリアルタイムに可視化するツールです。

**👉 ブラウザで開く: https://triorb-inc.github.io/safe-run-decel-viewer/**
（↑ 公開後に実際の URL に差し替えてください）

インストール不要です。上の URL を開くか、Release の zip を展開して `index.html`
をダブルクリックしてください。サーバも実行環境も要りません。

## できること

- `safe_run` のパラメータを動かすと、減速する範囲がその場で描き変わります
- 0.1 / 0.3 / 0.6 m/s の 3 速度を並べて比較できます
- 指令方向の「減速が始まる距離」と「実質停止する距離」を数値で表示します
- 調整した値を JSON として保存できます

## 使い方

1. 「開く」ボタン、またはウィンドウへのドラッグ＆ドロップで
   `safe_run_config.json` を読み込みます（最後に開いたものを記憶します）
2. スライダか右の数値欄でパラメータを調整します
3. 「保存」を押すと `<名前>.tuned.json` がダウンロードされます

**読み込んだファイルは書き換わりません。** 調整結果は別ファイルとして
ダウンロードされるので、実機への反映は利用者側で行ってください。

読み込むファイルを指定しなければ、同梱の `sample_config.json` で起動します。

### 図の読み方

| 表示 | 意味 |
|---|---|
| 色（viridis） | 出力速度 ÷ 指令速度。黄色が減速なし、暗いほど強く減速 |
| 白い等高線 | ここから減速が始まる（しきい値） |
| 赤い塗り | **ここに障害物が触れると実質停止**（出力が指令の 5% 以下） |
| 灰色 | 障害物を置けない範囲（自機と接触するため） |
| オレンジの輪郭 | ロボットの外形（`anker_points`） |

距離の基準は「障害物の**表面**」です。ボタンで「障害物の中心」基準にも切り替えられます。

### vel_filter 有効／無効

`vel_filter_weight` は、ノードが実際に使う速度を「今回の指令」と **前回の出力** で
混ぜる係数です。

    now_v = 指令速度 × (1 − w) + 前回の出力速度 × w

図を描くには前回の出力を仮定する必要があり、その仮定を切り替えるのがこのボタンです。

| | 仮定 | now_v |
|---|---|---|
| **無効（定常仮定）** | 前回出力 = 指令速度。その速度でしばらく走り続けている状態 | 指令速度そのもの。**w は結果に影響しない** |
| **有効（直前速度 0 仮定）** | 前回出力 = 0。停止から動き出した最初の 1 制御周期 | 指令速度 × (1 − w) |

有効にすると「フィルタによる立ち上がりの鈍り」と「障害物による減速」が同じ色に
混ざるため、減速範囲そのものを読むのには向きません。**通常は無効のまま**で
かまいません（既定）。`vel_filter_weight = 0` の config では切り替えても変化しません。

## ⚠ 安全に関する注意

**この図を安全距離の根拠に使わないでください。**

- ここに描かれるのは `safe_run` による減速だけです。**実機の保護停止は
  セーフティスキャナ (SLS) 側の設定によるもので、この図には含まれません。**
- SLS には別に減速ゾーンもあります。実機で減速を観測したときは、`safe_run` と
  SLS のどちらが効いたのかを先に切り分けてください。
- 障害物の形は直径 0.30 m の円板で固定しています。実際の物体が大きければ、
  表面はより手前で止まります。
- 各点は「いまその位置に障害物があったら」の値です。減速しながら近づく過程は
  表していません。

## 取り扱うデータについて

**読み込んだパラメータファイルは外部に送信されません。** このページは
`fetch` / `XMLHttpRequest` / `WebSocket` のいずれも使っておらず、外部 CDN も
参照していません。すべてブラウザの中だけで処理されます。

最後に開いたファイルの内容は、次回の復元のためブラウザの localStorage に
保存されます（利用者の PC 内で完結します）。共用 PC で使う場合はご留意ください。

## 精度について

計算式は `safe_run` ノードの実装から移植したものです。リファレンス実装
（同ノード付属の Python スクリプト）と全セルで照合しています。

| グリッド / 速度 | 最大差 | 平均差 |
|---|---|---|
| 96×96 / 0.1 m/s | 5.7e-08 | 9.2e-09 |
| 160×160 / 0.3 m/s | 5.9e-08 | 8.9e-09 |

障害物モデルの「物体」は、占有セルについての合算のしかたが実機ノードと同じです
（実機は占有セルを単純加算してから割るため、この合算は畳み込みで厳密に求まります）。

計算グリッドは実測時間から自動調整します（ドラッグ中 30 ms・確定後 200 ms が目安）。
遅い機械では自動的に粗くなるので、設定は不要です。

## 構成

| ファイル | 役割 |
|---|---|
| `index.html` | 画面とスタイル |
| `core.js` | 減速範囲の計算 |
| `app.js` | スライダ・描画・ファイル読み込み |
| `default_config.js` | 起動時の既定 config（`sample_config.json` を埋め込んだもの）|
| `make_default.py` | `default_config.js` を作り直すスクリプト |

`file://` では JSON を fetch できないため、既定 config は JS として埋め込んでいます。
差し替えたら `python3 make_default.py <json>` で作り直してください。

第三者ライブラリは使用していません。ビルド作業もありません。

## ライセンス

MIT License. [LICENSE](LICENSE) を参照してください。

---

## English

A browser-based viewer for the deceleration range of `safe_run`, the
obstacle-aware speed limiter on TriOrb AMRs. Adjust the parameters and the
affected area is redrawn in real time.

No installation. Open the page above, or download a release and open
`index.html` locally. No server, no build step, no third-party libraries.

Load a `safe_run_config.json` (button or drag & drop), adjust, then save the
result as a new `*.tuned.json`. **The loaded file is never modified, and it is
never uploaded** — the page makes no network requests of any kind.

**Do not use this figure to determine safety distances.** It shows only the
deceleration produced by `safe_run`. The machine's protective stop is
configured on the safety laser scanner and is not represented here.

MIT License.
