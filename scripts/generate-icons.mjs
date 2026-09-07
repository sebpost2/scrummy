import sharp from "sharp";

const svg = "public/icon.svg";

async function main() {
  await sharp(svg).resize(192, 192).png().toFile("public/icon-192.png");
  await sharp(svg).resize(512, 512).png().toFile("public/icon-512.png");
  await sharp(svg).resize(180, 180).png().toFile("public/apple-touch-icon.png");

  // Maskable icons need ~20% safe-zone padding so OS icon masks
  // (circle, squircle, etc.) don't clip the mark.
  await sharp(svg)
    .resize(410, 410)
    .extend({ top: 51, bottom: 51, left: 51, right: 51, background: "#3559e0" })
    .png()
    .toFile("public/icon-512-maskable.png");
}

main();
