/**
 * Rasterizes the Memory Wallet brand marks into the icon files used by the
 * extension and the website. The SVGs in brand/ are the source of truth.
 *
 * Usage: node scripts/icons.mjs  (or: npm run icons)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRIMARY = readFileSync(join(root, "brand", "mark-primary.svg"));
const OPTICAL = readFileSync(join(root, "brand", "mark-16.svg"));

/** Render one square SVG at an exact pixel size, keeping transparency. */
async function rasterize(svg, size) {
  return sharp(svg)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

/** Extension icon. 16px uses the optical master; larger sizes use the primary. */
export async function renderIcon(size, variant = "primary") {
  return rasterize(variant === "optical" ? OPTICAL : PRIMARY, size);
}

/** Opaque Apple touch icon: primary mark centred on brand navy. */
export async function renderAppleTouch(size = 180) {
  const art = await rasterize(PRIMARY, Math.round(size * 0.72));
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: "#0B1220",
    },
  })
    .composite([{ input: art, gravity: "center" }])
    .png()
    .toBuffer();
}

async function main() {
  mkdirSync(join(root, "src", "assets"), { recursive: true });
  mkdirSync(join(root, "site", "assets"), { recursive: true });

  const jobs = [
    ["src/assets/icon16.png", 16, "optical"],
    ["src/assets/icon32.png", 32, "primary"],
    ["src/assets/icon48.png", 48, "primary"],
    ["src/assets/icon128.png", 128, "primary"],
    ["site/assets/favicon-16.png", 16, "optical"],
    ["site/assets/favicon-32.png", 32, "primary"],
  ];

  for (const [file, size, variant] of jobs) {
    writeFileSync(join(root, file), await renderIcon(size, variant));
    console.log(`${file}  ${size}px  ${variant}`);
  }

  writeFileSync(join(root, "site/assets/apple-touch-icon.png"), await renderAppleTouch(180));
  console.log("site/assets/apple-touch-icon.png  180px  navy");
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/icons.mjs")) {
  await main();
}
