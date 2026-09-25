#!/usr/bin/env python3
"""既定 config の JSON から default_config.js を作り直す。

file:// で開いたページは JSON を fetch できないため、既定 config は JS として
埋め込む必要がある。JSON を差し替えたらこれを実行する。

    python3 make_default.py safe_run_config.remote.json
"""
import json
import pathlib
import sys

src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "safe_run_config.remote.json")
cfg = json.loads(src.read_text(encoding="utf-8"))
out = pathlib.Path("default_config.js")
out.write_text(
    "/* 既定の config。file:// では fetch できないので JS として埋め込む。\n"
    f"   生成元: {src.name}\n"
    "   作り直す場合: python3 make_default.py <json>  */\n"
    f"const DEFAULT_CFG_NAME = {json.dumps(src.name, ensure_ascii=False)};\n"
    "const DEFAULT_CFG = " + json.dumps(cfg, ensure_ascii=False, indent=2) + ";\n",
    encoding="utf-8",
)
print(f"{out} を生成しました（生成元 {src.name} / アンカー {len(cfg.get('anker_points', []))} 点）")
