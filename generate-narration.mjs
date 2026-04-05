/**
 * generate-narration.mjs
 * Generates ONE continuous voiceover for the full Hapee demo video.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=sk_xxxx node generate-narration.mjs
 *
 * Output:
 *   public/audio/narration.mp3
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, "public", "audio", "narration.mp3");

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error("❌ Run with: ELEVENLABS_API_KEY=sk_xxxx node generate-narration.mjs");
  process.exit(1);
}

// Jessica — Playful, Bright, Warm (premade, free tier)
const VOICE_ID = "cgSgspJ2msm6clMCkdW9";
const MODEL_ID = "eleven_multilingual_v2";

// Full narration script — exactly as the client wants it spoken
// Notes for ElevenLabs pronunciation:
//   "Japi" → ElevenLabs will pronounce this correctly in Spanish context
//   Pauses inserted with commas and "..." for dramatic effect
const SCRIPT = `¿Estás harto de estos problemas?

Happy... la solución ALL IN ONE, que hará que tu negocio funcione como una máquina de ventas, las 24 horas, los 7 días, impulsada con Inteligencia Artificial.

El único problema que tendrás... es un Happy problem.`;

const VOICE_SETTINGS = {
  stability: 0.40,         // más expresivo / dramático
  similarity_boost: 0.80,
  style: 0.55,             // más estilo para el remate "Hapee problem"
  use_speaker_boost: true,
};

console.log("🎙  Generating full narration...");
console.log(`   Voice: Jessica (${VOICE_ID})`);
console.log(`   Model: ${MODEL_ID}\n`);
console.log("   Script:\n  ", SCRIPT.replace(/\n/g, "\n   "), "\n");

const response = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
  {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: SCRIPT,
      model_id: MODEL_ID,
      voice_settings: VOICE_SETTINGS,
    }),
  }
);

if (!response.ok) {
  const err = await response.text();
  console.error(`❌ ElevenLabs error ${response.status}:`, err);
  process.exit(1);
}

if (!fs.existsSync(path.dirname(OUTPUT))) {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
}

const buffer = await response.arrayBuffer();
fs.writeFileSync(OUTPUT, Buffer.from(buffer));
const sizeKB = Math.round(fs.statSync(OUTPUT).size / 1024);
console.log(`✅ Narration saved: public/audio/narration.mp3 (${sizeKB}KB)`);
