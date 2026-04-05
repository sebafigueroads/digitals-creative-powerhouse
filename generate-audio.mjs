/**
 * generate-audio.mjs
 * Generates voiceover audio for the Hapee demo video using ElevenLabs TTS.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=sk_xxxx node generate-audio.mjs
 *
 * Output:
 *   public/audio/scene-1-hook.mp3
 *   public/audio/scene-2-brand.mp3
 *   public/audio/scene-3-chat.mp3
 *   public/audio/scene-4-crm.mp3
 *   public/audio/scene-5-omni.mp3
 *   public/audio/scene-6-cta.mp3
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "public", "audio");

// ─── ElevenLabs config ───────────────────────────────────────────────────────
const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error("❌ Missing API key. Run with: ELEVENLABS_API_KEY=sk_xxxx node generate-audio.mjs");
  process.exit(1);
}

// Voice: "Lucia" — natural female Spanish voice (great for Spanish content)
// Alternative IDs you can swap in:
//   "EXAVITQu4vr4xnSDxMaL"  → Bella (warm female, EN)
//   "pNInz6obpgDQGcFmaJgB"  → Adam (neutral male, EN)
//   "onwK4e9ZLuTAKqWW03F9"  → Daniel (authoritative male, EN)
//   "XB0fDUnXU5powFXDhCwa"  → Charlotte (upbeat female, EN)
const VOICE_ID = "cgSgspJ2msm6clMCkdW9"; // Jessica — Playful, Bright, Warm (premade, free tier)

const MODEL_ID = "eleven_multilingual_v2"; // Best multilingual model, native Spanish support

// ─── Voice settings ───────────────────────────────────────────────────────────
const VOICE_SETTINGS = {
  stability: 0.45,          // Lower = more expressive/dynamic
  similarity_boost: 0.80,   // Higher = closer to original voice
  style: 0.35,              // Style exaggeration (0–1)
  use_speaker_boost: true,
};

// ─── Scripts per scene ────────────────────────────────────────────────────────
// Timing matches the Remotion composition:
//   Scene 1:  0-3s   (90 frames)   → Hook / problema
//   Scene 2:  3-7s   (120 frames)  → Brand reveal
//   Scene 3:  7-11s  (120 frames)  → Feature IA Chat
//   Scene 4: 11-15s  (120 frames)  → Feature CRM
//   Scene 5: 15-18.5s(105 frames)  → Feature Omnicanal
//   Scene 6: 18.5-21s(75 frames)   → CTA
//
// NARRACIÓN OFICIAL:
//   "¿Estás harto de estos problemas?
//    Hapee — la solución ALL IN ONE que hará que tu negocio funcione
//    como una máquina de ventas 24/7 impulsada con IA.
//    El único problema que tendrás... es un Hapee problem."
//
// Estrategia de timing:
//   Scene 1 → pregunta gancho (cabe en 3s)
//   Scene 2 → presentación Hapee + propuesta de valor (cabe en 4s)
//   Scene 3-5 → silencio / música sola mientras se ven las features
//   Scene 6 → remate "Hapee problem" (cabe en 2.5s)
const SCENES = [
  {
    id: "scene-1-hook",
    // Duración target: ~2.8s — voz rápida, impactante
    text: "¿Estás harto de estos problemas?",
  },
  {
    id: "scene-2-brand",
    // Duración target: ~3.8s — tono seguro, energético
    text: "Japi. La solución all in one que hará que tu negocio funcione como una máquina de ventas, las 24 horas, los 7 días, impulsada con inteligencia artificial.",
  },
  {
    id: "scene-3-chat",
    // Duración target: ~3.5s — feature callout breve
    text: "Responde leads al instante, con agentes de IA que califican y agendan citas automáticamente.",
  },
  {
    id: "scene-4-crm",
    // Duración target: ~3.5s
    text: "Gestiona tu pipeline, cierra ventas y cobra con Stripe. Todo en un solo lugar.",
  },
  {
    id: "scene-5-omni",
    // Duración target: ~3s
    text: "WhatsApp, Instagram, Email, SMS. Un solo inbox. Cero mensajes perdidos.",
  },
  {
    id: "scene-6-cta",
    // Duración target: ~2.5s — remate memorable, pausa antes de "Hapee problem"
    text: "El único problema que tendrás... es un Japi problem.",
  },
];

// ─── TTS function ─────────────────────────────────────────────────────────────
async function generateSpeech(text, outputPath) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: VOICE_SETTINGS,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${err}`);
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

console.log(`🎙  Generating ${SCENES.length} voiceover tracks with ElevenLabs...\n`);
console.log(`   Voice: Charlotte (${VOICE_ID})`);
console.log(`   Model: ${MODEL_ID}\n`);

let successCount = 0;
for (const scene of SCENES) {
  const outPath = path.join(OUTPUT_DIR, `${scene.id}.mp3`);
  try {
    process.stdout.write(`  ⏳ ${scene.id} ...`);
    await generateSpeech(scene.text, outPath);
    const sizeKB = Math.round(fs.statSync(outPath).size / 1024);
    console.log(` ✅ ${sizeKB}KB → public/audio/${scene.id}.mp3`);
    successCount++;
  } catch (err) {
    console.log(` ❌ Failed: ${err.message}`);
  }
  // Small delay to avoid rate limiting
  await new Promise((r) => setTimeout(r, 300));
}

console.log(`\n${successCount}/${SCENES.length} tracks generated.`);
if (successCount === SCENES.length) {
  console.log("🎉 All done! Now run: STITCH=1 node render-frames.mjs");
}
