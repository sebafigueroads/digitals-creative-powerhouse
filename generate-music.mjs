/**
 * generate-music.mjs
 * Generates background music using ElevenLabs Sound Generation API.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=sk_xxxx node generate-music.mjs
 *
 * Output:
 *   public/background-music.mp3
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error("❌ Missing API key. Run with: ELEVENLABS_API_KEY=sk_xxxx node generate-music.mjs");
  process.exit(1);
}

const OUTPUT = path.join(__dirname, "public", "background-music.mp3");

// ElevenLabs Sound Generation API
// Docs: https://elevenlabs.io/docs/api-reference/sound-generation
const PROMPT = "upbeat cinematic tech demo background music, energetic electronic beats, inspiring corporate, driving rhythm, modern SaaS product launch, no vocals, 20 seconds loop";

const DURATION = 22; // seconds — slightly longer than video so it doesn't cut off

console.log("🎵 Generating background music with ElevenLabs Sound Generation...");
console.log(`   Prompt: "${PROMPT}"`);
console.log(`   Duration: ${DURATION}s\n`);

const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
  method: "POST",
  headers: {
    "xi-api-key": API_KEY,
    "Content-Type": "application/json",
    Accept: "audio/mpeg",
  },
  body: JSON.stringify({
    text: PROMPT,
    duration_seconds: DURATION,
    prompt_influence: 0.5, // 0 = more creative, 1 = strict to prompt
  }),
});

if (!response.ok) {
  const err = await response.text();
  console.error(`❌ ElevenLabs API error ${response.status}:`, err);
  process.exit(1);
}

const buffer = await response.arrayBuffer();
fs.writeFileSync(OUTPUT, Buffer.from(buffer));
const sizeKB = Math.round(fs.statSync(OUTPUT).size / 1024);
console.log(`✅ Background music saved: public/background-music.mp3 (${sizeKB}KB)`);
