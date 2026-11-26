#!/usr/bin/env python3
"""
Cuts the background out of the three prize photos for the /announce deck and writes transparent PNGs to src/announce/prizes/.

    pip install numpy scipy pillow
    python3 tools/announce-prizes/cutout.py watch.png card.png umbrella.png

The photos are studio shots on white, so a threshold is enough:
  watch     white that touches the border or fills a large area (the loop of the strap) is background; the rest is the product
  card      white connected to the border is background; the card's own outline stops it; a stray fragment below the card is dropped
  umbrella  the black canopy is the biggest dark thing; the caption, the blue tag, the watermark and the inset circle are left out
Edges get a soft 1px alpha. Check the result on the butter and pink of the deck before using new photos.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

OUT = 'src/announce/prizes/'


def finish(rgb, mask, name, pad=6, maxside=760, soft=0.9, fill=True):
    """Soft edge, crop to the product, scale down, save RGBA."""
    if fill:
        mask = ndi.binary_fill_holes(mask)
    a = ndi.gaussian_filter(mask.astype(float), soft)
    a = np.clip((a - 0.5) * 2.2 + 0.5, 0, 1)
    rgba = np.dstack([rgb, (a * 255).astype(np.uint8)])
    ys, xs = np.where(mask)
    y0, y1, x0, x1 = max(ys.min() - pad, 0), ys.max() + pad, max(xs.min() - pad, 0), xs.max() + pad
    im = Image.fromarray(rgba[y0:y1, x0:x1])
    s = maxside / max(im.size)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    im.save(OUT + name + '.png', optimize=True)
    print(name, im.size)


def keep_largest(m):
    lab, n = ndi.label(m)
    if n == 0:
        return m
    sizes = ndi.sum(m, lab, range(1, n + 1))
    return lab == (1 + int(np.argmax(sizes)))


def border_labels(lab):
    return set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}


def watch(path):
    rgb = np.array(Image.open(path).convert('RGB'))
    white = rgb.min(axis=2) >= 238
    lab, n = ndi.label(white)
    border = border_labels(lab)
    sizes = ndi.sum(white, lab, range(1, n + 1))
    bg = np.zeros_like(white)
    for i in range(1, n + 1):
        if i in border or sizes[i - 1] > 900:
            bg |= lab == i
    fg = ndi.binary_erosion(keep_largest(~bg), iterations=1)
    finish(rgb, fg, 'watch', soft=0.8, fill=False)     # the strap's loop is a real hole


def card(path):
    rgb = np.array(Image.open(path).convert('RGB'))
    white = rgb.min(axis=2) >= 250
    lab, _ = ndi.label(white)
    bg = np.isin(lab, list(border_labels(lab)))
    fg = keep_largest(ndi.binary_opening(keep_largest(~bg), iterations=2))
    finish(rgb, fg, 'card', soft=1.0)


def umbrella(path):
    rgb = np.array(Image.open(path).convert('RGB'))
    f = rgb.astype(float)
    lum = 0.299 * f[..., 0] + 0.587 * f[..., 1] + 0.114 * f[..., 2]
    dark = lum < 95
    region = keep_largest(ndi.binary_dilation(dark, iterations=8))
    fg = ndi.binary_closing(dark & region, iterations=3)
    grown = ndi.binary_dilation(fg, iterations=1)
    finish(rgb, keep_largest(grown) & grown, 'umbrella', soft=1.0)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    watch(sys.argv[1]); card(sys.argv[2]); umbrella(sys.argv[3])
