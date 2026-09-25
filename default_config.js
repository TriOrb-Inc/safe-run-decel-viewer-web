/* 既定の config。file:// では fetch できないので JS として埋め込む。
   生成元: sample_config.json
   作り直す場合: python3 make_default.py <json>  */
const DEFAULT_CFG_NAME = "sample_config.json";
const DEFAULT_CFG = {
  "point2d_topics": [
    "/sick/point2d/right",
    "/sick/point2d/left"
  ],
  "masks": {
    "/sick/point2d/right": [
      [
        [
          -600,
          -610
        ],
        [
          -600,
          -605
        ],
        [
          -590,
          -605
        ],
        [
          -590,
          -610
        ]
      ],
      [
        [
          600,
          -610
        ],
        [
          600,
          -605
        ],
        [
          590,
          -605
        ],
        [
          590,
          -610
        ]
      ]
    ],
    "/sick/point2d/left": [
      [
        [
          -600,
          -610
        ],
        [
          -600,
          -605
        ],
        [
          -590,
          -605
        ],
        [
          -590,
          -610
        ]
      ],
      [
        [
          600,
          -610
        ],
        [
          600,
          -605
        ],
        [
          590,
          -605
        ],
        [
          590,
          -610
        ]
      ]
    ]
  },
  "anker_points": [
    {
      "x": 0,
      "y": -310
    },
    {
      "x": 132,
      "y": -78
    },
    {
      "x": 268,
      "y": 155
    },
    {
      "x": 0,
      "y": 155
    },
    {
      "x": -268,
      "y": 155
    },
    {
      "x": -132,
      "y": -78
    }
  ],
  "$anker_points": "ロボット輪郭を表すアンカーポイント群（mm単位）。原点はロボット中心、x軸は右方向、y軸は前方向。",
  "ctrl_ms": 100,
  "$ctrl_ms": "制御周期[ms]",
  "slowdown_gain": 1.0,
  "$slowdown_gain": "ポテンシャル反力の大きさと速度減衰を一括調整する係数。1.0が標準、0.0～1.7。実機でのチューニングが必要。",
  "slowdown_gamma": 1.5,
  "$slowdown_gamma": "障害物との距離に対する減衰指数。大きいほど近距離で強く効く。実機でのチューニングが必要。",
  "slowdown_focus": 0.8,
  "$slowdown_focus": "角度への集中度と横移動抑制をまとめたフォーカス(0.0～1.0)。大きいほど前方重視で回避を抑える。実機でのチューニングが必要。",
  "detect_radius": 2500,
  "resolution": 20,
  "vel_filter_weight": 0.5,
  "$vel_filter_weight": "速度ベクトルのローパスフィルタ係数（0.0～1.0）。0.0のとき過去の速度を無視、1.0のとき過去の速度を完全に保持。実機の応答に合わせてチューニングが必要。",
  "velocity_bias": 0.0,
  "$velocity_bias": "ポテンシャル反力に常に加算される速度バイアス[m^2/s^2]。停止状態でも障害物からの反力を残したい場合に利用する。実機挙動を確認しながらチューニングが必要。",
  "map_decay": 0.0,
  "$map_decay": "0.0～1.0で過去の占有マップをブレンドする係数。値を大きくすると障害物が残像として残り、センサ欠測時の揺れを抑えられる。0.0で無効。",
  "future_location_weight": 1.0,
  "$future_location_weight": "将来位置予測の重み付け係数。"
};
