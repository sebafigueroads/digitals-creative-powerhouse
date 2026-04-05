/**
 * render-frames.mjs
 * Renders HapeeDemo frames using Remotion's browser renderer (no ffmpeg needed),
 * then stitches with system ffmpeg.
 *
 * Usage:
 *   node render-frames.mjs           → renders frames to hapee-frames/
 *   STITCH=1 node render-frames.mjs  → renders frames + stitches with /opt/homebrew/bin/ffmpeg
 */
import { bundle } from "@remotion/bundler";
import { renderFrames, getCompositions } from "@remotion/renderer";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR = path.join(__dirname, "hapee-frames");
const OUTPUT_MP4 = path.join(__dirname, "hapee-demo.mp4");
const ENTRY = path.join(__dirname, "src", "index.ts");
const FFMPEG = "/opt/homebrew/bin/ffmpeg";

console.log("📦 Bundling...");
const bundleLocation = await bundle({
  entryPoint: ENTRY,
  webpackOverride: (config) => config,
});

console.log("🎬 Getting compositions...");
const compositions = await getCompositions(bundleLocation);
const comp = compositions.find((c) => c.id === "HapeeDemo");
if (!comp) throw new Error("HapeeDemo composition not found");

console.log(`📐 ${comp.width}x${comp.height} @ ${comp.fps}fps — ${comp.durationInFrames} frames`);

if (!fs.existsSync(FRAMES_DIR)) fs.mkdirSync(FRAMES_DIR, { recursive: true });

console.log("🖼  Rendering frames (no ffmpeg)...");
await renderFrames({
  composition: comp,
  serveUrl: bundleLocation,
  outputDir: FRAMES_DIR,
  imageFormat: "jpeg",
  jpegQuality: 95,
  onFrameUpdate: (frame) => {
    if (frame % 30 === 0) process.stdout.write(`\r  Frame ${frame}/${comp.durationInFrames}`);
  },
});
console.log(`\n✅ Frames saved to: ${FRAMES_DIR}`);

// Stitch with system ffmpeg if requested or available
if (process.env.STITCH === "1" || fs.existsSync(FFMPEG)) {
  if (!fs.existsSync(FFMPEG)) {
    console.error(`❌ ffmpeg not found at ${FFMPEG}. Install with: brew install ffmpeg`);
    process.exit(1);
  }
  console.log(`\n🔗 Stitching with system ffmpeg (${FFMPEG})...`);
  const cmd = [
    FFMPEG, "-y",
    `-framerate ${comp.fps}`,
    `-i "${path.join(FRAMES_DIR, "element-%06d.jpeg")}"`,
    `-c:v libx264`,
    `-pix_fmt yuv420p`,
    `-preset fast`,
    `-crf 18`,
    `"${OUTPUT_MP4}"`,
  ].join(" ");
  console.log("  →", cmd);
  execSync(cmd, { stdio: "inherit" });
  console.log(`\n🎉 Done! → ${OUTPUT_MP4}`);
} else {
  console.log(`\nWhen ffmpeg is installed, run:
  STITCH=1 node render-frames.mjs
Or manually:
  ${FFMPEG} -framerate ${comp.fps} -i "${FRAMES_DIR}/element-%06d.jpeg" -c:v libx264 -pix_fmt yuv420p -crf 18 "${OUTPUT_MP4}"`);
}
