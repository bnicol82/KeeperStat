// One-off tool for regenerating public/*.png app icons from the original
// hero photo (not committed to the repo — only its compressed derivative,
// src/assets/welcome-bg.webp, is). Update SOURCE_PHOTO below and re-run
// with `node scripts/generate-icons.cjs` if you need to tweak the crop.
//
// Requires the `sharp` package (not a project dependency — install with
// `npm install --no-save sharp` before running).
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SOURCE_PHOTO = "C:/Users/bnico/Downloads/KeeperStat.png";
const SIZE = 1024;

// Background echoes the app's own original hero gradient
// (radial-gradient(ellipse at 50% 30%, #1c2b12 0%, #050505 65%)), so the
// icon reads as "this app" via its actual brand palette, not just the crest.
const backgroundSvg = `
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="34%" r="75%">
      <stop offset="0%" stop-color="#24391b"/>
      <stop offset="55%" stop-color="#0e1309"/>
      <stop offset="100%" stop-color="#050505"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
</svg>`;

async function extractShield() {
  // Crop coordinates found by hand against the source photo's crest badge.
  const cropBounds = { left: 63, top: 40, width: 180, height: 200 };
  const { data, info } = await sharp(SOURCE_PHOTO)
    .extract(cropBounds)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Chroma-key out the stadium-sky background: sky pixels are blue-dominant
  // (B channel well above R) and not too dark, which the shield's white/
  // green/black palette never satisfies.
  const { width, height, channels } = info;
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    const r = data[o], b = data[o + 2];
    const isSky = b - r > 12 && b > 55;
    if (isSky) data[o + 3] = 0;
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

async function main() {
  const shieldCutout = await extractShield();

  const trimmed = await sharp(shieldCutout).trim({ threshold: 10 }).toBuffer();
  const trimmedMeta = await sharp(trimmed).metadata();

  const targetWidth = Math.round(SIZE * 0.62);
  const targetHeight = Math.round(targetWidth * (trimmedMeta.height / trimmedMeta.width));
  const shield = await sharp(trimmed).resize(targetWidth, targetHeight).toBuffer();

  const background = await sharp(Buffer.from(backgroundSvg)).png().toBuffer();

  const left = Math.round((SIZE - targetWidth) / 2);
  const top = Math.round((SIZE - targetHeight) / 2) - Math.round(SIZE * 0.02);

  // Orange brand-accent ring on top, echoing the app's #FF5C00 accent color.
  const ringSvg = `
    <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ring" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FF8A3D"/>
          <stop offset="100%" stop-color="#E85300"/>
        </linearGradient>
      </defs>
      <rect x="14" y="14" width="${SIZE - 28}" height="${SIZE - 28}" rx="200" fill="none" stroke="url(#ring)" stroke-width="20"/>
    </svg>`;
  const ring = await sharp(Buffer.from(ringSvg)).png().toBuffer();

  const master = await sharp(background)
    .composite([
      { input: shield, left, top },
      { input: ring, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();

  const outDir = path.join(__dirname, "..", "public");
  fs.mkdirSync(outDir, { recursive: true });

  const targets = [
    { name: "icon-512.png", size: 512 },
    { name: "icon-192.png", size: 192 },
    { name: "apple-touch-icon.png", size: 180 },
    { name: "favicon-32.png", size: 32 },
    { name: "favicon-16.png", size: 16 },
  ];

  for (const t of targets) {
    await sharp(master).resize(t.size, t.size).png().toFile(path.join(outDir, t.name));
    console.log(`wrote ${t.name}`);
  }

  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
