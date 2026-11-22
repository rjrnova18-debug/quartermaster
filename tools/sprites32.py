"""Quartermaster pixel art, "32-bit 2D" pass.

Every image is a text matrix: one character = one palette colour, '.' = transparent.
The script writes PNGs at 1x (the app scales them by whole numbers, nearest neighbour)
and dumps every matrix to JSON so the app can reuse them.

    python sprites32.py <out_dir>
"""
import json
import os
import struct
import sys
import zlib

# 24 base colours (approved) + 8 transition tones for shading = 32 (the brief's maximum)
PAL = {
    # ink
    'k': '#1F1A2B', 'K': '#4A4257', 's': '#8B8398', 'm': '#C9C1CF',
    # paper
    'e': '#E9DDC0', 'p': '#F6EEDB', 'w': '#FFFAEE',
    # signal orange
    'O': '#A8471A', 'o': '#EE7B2C', 'h': '#FFB36B',
    # pass green
    'G': '#24663A', 'g': '#3E9A52', 'l': '#A6D98F',
    # fail red
    'R': '#922434', 'r': '#D53D3D', 'q': '#F4A592',
    # n/a slate
    'B': '#3D5470', 'b': '#6283A6', 'c': '#B3CBE0',
    # amber
    'Y': '#8A6410', 'y': '#F1C232',
    # cold
    'T': '#1F6F78', 't': '#43B9C4', 'u': '#C3EEF0',
    # 8 transition tones (new)
    'X': '#6A6178',  # metal shadow
    'n': '#ABA3B6',  # metal
    'i': '#DDEAF3',  # cold highlight (glass, chrome)
    'Q': '#C95F22',  # orange mid shade
    'v': '#4E6A8C',  # slate mid shade
    'z': '#8AA7C4',  # slate mid light
    'j': '#86D4DB',  # sky
    'f': '#FFD9A0',  # dawn glow
}


class Grid:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [['.'] * w for _ in range(h)]

    def get(self, x, y):
        return self.px[y][x] if 0 <= x < self.w and 0 <= y < self.h else '.'

    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c)

    def hline(self, x0, x1, y, c):
        self.rect(x0, y, x1, y, c)

    def vline(self, x, y0, y1, c):
        self.rect(x, y0, x, y1, c)

    def dither(self, x0, y0, x1, y1, c, only=None):
        """Checkerboard of colour c over the area (only over pixels in `only`)."""
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if (x + y) % 2 == 0 and (only is None or self.get(x, y) in only):
                    self.set(x, y, c)

    def disc(self, cx, cy, r, c):
        for y in range(cy - r - 1, cy + r + 2):
            for x in range(cx - r - 1, cx + r + 2):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r + r * 0.6:
                    self.set(x, y, c)

    def stamp(self, rows, x0, y0):
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row):
                if ch != '.':
                    self.set(x0 + dx, y0 + dy, ch)

    def recolor(self, x0, y0, x1, y1, mapping):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                c = self.get(x, y)
                if c in mapping:
                    self.set(x, y, mapping[c])

    def rows(self):
        return [''.join(r) for r in self.px]


# ---------------------------------------------------------------- vehicles

def wheel(g, cx, cy):
    g.disc(cx, cy, 5, 'k')
    g.disc(cx, cy, 4, 'K')
    g.disc(cx, cy, 2, 'n')
    g.set(cx, cy, 'X')
    g.set(cx - 1, cy - 1, 'i')
    g.set(cx - 1, cy - 2, 'i')
    for (x, y) in [(cx - 3, cy - 2), (cx - 2, cy - 3), (cx - 4, cy), (cx, cy - 4)]:
        g.set(x, y, 'X')          # tread highlight


def truck(reefer=False):
    g = Grid(96, 40)
    X0, X1, Y0, Y1 = 2, 67, 3, 27
    if reefer:
        out, body, top1, top2, rib_hi, rib_lo, rail1, rail2, grime = 'X', 'p', 'w', 'i', 'w', 'm', 'm', 'n', 'e'
    else:
        out, body, top1, top2, rib_hi, rib_lo, rail1, rail2, grime = 'B', 'b', 'c', 'z', 'z', 'v', 'v', 'B', 'v'
    # container box
    g.rect(X0, Y0, X1, Y1, out)
    g.hline(X0, X1, Y1, 'k')
    g.rect(X0 + 1, Y0 + 1, X1 - 1, Y1 - 1, body)
    g.hline(X0 + 1, X1 - 1, Y0 + 1, top1)
    g.hline(X0 + 1, X1 - 1, Y0 + 2, top2)
    g.hline(X0 + 1, X1 - 1, Y1 - 2, rail1)
    g.hline(X0 + 1, X1 - 1, Y1 - 1, rail2)
    # corrugation: highlight, body, shadow
    for x in range(X0 + 12, X1 - 9, 4):
        g.vline(x, Y0 + 3, Y1 - 3, rib_hi)
        g.vline(x + 2, Y0 + 3, Y1 - 3, rib_lo)
    # rear doors with locking bars and cams
    g.vline(X0 + 6, Y0 + 3, Y1 - 3, rail2)
    for bx in (X0 + 3, X0 + 9):
        g.vline(bx, Y0 + 3, Y1 - 3, 'n')
        g.vline(bx + 1, Y0 + 3, Y1 - 3, 'X')
        g.rect(bx - 1, Y0 + 4, bx + 1, Y0 + 5, 'k')
        g.rect(bx - 1, Y1 - 5, bx + 1, Y1 - 4, 'k')
    g.rect(X0 + 2, Y0 + 13, X0 + 4, Y0 + 13, 'k')
    g.rect(X0 + 8, Y0 + 13, X0 + 10, Y0 + 13, 'k')
    # corner castings
    for (x, y) in [(X0, Y0), (X1 - 2, Y0), (X0, Y1 - 2), (X1 - 2, Y1 - 2)]:
        g.rect(x, y, x + 2, y + 2, 'X')
        g.set(x + 1, y + 1, 'k')
        g.set(x, y, 'n')
    # grime along the bottom
    g.dither(X0 + 12, Y1 - 6, X1 - 3, Y1 - 3, grime, only={body})
    if reefer:
        # cooling unit on the front wall
        g.rect(X1 - 9, Y0 + 3, X1 - 1, Y1 - 3, 'n')
        g.hline(X1 - 9, X1 - 1, Y0 + 3, 'i')
        for y in range(Y0 + 5, Y1 - 4, 2):
            g.hline(X1 - 8, X1 - 2, y, 'X')
        g.rect(X1 - 7, Y0 + 15, X1 - 4, Y0 + 16, 'T')
        g.set(X1 - 6, Y0 + 15, 't')
        # snowflake emblem
        flake = ['....T....', '.T..T..T.', '..T.t.T..', '...ttt...', 'TTttittTT',
                 '...ttt...', '..T.t.T..', '.T..T..T.', '....T....']
        g.stamp(flake, 33, Y0 + 7)
    else:
        # ID plate
        g.rect(X1 - 18, Y0 + 5, X1 - 10, Y0 + 9, 'w')
        g.hline(X1 - 18, X1 - 10, Y0 + 9, 'm')
        g.hline(X1 - 17, X1 - 12, Y0 + 6, 'X')
        g.hline(X1 - 17, X1 - 14, Y0 + 8, 'n')

    # chassis and landing gear
    g.hline(X0 + 1, 76, Y1 + 1, 'X')
    g.hline(X0 + 1, 76, Y1 + 2, 'k')
    g.vline(52, Y1 + 3, Y1 + 9, 'X')
    g.vline(53, Y1 + 3, Y1 + 9, 'k')
    g.rect(51, Y1 + 10, 54, Y1 + 10, 'k')

    # tractor cab
    g.rect(70, 1, 71, 17, 'n')                      # exhaust stack
    g.vline(71, 1, 17, 'X')
    g.rect(70, 0, 71, 0, 'k')
    g.rect(72, 10, 93, 31, 'O')                     # body with sel-out
    g.hline(72, 93, 31, 'k')
    g.rect(73, 11, 92, 30, 'o')
    g.hline(73, 92, 11, 'h')
    g.vline(73, 11, 30, 'h')
    g.rect(89, 12, 92, 30, 'Q')
    g.rect(73, 28, 92, 30, 'Q')
    g.hline(73, 92, 30, 'O')
    for y in range(4, 10):                          # roof fairing
        x0 = 74 + (9 - y) // 2
        g.hline(x0, 88 - (9 - y) // 3, y, 'Q')
        g.set(x0, y, 'O')
    g.hline(75, 87, 4, 'h')
    g.hline(74, 89, 9, 'O')
    g.rect(83, 13, 91, 21, 'k')                     # window
    g.rect(84, 14, 90, 20, 'j')
    for i in range(5):
        g.set(85 + i, 19 - i, 'i')
        g.set(86 + i, 19 - i, 'u')
    g.vline(81, 13, 29, 'Q')                        # door seam
    g.hline(78, 79, 21, 'k')                        # handle
    for y in range(22, 30, 2):                      # grille
        g.hline(92, 93, y, 'X')
        g.hline(92, 93, y + 1, 'n')
    g.rect(91, 24, 93, 25, 'y')                     # headlight
    g.set(92, 24, 'w')
    g.rect(85, 30, 95, 32, 'k')                     # bumper
    g.hline(86, 94, 31, 'n')
    g.hline(86, 94, 30, 'i')
    g.rect(94, 14, 95, 18, 'k')                     # mirror
    g.rect(74, 25, 80, 30, 'k')                     # fuel tank
    g.rect(75, 26, 79, 29, 'n')
    g.hline(75, 79, 26, 'i')
    g.hline(75, 79, 29, 'X')

    for cx in (14, 26, 86):
        wheel(g, cx, 34)
    return g


def container_3q(lit='doors'):
    """Cabinet-oblique container: right side face-on, roof and doors receding."""
    g = Grid(60, 42)
    d = 8
    X0, X1, Y0, Y1 = 2, 46, 13, 38
    # roof
    for y in range(Y0 - d, Y0):
        off = Y0 - y
        g.hline(X0 + off, X1 + off, y, 'c')
        for x in range(X0 + off + 3, X1 + off - 1, 4):
            g.set(x, y, 'z')
    for i in range(d + 1):
        g.set(X0 + i, Y0 - i, 'k')
    g.hline(X0 + d, X1 + d, Y0 - d, 'k')
    # side
    g.rect(X0, Y0, X1, Y1, 'k')
    g.rect(X0 + 1, Y0 + 1, X1 - 1, Y1 - 1, 'b')
    g.hline(X0 + 1, X1 - 1, Y0, 'w')                # lit edge roof/side
    g.hline(X0 + 1, X1 - 1, Y0 + 1, 'c')
    g.hline(X0 + 1, X1 - 1, Y1 - 1, 'B')
    g.hline(X0 + 1, X1 - 1, Y1 - 2, 'v')
    for x in range(X0 + 3, X1 - 2, 4):
        g.vline(x, Y0 + 2, Y1 - 3, 'z')
        g.vline(x + 2, Y0 + 2, Y1 - 3, 'v')
    g.dither(X0 + 1, Y1 - 6, X1 - 1, Y1 - 3, 'v', only={'b'})
    # doors end
    face_fill = {'o': 'o', 'hi': 'h', 'lo': 'Q', 'edge': 'O'} if lit == 'doors' else \
                {'o': 'v', 'hi': 'z', 'lo': 'B', 'edge': 'B'}
    for x in range(X1 + 1, X1 + d + 1):
        off = x - X1
        top, bot = Y0 - off, Y1 - off
        g.vline(x, top + 1, bot - 1, face_fill['o'])
        g.set(x, top, 'k')
        g.set(x, bot, 'k')
        g.set(x, bot - 1, face_fill['lo'])
        g.set(x, bot - 2, face_fill['lo'])
    g.vline(X1 + 1, Y0, Y1 - 1, face_fill['hi'])
    g.vline(X1 + d, Y0 - d, Y1 - d, 'k')
    for bx in (X1 + 3, X1 + 6):
        off = bx - X1
        g.vline(bx, Y0 - off + 3, Y1 - off - 3, 'n')
        g.set(bx, Y0 - off + 3, 'k')
        g.set(bx, Y1 - off - 3, 'k')
    g.vline(X1 + 4, Y0 - 4 + 2, Y1 - 4 - 2, face_fill['edge'])
    # x-ray: hidden edges, dotted
    for x in range(X0 + d, X1 + 1, 2):
        g.set(x, Y1 - d, 'w')
    for y in range(Y0 + 1, Y1 - d + 1, 2):
        g.set(X0 + d, y, 'w')
    for i in range(0, d + 1, 2):
        g.set(X0 + i, Y1 - i, 'w')
    return g


# ---------------------------------------------------------------- home scene

def dawn_scene():
    g = Grid(170, 70)
    bands = [(0, 11, 'j'), (12, 25, 'u'), (26, 35, 'w'), (36, 69, 'f')]
    for y0, y1, c in bands:
        g.rect(0, y0, 169, y1, c)
    g.dither(0, 12, 169, 13, 'j')
    g.dither(0, 26, 169, 27, 'u')
    g.dither(0, 36, 169, 37, 'w')
    # sun
    g.disc(150, 46, 10, 'h')
    g.disc(150, 46, 8, 'w')
    # clouds
    for (x, y, w) in [(112, 8, 22), (138, 22, 18)]:
        g.rect(x + 3, y, x + w - 4, y, 'w')
        g.rect(x, y + 1, x + w, y + 2, 'w')
        g.hline(x + 1, x + w - 1, y + 3, 'i')
    # far gantry crane
    for lx in (96, 120):
        g.rect(lx, 18, lx + 1, 54, 'z')
    g.rect(88, 15, 140, 17, 'z')
    g.rect(104, 18, 110, 22, 'z')
    g.vline(107, 23, 34, 'z')
    g.rect(105, 34, 109, 35, 'z')
    for x in range(89, 140, 3):
        g.set(x, 18, 'z')
    # far container stacks (light, atmospheric)
    for (x0, x1, top) in [(0, 22, 38), (23, 48, 30), (49, 70, 42), (128, 169, 48)]:
        g.rect(x0, top, x1, 55, 'c')
        for y in range(top, 55, 8):
            g.hline(x0, x1, y, 'z')
        for x in range(x0 + 2, x1, 3):
            g.vline(x, top + 1, 54, 'i' if (x // 3) % 2 else 'c')
    # near stacks on the left, coloured
    near = [(0, 18, 44, ('Q', 'o', 'O')), (19, 40, 48, ('g', 'l', 'G')), (0, 18, 36, ('v', 'z', 'B'))]
    for x0, x1, top, (mid, hi, lo) in near:
        g.rect(x0, top, x1, top + 7, mid)
        g.hline(x0, x1, top, hi)
        g.hline(x0, x1, top + 7, lo)
        for x in range(x0 + 2, x1, 3):
            g.vline(x, top + 1, top + 6, lo)
    # yard ground
    g.rect(0, 56, 169, 69, 'n')
    g.hline(0, 169, 56, 'm')
    g.dither(0, 57, 169, 58, 'm')
    for x in range(4, 170, 14):
        g.hline(x, x + 6, 64, 'w')
    g.dither(64, 64, 164, 67, 'X', only={'n', 'w'})       # truck shadow
    g.hline(0, 169, 69, 'X')
    return g


# ---------------------------------------------------------------- nine-slice frames

def frame(w, profile, outline, fill, hi=None, lo=None, ring=None, depth=0, depth_c=None,
          dotted=False, h=None):
    """A stretchable frame. `profile` = transparent pixels at each corner row, from the edge in."""
    h = h or w
    H = h                     # face height
    T = H + depth

    def inset(y, height):
        top, bot = y, height - 1 - y
        if top < len(profile):
            return profile[top]
        if bot < len(profile):
            return profile[bot]
        return 0

    def in_face(x, y):
        if not (0 <= y < H):
            return False
        i = inset(y, H)
        return i <= x <= w - 1 - i

    def in_full(x, y):
        return any(in_face(x, y - s) for s in range(depth + 1)) if 0 <= x < w else False

    n4 = [(1, 0), (-1, 0), (0, 1), (0, -1)]

    def face_edge(x, y):
        return in_face(x, y) and any(not in_face(x + dx, y + dy) for dx, dy in n4)

    g = Grid(w, T)
    # pass 1: the whole silhouette (face + depth band): outline around, depth colour inside
    for y in range(T):
        for x in range(w):
            if in_full(x, y):
                edge = any(not in_full(x + dx, y + dy) for dx, dy in n4)
                g.set(x, y, outline if edge else depth_c)
    # pass 2: the face: outline, then a one-pixel bevel (or ring), then the fill
    for y in range(H):
        for x in range(w):
            if not in_face(x, y):
                continue
            if face_edge(x, y):
                g.set(x, y, fill if dotted and (x + y) % 2 else outline)
                continue
            near = [(dx, dy) for dx, dy in n4 if face_edge(x + dx, y + dy)]
            if near and ring:
                g.set(x, y, ring)
            elif near and hi and any(d in [(-1, 0), (0, -1)] for d in near):
                g.set(x, y, hi)
            elif near and lo and any(d in [(1, 0), (0, 1)] for d in near):
                g.set(x, y, lo)
            else:
                g.set(x, y, fill)
    return g


def node(kind):
    prof = [5, 3, 2, 1, 1]
    if kind == 'done':
        g = frame(18, prof, 'G', 'l', hi='w')
        g.stamp(['.......G', '......GG', 'G....GG.', 'GG..GG..', '.GGGG...', '..GG....'], 5, 6)
    elif kind == 'current':
        g = frame(22, prof, 'k', 'o', hi='h', lo='Q')
    elif kind == 'todo':
        g = frame(18, prof, 'k', 'w', lo='e')
    else:  # skipped: dotted outline, not a lock
        g = frame(18, prof, 's', 'p', dotted=True)
        g.rect(6, 8, 11, 9, 's')
    return g


# ---------------------------------------------------------------- icons (10 px grid)

ICONS = {
    'check': ['........GG', '.......GlG', '......GlG.', 'G....GlG..', 'GG..GlG...',
              'GlGGlG....', '.GllG.....', '..GG......'],
    'cross': ['.RR....RR.', 'RrrR..RrrR', '.RrrRRrrR.', '..RrrrrR..', '...RrrR...',
              '..RrrrrR..', '.RrrRRrrR.', 'RrrR..RrrR', '.RR....RR.'],
    'dash': ['.BBBBBBBB.', 'BbbbbbbbbB', 'BvvvvvvvvB', '.BBBBBBBB.'],
    'snow': ['....T....', '.T..T..T.', '..T.t.T..', '...ttt...', 'TTttittTT',
             '...ttt...', '..T.t.T..', '.T..T..T.', '....T....'],
    'clock': ['...kkkk...', '..kwwwwk..', '.kwwwkwwk.', 'kwwwwkwwwk', 'kwwwwkkkwk',
              'kwwwwwwwwk', '.kwwwwwwk.', '..kwwwwk..', '...kkkk...'],
    'alert': ['....kk....', '...kyyk...', '..kykkyk..', '..kykkyk..', '.kyykkyyk.',
              '.kyyyyyyk.', 'kyyykkyyyk', 'kkkkkkkkkk'],
    'chev': ['.kk.....', '.kKk....', '..kKk...', '...kKk..', '...kKk..', '..kKk...',
             '.kKk....', '.kk.....'],
    'back': ['...k......', '..kk......', '.kKkkkkkkk', 'kKKKKKKKKk', '.kKkkkkkkk',
             '..kk......', '...k......'],
    'next': ['......k...', '......kk..', 'kkkkkkkKk.', 'kKKKKKKKKk', 'kkkkkkkKk.',
             '......kk..', '......k...'],
    'plus': ['...kkk...', '...kwk...', 'kkkkwkkkk', 'kwwwwwwwk', 'kkkkwkkkk',
             '...kwk...', '...kkk...'],
    'trash': ['...kkkk...', 'kkkkkkkkkk', 'kiiiiiiiik', 'kkkkkkkkkk', '.knXnXnXk.',
              '.knXnXnXk.', '.knXnXnXk.', '.knXnXnXk.', '.kkkkkkkk.'],
    'list': ['kkkkkkkkk', 'kwwwwwwwk', 'kwXXXXXwk', 'kwwwwwwwk', 'kwXXXXwwk',
             'kwwwwwwwk', 'kwXXXXXwk', 'kwwwwwwwk', 'kkkkkkkkk'],
    'card': ['kkkkkkkkkk', 'kzzzzzzzzk', 'kwwwwwwwwk', 'kwOOwXXXwk', 'kwOOwwwwwk',
             'kwhhwXXwwk', 'kwwwwwwwwk', 'kkkkkkkkkk'],
    'user': ['...kkkk...', '..khhhhk..', '..khhhhk..', '..khhhhk..', '...kkkk...',
             '.kkkkkkkk.', 'kooooooook', 'kQQQQQQQQk', 'kkkkkkkkkk'],
    'note': ['.......kk.', '......kyyk', '.....kyyk.', '....kyyk..', '...kyyk...',
             '..kyyk....', '.kmyk.....', '.kkk......', 'kk........'],
}


def icon(name):
    rows = ICONS[name]
    g = Grid(max(len(r) for r in rows), len(rows))
    g.stamp(rows, 0, 0)
    return g


# ---------------------------------------------------------------- output

def png(rows, path):
    h, w = len(rows), max(len(r) for r in rows)
    raw = b''
    for row in rows:
        raw += b'\x00'
        for x in range(w):
            ch = row[x] if x < len(row) else '.'
            if ch == '.':
                raw += b'\x00\x00\x00\x00'
            else:
                c = PAL[ch]
                raw += bytes([int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16), 255])

    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)

    data = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(data)


def build():
    r2 = [2, 1]
    images = {
        'truck-dry': truck(),
        'truck-reefer': truck(True),
        'container-doors': container_3q(),
        'scene-dawn': dawn_scene(),
        # frames: profile [2,1] -> slice 4 px
        'frame-panel': frame(10, r2, 'k', 'p', hi='w', lo='e'),
        'frame-card': frame(10, r2, 'k', 'w', lo='e'),
        'frame-line': frame(10, r2, 'k', 'w'),
        'frame-field': frame(10, [1], 'k', 'w', hi='m'),
        'frame-field-fail': frame(10, [1], 'R', 'w', ring='q'),
        'btn-orange': frame(10, r2, 'k', 'o', hi='h', lo='Q', depth=2, depth_c='O'),
        'btn-paper': frame(10, r2, 'k', 'p', hi='w', lo='m', depth=2, depth_c='n'),
        # stamps: square / octagon / round
        'stamp-pass-off': frame(12, [1], 'G', 'w', ring='l'),
        'stamp-pass-on': frame(12, [1], 'k', 'G', hi='g'),
        'stamp-fail-off': frame(16, [4, 3, 2, 1], 'R', 'w', ring='q'),
        'stamp-fail-on': frame(16, [4, 3, 2, 1], 'k', 'R', hi='r'),
        'stamp-na-off': frame(18, [5, 3, 2, 1, 1], 'B', 'w', ring='c'),
        'stamp-na-on': frame(18, [5, 3, 2, 1, 1], 'k', 'B', hi='v'),
        'node-done': node('done'),
        'node-current': node('current'),
        'node-todo': node('todo'),
        'node-skip': node('skip'),
    }
    for name in ICONS:
        images['icon-' + name] = icon(name)
    return images


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'out32'
    os.makedirs(os.path.join(out, 'png'), exist_ok=True)
    imgs = build()
    for name, g in imgs.items():
        png(g.rows(), os.path.join(out, 'png', name + '.png'))
    with open(os.path.join(out, 'matrices32.json'), 'w') as f:
        json.dump({'palette': PAL, 'images': {k: g.rows() for k, g in imgs.items()}}, f, indent=1)
    print(len(imgs), 'images,', len(PAL), 'colours')
