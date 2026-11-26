"""Trace the shipped art. Requires Pillow, NumPy, SciPy, scikit-image and OpenCV.

Usage: python tools/boss-vector/build.py [source.png] [output.bin]
"""
import argparse
import gzip
import struct
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
from skimage.measure import find_contours

ROOT = Path(__file__).resolve().parents[2]
CELL_WIDTH, CELL_HEIGHT = 125, 144.25
COUNTS = (12, 16, 16, 14)
SAMPLE_SCALE = 3
PATH_SCALE = 8
ALPHA_LEVELS = (20, 61, 112, 161, 209, 239)


def register(base, frame, motion):
    gray = [cv2.cvtColor(im, cv2.COLOR_RGBA2GRAY) for im in (base, frame)]
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 100, 1e-7)
    score, matrix = cv2.findTransformECC(*gray, np.eye(2, 3, dtype=np.float32), motion, criteria)
    if score < .999:
        raise ValueError(f'Frames do not share a pose (registration score {score:.5f})')
    angle = np.arctan2(matrix[1, 0], matrix[0, 0])
    x, y = matrix[:, 2]
    center = .5 - matrix[:, :2].sum(axis=1) * .5
    return x + center[0], y + center[1], angle


def outlines(signal, level, tolerance, min_area):
    # Marching squares interpolates the threshold between samples. Pad the field so
    # contours that reach the sample bounds are closed, including transparent holes.
    contours = find_contours(np.pad(signal, 1), level)
    polygons = []
    for contour in contours:
        xy = np.ascontiguousarray(contour[:, ::-1], dtype=np.float32) - .5
        if cv2.contourArea(xy) < min_area:
            continue
        points = cv2.approxPolyDP(xy, tolerance, True).reshape(-1, 2)
        if len(points) > 2:
            polygons.append(np.rint(points * PATH_SCALE / SAMPLE_SCALE).astype(int).tolist())
    return polygons


def trace(frame):
    alpha = frame[:, :, 3]
    inside = alpha >= 85
    distance, (iy, ix) = distance_transform_edt(~inside, return_indices=True)

    def upscale(image, method=cv2.INTER_CUBIC):
        return cv2.resize(image, None, fx=SAMPLE_SCALE, fy=SAMPLE_SCALE, interpolation=method)

    # Extend colors underneath the silhouette so its antialiasing uses the local edge color.
    color = upscale(frame[iy, ix, :3].astype(np.float32))
    # Raise contrast across details that were softened when the source was downsampled.
    # This feeds the geometry extraction only. The game still paints the resulting paths.
    softened = cv2.GaussianBlur(color, (0, 0), .72 * SAMPLE_SCALE)
    color = np.clip(color + .72 * (color - softened), 0, 255)
    limit = upscale(distance, cv2.INTER_LINEAR) < 2.8
    alpha = upscale(alpha)
    masks = [outlines(alpha, level, .63, .8) for level in ALPHA_LEVELS]

    # Most of the hair, trousers and sneakers are nearly neutral. Trace their shared gray
    # component once, followed by the extra red, green and blue separately.
    gray = color.min(2)
    signals = (gray, *(color - gray[:, :, None]).transpose(2, 0, 1))
    channels = []
    for signal, step in zip(signals, (6, 7, 7, 6)):
        trimmed = np.where(limit, signal, 0)
        bands, previous = [], 0
        for value in range(step, 256, step):
            polygons = outlines(trimmed, value - step / 2, .88, 3.5)
            if polygons:
                bands.append((value - previous, polygons))
                previous = value
        channels.append(bands)
    return masks, channels


def encode(poses, placements):
    # The bitstream is path geometry and paint values, with no embedded pixels. See boss-vector.ts.
    out = bytearray([1, PATH_SCALE, len(poses)])

    def number(n):
        while n > 127:
            out.append(128 + (n & 127))
            n >>= 7
        out.append(n)

    def signed(n):
        number(2 * n if n >= 0 else -2 * n - 1)

    def shape(polygons):
        number(len(polygons))
        left = top = 0
        for polygon in polygons:
            number(len(polygon))
            x, y = polygon[0]
            signed(x - left)
            signed(y - top)
            left, top = x, y
            for next_x, next_y in polygon[1:]:
                dx, dy = next_x - x, next_y - y
                if -7 <= dx <= 7 and -7 <= dy <= 7:
                    out.append((dx + 7) * 15 + dy + 7)
                else:
                    out.append(255)
                    signed(dx)
                    signed(dy)
                x, y = next_x, next_y

    for pose in poses:
        masks, channels = trace(pose)
        for polygons in masks:
            shape(polygons)
        for channel in channels:
            number(len(channel))
            for value, polygons in channel:
                out.append(value)
                shape(polygons)
    for row in placements:
        for index, x, y, angle in row:
            out += struct.pack('<Bfff', index, x, y, angle)
    return gzip.compress(out, mtime=0)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, nargs='?', default=ROOT / 'assets/skins/boss-sprite.png')
    parser.add_argument('output', type=Path, nargs='?', default=ROOT / 'assets/skins/boss-vector.bin')
    args = parser.parse_args()
    source = np.array(Image.open(args.source).convert('RGBA'))
    if source.shape != (577, 2000, 4):
        raise ValueError('Expected the original 2000 × 577 four-row sprite sheet')
    poses, placements = [], []
    for row, count in enumerate(COUNTS):
        top, bottom = int(row * CELL_HEIGHT), int((row + 1) * CELL_HEIGHT)
        frames = [source[top:bottom, i*CELL_WIDTH:(i+1)*CELL_WIDTH] for i in range(count)]
        # Run uses eight poses with alternating vertical offsets. The other rows reuse one
        # pose with the original bob or rotation. Keep a separate placement for every frame.
        group_size = 2 if row == 1 else count
        row_placements = []
        for start in range(0, count, group_size):
            base, index = frames[start], len(poses)
            poses.append(base)
            row_placements.append((index, 0, 0, 0))
            mode = cv2.MOTION_EUCLIDEAN if row == 3 else cv2.MOTION_TRANSLATION
            for frame in frames[start + 1:start + group_size]:
                row_placements.append((index, *register(base, frame, mode)))
        placements.append(row_placements)
    packed = encode(poses, placements)
    args.output.write_bytes(packed)
    print(f'{sum(COUNTS)} frames, {len(poses)} distinct poses, {len(packed):,} bytes')


if __name__ == '__main__':
    main()
