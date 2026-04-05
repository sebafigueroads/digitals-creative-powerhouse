#!/usr/bin/env node
/**
 * create-client-video.mjs
 * Multi-Client Video Engine — interactive CLI for the Digitals team.
 *
 * Usage:
 *   npm run create-client-video
 *   ELEVENLABS_API_KEY=sk_xxx npm run create-client-video
 *
 * Or non-interactively (reads current-project.json):
 *   npm run create-client-video -- --auto
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENTS_DIR    = path.join(__dirname, "clients");
const PRONMAP_FILE   = path.join(__dirname, "pronunciation-map.json");
const PROJECT_FILE   = path.join(__dirname, "current-project.json");
const PUBLIC_DIR     = path.join(__dirname, "public");
const FRAMES_DIR     = path.join(__dirname, "hapee-frames");
const FFMPEG         = "/opt/homebrew/bin/ffmpeg";
const API_KEY        = process.env.ELEVENLABS_API_KEY;
const AUTO_MODE      = process.argv.includes("--auto");

// ─── Colors for terminal output ──────────────────────────────────────────────
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m",
  red: "\x1b[31m", magenta: "\x1b[35m", white: "\x1b[37m",
};
const log  = (msg)       => console.log(`${C.cyan}▶${C.reset} ${msg}`);
const ok   = (msg)       => console.log(`${C.green}✅${C.reset} ${msg}`);
const warn = (msg)       => console.log(`${C.yellow}⚠️ ${C.reset} ${msg}`);
const err  = (msg)       => console.log(`${C.red}❌${C.reset} ${msg}`);
const head = (msg)       => console.log(`\n${C.bold}${C.magenta}${msg}${C.reset}\n`);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function ask(rl, question) {
  return new Promise((resolve) => rl.question(`${C.cyan}?${C.reset} ${question} `, resolve));
}

function applyPronunciationMap(script) {
  const map = JSON.parse(fs.readFileSync(PRONMAP_FILE, "utf8"));
  let result = script;
  for (const [brand, phonetic] of Object.entries(map.brands)) {
    // Replace all occurrences, case-sensitive (map covers all cases)
    result = result.split(brand).join(phonetic);
  }
  return result;
}

function getAvailableClients() {
  return fs.readdirSync(CLIENTS_DIR)
    .filter(d => !d.startsWith("_") && fs.existsSync(path.join(CLIENTS_DIR, d, "brand-identity.json")));
}

async function generateNarration(script, voiceId = "cgSgspJ2msm6clMCkdW9") {
  const phonetic = applyPronunciationMap(script);
  log(`Sending to ElevenLabs (${phonetic.length} chars)...`);

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text: phonetic,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.40, similarity_boost: 0.80, style: 0.55, use_speaker_boost: true },
    }),
  });
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${await response.text()}`);

  const outPath = path.join(PUBLIC_DIR, "audio", "narration.mp3");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(await response.arrayBuffer()));
  const kb = Math.round(fs.statSync(outPath).size / 1024);
  ok(`Narration generated → public/audio/narration.mp3 (${kb}KB)`);
  return outPath;
}

async function generateSfx() {
  log("Generating CTA tech SFX...");
  const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: { "xi-api-key": API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text: "futuristic tech interface deployment whoosh, digital startup chime, premium UI reveal sound, clean electronic swoosh with subtle high-frequency sparkle",
      duration_seconds: 3,
      prompt_influence: 0.6,
    }),
  });
  if (!response.ok) throw new Error(`ElevenLabs SFX ${response.status}: ${await response.text()}`);

  const outPath = path.join(PUBLIC_DIR, "audio", "sfx-cta.mp3");
  fs.writeFileSync(outPath, Buffer.from(await response.arrayBuffer()));
  ok(`SFX generated → public/audio/sfx-cta.mp3`);
}

async function generateBgm(mood) {
  const prompts = {
    Corporate:  "professional corporate background music, clean piano and subtle strings, business presentation, no vocals",
    Hype:       "high energy hype trap beat, powerful bass, aggressive electronic, no vocals, 20 seconds",
    Cinematic:  "upbeat cinematic tech demo background music, energetic electronic beats, inspiring corporate, driving rhythm, modern SaaS product launch, no vocals",
    Chill:      "relaxed lofi chill background music, soft beats, calm corporate, no vocals",
    Dramatic:   "dramatic orchestral cinematic music, powerful builds, emotional, no vocals",
    Upbeat:     "upbeat happy corporate background music, cheerful acoustic guitar, optimistic, no vocals",
  };
  const prompt = prompts[mood] ?? prompts.Cinematic;
  log(`Generating BGM (${mood})...`);
  const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: { "xi-api-key": API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: prompt, duration_seconds: 22, prompt_influence: 0.5 }),
  });
  if (!response.ok) throw new Error(`ElevenLabs BGM ${response.status}: ${await response.text()}`);

  const outPath = path.join(PUBLIC_DIR, "background-music.mp3");
  fs.writeFileSync(outPath, Buffer.from(await response.arrayBuffer()));
  ok(`BGM generated → public/background-music.mp3`);
}

function copyLogoToPublic(clientId) {
  const src  = path.join(CLIENTS_DIR, clientId, "logo.png");
  const dest = path.join(PUBLIC_DIR, `clients/${clientId}/logo.png`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  ok(`Logo copied → public/clients/${clientId}/logo.png`);
}

function renderFrames(clientId) {
  log("Rendering video frames (Remotion)...");
  // Re-use existing frames if already rendered — saves time for audio-only updates
  if (fs.existsSync(FRAMES_DIR) && fs.readdirSync(FRAMES_DIR).length >= 630) {
    warn("Frames already exist (630 frames). Skipping re-render. Delete hapee-frames/ to force re-render.");
    return;
  }
  execSync(`node render-frames.mjs`, { cwd: __dirname, stdio: "inherit" });
}

function stitchVideo(outputFilename) {
  log("Stitching video with ffmpeg...");
  const AUDIO = path.join(PUBLIC_DIR, "audio");
  const BGM   = path.join(PUBLIC_DIR, "background-music.mp3");
  const SFX   = path.join(AUDIO, "sfx-cta.mp3");
  const OUT   = path.join(__dirname, outputFilename);

  const hasBgm = fs.existsSync(BGM);
  const hasSfx = fs.existsSync(SFX);

  let filterComplex, inputs;

  if (hasBgm && hasSfx) {
    inputs = `-i "${AUDIO}/narration.mp3" -i "${BGM}" -i "${SFX}"`;
    filterComplex = `[1:a]volume=0.18[bgm];[2:a]adelay=18500|18500,volume=2.5[sfx];[0:a][bgm][sfx]amix=inputs=3:duration=first:normalize=0[aout]`;
  } else if (hasBgm) {
    inputs = `-i "${AUDIO}/narration.mp3" -i "${BGM}"`;
    filterComplex = `[1:a]volume=0.18[bgm];[0:a][bgm]amix=inputs=2:duration=first:normalize=0[aout]`;
  } else {
    inputs = `-i "${AUDIO}/narration.mp3"`;
    filterComplex = `[0:a]volume=1.0[aout]`;
  }

  const cmd = [
    FFMPEG, "-y",
    `-framerate 30 -i "${FRAMES_DIR}/element-%03d.jpeg"`,
    inputs,
    `-filter_complex "${filterComplex}"`,
    `-map 0:v -map "[aout]"`,
    `-c:v libx264 -pix_fmt yuv420p -crf 18 -preset fast`,
    `-c:a aac -b:a 192k -t 21`,
    `"${OUT}"`,
  ].join(" ");

  execSync(cmd, { cwd: __dirname, stdio: "pipe" });
  const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1);
  ok(`Video ready → ${outputFilename} (${mb}MB)`);
  return OUT;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
head("🎬 DIGITALS — Multi-Client Video Engine");

let project;

if (AUTO_MODE) {
  log("Auto mode: reading current-project.json...");
  project = JSON.parse(fs.readFileSync(PROJECT_FILE, "utf8"));
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const clients = getAvailableClients();

  console.log(`${C.dim}Available clients: ${clients.join(", ")}${C.reset}`);
  const clientId = (await ask(rl, "¿Para qué cliente es este video?")).trim().toLowerCase();

  if (!clients.includes(clientId)) {
    err(`Cliente '${clientId}' no encontrado. Crea la carpeta clients/${clientId}/ primero.`);
    rl.close(); process.exit(1);
  }

  console.log(`${C.dim}(Pega el guion y presiona Enter dos veces cuando termines)${C.reset}`);
  const scriptLine = await ask(rl, "Pega el guion aquí:");

  const videoTypes  = ["Ad", "Explainer", "Reel", "Testimonial", "ProductDemo"];
  const musicMoods  = ["Corporate", "Hype", "Cinematic", "Chill", "Dramatic", "Upbeat"];
  console.log(`${C.dim}Tipos: ${videoTypes.join(", ")}${C.reset}`);
  const videoType   = (await ask(rl, "videoType:")).trim() || "Ad";
  console.log(`${C.dim}Moods: ${musicMoods.join(", ")}${C.reset}`);
  const musicMood   = (await ask(rl, "musicMood:")).trim() || "Cinematic";
  const outputFile  = (await ask(rl, `Nombre del archivo de salida [${clientId}-video.mp4]:`)).trim() || `${clientId}-video.mp4`;

  rl.close();
  project = { clientId, script: scriptLine, videoType, musicMood, sfxOnCta: true, outputFilename: outputFile };

  // Save to current-project.json for reference
  fs.writeFileSync(PROJECT_FILE, JSON.stringify(project, null, 2));
  ok("Saved to current-project.json");
}

// ─── Validate client ─────────────────────────────────────────────────────────
const brandFile = path.join(CLIENTS_DIR, project.clientId, "brand-identity.json");
if (!fs.existsSync(brandFile)) {
  err(`No se encontró brand-identity.json para '${project.clientId}'`);
  process.exit(1);
}
const brand = JSON.parse(fs.readFileSync(brandFile, "utf8"));
ok(`Cliente: ${brand.displayName}`);

if (!API_KEY) {
  warn("No ELEVENLABS_API_KEY found. Skipping audio generation.");
  warn("Run with: ELEVENLABS_API_KEY=sk_xxx npm run create-client-video");
} else {
  head("🎙  Generating Audio");
  await generateNarration(project.script);
  await generateBgm(project.musicMood ?? "Cinematic");
  if (project.sfxOnCta !== false) await generateSfx();
}

head("🖼  Preparing Assets");
copyLogoToPublic(project.clientId);

head("🎬 Rendering Video");
renderFrames(project.clientId);
const outputPath = stitchVideo(project.outputFilename ?? `${project.clientId}-video.mp4`);

head("🎉 Done!");
log(`Opening: ${outputPath}`);
execSync(`open "${outputPath}"`);
