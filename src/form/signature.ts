/**
 * Turns the strokes of a finger signature into a small PNG, with no library.
 *
 * A signature is two colours: ink and nothing. So the image uses one bit per pixel and
 * a two-entry palette whose first entry is transparent. A 600 × 240 signature is about
 * 18 KB before any compression, small enough to store the pixels "as is" inside the PNG
 * (deflate's uncompressed blocks), which keeps this file short and easy to follow.
 */

export interface Point {
  x: number;
  y: number;
}

/** One finger movement, from touching the pad to lifting the finger. */
export type Stroke = Point[];

export const SIGNATURE_WIDTH = 600;
export const SIGNATURE_HEIGHT = 240;

/**
 * Draws the strokes into a grid of booleans (true = ink), `width` × `height` pixels.
 * Each segment is sampled every half pixel and stamped with a round pen.
 */
export function rasterize(strokes: Stroke[], width: number, height: number, penWidth = 4): boolean[] {
  const ink = new Array<boolean>(width * height).fill(false);
  const radius = penWidth / 2;

  const stamp = (cx: number, cy: number) => {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        if (x >= 0 && x < width && y >= 0 && y < height && (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) {
          ink[y * width + x] = true;
        }
      }
    }
  };

  for (const stroke of strokes) {
    if (stroke.length === 1) stamp(stroke[0].x, stroke[0].y); // a dot
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1];
      const b = stroke[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2));
      for (let s = 0; s <= steps; s++) {
        stamp(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps);
      }
    }
  }
  return ink;
}

/** True when the pad has no ink at all (nothing to save). */
export function isBlank(strokes: Stroke[]): boolean {
  return strokes.every((stroke) => stroke.length === 0);
}

// ---------------------------------------------------------------- PNG encoding

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function uint32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

/** Joins byte arrays with `set`, never with `...spread` (a phone limits how many arguments a call may take). */
function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = concat([new Uint8Array(Array.from(type, (c) => c.charCodeAt(0))), data]);
  return concat([uint32(data.length), body, uint32(crc32(body))]);
}

/** zlib data made of uncompressed ("stored") deflate blocks of at most 65 535 bytes. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  let offset = 0;
  do {
    const block = raw.subarray(offset, offset + 65535);
    const last = offset + block.length >= raw.length ? 1 : 0;
    const n = block.length;
    parts.push(new Uint8Array([last, n & 0xff, n >>> 8, ~n & 0xff, (~n >>> 8) & 0xff]), block);
    offset += n;
  } while (offset < raw.length);
  parts.push(uint32(adler32(raw)));
  return concat(parts);
}

/** A PNG of the grid: transparent background, `inkHex` (#RRGGBB) for the ink. */
export function encodePng(ink: boolean[], width: number, height: number, inkHex: string): Uint8Array {
  const rowBytes = Math.ceil(width / 8);
  const raw = new Uint8Array(height * (rowBytes + 1)); // each row starts with filter type 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (ink[y * width + x]) raw[y * (rowBytes + 1) + 1 + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(inkHex.slice(i, i + 2), 16));
  const header = concat([uint32(width), uint32(height), new Uint8Array([1, 3, 0, 0, 0])]); // 1 bit, palette
  return concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('PLTE', new Uint8Array([255, 255, 255, r, g, b])),
    chunk('tRNS', new Uint8Array([0])), // palette entry 0 is fully transparent
    chunk('IDAT', zlibStored(raw)),
    chunk('IEND', new Uint8Array()),
  ]);
}

/** Strokes in pad coordinates (dp) → PNG bytes at the stored signature size. */
export function signaturePng(strokes: Stroke[], padWidth: number, inkHex: string): Uint8Array {
  const scale = SIGNATURE_WIDTH / padWidth;
  const scaled = strokes.map((stroke) => stroke.map((p) => ({ x: p.x * scale, y: p.y * scale })));
  return encodePng(rasterize(scaled, SIGNATURE_WIDTH, SIGNATURE_HEIGHT), SIGNATURE_WIDTH, SIGNATURE_HEIGHT, inkHex);
}
