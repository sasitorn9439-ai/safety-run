#!/usr/bin/env python3
"""
Pixel-art mascot, adapted from the 16x32 character template in assets/mascot-pixel/source/, then exported three ways:
  x1/, x4/   PNG strips (native size and 4x nearest-neighbour)
  svg/       one exact vector SVG per frame (every pixel kept, merged into rectangles per colour)
  vector.json the same vectors as path data, which is what the game draws from (so it can be rasterised crisply at any size)

What comes from the template: the head (shape, 1-px outline, shading) and the *timing* of its back-view idle and run cycle.
What is drawn here: the mascot's own parts and proportions (a big head that is half the height, a red crystal growing out of the crown,
a short flared cape, stubby shoes) and the jump/slide poses, which the template does not have.

Run:  python3 tools/mascot-pixel/build.py        (needs Pillow)
"""
import json, os
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'assets/mascot-pixel/source/16x32-all-animations.png')
OUT = os.path.join(ROOT, 'assets/mascot-pixel')

def rgb(h): return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), 255)
OUTLINE = rgb('#2f2522'); CREAM = rgb('#faf3e8'); GREY = rgb('#b9b3a1')
RED, RED_D, RED_L = rgb('#e6323a'), rgb('#b7212b'), rgb('#ff6a72')
GEM_L, GEM_B, GEM_D = rgb('#ff6a72'), rgb('#e6323a'), rgb('#b7212b')
SHOE_L, SHOE_B, SHOE_D = rgb('#f2474f'), rgb('#d02a33'), rgb('#a01c26')
DUST = rgb('#d9d4c8')

CW, CH = 32, 32          # cell
CX = 15                  # the two centre columns are CX and CX+1
GROUND = 31              # last row of the cell: the feet
HT0, HEM0 = 13, 27       # standing: head top row, cape hem row. Head 10 rows = half of the ~21-row figure.
UNIT = 24                # art pixels per game unit u (the figure is ~21 px tall, so ~0.88 u in the game; the old vector mascot was 0.94 u)

src_sheet = Image.open(SRC).convert('RGBA')
def template_frame(row, col): return src_sheet.crop((col * 32, row * 32, col * 32 + 32, row * 32 + 32))
def head_top(img): return min(y for y in range(32) for x in range(32) if img.getpixel((x, y))[3])

class Canvas:
    def __init__(self): self.im = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    def put(self, x, y, c):
        if 0 <= x < CW and 0 <= y < CH: self.im.putpixel((x, y), c)
    def shape(self, pixels, fill, outline=OUTLINE):
        pixels = set(pixels)
        for (x, y) in pixels: self.put(x, y, fill(x, y))
        for (x, y) in pixels:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (x + dx, y + dy)
                if n not in pixels: self.put(n[0], n[1], outline)
    def bitmap(self, x0, y0, rows, colors):
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row):
                if ch != '.': self.put(x0 + dx, y0 + dy, colors[ch])
    def copy_head(self, img, ht_src, ht_dst):
        for r in range(10):
            for x in range(32):
                p = img.getpixel((x, ht_src + r))
                if p[3]: self.put(x, ht_dst + r, p)

def line_pixels(p0, p1, thick=2):
    (x0, y0), (x1, y1) = p0, p1
    n = max(abs(x1 - x0), abs(y1 - y0), 1); out = set()
    for i in range(n + 1):
        x = round(x0 + (x1 - x0) * i / n); y = round(y0 + (y1 - y0) * i / n)
        for tx in range(thick):
            for ty in range(thick): out.add((x + tx, y + ty))
    return out

# ---------------------------------------------------------------- the mascot's parts
# The crystal grows out of the crown, as on the official sticker sheet: it is drawn BEFORE the head, so the head covers its base and
# what shows is a two-tone red wedge rising above the head (rows ht-4 .. ht-1, plus the corners beside the head's top row).
GEM = ["...##...",
       "..#HH#..",
       ".#HHBB#.",
       "#HHBBDD#",
       "#HBBDDD#",
       "#BBBDDD#",
       "#BBDDDD#"]
def gem(c, ht): c.bitmap(CX - 3, ht - 4, GEM, {'#': OUTLINE, 'H': GEM_L, 'B': GEM_B, 'D': GEM_D})

SHOE = [".####.",
        "#LLBB#",
        "#BBBD#",
        "######"]
def shoe(c, left, bottom): c.bitmap(left, bottom - 3, SHOE, {'#': OUTLINE, 'L': SHOE_L, 'B': SHOE_B, 'D': SHOE_D})

def leg_stub(c, left, top, bottom):
    for y in range(top, bottom + 1):
        c.put(left + 1, y, OUTLINE); c.put(left + 4, y, OUTLINE); c.put(left + 2, y, GREY if y == top else CREAM); c.put(left + 3, y, CREAM)

MITT = [".##.",
        "#LB#",
        "#BD#",
        ".##."]
def mitt(c, x, y): c.bitmap(x, y, MITT, {'#': OUTLINE, 'L': RED_L, 'B': RED, 'D': RED_D})

def cape_mask(top, hem, grow=0, notch=0, flare=0, lift=0):
    """A short bell: narrow collar, flaring quickly to a scalloped hem."""
    H = hem - top + 1; m = set()
    for i in range(H):
        t = i / max(1, H - 1)
        k = 2 + round(4 * t) + (round(flare * t * t) if flare else 0) + (round(grow * t) if grow else 0)
        for x in range(CX - k, CX + 2 + k): m.add((x, top + i))
    for nx in (CX - 2 + notch, CX + 3 + notch):
        m.discard((nx, hem)); m.discard((nx + 1, hem))
    if lift:
        for x in range(CX - 12, CX + 14):
            if (x, hem) in m and (x < CX - 4 or x > CX + 5): m.discard((x, hem))
    return m

def cape(c, top, hem, **kw):
    m = cape_mask(top, hem, **kw)
    xs = [x for x, _ in m]; lo, hi = min(xs), max(xs)
    def fill(x, y):
        i = y - top
        if i == 0: return RED_L                                        # collar
        if (x - lo <= 1) or (hi - x <= 1): return RED_D                # edge shading
        if y >= hem: return RED_D                                      # shadow along the hem
        if x in (CX - 1, CX + 2) and i >= 2: return RED_D              # centre fold
        if x <= CX - 3 and i == 2 and x > lo + 1: return RED_L         # highlight, upper left
        return RED
    c.shape(m, fill)

def figure(head_img, ht_src, ht, hem, *, lift_l=0, lift_r=0, mitt_l=None, mitt_r=None, arms=None, shoe_dx=(0, 0),
           grow=0, flare=0, notch=0, cape_lift=0, dust=None):
    c = Canvas()
    for side, lift, dx in ((0, lift_l, shoe_dx[0]), (1, lift_r, shoe_dx[1])):
        left = (CX - 5 if side == 0 else CX + 1) + dx
        bottom = min(GROUND, max(GROUND - lift, hem + 2))             # a shoe never rides higher than the hem
        if bottom - 3 > hem + 2: leg_stub(c, left, hem + 1, bottom - 4)
        shoe(c, left, bottom)
    if arms:
        for sh, hd in arms: c.shape(line_pixels(sh, hd, 2), lambda x, y: CREAM)
    cape(c, ht + 10, hem, grow=grow, flare=flare, notch=notch, lift=cape_lift)
    gem(c, ht)                              # behind the head: its base is hidden
    c.copy_head(head_img, ht_src, ht)
    if mitt_l: mitt(c, *mitt_l)
    if mitt_r: mitt(c, *mitt_r)
    for (x, y) in dust or (): c.put(x, y, DUST)
    return c

# ---------------------------------------------------------------- animations
def idle_frames():
    frames = []
    for rep in range(2):
        for col in (16, 17, 18, 19):
            t = template_frame(1, col); src = head_top(t)
            b = (src - 7 + 1) // 2                      # the template's breath (head 7,8,9,7) is too big for a body this short: halve it
            ht, hem = HT0 + b, HEM0
            frames.append(figure(t, src, ht, hem, mitt_l=(CX - 9, hem - 3 + (1 if b else 0)), mitt_r=(CX + 7, hem - 3 + (1 if b else 0)), notch=rep))
    return frames

def run_frames():
    # the template's back-view walk (cols 24-29): head tops 4,5,7 | 4,5,7, feet lifted (L,R) 2,5 | 0,3 | 0,0 | 5,2 | 3,0 | 0,0 - scaled down to this body
    seq = [(24, 2, 5), (25, 0, 3), (26, 0, 0), (27, 5, 2), (28, 3, 0), (29, 0, 0)]
    frames = []
    for i, (col, ll, lr) in enumerate(seq):
        t = template_frame(3, col); src = head_top(t)
        rise = round((7 - src) * .67)
        ht, hem = HT0 - rise, HEM0 - rise
        ll, lr = round(ll * .6), round(lr * .6)
        sw = 1 if lr > ll else -1 if ll > lr else 0       # the arm opposite the raised foot swings forward (up)
        frames.append(figure(t, src, ht, hem, lift_l=ll, lift_r=lr, mitt_l=(CX - 9, hem - 3 - max(sw, 0)), mitt_r=(CX + 7, hem - 3 + min(sw, 0)), notch=i % 2))
    return frames

def jump_frames():
    base = template_frame(1, 16); src = head_top(base)
    def pose(ht_off, hem_off, **kw): return figure(base, src, HT0 + ht_off, HEM0 + hem_off, **kw)
    sh = lambda ht: ((CX - 4, ht + 11), (CX + 5, ht + 11))         # shoulders, for the arms
    def arms_to(ht, l, r): (sl, sr) = sh(ht); return [(sl, (l[0] + 2, l[1] + 2)), (sr, (r[0] + 2, r[1] + 2))]
    out = []
    out.append(pose(3, 0, grow=2, shoe_dx=(-1, 1), mitt_l=(CX - 11, HEM0 - 1), mitt_r=(CX + 9, HEM0 - 1)))                       # 0 crouch
    l, r = (CX - 9, HT0 + 3), (CX + 7, HT0 + 3)
    out.append(pose(-1, 0, grow=-1, mitt_l=l, mitt_r=r, arms=arms_to(HT0 - 1, l, r)))                                           # 1 launch
    for k, off in enumerate((-2, -1)):                                                                                           # 2-3 rise
        l, r = (CX - 10, HT0 + off + 1), (CX + 8, HT0 + off + 1)
        out.append(pose(off, -2, lift_l=1, lift_r=2, mitt_l=l, mitt_r=r, arms=arms_to(HT0 + off, l, r), cape_lift=1, notch=k))
    for k in range(2):                                                                                                           # 4-5 apex
        l, r = (CX - 12, HT0 + 7), (CX + 10, HT0 + 7)
        out.append(pose(0, -3, lift_l=3 + k, lift_r=3, shoe_dx=(-1, 1), flare=2, mitt_l=l, mitt_r=r, arms=arms_to(HT0, l, r), cape_lift=1, notch=k))
    for k in range(2):                                                                                                           # 6-7 fall
        l, r = (CX - 10, HT0 + 2), (CX + 8, HT0 + 2)
        out.append(pose(0, -1, lift_l=1, lift_r=2 - k, flare=1, mitt_l=l, mitt_r=r, arms=arms_to(HT0, l, r), cape_lift=1, notch=k))
    out.append(pose(3, 0, grow=3, shoe_dx=(-2, 2), mitt_l=(CX - 13, HEM0 - 1), mitt_r=(CX + 11, HEM0 - 1)))                     # 8 impact
    out.append(pose(-1, 0, grow=-1, mitt_l=(CX - 9, HEM0 - 4), mitt_r=(CX + 7, HEM0 - 4)))                                      # 9 rebound
    out.append(pose(1, 0, mitt_l=(CX - 9, HEM0 - 3), mitt_r=(CX + 7, HEM0 - 3)))                                                 # 10 settle
    out.append(pose(0, 0, mitt_l=(CX - 9, HEM0 - 3), mitt_r=(CX + 7, HEM0 - 3)))                                                 # 11 neutral
    return out

def slide_frames():
    base = template_frame(1, 16); src = head_top(base)
    def pose(ht_off, hem_off, **kw): return figure(base, src, HT0 + ht_off, HEM0 + hem_off, **kw)
    out = [pose(2, 0, grow=1, mitt_l=(CX - 10, HEM0 - 2), mitt_r=(CX + 8, HEM0 - 2)),
           pose(3, 1, grow=3, shoe_dx=(-3, 2), mitt_l=(CX - 13, HEM0 - 1), mitt_r=(CX + 10, HEM0))]
    for k in range(4):                                       # hold: head low, left shoe kicked out, right mitt braced, dust
        out.append(pose(4, 2, grow=5, shoe_dx=(-5 - (k % 2), 2), mitt_l=(CX - 14, GROUND - 4), mitt_r=(CX + 12, GROUND - 3),
                        dust=[(CX + 14 + (k % 2), GROUND), (CX + 15, GROUND - 1 - (k % 2)), (CX + 14, GROUND - 3 + (k % 2))]))
    out += [pose(3, 1, grow=3, shoe_dx=(-3, 2), mitt_l=(CX - 12, HEM0 - 1), mitt_r=(CX + 10, HEM0 - 1)),
            pose(2, 0, grow=1, mitt_l=(CX - 10, HEM0 - 2), mitt_r=(CX + 8, HEM0 - 2)),
            pose(0, 0, mitt_l=(CX - 9, HEM0 - 3), mitt_r=(CX + 7, HEM0 - 3))]
    return out

ANIMS = [
    ('idle',  idle_frames,  dict(fps=6,  loop=True,  tags={},   note='Breathing; head timing from the template back-view idle (cols 16-19), halved. Plays twice with the cape hem shifting.')),
    ('run',   run_frames,   dict(fps=12, loop=True,  tags={'stepA': [0, 2], 'stepB': [3, 5]}, note='6-frame loop = two steps, driven by the template back-view walk (head bob and foot lift scaled to this short body). Frames 0-2 = left step, 3-5 = right step.')),
    ('jump',  jump_frames,  dict(fps=14, loop=False, tags={'takeoff': [0, 1], 'rise': [2, 3], 'apex': [4, 5], 'fall': [6, 7], 'land': [8, 11]}, note='takeoff/rise while vy > 0, apex near 0, fall while vy < 0 (hold the last fall frame), land plays on touchdown. Squash and stretch are drawn in.')),
    ('slide', slide_frames, dict(fps=14, loop=False, tags={'drop': [0, 1], 'hold': [2, 5], 'recover': [6, 8]}, note='Slides under low pipes (0.7 s): drop, hold (loop frames 2-5 if the slide lasts longer), recover.')),
]

# ---------------------------------------------------------------- exact vector export
def hexc(c): return '#%02x%02x%02x' % c[:3]
def vector_layers(img):
    """One path per colour; the pixels are merged into rectangles, so the vector is exactly the sprite."""
    px = img.load(); by = {}
    for y in range(CH):
        for x in range(CW):
            if px[x, y][3]: by.setdefault(px[x, y][:3], set()).add((x, y))
    layers = []
    for col, ps in sorted(by.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        d = []; seen = set()
        for (x, y) in sorted(ps, key=lambda p: (p[1], p[0])):
            if (x, y) in seen: continue
            x2 = x
            while (x2 + 1, y) in ps and (x2 + 1, y) not in seen: x2 += 1
            y2 = y
            while all((xx, y2 + 1) in ps and (xx, y2 + 1) not in seen for xx in range(x, x2 + 1)): y2 += 1
            for yy in range(y, y2 + 1):
                for xx in range(x, x2 + 1): seen.add((xx, yy))
            d.append(f'M{x} {y}h{x2 - x + 1}v{y2 - y + 1}h-{x2 - x + 1}z')
        layers.append([hexc(col), ''.join(d)])
    return layers

def svg_of(layers):
    body = ''.join(f'<path fill="{f}" d="{d}"/>' for f, d in layers)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CW} {CH}" width="{CW * 8}" height="{CH * 8}" shape-rendering="crispEdges">{body}</svg>\n'

def main():
    os.makedirs(OUT, exist_ok=True)
    sheets = {name: (fn(), meta) for name, fn, meta in ANIMS}
    for scale in (1, 4):
        d = os.path.join(OUT, f'x{scale}'); os.makedirs(d, exist_ok=True)
        for name, (frames, _) in sheets.items():
            sheet = Image.new('RGBA', (CW * len(frames), CH), (0, 0, 0, 0))
            for i, f in enumerate(frames): sheet.paste(f.im, (i * CW, 0))
            if scale != 1: sheet = sheet.resize((sheet.width * scale, sheet.height * scale), Image.NEAREST)
            sheet.save(os.path.join(d, f'{name}.png'))
    svg_dir = os.path.join(OUT, 'svg'); os.makedirs(svg_dir, exist_ok=True)
    for f in os.listdir(svg_dir): os.remove(os.path.join(svg_dir, f))
    vectors = {}
    for name, (frames, _) in sheets.items():
        vectors[name] = [vector_layers(f.im) for f in frames]
        for i, layers in enumerate(vectors[name]): open(os.path.join(svg_dir, f'{name}_{i:02d}.svg'), 'w').write(svg_of(layers))
    json.dump({'cell': {'w': CW, 'h': CH}, 'anchor': {'x': CX + 1, 'y': CH}, 'unit': UNIT, 'animations': vectors}, open(os.path.join(OUT, 'vector.json'), 'w'), separators=(',', ':'))

    bounds = {}
    for name, (frames, _) in sheets.items():
        boxes = [f.im.getchannel('A').getbbox() for f in frames]
        bounds[name] = dict(minX=min(b[0] for b in boxes), minY=min(b[1] for b in boxes), maxX=max(b[2] for b in boxes) - 1, maxY=max(b[3] for b in boxes) - 1)
    clipped = [n for n, b in bounds.items() if b['minX'] <= 0 or b['minY'] <= 0 or b['maxX'] >= CW - 1]
    manifest = {
        'name': 'safety-run-mascot-pixel', 'version': 2, 'style': 'pixel art (stubby proportions), adapted from the 16x32 character template; exact vector export included',
        'view': 'From behind, like the game camera.',
        'howToUse': 'PNG strips: horizontal, frame size = cell, left to right. Place the sprite so `anchor` (the feet, bottom centre) sits on the ground point and scale by u_px / unit; use NEAREST filtering. svg/ and vector.json are the same frames as exact vectors and can be drawn at any size. Squash, stretch and cape/arm motion are drawn into the frames.',
        'variants': {f'x{s}': {'cell': {'w': CW * s, 'h': CH * s}, 'scale': s, 'anchor': {'x': (CX + 1) * s, 'y': CH * s}, 'unit': UNIT * s} for s in (1, 4)},
        'animations': {n: dict(image=f'{n}.png', frames=len(fr), cols=len(fr), rows=1, fps=m['fps'], loop=m['loop'], tags=m['tags'], note=m['note']) for n, (fr, m) in sheets.items()},
        'contentBoundsNative': bounds,
    }
    json.dump(manifest, open(os.path.join(OUT, 'mascot.json'), 'w'), indent=2, ensure_ascii=False)

    Z = 7; pad = 8
    rows = [(n, fr) for n, (fr, _) in sheets.items()]
    W = max(len(fr) for _, fr in rows) * (CW * Z + pad) + pad; H = len(rows) * (CH * Z + 28) + pad
    pv = Image.new('RGBA', (W, H), (27, 30, 35, 255)); dr = ImageDraw.Draw(pv)
    for r, (n, fr) in enumerate(rows):
        y = pad + r * (CH * Z + 28)
        dr.text((pad, y), f'{n} · {len(fr)} frames · {sheets[n][1]["fps"]} fps', fill=(255, 212, 0, 255))
        for i, f in enumerate(fr):
            x = pad + i * (CW * Z + pad)
            tile = Image.new('RGBA', (CW * Z, CH * Z), (138, 142, 149, 255))
            tile.alpha_composite(f.im.resize((CW * Z, CH * Z), Image.NEAREST))
            ImageDraw.Draw(tile).line([(0, CH * Z - 1), (CW * Z, CH * Z - 1)], fill=(0, 0, 0, 60))
            pv.alpha_composite(tile, (x, y + 16)); dr.text((x + 3, y + 18), str(i), fill=(0, 0, 0, 160))
    pv.save(os.path.join(OUT, 'preview.png'))
    print('frames:', {n: len(fr) for n, (fr, _) in sheets.items()}, '| clipped:', clipped or 'none')
    print('bounds:', bounds)
    print('vector.json bytes:', os.path.getsize(os.path.join(OUT, 'vector.json')))

if __name__ == '__main__': main()
