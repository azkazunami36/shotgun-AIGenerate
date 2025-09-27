# ショットガン・ルーレット ver.α0.5（内部ファイルスキン）

## 使い方（ローカル動作）
1. このHTMLファイルと同じ階層に `assets/` フォルダを置いてください。
2. `assets/config.json` を編集し、画像パスを指定します（相対パス推奨）。
3. 画像は例のように配置してください。存在しない項目は未設定として扱われます。

```
/index.html
/assets/
  config.json
  bg.jpg
  panel.jpg
  /avatars/
    p1.png
    p2.png
    p3.png
    p4.png
  /icons/
    saw.png
    glass.png
    beer.png
    smoke.png
    cuff.png
```

## 注意
- `file://` で開いた場合、一部ブラウザでは `fetch('assets/config.json')` がブロックされることがあります。
  その場合は、簡易ローカルサーバーで同階層を公開してください。例：
  - Python: `python -m http.server 8000`
  - Node: `npx http-server .`
- `assets/config.json` が読めない場合、HTML内のデフォルト設定が使われます。
- 画像の差し替えは、画面上部の「スキン再読込」ボタンで反映できます。

## 設定項目
- `flashColor` : 実弾ヒット時のフラッシュ色（例 "#ffe9e9"）
- `background` : 背景画像（例 "assets/bg.jpg"）
- `panel` : パネル背景画像
- `avatars.P1..P4` : 各プレイヤーのアバター画像
- `icons` : アイテムアイコン（キーはアイテム名）
