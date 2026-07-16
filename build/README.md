# Build resources

## App icon

| File | Use |
|------|-----|
| `icon.svg` | Source artwork |
| `icon.png` | 1024×1024 — Linux / window / dock |
| `icon.icns` | macOS `.app` / `.dmg` |
| `icon.ico` | Windows `.exe` / installer |

### Regenerate from SVG

```bash
cd build
rsvg-convert -w 1024 -h 1024 icon.svg -o icon.png
# then regenerate icns/ico as needed (see repo history / scripts)
```
