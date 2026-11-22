/** The finger signature becomes a valid PNG with exactly the ink that was drawn. */
import { inflateSync } from 'node:zlib';

import { encodePng, isBlank, rasterize, signaturePng, SIGNATURE_HEIGHT, SIGNATURE_WIDTH } from '../src/form/signature';

/** Reads back what a PNG decoder would see: size, colour type and the unpacked ink grid. */
function decode(png: Uint8Array) {
  const bytes = Buffer.from(png);
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  let offset = 8;
  const chunks: Record<string, Buffer> = {};
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    chunks[type] = Buffer.concat([chunks[type] ?? Buffer.alloc(0), bytes.subarray(offset + 8, offset + 8 + length)]);
    offset += 12 + length;
  }
  const width = chunks.IHDR.readUInt32BE(0);
  const height = chunks.IHDR.readUInt32BE(4);
  const raw = inflateSync(chunks.IDAT); // fails if the zlib data or its checksum is wrong
  const rowBytes = Math.ceil(width / 8);
  const ink: boolean[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      ink.push((raw[y * (rowBytes + 1) + 1 + (x >> 3)] & (0x80 >> (x & 7))) !== 0);
    }
  }
  return { width, height, depth: chunks.IHDR[8], colourType: chunks.IHDR[9], palette: chunks.PLTE, alpha: chunks.tRNS, ink };
}

test('a horizontal stroke inks the pixels along it and nothing far from it', () => {
  const ink = rasterize([[{ x: 2, y: 5 }, { x: 17, y: 5 }]], 20, 10, 2);
  expect(ink[5 * 20 + 10]).toBe(true);
  expect(ink[0]).toBe(false);
  expect(ink[9 * 20 + 19]).toBe(false);
});

test('a single touch leaves a dot', () => {
  const ink = rasterize([[{ x: 5, y: 5 }]], 10, 10, 4);
  expect(ink.filter(Boolean).length).toBeGreaterThan(4);
});

test('the PNG decodes to the same grid, 1 bit with a transparent background', () => {
  const ink = rasterize([[{ x: 0, y: 0 }, { x: 12, y: 6 }]], 13, 7, 2);
  const png = decode(encodePng(ink, 13, 7, '#3D5470'));
  expect([png.width, png.height, png.depth, png.colourType]).toEqual([13, 7, 1, 3]);
  expect([...png.palette]).toEqual([255, 255, 255, 0x3d, 0x54, 0x70]);
  expect([...png.alpha]).toEqual([0]);
  expect(png.ink).toEqual(ink);
});

test('a full-size signature decodes at the stored size and stays small', () => {
  const strokes = [[{ x: 10, y: 20 }, { x: 290, y: 100 }, { x: 150, y: 110 }]];
  const bytes = signaturePng(strokes, 300, '#1F1A2B');
  const png = decode(bytes);
  expect([png.width, png.height]).toEqual([SIGNATURE_WIDTH, SIGNATURE_HEIGHT]);
  expect(png.ink[40 * SIGNATURE_WIDTH + 20]).toBe(true); // (10,20) scaled by 2
  expect(bytes.length).toBeLessThan(20 * 1024);
});

test('an image too big for one stored block is split and still decodes', () => {
  const ink = rasterize([[{ x: 0, y: 0 }, { x: 1199, y: 999 }]], 1200, 1000, 3); // 151 000 raw bytes: 3 blocks
  expect(decode(encodePng(ink, 1200, 1000, '#1F1A2B')).ink).toEqual(ink);
});

test('an untouched pad is blank', () => {
  expect(isBlank([])).toBe(true);
  expect(isBlank([[{ x: 1, y: 1 }]])).toBe(false);
});
