"""Placeholder photos and signatures for the demo data (src/demo/demo-data.ts).

The photos are drawn with the app's own sprites and carry the name of their question,
so the demo never uses a photograph of a real place, vehicle or person. The signatures
are generated pen strokes. Run it from the repo root when a photo question is added:

    python tools/demo_images.py

and commit what it writes to assets/demo/. The output is always the same.
"""
import math
import os
import random

from sprites32 import Grid, container_3q, dawn_scene, png, truck

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'demo')
PHOTO_SCALE = 4       # 170x70 scene -> 680x280 px
SIGNATURE_SCALE = 3   # 120x40 pad -> 360x120 px

# 5x7 pixel font, only the letters the labels use. Add a glyph when a label needs it.
FONT = {
    'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'I': ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    ' ': ['.....'] * 7,
}

# question code -> (file name, label, subject); file names match PHOTO_ASSETS in demo-data.ts
PHOTOS = {
    'PHOTO_ARRIVAL': ('photo-arrival.png', 'ARRIVAL', 'truck'),
    'PHOTO_EMPTY': ('photo-empty.png', 'EMPTY', 'container'),
    'PHOTO_LOADED': ('photo-loaded.png', 'LOADED', 'container'),
    'PHOTO_CLOSED': ('photo-closed.png', 'CLOSED', 'container'),
    'PHOTO_SEAL': ('photo-seal.png', 'SEAL', 'container'),
    'RFR_PHOTO_DISPLAY': ('photo-reefer-display.png', 'REEFER DISPLAY', 'reefer'),
}

SIGNERS = ['sam', 'kim', 'robin', 'driver-1', 'driver-2', 'driver-3']


def text(g, words, x, y, color):
    for i, letter in enumerate(words):
        for dy, row in enumerate(FONT[letter]):
            for dx, ch in enumerate(row):
                if ch == '#':
                    g.set(x + i * 6 + dx, y + dy, color)


def label(g, words, x, y, fill, ink):
    """A tag with a 1 px outline: text on a filled box."""
    width = len(words) * 6 - 1
    g.rect(x, y, x + width + 5, y + 12, 'k')
    g.rect(x + 1, y + 1, x + width + 4, y + 11, fill)
    text(g, words, x + 3, y + 3, ink)


def photo(subject, words):
    g = dawn_scene()
    if subject == 'container':
        g.stamp(container_3q().rows(), 84, 24)
    else:
        g.stamp(truck(reefer=(subject == 'reefer')).rows(), 66, 27)
    label(g, words, 3, 3, 'k', 'w')
    label(g, 'DEMO PHOTO', 3, 17, 'y', 'k')
    return g


def line(g, x0, y0, x1, y1, color):
    """Bresenham line, two pixels wide so it reads as a pen stroke."""
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    while True:
        g.set(x0, y0, color)
        g.set(x0 + 1, y0, color)
        if x0 == x1 and y0 == y1:
            return
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def signature(seed):
    """Cursive-looking loops (a prolate cycloid) plus an underline. Transparent background."""
    rnd = random.Random(seed)
    g = Grid(120, 40)
    speed = rnd.uniform(1.0, 1.3)
    loop = rnd.uniform(3.6, 4.8)
    heights = [rnd.uniform(0.6, 1.6) for _ in range(12)]
    drift = rnd.uniform(0, 2 * math.pi)
    previous, t = None, 0.0
    while True:
        x = 8 + speed * 1.6 * t - loop * math.sin(t)
        if x > 108:
            break
        tall = heights[int(t / (2 * math.pi)) % len(heights)]
        y = 19 - loop * tall * 1.5 * math.cos(t) + 3 * math.sin(0.21 * t + drift)
        point = (round(x), round(y))
        if previous:
            line(g, *previous, *point, 'B')
        previous = point
        t += 0.05
    y0 = 34 + rnd.randint(-1, 1)
    line(g, rnd.randint(10, 30), y0, rnd.randint(90, 110), y0 + rnd.randint(-3, 1), 'B')
    return g


def save(g, name, scale):
    rows = [''.join(ch * scale for ch in row) for row in g.rows() for _ in range(scale)]
    png(rows, os.path.join(OUT, name))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for file_name, words, subject in PHOTOS.values():
        save(photo(subject, words), file_name, PHOTO_SCALE)
    for signer in SIGNERS:
        save(signature(signer), f'signature-{signer}.png', SIGNATURE_SCALE)
    print(f'{len(PHOTOS)} photos and {len(SIGNERS)} signatures in {os.path.normpath(OUT)}')
