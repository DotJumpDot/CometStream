/**
 * Regenerates desktop/build/icon.ico from an inline SVG.
 * Run from desktop/: `yarn icon` (needs devDependencies installed).
 *
 * Produces a PNG-compressed multi-size ICO (256/64/48/32/16), which Windows
 * 10/11 and electron-builder both accept. Comet on a dark rounded square:
 * pink->orange head (Monokai Night pink to Dark Soda orange - the fork's two
 * theme accents) with a sweeping tail.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SIZES = [256, 64, 48, 32, 16];

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg">
      <stop offset="0" stop-color="#161616"/>
      <stop offset="1" stop-color="#0f0f0f"/>
    </linearGradient>
    <linearGradient id="comet" gradientTransform="rotate(45)">
      <stop offset="0" stop-color="#fd971f"/>
      <stop offset="1" stop-color="#f92672"/>
    </linearGradient>
    <linearGradient id="tail">
      <stop offset="0" stop-color="#f92672" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#f92672" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="256" height="256" rx="56" fill="url(#bg)"/>

  <!-- comet tail sweeping to the lower left -->
  <path d="M 96 160 L 36 220 Q 60 224 84 208 Q 104 194 112 176 Z" fill="url(#tail)" transform="rotate(180 75 190)"/>
  <path d="M 108 148 L 60 196 Q 74 198 88 188 Q 102 178 110 164 Z"
        fill="#f92672" opacity="0.45"/>

  <!-- comet head -->
  <circle cx="150" cy="106" r="44" fill="url(#comet)"/>
  <circle cx="150" cy="106" r="44" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="4"/>

  <!-- sparkle -->
  <circle cx="196" cy="58" r="7" fill="#e6db74"/>
  <circle cx="214" cy="84" r="4" fill="#66d9ef"/>
</svg>`;

/**
 * Assemble PNG buffers into an ICO container.
 * Layout: 6-byte ICONDIR + one 16-byte ICONDIRENTRY per image + PNG blobs.
 * @param {Buffer[]} pngs - PNG buffers ordered largest-first.
 * @param {number[]} sizes - Matching square dimensions.
 */
function assembleIco(pngs, sizes) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  const entries = Buffer.alloc(pngs.length * 16);
  let offset = header.length + entries.length;
  pngs.forEach((png, index) => {
    const base = index * 16;
    const size = sizes[index];
    entries.writeUInt8(size >= 256 ? 0 : size, base + 0); // width
    entries.writeUInt8(size >= 256 ? 0 : size, base + 1); // height
    entries.writeUInt8(0, base + 2); // palette
    entries.writeUInt8(0, base + 3); // reserved
    entries.writeUInt16LE(1, base + 4); // color planes
    entries.writeUInt16LE(32, base + 6); // bits per pixel
    entries.writeUInt32LE(png.length, base + 8); // image size
    entries.writeUInt32LE(offset, base + 12); // image offset
    offset += png.length;
  });

  return Buffer.concat([header, entries, ...pngs]);
}

const outDir = path.resolve(process.cwd(), "build");
fs.mkdirSync(outDir, { recursive: true });

const pngs = [];
for (const size of SIZES) {
  pngs.push(await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer());
}

fs.writeFileSync(path.join(outDir, "icon.ico"), assembleIco(pngs, SIZES));
console.log(`Wrote build/icon.ico (${SIZES.join("/")} px)`);
