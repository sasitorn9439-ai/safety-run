# PPE icons — flat vector

Eight safety-gear icons redrawn from the pixel reference sheet as flat vector illustrations
(thick brown outline, flat fills, one highlight and one shade per shape).

| file | in game |
|---|---|
| `svg/helmet.svg` | pickup + HUD slot |
| `svg/gloves.svg` | pickup + HUD slot |
| `svg/glasses.svg` | pickup + HUD slot |
| `svg/earmuffs.svg` | pickup + HUD slot (`ear`) |
| `svg/boots.svg` | pickup + HUD slot |
| `svg/mask.svg` | asset only |
| `svg/vest.svg` | asset only |
| `svg/firstaid.svg` | asset only |
| `svg/sheet.svg` | all eight in a row (each in a `<g id>`) |
| `preview.png` | contact sheet (light / dark background / 40 px) |

Mask, vest and first-aid are not pickup types: adding one would change the deterministic sim, which
the server replays to verify scores (`shared/hazards.ts` → `PPE`).

## Source of truth

`src/render/ppe-icons.ts` — each icon is a list of layers (SVG path data in a 100 × 100 box).
The game draws it with `Path2D` (`drawPpeIcon`), the SVG files are generated from the same data (`iconSvg`),
so they can't drift.

## Regenerate

```
npm run ppe:svg          # opens the preview page; "Save SVGs" writes assets/ppe/svg/*.svg
```
(or open `http://localhost:5182/?auto` to save immediately.)
