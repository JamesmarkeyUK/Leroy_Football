// Generates app icons with no external deps (raw RGBA -> PNG via zlib).
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function makeIcon(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  // grass-green rounded background; maskable keeps art inside safe zone
  const corner = maskable ? size : size * 0.22;
  const ballR = size * (maskable ? 0.30 : 0.34);

  function set(x, y, r, g, b, a = 255) {
    const i = (y * size + x) * 4;
    buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = a;
  }

  // background gradient + rounded corners
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // rounded-rect mask (skip for maskable -> full bleed)
      if (!maskable) {
        const dx = Math.max(corner - x, x - (size - corner), 0);
        const dy = Math.max(corner - y, y - (size - corner), 0);
        if (Math.hypot(dx, dy) > corner) { set(x, y, 0, 0, 0, 0); continue; }
      }
      const t = y / size;
      const r = Math.round(0x1f * (1 - t) + 0x0a * t);
      const g = Math.round(0x8e * (1 - t) + 0x55 * t);
      const b = Math.round(0x40 * (1 - t) + 0x22 * t);
      set(x, y, r, g, b, 255);
    }
  }

  // soccer ball: white circle + black pentagon patches
  const patches = [[0, 0, ballR * 0.34]];
  for (let k = 0; k < 5; k++) {
    const a = k * (Math.PI * 2 / 5) - Math.PI / 2;
    patches.push([Math.cos(a) * ballR * 0.66, Math.sin(a) * ballR * 0.66, ballR * 0.17, a]);
  }
  function inPentagon(px, py, p) {
    const [ox, oy, rad, rot = 0] = p;
    const lx = px - ox, ly = py - oy;
    const ang = Math.atan2(ly, lx) - rot + Math.PI / 2;
    const seg = Math.PI * 2 / 5;
    let a = ((ang % seg) + seg) % seg - seg / 2;
    const apothem = rad * Math.cos(Math.PI / 5);
    return Math.hypot(lx, ly) * Math.cos(a) < apothem;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const lx = x - cx, ly = y - cy;
      const d = Math.hypot(lx, ly);
      if (d <= ballR) {
        // shading: lighter top-left
        const shade = 1 - (d / ballR) * 0.18 - ((lx + ly) / (ballR * 2)) * 0.12;
        let r = 255, g = 255, b = 255;
        for (const p of patches) {
          if (inPentagon(lx, ly, p)) { r = 0x1b; g = 0x23; b = 0x30; break; }
        }
        const sh = Math.max(0.6, Math.min(1, shade));
        set(x, y, Math.round(r * sh), Math.round(g * sh), Math.round(b * sh), 255);
      } else if (d <= ballR + size * 0.012) {
        set(x, y, 0, 0, 0, 60); // soft rim
      }
    }
  }
  return buf;
}

function encodePNG(width, height, rgba) {
  // build raw scanlines with filter byte 0
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const body = Buffer.concat([t, data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const dir = path.join(__dirname, 'icons');
fs.mkdirSync(dir, { recursive: true });
const outs = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
];
for (const [name, size, mask] of outs) {
  const png = encodePNG(size, size, makeIcon(size, mask));
  fs.writeFileSync(path.join(dir, name), png);
  console.log('wrote', name, png.length, 'bytes');
}
