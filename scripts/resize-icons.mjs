/**
 * PWAアイコンを manifest.json で指定したサイズにリサイズするスクリプト
 * 実行: npm run resize-icons
 *
 * 方法1: sharp を使う（推奨）
 *   npm install
 *   npm run resize-icons
 *
 * 方法2: ImageMagick がインストール済みの場合
 *   magick icon-512x512.png -resize 192x192 icon-192x192.png
 *   magick icon-512x512.png -resize 512x512 icon-512x512.png
 *   (public/icons/ で実行)
 */
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicIconsDir = path.join(__dirname, "..", "public", "icons");
const sourcePath = path.join(publicIconsDir, "icon-512x512.png");

async function resizeWithSharp() {
  const sharp = (await import("sharp")).default;
  const metadata = await sharp(sourcePath).metadata();
  console.log(`Source image: ${metadata.width}x${metadata.height}`);

  await sharp(sourcePath).resize(192, 192).png().toFile(path.join(publicIconsDir, "icon-192x192.png"));
  console.log("Created icon-192x192.png (192x192px)");

  await sharp(sourcePath).resize(512, 512).png().toFile(path.join(publicIconsDir, "icon-512x512.png"));
  console.log("Created icon-512x512.png (512x512px)");
}

function resizeWithImageMagick() {
  const dir = publicIconsDir.replace(/\\/g, "/");
  try {
    execSync(`magick "${sourcePath}" -resize 192x192 "${path.join(publicIconsDir, "icon-192x192.png")}"`, {
      stdio: "inherit",
    });
    console.log("Created icon-192x192.png (192x192px)");
    execSync(`magick "${sourcePath}" -resize 512x512 "${path.join(publicIconsDir, "icon-512x512.png")}"`, {
      stdio: "inherit",
    });
    console.log("Created icon-512x512.png (512x512px)");
    return true;
  } catch {
    try {
      execSync(`convert "${sourcePath}" -resize 192x192 "${path.join(publicIconsDir, "icon-192x192.png")}"`, {
        stdio: "inherit",
      });
      execSync(`convert "${sourcePath}" -resize 512x512 "${path.join(publicIconsDir, "icon-512x512.png")}"`, {
        stdio: "inherit",
      });
      return true;
    } catch {
      return false;
    }
  }
}

async function main() {
  if (!fs.existsSync(sourcePath)) {
    console.error("Source icon not found:", sourcePath);
    process.exit(1);
  }

  try {
    await resizeWithSharp();
    console.log("Done (sharp).");
  } catch (err) {
    if (err.code === "ERR_MODULE_NOT_FOUND" || err.message?.includes("sharp")) {
      console.log("sharp not installed. Trying ImageMagick...");
      if (resizeWithImageMagick()) {
        console.log("Done (ImageMagick).");
      } else {
        console.error("");
        console.error("Please install sharp and run again:");
        console.error("  npm install");
        console.error("  npm run resize-icons");
        console.error("");
        console.error("Or install ImageMagick and run this script again.");
        process.exit(1);
      }
    } else {
      throw err;
    }
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
