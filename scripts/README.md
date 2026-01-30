# PWAアイコンリサイズ

`public/icons/` のアイコンを manifest.json で指定したサイズ（192x192, 512x512）にリサイズします。

## 実行方法

```bash
npm install
npm run resize-icons
```

`sharp` がインストールされていれば自動でリサイズされます。  
ImageMagick（`magick` または `convert`）がインストールされていれば、sharp がなくてもリサイズを試みます。

## 手動でリサイズする場合

ImageMagick が使える場合、`public/icons/` で以下を実行してください。

```bash
cd public/icons
magick icon-512x512.png -resize 192x192 icon-192x192.png
magick icon-512x512.png -resize 512x512 icon-512x512.png
```

（ソースが 2048x2048 などの大きい画像の場合、上記で 192x192 と 512x512 に正しくリサイズされます。）
