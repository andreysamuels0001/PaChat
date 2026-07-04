# Build resources

`electron-builder` looks here for packaging assets. The directory is
intentionally empty of binaries so the repository stays free of generated
images — packaging works without them, falling back to the default Electron
icon.

## Adding application icons

Drop these three files in alongside this README and `electron-builder` picks
them up automatically — no configuration change needed:

| File | Format | Used by |
|:--|:--|:--|
| `icon.png` | 1024 × 1024 PNG | Linux, and as the source for the others |
| `icon.ico` | multi-size ICO (16–256 px) | Windows |
| `icon.icns` | ICNS | macOS |

The master artwork is [`docs/assets/logo.svg`](../../../docs/assets/logo.svg).
To generate all three from it:

```bash
# Requires ImageMagick 7+ (`magick`) and, on macOS, `iconutil`.

# 1 · Rasterise the master
magick -background none ../../../docs/assets/logo.svg -resize 1024x1024 icon.png

# 2 · Windows — a single ICO holding every size Explorer asks for
magick icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico

# 3 · macOS — an iconset directory, then compile it
mkdir -p icon.iconset
for size in 16 32 128 256 512; do
  magick icon.png -resize ${size}x${size}     icon.iconset/icon_${size}x${size}.png
  magick icon.png -resize $((size*2))x$((size*2)) icon.iconset/icon_${size}x${size}@2x.png
done
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset
```

Alternatively, `electron-icon-builder` does the whole thing in one command:

```bash
npx electron-icon-builder --input=../../../docs/assets/logo.svg --output=./
```

## Other assets electron-builder recognises

| File | Purpose |
|:--|:--|
| `background.png` | macOS DMG window background (540 × 380) |
| `installerIcon.ico` | Windows NSIS installer icon |
| `installerHeader.bmp` | Windows NSIS header image (150 × 57) |
| `entitlements.mac.plist` | macOS entitlements, required for notarisation |

Generated icon files are listed in `.gitignore`, so building them locally will
not dirty your working tree.
