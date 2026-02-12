// Generate minimal PNG icons from raw pixel data (no dependencies)
import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

function createPNG(width, height, drawFn) {
  const pixels = new Uint8Array(width * height * 4);

  // Draw function fills pixels
  drawFn(pixels, width, height);

  // Build raw scanlines (filter byte 0 = None for each row)
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const di = y * (1 + width * 4) + 1 + x * 4;
      raw[di] = pixels[si];
      raw[di + 1] = pixels[si + 1];
      raw[di + 2] = pixels[si + 2];
      raw[di + 3] = pixels[si + 3];
    }
  }

  const compressed = deflateSync(Buffer.from(raw));

  // PNG file structure
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeB = Buffer.from(type, 'ascii');
    const body = Buffer.concat([typeB, data]);
    const crc = crc32(body);
    const crcB = Buffer.alloc(4);
    crcB.writeUInt32BE(crc >>> 0);
    return Buffer.concat([len, body, crcB]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', iend),
  ]);
}

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Helper to set a pixel
function setPixel(pixels, w, x, y, r, g, b, a = 255) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || x >= w || y < 0 || y >= w) return;
  const i = (y * w + x) * 4;
  // Alpha blending
  const srcA = a / 255;
  const dstA = pixels[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA > 0) {
    pixels[i] = Math.round((r * srcA + pixels[i] * dstA * (1 - srcA)) / outA);
    pixels[i + 1] = Math.round((g * srcA + pixels[i + 1] * dstA * (1 - srcA)) / outA);
    pixels[i + 2] = Math.round((b * srcA + pixels[i + 2] * dstA * (1 - srcA)) / outA);
    pixels[i + 3] = Math.round(outA * 255);
  }
}

function fillRect(pixels, w, h, x1, y1, rw, rh, r, g, b, a = 255) {
  for (let y = Math.max(0, Math.floor(y1)); y < Math.min(h, Math.ceil(y1 + rh)); y++) {
    for (let x = Math.max(0, Math.floor(x1)); x < Math.min(w, Math.ceil(x1 + rw)); x++) {
      setPixel(pixels, w, x, y, r, g, b, a);
    }
  }
}

function fillCircle(pixels, w, h, cx, cy, radius, r, g, b, a = 255) {
  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(h - 1, Math.ceil(cy + radius)); y++) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(w - 1, Math.ceil(cx + radius)); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(pixels, w, x, y, r, g, b, a);
      }
    }
  }
}

function drawLine(pixels, w, h, x1, y1, x2, y2, thickness, r, g, b, a = 255) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.ceil(len * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = x1 + dx * t;
    const cy = y1 + dy * t;
    fillCircle(pixels, w, h, cx, cy, thickness / 2, r, g, b, a);
  }
}

function drawIcon(pixels, w, h, maskable) {
  const s = w;
  const scale = s / 512;

  // Background gradient (simplified: solid)
  fillRect(pixels, w, h, 0, 0, w, h, 0x1a, 0x1a, 0x2e);

  // Round corners for non-maskable (approximate by just covering corners with transparent)
  if (!maskable) {
    const r = Math.floor(s * 0.15);
    for (let y = 0; y < r; y++) {
      for (let x = 0; x < r; x++) {
        const dx = r - x, dy = r - y;
        if (dx * dx + dy * dy > r * r) setPixel(pixels, w, x, y, 0, 0, 0, 0);
      }
      for (let x = w - r; x < w; x++) {
        const dx = x - (w - r), dy = r - y;
        if (dx * dx + dy * dy > r * r) setPixel(pixels, w, x, y, 0, 0, 0, 0);
      }
    }
    for (let y = h - r; y < h; y++) {
      for (let x = 0; x < r; x++) {
        const dx = r - x, dy = y - (h - r);
        if (dx * dx + dy * dy > r * r) setPixel(pixels, w, x, y, 0, 0, 0, 0);
      }
      for (let x = w - r; x < w; x++) {
        const dx = x - (w - r), dy = y - (h - r);
        if (dx * dx + dy * dy > r * r) setPixel(pixels, w, x, y, 0, 0, 0, 0);
      }
    }
  }

  const ox = maskable ? s * 0.1 : 0;
  const sc = maskable ? 0.8 : 1;
  const S = scale * sc;
  const OX = ox, OY = ox;

  // Waveform
  const wavePoints = [[80,256],[110,200],[130,280],[160,180],[190,300],[210,220],[240,290],[260,190],[290,310],[310,210],[340,270],[360,200],[390,280],[410,240],[440,256]];
  for (let i = 0; i < wavePoints.length - 1; i++) {
    drawLine(pixels, w, h,
      OX + wavePoints[i][0] * S, OY + wavePoints[i][1] * S,
      OX + wavePoints[i + 1][0] * S, OY + wavePoints[i + 1][1] * S,
      Math.max(2, 5 * S), 0xe9, 0x45, 0x60);
  }

  // Notes
  fillCircle(pixels, w, h, OX + 130 * S, OY + 380 * S, 18 * S, 0xe9, 0x45, 0x60);
  fillRect(pixels, w, h, OX + 146 * S, OY + 310 * S, 5 * S, 70 * S, 0xe9, 0x45, 0x60);
  fillCircle(pixels, w, h, OX + 200 * S, OY + 370 * S, 18 * S, 0xe9, 0x45, 0x60);
  fillRect(pixels, w, h, OX + 216 * S, OY + 300 * S, 5 * S, 70 * S, 0xe9, 0x45, 0x60);
  fillRect(pixels, w, h, OX + 146 * S, OY + 308 * S, 75 * S, 6 * S, 0xe9, 0x45, 0x60);

  // Stylus shape (simplified rectangle)
  fillRect(pixels, w, h, OX + 350 * S, OY + 90 * S, 12 * S, 80 * S, 0x88, 0x92, 0xb0);
  fillRect(pixels, w, h, OX + 350 * S, OY + 90 * S, 12 * S, 20 * S, 0xe9, 0x45, 0x60);

  // "NP" text simplified as shapes
  // N
  fillRect(pixels, w, h, OX + 190 * S, OY + 430 * S, 6 * S, 40 * S, 0xea, 0xea, 0xea);
  fillRect(pixels, w, h, OX + 220 * S, OY + 430 * S, 6 * S, 40 * S, 0xea, 0xea, 0xea);
  drawLine(pixels, w, h, OX + 193 * S, OY + 432 * S, OX + 223 * S, OY + 467 * S, 4 * S, 0xea, 0xea, 0xea);
  // P
  fillRect(pixels, w, h, OX + 240 * S, OY + 430 * S, 6 * S, 40 * S, 0xea, 0xea, 0xea);
  fillRect(pixels, w, h, OX + 246 * S, OY + 430 * S, 20 * S, 6 * S, 0xea, 0xea, 0xea);
  fillRect(pixels, w, h, OX + 246 * S, OY + 448 * S, 20 * S, 6 * S, 0xea, 0xea, 0xea);
  fillRect(pixels, w, h, OX + 262 * S, OY + 432 * S, 6 * S, 20 * S, 0xea, 0xea, 0xea);

  // D (for DAW)
  fillRect(pixels, w, h, OX + 285 * S, OY + 430 * S, 6 * S, 40 * S, 0xea, 0xea, 0xea);
  fillRect(pixels, w, h, OX + 291 * S, OY + 430 * S, 15 * S, 6 * S, 0xea, 0xea, 0xea);
  fillRect(pixels, w, h, OX + 291 * S, OY + 464 * S, 15 * S, 6 * S, 0xea, 0xea, 0xea);
  fillRect(pixels, w, h, OX + 304 * S, OY + 432 * S, 6 * S, 36 * S, 0xea, 0xea, 0xea);
}

// Generate icons
const sizes = [192, 512];
const outDir = new URL('../public/icons/', import.meta.url).pathname;

for (const size of sizes) {
  const png = createPNG(size, size, (p, w, h) => drawIcon(p, w, h, false));
  writeFileSync(`${outDir}icon-${size}.png`, png);
  console.log(`Generated icon-${size}.png`);

  const maskPng = createPNG(size, size, (p, w, h) => drawIcon(p, w, h, true));
  writeFileSync(`${outDir}icon-maskable-${size}.png`, maskPng);
  console.log(`Generated icon-maskable-${size}.png`);
}

console.log('Done!');
