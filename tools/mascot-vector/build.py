#!/usr/bin/env python3
"""
The stubby mascot as real vector art (smooth curves, outlined, layered), one SVG per frame.

The poses are NOT redrawn by hand: this imports the pixel builder (tools/mascot-pixel/build.py), intercepts the numbers every pose is
built from (head height, cape hem, foot lifts, mitt and arm positions...) and draws the same pose with Bezier curves instead of
pixels. So the vector frames always match the pixel frames one for one (same indices, tags, timing, anchor), and a pose changed
in the pixel builder shows up here after a re-run.

Coordinates are the pixel cell's: viewBox 0 0 32 32, feet at (16, 32), 24 units per game unit u.

Output (assets/mascot-vector/):
  svg/<anim>_<NN>.svg   one file per frame, layers named (cape, head, gem, mitt-l ...) so a designer can edit them
  svg/sheet_<anim>.svg  the frames side by side
  vector.json           the same layers as [fill, path, stroke, strokeWidth] tuples, which is what the game draws from
  mascot.json           cell, anchor, unit, fps, loop, tags (same as the pixel set)
  preview.html          contact sheet to open in a browser

Run:  python3 tools/mascot-vector/build.py
"""
import importlib.util, json, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets/mascot-vector')

spec = importlib.util.spec_from_file_location('pxbuild', os.path.join(ROOT, 'tools/mascot-pixel/build.py'))
px = importlib.util.module_from_spec(spec); spec.loader.exec_module(px)

def hexc(c): return '#%02x%02x%02x' % c[:3]
OUTLINE, CREAM, GREY = hexc(px.OUTLINE), hexc(px.CREAM), hexc(px.GREY)
RED, RED_D, RED_L = hexc(px.RED), hexc(px.RED_D), hexc(px.RED_L)
GEM_L, GEM_B, GEM_D = hexc(px.GEM_L), hexc(px.GEM_B), hexc(px.GEM_D)
SHOE_L, SHOE_B, SHOE_D = hexc(px.SHOE_L), hexc(px.SHOE_B), hexc(px.SHOE_D)
DUST = hexc(px.DUST)
CX0 = 16.0                  # the cell's centre line
SW = 0.8                    # outline width, in cell units
CW, CH, UNIT, GROUND = px.CW, px.CH, px.UNIT, px.GROUND

def f(v): return ('%.2f' % v).rstrip('0').rstrip('.')
def P(*pts): return ' '.join(f(v) for v in pts)

class Layer:
    def __init__(self, name, d, fill='none', stroke='', sw=0.0): self.name, self.d, self.fill, self.stroke, self.sw = name, d, fill, stroke, sw

# ---------------------------------------------------------------- parts, in cell units
def egg(cx, cy, hw, hh):
    """The head: an egg, a little wider at the bottom."""
    t, b = cy - hh, cy + hh * 1.0
    return (f'M{P(cx, t)}C{P(cx + hw * .58, t, cx + hw, cy - hh * .45, cx + hw, cy + hh * .1)}'
            f'C{P(cx + hw, cy + hh * .7, cx + hw * .62, b, cx, b)}C{P(cx - hw * .62, b, cx - hw, cy + hh * .7, cx - hw, cy + hh * .1)}'
            f'C{P(cx - hw, cy - hh * .45, cx - hw * .58, t, cx, t)}Z')

def ellipse(cx, cy, rx, ry):
    return f'M{P(cx - rx, cy)}A{P(rx, ry)} 0 1 0 {P(cx + rx, cy)}A{P(rx, ry)} 0 1 0 {P(cx - rx, cy)}Z'

def cape_path(top, hem_bottom, hw0, hw1, notch, lift, inset=0.0, up=0.0):
    """Bell-shaped cape: narrow collar, flaring to a hem with three scallops. `inset`/`up` make the smaller body shape that sits on the shadow."""
    xl0, xr0, xl1, xr1 = CX0 - hw0, CX0 + hw0, CX0 - hw1 + inset, CX0 + hw1 - inset
    yt, yh = top + (inset * .4), hem_bottom - up
    H = yh - yt
    n1, n2 = CX0 - 2.0 + notch, CX0 + 3.0 + notch                # notches between the lobes (pixel columns, as in the pixel builder)
    sag = 0.9
    out_l = yh - lift * 1.3 if lift else yh
    out_r = out_l
    return (f'M{P(xl0, yt)}Q{P(CX0, yt + 1.1, xr0, yt)}'
            f'C{P(xr0 + .5, yt + H * .35, xr1 - .3, yh - H * .45, xr1, out_r)}'
            f'Q{P((xr1 + n2) / 2, out_r + sag, n2, yh - .2)}Q{P((n2 + n1) / 2, yh + sag, n1, yh - .2)}Q{P((n1 + xl1) / 2, out_l + sag, xl1, out_l)}'
            f'C{P(xl1 + .3, yh - H * .45, xl0 - .5, yt + H * .35, xl0, yt)}Z')

def shoe_layers(side, cx, bottom_edge):
    w, h = 3.3, 3.9
    l, r, b = cx - w, cx + w, bottom_edge
    body = (f'M{P(l, b - 1.0)}C{P(l, b - h * .95, r, b - h * .95, r, b - 1.0)}'
            f'Q{P(r, b, r - 1.0, b)}L{P(l + 1.0, b)}Q{P(l, b, l, b - 1.0)}Z')
    return [Layer(f'shoe-{side}', body, SHOE_B, OUTLINE, SW),
            Layer(f'shoe-{side}-light', f'M{P(l + .9, b - 2.5)}Q{P(cx, b - h + .1, r - 1.0, b - 2.5)}Q{P(cx, b - 2.2, l + .9, b - 2.5)}Z', SHOE_L),
            Layer(f'shoe-{side}-sole', f'M{P(l + .3, b - .9)}L{P(r - .3, b - .9)}L{P(r - 1.0, b - .15)}L{P(l + 1.0, b - .15)}Z', SHOE_D)]

def mitt_layers(side, x, y):
    cx, cy = x + 2.0 + (-.35 if side == 'l' else .35), y + 2.0            # nudged outward so they sit beside the cape, not on it
    return [Layer(f'mitt-{side}', ellipse(cx, cy, 1.85, 1.7), RED, OUTLINE, SW),
            Layer(f'mitt-{side}-light', ellipse(cx - .5, cy - .5, .65, .48), RED_L)]

def gem_layers(ht):
    """The crystal grows out of the crown (as on the official sticker sheet): drawn before the head, so the head covers its base and a
    two-tone red wedge shows above it. The lower corners sit inside the head's outline."""
    cx = CX0                                    # the centre line of the head
    peak, l_out, r_out = (cx, ht - 4.4), (cx - 3.6, ht + 2.3), (cx + 3.6, ht + 2.3)
    def poly(*pts): return 'M' + 'L'.join(P(*p) for p in pts) + 'Z'
    return [Layer('crystal-face-l', poly(l_out, peak, (cx, ht + 3.2), (cx - 2.8, ht + 3.7)), GEM_L.replace('ff6a72', 'ee3e46')),
            Layer('crystal-face-r', poly(peak, r_out, (cx + 2.8, ht + 3.7), (cx, ht + 3.2)), '#c4222b'),
            Layer('crystal-highlight', poly((cx - 2.4, ht + 1.4), peak, (cx - 1.0, ht - 1.2)), '#fa5860'),
            Layer('crystal-outline', f'M{P(*l_out)}L{P(*peak)}L{P(*r_out)}', 'none', '#a81c25', .7)]

def frame_layers(rec):
    """One pose (the keyword arguments the pixel builder was about to draw with) -> layers, back to front."""
    ht, hem = rec['ht'], rec['hem']
    lift = {0: rec.get('lift_l', 0), 1: rec.get('lift_r', 0)}
    dx = rec.get('shoe_dx', (0, 0))
    grow, flare = rec.get('grow', 0), rec.get('flare', 0)
    L = []

    # shoes (behind the cape); a shoe never rides higher than the hem, as in the pixel version
    for side in (0, 1):
        left = (px.CX - 5 if side == 0 else px.CX + 1) + dx[side]
        bottom = min(GROUND, max(GROUND - lift[side], hem + 2))
        L += shoe_layers('l' if side == 0 else 'r', left + 3.0, bottom + 1.0)

    # arms (raised in the jump): outlined cream strokes from the shoulder to the mitt
    for i, (sh, hd) in enumerate(rec.get('arms') or ()):
        d = f'M{P(sh[0] + .5, sh[1] + .5)}L{P(hd[0] + 2.0, hd[1] + 2.0)}'
        L.append(Layer(f'arm-{"lr"[i]}-outline', d, 'none', OUTLINE, 3.3))
        L.append(Layer(f'arm-{"lr"[i]}', d, 'none', CREAM, 1.9))

    # cape: dark base with outline, lighter body on top (leaves a shaded rim), collar, highlight and folds
    top, hem_b = ht + 10.0, hem + 1.0
    hw0, hw1 = 3.0, 7.0 + flare + grow
    notch, lift_c = rec.get('notch', 0), rec.get('cape_lift', 0)
    L.append(Layer('cape-shadow', cape_path(top, hem_b, hw0, hw1, notch, lift_c), RED_D, OUTLINE, SW + .1))
    if hem - top >= 2:
        L.append(Layer('cape', cape_path(top, hem_b, hw0 - .2, hw1, notch, lift_c, inset=.9, up=1.0), RED))
        mid_h = hem_b - top
        L.append(Layer('cape-fold-l', f'M{P(CX0 - 1.6, top + 2.2)}Q{P(CX0 - 2.2, top + mid_h * .6, CX0 - 2.6, hem_b - 1.3)}', 'none', RED_D, .6))
        L.append(Layer('cape-fold-r', f'M{P(CX0 + 1.6, top + 2.2)}Q{P(CX0 + 2.2, top + mid_h * .6, CX0 + 2.6, hem_b - 1.3)}', 'none', RED_D, .6))
        L.append(Layer('cape-highlight', f'M{P(CX0 - 4.6, top + 2.4)}Q{P(CX0 - 3.4, top + 1.8, CX0 - 3.0, top + 3.4)}Q{P(CX0 - 4.2, top + 3.6, CX0 - 4.6, top + 2.4)}Z', RED_L))
    L.append(Layer('collar', f'M{P(CX0 - hw0, top)}Q{P(CX0, top + 1.1, CX0 + hw0, top)}L{P(CX0 + hw0 - .2, top + 1.0)}Q{P(CX0, top + 2.1, CX0 - hw0 + .2, top + 1.0)}Z', RED_L, OUTLINE, .5))

    L += gem_layers(ht)                         # behind the head: its base is hidden

    # head: grey crescent underneath, cream on top (shifted a little up and right, so the grey shows at the lower left)
    cy = ht + 5.1
    L.append(Layer('head', egg(CX0, cy, 6.1, 5.1), GREY, OUTLINE, SW))
    L.append(Layer('head-face', egg(CX0 + .5, cy - .35, 5.5, 4.65), CREAM))

    for side, key in (('l', 'mitt_l'), ('r', 'mitt_r')):
        if rec.get(key): L += mitt_layers(side, *rec[key])
    for i, (x, y) in enumerate(rec.get('dust') or ()):
        L.append(Layer(f'dust-{i}', ellipse(x + .5, y + .5, .7, .55), DUST))
    return L

# ---------------------------------------------------------------- run the pixel builder's poses through it
def collect():
    px.figure = lambda head_img, ht_src, ht, hem, **kw: dict(ht=ht, hem=hem, **kw)   # intercept: record the pose instead of drawing pixels
    return {name: [frame_layers(rec) for rec in fn()] for name, fn, _ in px.ANIMS}

def svg_of(layers, with_ids=True):
    parts = []
    for l in layers:
        a = f'<path{(" id=%s" % chr(34) + l.name + chr(34)) if with_ids else ""} d="{l.d}"'
        a += f' fill="{l.fill}"'
        if l.stroke: a += f' stroke="{l.stroke}" stroke-width="{f(l.sw)}" stroke-linejoin="round" stroke-linecap="round"'
        parts.append(a + '/>')
    return ''.join(parts)

def main():
    os.makedirs(os.path.join(OUT, 'svg'), exist_ok=True)
    for fn in os.listdir(os.path.join(OUT, 'svg')): os.remove(os.path.join(OUT, 'svg', fn))
    anims = collect()
    data = {}
    for name, frames in anims.items():
        data[name] = [[[l.fill, l.d, l.stroke, l.sw] for l in layers] for layers in frames]
        for i, layers in enumerate(frames):
            open(os.path.join(OUT, 'svg', f'{name}_{i:02d}.svg'), 'w').write(
                f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CW} {CH}" width="{CW * 8}" height="{CH * 8}">{svg_of(layers)}</svg>\n')
        sheet = ''.join(f'<g id="frame-{i}" transform="translate({i * CW} 0)">{svg_of(layers, False)}</g>' for i, layers in enumerate(frames))
        open(os.path.join(OUT, 'svg', f'sheet_{name}.svg'), 'w').write(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CW * len(frames)} {CH}" width="{CW * len(frames) * 4}" height="{CH * 4}">{sheet}</svg>\n')
    json.dump({'style': 'smooth', 'cell': {'w': CW, 'h': CH}, 'anchor': {'x': CX0, 'y': CH}, 'unit': UNIT, 'animations': data},
              open(os.path.join(OUT, 'vector.json'), 'w'), separators=(',', ':'))

    manifest = {
        'name': 'safety-run-mascot-vector', 'version': 1, 'style': 'smooth vector, outlined; same poses as the pixel set',
        'view': 'From behind, like the game camera.',
        'howToUse': 'svg/<anim>_<NN>.svg is one frame (viewBox 0 0 32 32; the feet are at (16, 32)); svg/sheet_<anim>.svg has the frames side by side. 24 cell units = 1 game unit u. Layers are named; strokes are round-joined. Squash, stretch, arm and cape motion are drawn into the frames: play them as they are.',
        'cell': {'w': CW, 'h': CH}, 'anchor': {'x': 16, 'y': CH}, 'unit': UNIT,
        'animations': {n: dict(frames=len(fr), fps=m['fps'], loop=m['loop'], tags=m['tags'], note=m['note']) for (n, _, m), fr in zip(px.ANIMS, anims.values())},
    }
    json.dump(manifest, open(os.path.join(OUT, 'mascot.json'), 'w'), indent=2, ensure_ascii=False)

    rows = ''
    for name, frames in anims.items():
        cells = ''.join(f'<figure><svg viewBox="0 0 {CW} {CH}" width="{CW * 6}" height="{CH * 6}"><line x1="0" y1="{CH - .02}" x2="{CW}" y2="{CH - .02}" stroke="#0003" stroke-width=".1"/>{svg_of(l, False)}</svg><figcaption>{i}</figcaption></figure>' for i, l in enumerate(frames))
        rows += f'<h2>{name} · {len(frames)} frames</h2><div class="row">{cells}</div>'
    open(os.path.join(OUT, 'preview.html'), 'w').write(
        '<!doctype html><meta charset="utf-8"><title>Mascot vector preview</title><style>body{margin:0;padding:12px;background:#1b1e23;color:#ffd400;font:600 14px system-ui}'
        'h2{margin:14px 0 6px}.row{display:flex;flex-wrap:wrap;gap:6px}figure{margin:0;background:#8a8e95;position:relative}figcaption{position:absolute;left:4px;top:2px;color:#0008;font:11px system-ui}</style>' + rows)
    print('frames:', {n: len(fr) for n, fr in anims.items()}, '| vector.json bytes:', os.path.getsize(os.path.join(OUT, 'vector.json')))

if __name__ == '__main__': main()
