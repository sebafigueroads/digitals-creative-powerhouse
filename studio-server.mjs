/**
 * studio-server.mjs
 * Digitals Creative Powerhouse — Express backend v2
 * http://localhost:4000
 *
 * NEW in v2:
 *   POST /api/brand/scrape          → Extract brand colors/fonts/logo from URL
 *   POST /api/script/generate       → AI-style script + storyboard from prompt
 *   POST /api/assets/upload         → Multi-file upload (10 videos + 15 photos)
 *   POST /api/render                → Full pipeline (format, duration, audioMode)
 *   GET  /api/render/progress/:id   → SSE progress stream
 *   GET  /api/library               → List rendered videos
 *   GET  /api/clients               → List clients
 *   POST /api/clients               → Create client
 *   POST /api/clients/:id/logo      → Upload logo
 *   POST /api/ai-refine             → Brand editor (keyword-based)
 */

import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import crypto from "crypto";
import axios from "axios";
import * as cheerio from "cheerio";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { bundle } from "@remotion/bundler";
import { renderFrames, renderStill, renderMedia, getCompositions } from "@remotion/renderer";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Constants ────────────────────────────────────────────────────────────────
const PORT  = Number(process.env.PORT || 4000);
const HOST  = process.env.HOST || '0.0.0.0';  // 0.0.0.0 for Docker
const FFMPEG = process.env.FFMPEG_PATH || (process.platform === 'darwin' ? '/opt/homebrew/bin/ffmpeg' : '/usr/bin/ffmpeg');
// In Docker/production: set BASE_URL=https://yourdomain.com
// In dev: auto-detects localhost
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Remotion: use system Chromium in Docker (set via PUPPETEER_EXECUTABLE_PATH or CHROME_PATH)
const BROWSER_EXECUTABLE = process.env.PUPPETEER_EXECUTABLE_PATH
  || process.env.CHROME_PATH
  || (process.platform === 'darwin' ? null : '/usr/bin/chromium'); // null = let Remotion auto-detect on Mac
const CLIENTS_DIR = path.join(__dirname, "clients");
const PUBLIC_DIR  = path.join(__dirname, "public");
const RENDERS_DIR = path.join(PUBLIC_DIR, "renders");
const PUB_CLIENTS = path.join(PUBLIC_DIR, "clients");
const ASSETS_DIR  = path.join(PUBLIC_DIR, "assets");
const FRAMES_DIR  = path.join(__dirname, "hapee-frames");
const PRONMAP     = path.join(__dirname, "pronunciation-map.json");

const ELEVENLABS_VOICE_ID = "cgSgspJ2msm6clMCkdW9"; // Jessica
const ELEVENLABS_MODEL    = "eleven_multilingual_v2";

/** Returns the ElevenLabs key: stored server key always takes priority over frontend-provided key */
function resolveElKey(reqKey) {
  const stored = loadApiKeys().ELEVENLABS_API_KEY;
  return stored || reqKey || null;
}

const MUSIC_PROMPTS = {
  Corporate:  "professional corporate background music, clean piano and strings, inspiring, no vocals, 22 seconds",
  Hype:       "high energy hype music, pounding bass, modern trap, energetic, no vocals, 22 seconds",
  Cinematic:  "cinematic orchestral tech demo music, epic strings, powerful, no vocals, 22 seconds",
  Chill:      "chill lo-fi background music, relaxed keys, calm, no vocals, 22 seconds",
  Dramatic:   "dramatic tension music, building orchestral swells, intense, no vocals, 22 seconds",
  Upbeat:     "upbeat pop-electronic music, cheerful, driving beat, positive, no vocals, 22 seconds",
  Lyria:      "modern electronic corporate music, subtle beats, innovative, tech feel, no vocals, 22 seconds",
};

[RENDERS_DIR, PUB_CLIENTS, ASSETS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ─── API Keys store (persisted to disk) ──────────────────────────────────────
const API_KEYS_FILE = path.join(__dirname, ".api-keys.json");

function loadApiKeys() {
  let stored = {};
  try { stored = JSON.parse(fs.readFileSync(API_KEYS_FILE, "utf8")); } catch (_) {}
  // Environment variables take precedence over file (production / Docker)
  return {
    ...stored,
    ...(process.env.OPENAI_API_KEY       && { OPENAI_API_KEY:       process.env.OPENAI_API_KEY }),
    ...(process.env.ELEVENLABS_API_KEY   && { ELEVENLABS_API_KEY:   process.env.ELEVENLABS_API_KEY }),
    ...(process.env.GEMINI_API_KEY       && { GEMINI_API_KEY:       process.env.GEMINI_API_KEY }),
    ...(process.env.KLING_ACCESS_KEY     && { KLING_ACCESS_KEY:     process.env.KLING_ACCESS_KEY }),
    ...(process.env.KLING_SECRET_KEY     && { KLING_SECRET_KEY:     process.env.KLING_SECRET_KEY }),
    ...(process.env.RUNWAY_API_KEY       && { RUNWAY_API_KEY:       process.env.RUNWAY_API_KEY }),
    ...(process.env.STABILITY_API_KEY    && { STABILITY_API_KEY:    process.env.STABILITY_API_KEY }),
    ...(process.env.FAL_API_KEY          && { FAL_API_KEY:          process.env.FAL_API_KEY }),
    ...(process.env.REPLICATE_API_KEY    && { REPLICATE_API_KEY:    process.env.REPLICATE_API_KEY }),
    ...(process.env.PEXELS_API_KEY       && { PEXELS_API_KEY:       process.env.PEXELS_API_KEY }),
    ...(process.env.PIXABAY_API_KEY      && { PIXABAY_API_KEY:      process.env.PIXABAY_API_KEY }),
    ...(process.env.GOOGLE_CLIENT_ID     && { GOOGLE_CLIENT_ID:     process.env.GOOGLE_CLIENT_ID }),
    ...(process.env.GOOGLE_CLIENT_SECRET && { GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET }),
  };
}
function saveApiKeys(keys) {
  fs.writeFileSync(API_KEYS_FILE, JSON.stringify(keys, null, 2));
}

// ─── AI Image Generation Engine ───────────────────────────────────────────────

/**
 * Build an image prompt for a scene based on brand + scene data.
 */
function buildImagePrompt(scene, brand, tone = "Cinematic", style = "photorealistic") {
  const colorHex = brand?.colors?.primary || "#3B82F6";
  const brandName = brand?.displayName || "brand";

  const styleMap = {
    photorealistic: "cinematic photography, professional product shoot, 8k, shallow depth of field",
    illustration:   "modern flat design illustration, clean lines, minimal, professional",
    cinematic:      "cinematic still, movie quality, dramatic lighting, professional color grading",
    abstract:       "abstract digital art, flowing shapes, vibrant colors, modern tech aesthetic",
    corporate:      "professional business photography, bright office, modern workspace, clean",
  };
  const stylePrompt = styleMap[style] || styleMap.photorealistic;

  const toneModifiers = {
    Urgente:     "urgent, high energy, dramatic lighting, bold",
    Inspirador:  "inspiring, warm golden light, uplifting, aspirational",
    Profesional: "professional, clean, modern, trustworthy",
    Divertido:   "colorful, playful, vibrant, cheerful",
    Dramático:   "dramatic, moody, cinematic, high contrast",
  };
  const toneStr = toneModifiers[tone] || "professional, modern";

  let subject = "";
  if (scene.type === "hook") {
    subject = `frustrated business person at desk, problem to solve, urban background`;
  } else if (scene.type === "brand") {
    subject = `${brandName} brand reveal, futuristic tech interface, holographic display, glowing logo`;
  } else if (scene.type === "feature") {
    subject = `modern mobile app interface for ${scene.title || "productivity"}, smartphone display, user interaction`;
  } else if (scene.type === "cta") {
    subject = `success celebration, happy entrepreneur, modern city background, achievement`;
  } else {
    subject = `modern technology, ${brandName}, innovation`;
  }

  return `${subject}, ${toneStr}, ${stylePrompt}, dominant color ${colorHex}, no text, no watermark`;
}

/**
 * Download an image from a URL and save to disk, return local path.
 * Retries up to 3 times with exponential backoff.
 */
async function downloadImage(url, destPath, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, { responseType: "arraybuffer", timeout: 45000 });
      fs.writeFileSync(destPath, Buffer.from(res.data));
      return destPath;
    } catch (e) {
      if (attempt === retries) throw e;
      const delay = attempt * 2000; // 2s, 4s, 6s
      console.log(`  ↩️  Retry ${attempt}/${retries - 1} in ${delay / 1000}s: ${e.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * Generate using Gemini Imagen 3 — uses GEMINI_API_KEY.
 * Returns a local Buffer (PNG).
 */
async function generateWithGeminiImagen(prompt, width, height, apiKey) {
  // Gemini Imagen 3 via REST
  const aspectRatio = width > height ? 'LANDSCAPE' : width < height ? 'PORTRAIT' : 'SQUARE';
  const body = {
    instances: [{ prompt: prompt.substring(0, 2000) }],
    parameters: {
      sampleCount: 1,
      aspectRatio: aspectRatio === 'LANDSCAPE' ? '16:9' : aspectRatio === 'PORTRAIT' ? '9:16' : '1:1',
    },
  };
  const res = await fetch(
    `https://us-central1-aiplatform.googleapis.com/v1/projects/generativelanguage/locations/us-central1/publishers/google/models/imagegeneration@006:predict`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  // Vertex endpoint requires OAuth — fall through to Gemini generativelanguage API
  if (!res.ok) {
    // Use the Gemini Developer API imagen endpoint instead
    const r2 = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: prompt.substring(0, 2000) }],
          parameters: {
            sampleCount: 1,
            aspectRatio: aspectRatio === 'LANDSCAPE' ? '16:9' : aspectRatio === 'PORTRAIT' ? '9:16' : '1:1',
          },
        }),
      }
    );
    if (!r2.ok) throw new Error(`Gemini Imagen ${r2.status}: ${await r2.text()}`);
    const d2 = await r2.json();
    const b64 = d2.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) throw new Error('Gemini Imagen returned no image data');
    return Buffer.from(b64, 'base64');
  }
  const data = await res.json();
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('Gemini Imagen returned no image data');
  return Buffer.from(b64, 'base64');
}

/**
 * Generate using Runway Gen-4 Image (text-to-image).
 * Returns a Buffer (JPEG).
 */
async function generateWithRunwayImage(prompt, width, height, apiKey) {
  const ratioMap = {
    '1920x1080': '16:9',
    '1280x720':  '16:9',
    '768x1365':  '9:16',
    '1080x1920': '9:16',
    '1080x1080': '1:1',
  };
  const key = `${width}x${height}`;
  const ratio = ratioMap[key] || (width > height ? '16:9' : width < height ? '9:16' : '1:1');

  const res = await fetch('https://api.dev.runwayml.com/v1/text_to_image', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify({ model: 'gen4_image', promptText: prompt.substring(0, 1000), ratio }),
  });
  if (!res.ok) throw new Error(`Runway image ${res.status}: ${await res.text()}`);
  const task = await res.json();

  // Poll for completion (up to 2 minutes)
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const poll = await fetch(`https://api.dev.runwayml.com/v1/tasks/${task.id}`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'X-Runway-Version': '2024-11-06' },
    });
    const t = await poll.json();
    if (t.status === 'SUCCEEDED') {
      const imgUrl = t.output?.[0];
      if (!imgUrl) throw new Error('Runway image task succeeded but no output URL');
      const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 30000 });
      return Buffer.from(imgRes.data);
    }
    if (t.status === 'FAILED') throw new Error(`Runway image task failed: ${t.failure || 'unknown'}`);
  }
  throw new Error('Runway image task timed out after 2 minutes');
}

/**
 * Generate using Stability AI (stable-image/generate/core).
 * Requires STABILITY_API_KEY.
 */
async function generateWithStability(prompt, width, height, apiKey) {
  const formData = new FormData();
  formData.append("prompt", prompt);
  formData.append("output_format", "jpeg");
  formData.append("width", String(width));
  formData.append("height", String(height));
  formData.append("style_preset", "photographic");

  const res = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "image/*" },
    body: formData,
  });
  if (!res.ok) throw new Error(`Stability ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Generate using Fal.ai (FLUX fast).
 * Requires FAL_API_KEY.
 */
async function generateWithFal(prompt, width, height, apiKey) {
  const res = await fetch("https://fal.run/fal-ai/flux/schnell", {
    method: "POST",
    headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image_size: { width, height }, num_images: 1, num_inference_steps: 4 }),
  });
  if (!res.ok) throw new Error(`Fal.ai ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const imgUrl = data.images?.[0]?.url;
  if (!imgUrl) throw new Error("Fal.ai returned no image URL");
  return imgUrl; // remote URL
}

/**
 * Generate using OpenAI DALL-E 3 — highest quality images.
 * Requires OPENAI_API_KEY.
 */
async function generateWithOpenAI(prompt, width, height, apiKey) {
  const sizeMap = {
    '1024x1792': width < height, // portrait
    '1792x1024': width > height, // landscape
    '1024x1024': width === height, // square
  };
  const size = width > height ? '1792x1024' : width < height ? '1024x1792' : '1024x1024';
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'dall-e-3', prompt: prompt.substring(0, 1000), n: 1, size, quality: 'standard' }),
  });
  if (!res.ok) throw new Error(`OpenAI DALL-E ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data[0].url; // remote URL, download separately
}

/**
 * Generate using Replicate (SDXL or Flux).
 * Requires REPLICATE_API_KEY.
 */
async function generateWithReplicate(prompt, width, height, apiKey) {
  // Use Flux Schnell for speed
  const createRes = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Prefer: "wait" },
    body: JSON.stringify({ input: { prompt, width, height, num_outputs: 1, output_format: "jpg" } }),
  });
  if (!createRes.ok) throw new Error(`Replicate ${createRes.status}`);
  const pred = await createRes.json();
  if (pred.error) throw new Error(`Replicate error: ${pred.error}`);
  const imgUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  if (!imgUrl) throw new Error("Replicate returned no output");
  return imgUrl;
}

/**
 * Fetch stock photo from Pexels.
 * Requires PEXELS_API_KEY.
 */
async function fetchPexelsPhoto(query, orientation, apiKey) {
  const orient = orientation === "9:16" ? "portrait" : orientation === "16:9" ? "landscape" : "square";
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=${orient}`,
    { headers: { Authorization: apiKey } }
  );
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  const data = await res.json();
  const photo = data.photos?.[Math.floor(Math.random() * Math.min(data.photos.length, 5))];
  if (!photo) throw new Error("No Pexels results");
  return photo.src.large2x || photo.src.large;
}

/**
 * Fetch stock photo from Pixabay.
 * Requires PIXABAY_API_KEY.
 */
async function fetchPixabayPhoto(query, format, apiKey) {
  const orientation = format === "16:9" ? "horizontal" : "vertical";
  const url = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&image_type=photo&orientation=${orientation}&per_page=5&safesearch=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pixabay ${res.status}`);
  const data = await res.json();
  const hit = data.hits?.[Math.floor(Math.random() * Math.min(data.hits.length, 5))];
  if (!hit) throw new Error("No Pixabay results");
  return hit.largeImageURL;
}

/**
 * Main image generation function — tries providers in priority order.
 * Returns a local file path (downloaded to .tmp/{jobId}/scene-{i}.jpg).
 */
async function generateSceneImage({ scene, brand, tone, format, index, jobId, imageStyle = "photorealistic", imageProvider = 'auto' }) {
  const keys = loadApiKeys();
  const prompt = scene.visual_prompt || buildImagePrompt(scene, brand, tone, imageStyle);
  console.log(`  🖼  Scene ${index} [${imageProvider}] prompt: ${prompt.substring(0, 80)}...`);
  const { width, height } = format === "16:9"
    ? { width: 1280, height: 720 }
    : format === "1:1"
      ? { width: 1080, height: 1080 }
      : { width: 768, height: 1365 }; // 9:16

  const destDir = path.join(__dirname, ".tmp", jobId);
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, `scene-${index}.jpg`);

  // Build ordered provider list based on imageProvider preference
  // 'runway' → Runway first; 'gemini' → Gemini first; 'auto' → Gemini > Runway > others
  const allProviders = [];

  const runwayProvider = keys.RUNWAY_API_KEY ? async () => {
    console.log(`  🎨 Scene ${index}: Runway Gen-4 Image`);
    const buf = await generateWithRunwayImage(prompt, width, height, keys.RUNWAY_API_KEY);
    fs.writeFileSync(destPath, buf);
    return destPath;
  } : null;

  const geminiProvider = keys.GEMINI_API_KEY ? async () => {
    console.log(`  🎨 Scene ${index}: Gemini Imagen 3`);
    const buf = await generateWithGeminiImagen(prompt, width, height, keys.GEMINI_API_KEY);
    fs.writeFileSync(destPath, buf);
    return destPath;
  } : null;

  if (imageProvider === 'runway') {
    if (runwayProvider) allProviders.push(runwayProvider);
    if (geminiProvider) allProviders.push(geminiProvider);
  } else if (imageProvider === 'gemini') {
    if (geminiProvider) allProviders.push(geminiProvider);
    if (runwayProvider) allProviders.push(runwayProvider);
  } else {
    // auto: Gemini first (fast/free), Runway second (premium quality)
    if (geminiProvider) allProviders.push(geminiProvider);
    if (runwayProvider) allProviders.push(runwayProvider);
  }

  if (keys.STABILITY_API_KEY) allProviders.push(async () => {
    console.log(`  🎨 Scene ${index}: Stability AI`);
    const buf = await generateWithStability(prompt, width, height, keys.STABILITY_API_KEY);
    fs.writeFileSync(destPath, buf);
    return destPath;
  });

  if (keys.FAL_API_KEY) allProviders.push(async () => {
    console.log(`  🎨 Scene ${index}: Fal.ai`);
    const imgUrl = await generateWithFal(prompt, width, height, keys.FAL_API_KEY);
    await downloadImage(imgUrl, destPath);
    return destPath;
  });

  if (keys.REPLICATE_API_KEY) allProviders.push(async () => {
    console.log(`  🎨 Scene ${index}: Replicate`);
    const imgUrl = await generateWithReplicate(prompt, width, height, keys.REPLICATE_API_KEY);
    await downloadImage(imgUrl, destPath);
    return destPath;
  });

  if (keys.OPENAI_API_KEY) allProviders.push(async () => {
    console.log(`  🎨 Scene ${index}: OpenAI DALL-E 3`);
    const imgUrl = await generateWithOpenAI(prompt, width, height, keys.OPENAI_API_KEY);
    await downloadImage(imgUrl, destPath);
    return destPath;
  });

  const providers = allProviders;

  if (keys.PEXELS_API_KEY) providers.push(async () => {
    console.log(`  🎨 Scene ${index}: Pexels stock`);
    const stockQuery = `${scene.title || brand?.displayName || "business"} ${tone || ""}`.trim();
    const imgUrl = await fetchPexelsPhoto(stockQuery, format, keys.PEXELS_API_KEY);
    await downloadImage(imgUrl, destPath);
    return destPath;
  });

  if (keys.PIXABAY_API_KEY) providers.push(async () => {
    console.log(`  🎨 Scene ${index}: Pixabay stock`);
    const stockQuery = (scene.title || brand?.displayName || "business technology").trim();
    const imgUrl = await fetchPixabayPhoto(stockQuery, format, keys.PIXABAY_API_KEY);
    await downloadImage(imgUrl, destPath);
    return destPath;
  });

  // Try each provider in order, fall through on error
  for (const provider of providers) {
    try {
      return await provider();
    } catch (e) {
      console.warn(`  ⚠️  Provider failed for scene ${index}:`, e.message);
    }
  }

  // If all providers fail, throw explicit error
  if (providers.length === 0) {
    throw new Error("No image provider available. Check API keys: OpenAI, Stability AI, or Fal.ai must be configured.");
  }
  console.warn(`  ⚠️  All image providers failed for scene ${index} — returning null (no image)`);
  return null;
}

/**
 * Generate images for all scenes sequentially.
 * Each image waits for the previous one before starting.
 */
async function generateAllSceneImages({ scenes, brand, tone, format, jobId, imageStyle, imageProvider = 'auto', onProgress }) {
  const results = [];

  for (let i = 0; i < scenes.length; i++) {
    let result = null;
    try {
      result = await generateSceneImage({ scene: scenes[i], brand, tone, format, index: i, jobId, imageStyle, imageProvider });
    } catch (e) {
      console.warn(`  ⚠️  Scene ${i} image failed: ${e.message}`);
    }
    results.push(result);
    if (onProgress) onProgress({ scene: i, total: scenes.length, path: result });
  }

  return results; // array of local file paths (or null)
}

// ─── Video Generation Engine ─────────────────────────────────────────────────

/**
 * Generate a short video clip with Runway ML Gen-3 Alpha Turbo.
 * Returns a URL to the generated mp4 video.
 */
async function generateWithRunway(prompt, imageUrl, format, apiKey) {
  const ratioMap = { '9:16': '768:1344', '16:9': '1344:768', '1:1': '1024:1024' };
  const ratio = ratioMap[format] || '768:1344';

  const body = {
    model: 'gen3a_turbo',
    promptText: prompt.substring(0, 512),
    duration: 5,
    ratio,
  };
  if (imageUrl) body.promptImage = imageUrl;

  const res = await fetch('https://api.dev.runwayml.com/v1/image_to_video', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Runway ${res.status}: ${await res.text()}`);
  const task = await res.json();

  // Poll for completion (up to 3 minutes)
  for (let i = 0; i < 36; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const poll = await fetch(`https://api.dev.runwayml.com/v1/tasks/${task.id}`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'X-Runway-Version': '2024-11-06' },
    });
    const t = await poll.json();
    if (t.status === 'SUCCEEDED') return t.output?.[0] || null;
    if (t.status === 'FAILED') throw new Error(`Runway task failed: ${t.failure || 'unknown'}`);
  }
  throw new Error('Runway task timed out after 3 minutes');
}

/**
 * Generate JWT for Kling native API (HMAC-SHA256).
 */
function buildKlingJWT(accessKey, secretKey) {
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 })).toString('base64url');
  const signature = crypto.createHmac('sha256', secretKey).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

/**
 * Generate video with Kling native API (direct, no Fal.ai intermediary).
 */
async function generateWithKlingNative(prompt, format, accessKey, secretKey) {
  const aspectMap = { '9:16': '9:16', '16:9': '16:9', '1:1': '1:1' };
  const aspect = aspectMap[format] || '9:16';
  const jwt = buildKlingJWT(accessKey, secretKey);

  // Submit task
  const res = await fetch('https://api.klingai.com/v1/videos/text2video', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_name: 'kling-v1-6',
      prompt: prompt.substring(0, 500),
      negative_prompt: 'text overlay, watermark, blurry, distorted',
      cfg_scale: 0.5,
      mode: 'std',
      aspect_ratio: aspect,
      duration: '5',
    }),
  });
  if (!res.ok) throw new Error(`Kling native ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Kling native: ${data.message}`);
  const taskId = data.data?.task_id;
  if (!taskId) throw new Error('Kling: no task_id returned');

  // Poll for completion (up to 3 minutes)
  for (let i = 0; i < 36; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const freshJwt = buildKlingJWT(accessKey, secretKey);
    const poll = await fetch(`https://api.klingai.com/v1/videos/text2video/${taskId}`, {
      headers: { Authorization: `Bearer ${freshJwt}` },
    });
    const t = await poll.json();
    if (t.code !== 0) throw new Error(`Kling poll error: ${t.message}`);
    const status = t.data?.task_status;
    if (status === 'succeed') {
      return t.data?.task_result?.videos?.[0]?.url || null;
    }
    if (status === 'failed') throw new Error(`Kling task failed: ${t.data?.task_status_msg}`);
  }
  throw new Error('Kling native timed out after 3 minutes');
}

/**
 * Generate video with Kling via Fal.ai (fallback if no native keys).
 */
async function generateWithKling(prompt, format, apiKey) {
  const aspectMap = { '9:16': '9:16', '16:9': '16:9', '1:1': '1:1' };
  const aspect = aspectMap[format] || '9:16';

  const res = await fetch('https://fal.run/fal-ai/kling-video/v1.6/standard/text-to-video', {
    method: 'POST',
    headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: prompt.substring(0, 500), aspect_ratio: aspect, duration: '5' }),
  });
  if (!res.ok) throw new Error(`Kling/Fal ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.video?.url) return data.video.url;
  if (data.request_id) {
    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const poll = await fetch(`https://fal.run/fal-ai/kling-video/v1.6/standard/text-to-video/requests/${data.request_id}`, {
        headers: { Authorization: `Key ${apiKey}` },
      });
      const p = await poll.json();
      if (p.status === 'COMPLETED') return p.video?.url;
      if (p.status === 'FAILED') throw new Error(`Kling failed: ${p.error}`);
    }
  }
  throw new Error('Kling timed out');
}

/**
 * Generate video with Luma Dream Machine via Replicate.
 */
async function generateWithLuma(prompt, format, apiKey) {
  const aspectMap = { '9:16': '9:16', '16:9': '16:9', '1:1': '1:1' };
  const res = await fetch('https://api.replicate.com/v1/models/luma/photon-flash/predictions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Prefer: 'wait' },
    body: JSON.stringify({ input: { prompt: prompt.substring(0, 500), aspect_ratio: aspectMap[format] || '9:16', duration: 5 } }),
  });
  if (!res.ok) throw new Error(`Luma/Replicate ${res.status}`);
  const pred = await res.json();
  if (pred.error) throw new Error(`Luma error: ${pred.error}`);
  return Array.isArray(pred.output) ? pred.output[0] : pred.output;
}

/**
 * Generate video with Pika Labs via Replicate.
 */
async function generateWithPika(prompt, format, apiKey) {
  const res = await fetch('https://api.replicate.com/v1/models/pika-labs/pika-1.5/predictions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Prefer: 'wait' },
    body: JSON.stringify({ input: { prompt: prompt.substring(0, 400) } }),
  });
  if (!res.ok) throw new Error(`Pika/Replicate ${res.status}`);
  const pred = await res.json();
  if (pred.error) throw new Error(`Pika error: ${pred.error}`);
  return Array.isArray(pred.output) ? pred.output[0] : pred.output;
}

/**
 * Generate scene video clip — tries providers in order.
 * Returns local path to downloaded mp4, or null.
 */
async function generateSceneVideo({ scene, brand, tone, format, index, jobId, prompt }) {
  const keys = loadApiKeys();
  const videoDir = path.join(__dirname, '.tmp', jobId, 'videos');
  fs.mkdirSync(videoDir, { recursive: true });
  const destPath = path.join(videoDir, `scene-${index}.mp4`);

  const videoPrompt = `${prompt || scene.title}, ${tone} style, professional commercial video, ${brand?.displayName || ''}, cinematic, no text overlays`;

  const providers = [];

  // Kling native API (preferred — direct, no intermediary)
  if (keys.KLING_ACCESS_KEY && keys.KLING_SECRET_KEY) providers.push(async () => {
    console.log(`  🎬 Scene ${index}: Kling Native`);
    const url = await generateWithKlingNative(videoPrompt, format, keys.KLING_ACCESS_KEY, keys.KLING_SECRET_KEY);
    if (!url) throw new Error('No Kling output URL');
    await downloadImage(url, destPath);
    return { path: destPath, provider: 'kling' };
  });

  if (keys.RUNWAY_API_KEY) providers.push(async () => {
    console.log(`  🎬 Scene ${index}: Runway ML`);
    const url = await generateWithRunway(videoPrompt, null, format, keys.RUNWAY_API_KEY);
    if (!url) throw new Error('No Runway output URL');
    await downloadImage(url, destPath);
    return { path: destPath, provider: 'runway' };
  });

  if (keys.FAL_API_KEY) providers.push(async () => {
    console.log(`  🎬 Scene ${index}: Kling (Fal.ai)`);
    const url = await generateWithKling(videoPrompt, format, keys.FAL_API_KEY);
    if (!url) throw new Error('No Kling output URL');
    await downloadImage(url, destPath);
    return { path: destPath, provider: 'kling' };
  });

  if (keys.REPLICATE_API_KEY) providers.push(async () => {
    console.log(`  🎬 Scene ${index}: Luma (Replicate)`);
    const url = await generateWithLuma(videoPrompt, format, keys.REPLICATE_API_KEY);
    if (!url) throw new Error('No Luma output URL');
    await downloadImage(url, destPath);
    return destPath;
  });

  if (!providers.length) return null;

  for (const fn of providers) {
    try {
      const result = await fn();
      // result can be {path, provider} or legacy string path
      return typeof result === 'object' ? result : { path: result, provider: 'unknown' };
    } catch (e) {
      console.warn(`  ⚠️  Video provider failed for scene ${index}:`, e.message);
    }
  }
  return null;
}

// ─── SSE job registry ─────────────────────────────────────────────────────────
const sseJobs = new Map();

function createJob(jobId) {
  sseJobs.set(jobId, { clients: [], events: [], done: false });
}

function emitProgress(jobId, type, data) {
  const job = sseJobs.get(jobId);
  if (!job) return;
  const event = { type, data, ts: Date.now() };
  job.events.push(event);
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  job.clients.forEach(res => { try { res.write(payload); } catch (_) {} });
  if (type === "done" || type === "error") {
    job.done = true;
    setTimeout(() => {
      job.clients.forEach(res => { try { res.end(); } catch (_) {} });
      job.clients = [];
    }, 500);
  }
}

// ─── Gemini Flash Script Generator ──────────────────────────────────────────

/**
 * Generate a modern, disruptive script with Gemini Flash.
 * Returns same shape as generateScript(): { script, scenes, wordCount, problem, benefit, category }
 */
async function generateScriptWithGemini({ prompt, brandName, brandDesc, tone, durationSeconds, rrss, creativity, geminiApiKey, brandFull = null }) {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  // Temperature: creativity 0→0.3, 100→1.4
  const temperature = 0.3 + (creativity / 100) * 1.1;
  // Try models in order: 2.0-flash → 1.5-flash → 1.5-flash-8b
  const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash'];
  let model = null;
  for (const m of GEMINI_MODELS) {
    try {
      model = genAI.getGenerativeModel({ model: m, generationConfig: { temperature, maxOutputTokens: 8192, responseMimeType: 'application/json' } });
      await model.generateContent('ping'); // quick probe
      console.log(`  ✅ Gemini model: ${m}`);
      break;
    } catch (_) { model = null; }
  }
  if (!model) throw new Error('All Gemini models unavailable (quota exhausted)');

  const sceneCount = durationSeconds <= 15 ? 3 : durationSeconds <= 21 ? 4 : durationSeconds <= 30 ? 4 : durationSeconds <= 45 ? 5 : 6;
  const wordsTarget = Math.floor(durationSeconds * 2.4);

  const brandContext = [
    brandDesc ? `Descripción: ${brandDesc}` : '',
    brandFull?.website ? `Sitio web: ${brandFull.website}` : '',
    brandFull?.colors?.primary ? `Color principal: ${brandFull.colors.primary}` : '',
    brandFull?.fonts?.display ? `Tipografía display: ${brandFull.fonts.display}` : '',
    brandFull?.values?.length ? `Valores de marca: ${brandFull.values.join(', ')}` : '',
    brandFull?.targetAudience ? `Audiencia objetivo: ${brandFull.targetAudience}` : '',
    brandFull?.uniqueValue ? `Propuesta de valor: ${brandFull.uniqueValue}` : '',
    `Red social: ${rrss}`,
    `Tono: ${tone}`,
    `Idioma: español latinoamericano`,
  ].filter(Boolean).join('\n');

  const jsonShape = JSON.stringify({
    problem: "problema central del cliente en 1 línea",
    benefit: "beneficio principal en 1 línea",
    category: "water|food|health|realestate|ecommerce|saas|education|general",
    script: "narración completa concatenada",
    scenes: [{
      type: "hook|brand|feature|cta",
      title: "título impactante (max 5 palabras)",
      subtitle: "subtítulo descriptivo",
      badge: "badge corto (opcional)",
      items: ["bullet 1", "bullet 2", "bullet 3"],
      voiceover: "narración exacta del locutor",
      visual_prompt: "english prompt for AI image generation, cinematic, no text",
      sfx_instruction: "sound instruction"
    }]
  }, null, 2);

  const systemPrompt = `Eres un Director Creativo de una agencia de élite global. Tu trabajo es escribir guiones de video que sean disruptivos, memorables y directos al punto. NUNCA uses clichés como "¿Te imaginas?", "¿Y si...?", "Transformamos tu negocio", "Llevamos tu marca al siguiente nivel", "Somos tu aliado estratégico". NUNCA uses estructuras formulaicas como PAS o AIDA. Escribe narrativa moderna, minimalista y con impacto emocional real. Cada palabra debe ganar su lugar en el guion.`;

  const userPrompt = `Escribe un guion de video de ${durationSeconds} segundos para la marca "${brandName}".

Contexto de la marca:
${brandContext}

Instrucciones:
- Guion narrativo, moderno y profesional basado 100% en el contexto real de esta marca
- ${sceneCount} escenas, cada una con título impactante (máx 5 palabras), subtítulo y 3 puntos clave
- Creatividad: ${creativity}/100 — a mayor valor, más atrevido y minimalista el copy
- Responde SOLO con JSON válido, sin markdown, con esta estructura exacta:
${jsonShape}

IMPORTANTE: La escena 1 debe ser type "hook", la última tipo "cta". Las intermedias "brand" y/o "feature".`;

  try {
    const result = await model.generateContent([{ text: systemPrompt }, { text: userPrompt }]);
    let text = result.response.text().trim();
    // Repair truncated JSON: close open arrays/objects if Gemini hit token limit
    if (!text.endsWith('}')) {
      const openBraces = (text.match(/\{/g) || []).length - (text.match(/\}/g) || []).length;
      const openBrackets = (text.match(/\[/g) || []).length - (text.match(/\]/g) || []).length;
      // Close any incomplete string
      if ((text.match(/"/g) || []).length % 2 !== 0) text += '"';
      for (let i = 0; i < openBrackets; i++) text += ']';
      for (let i = 0; i < openBraces; i++) text += '}';
    }
    const parsed = JSON.parse(text);

    // Normalize scenes shape
    const scenes = (parsed.scenes || []).map((s, i) => ({
      type:             s.type || (i === 0 ? 'hook' : i === parsed.scenes.length - 1 ? 'cta' : 'feature'),
      title:            s.title || '',
      subtitle:         s.subtitle || '',
      badge:            s.badge || '',
      items:            s.items || [],
      voiceover:        s.voiceover || '',
      visual_prompt:    s.visual_prompt || '',
      sfx_instruction:  s.sfx_instruction || buildSfxInstruction(s.type || 'hook'),
      painPoints:       s.items?.map(t => ({ emoji: '✓', text: t })) || [],
    }));

    // Trim/pad script to target word count
    let script = parsed.script || scenes.map(s => s.voiceover).join(' ');
    const words = script.split(/\s+/);
    if (words.length > wordsTarget) script = words.slice(0, wordsTarget).join(' ') + '.';

    return {
      script,
      scenes,
      wordCount: script.split(/\s+/).length,
      problem:   parsed.problem || '',
      benefit:   parsed.benefit || '',
      category:  parsed.category || 'general',
      engine:    'gemini',
    };
  } catch (err) {
    console.error('Gemini script error:', err.message);
    throw err;
  }
}

// ─── Script Generation — Gemini-only, no templates ──────────────────────────
// PAS engine removed. All scripts generated by Gemini 2.0 Flash.
// Fallback: if Gemini fails, return error — no clichéd templates.

function generateScript({ prompt, brandName = 'la marca', tone = 'Inspirador', durationSeconds = 21, rrss = 'TikTok', creativity = 50, brandDesc = '' }) {
  // This function is kept as a thin wrapper — real generation always goes through
  // generateScriptWithGemini(). It should never be called directly in production.
  // If called without Gemini key, throw so the caller surfaces the real error.
  throw new Error('Gemini API key required — local script engine has been removed. Configure GEMINI_API_KEY.');
}

// ─── Brand Scraping ───────────────────────────────────────────────────────────

async function scrapeBrand(url) {
  const resp = await axios.get(url, {
    timeout: 12000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    maxRedirects: 5,
  });

  const $ = cheerio.load(resp.data);
  const html = resp.data;

  // ── Colors ────────────────────────────────────────────────────
  const themeColor = $('meta[name="theme-color"]').attr('content');
  const styleText  = $('style').text();

  // Extract CSS custom properties
  const cssVarColors = {};
  const cssVarRe = /--(?:([a-z-]+)):\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/gi;
  let match;
  while ((match = cssVarRe.exec(styleText)) !== null) {
    cssVarColors[match[1]] = match[2];
  }

  const primary = themeColor
    || cssVarColors['primary'] || cssVarColors['brand'] || cssVarColors['accent']
    || cssVarColors['color-primary'] || cssVarColors['primary-color']
    || (() => {
      // Count hex occurrences in full HTML, prefer vibrant ones
      const all = [...html.matchAll(/#([0-9a-fA-F]{6})\b/g)]
        .map(m => '#' + m[1].toUpperCase())
        .filter(c => c !== '#000000' && c !== '#FFFFFF' && c !== '#FEFEFE' && c !== '#F8F8F8');
      const freq = {};
      all.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
      return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];
    })()
    || '#3B82F6';

  const secondary = cssVarColors['secondary'] || cssVarColors['secondary-color']
    || (() => {
      // find second most common color
      const all = [...html.matchAll(/#([0-9a-fA-F]{6})\b/g)]
        .map(m => '#' + m[1].toUpperCase())
        .filter(c => c !== '#000000' && c !== '#FFFFFF' && c !== '#FEFEFE' && c !== primary);
      const freq = {};
      all.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
      return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];
    })()
    || '#6366F1';

  const bgColor = cssVarColors['background'] || cssVarColors['bg'] || cssVarColors['surface']
    || ($('body').css?.('background-color')) || '#FFFFFF';

  // ── Fonts ─────────────────────────────────────────────────────
  let fontName = null;
  let googleFontsUrl = null;
  $('link[href*="fonts.googleapis.com"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!googleFontsUrl) googleFontsUrl = href;
    const fm = href.match(/family=([^&:]+)/);
    if (fm && !fontName) fontName = decodeURIComponent(fm[1]).replace(/\+/g, ' ').split(':')[0].trim();
  });

  // Check @import in style tags
  if (!fontName) {
    const importMatch = styleText.match(/@import\s+url\(['"](https?:\/\/fonts\.googleapis\.com\/css[^'"]+)['"]\)/i);
    if (importMatch) {
      const fm = importMatch[1].match(/family=([^&:]+)/);
      if (fm) fontName = decodeURIComponent(fm[1]).replace(/\+/g, ' ').split(':')[0].trim();
    }
  }

  // ── Logo ──────────────────────────────────────────────────────
  const logoSelectors = [
    'img[class*="logo"i]',
    'img[alt*="logo"i]',
    'a[class*="logo"i] img',
    'a[href="/"] img',
    'header img',
    'nav img',
    '.navbar img',
    '#header img',
  ];
  let logoSrc = null;
  for (const sel of logoSelectors) {
    const src = $(sel).first().attr('src') || $(sel).first().attr('data-src');
    if (src && !src.includes('banner') && !src.includes('hero') && !src.includes('bg')) {
      logoSrc = src;
      break;
    }
  }

  // Make logo URL absolute
  if (logoSrc && !logoSrc.startsWith('http')) {
    try { logoSrc = new URL(logoSrc, url).href; } catch (_) {}
  }

  // ── Name & Description ───────────────────────────────────────
  const ogTitle   = $('meta[property="og:title"]').attr('content');
  const title     = $('title').text().trim().split(/[-|·–—]/)[0].trim();
  const displayName = (ogTitle || title || new URL(url).hostname.replace('www.', '')).substring(0, 40);

  const description = ($('meta[name="description"]').attr('content')
    || $('meta[property="og:description"]').attr('content')
    || '').substring(0, 200);

  const ogImage = $('meta[property="og:image"]').attr('content');

  return {
    displayName,
    description,
    website: url,
    colors: {
      primary,
      secondary,
      background: bgColor,
      bgAlt:   '#F5F5F5',
      bgSoft:  '#FAFAFA',
      heading: '#111111',
      body:    '#444444',
      muted:   '#888888',
      card:    '#FFFFFF',
      border:  'rgba(0,0,0,0.1)',
    },
    fonts: {
      display: fontName ? `'${fontName}', Impact, sans-serif` : 'Impact, sans-serif',
      body:    fontName ? `'${fontName}', system-ui, sans-serif` : 'system-ui, sans-serif',
    },
    googleFonts:  googleFontsUrl || '',
    gradient: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`,
    logoUrl:  logoSrc || null,
    ogImage:  ogImage || null,
  };
}

// ─── Audio helpers ────────────────────────────────────────────────────────────

function applyPronunciation(script) {
  let out = script;
  try {
    const map = JSON.parse(fs.readFileSync(PRONMAP, 'utf8'));
    for (const [orig, phon] of Object.entries(map.brands || {})) {
      out = out.split(orig).join(phon);
    }
  } catch (_) {}
  return out;
}

async function ttsNarration(script, apiKey) {
  const text = applyPronunciation(script);
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL,
      voice_settings: { stability: 0.40, similarity_boost: 0.80, style: 0.55, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

async function generateSound(prompt, durationSec, apiKey) {
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: prompt, duration_seconds: durationSec, prompt_influence: 0.5 }),
  });
  if (!res.ok) throw new Error(`ElevenLabs Sound ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

// ─── Video stitch ─────────────────────────────────────────────────────────────

async function stitchVideo({ outputPath, durationSec, audioMode, narrationPath, bgmPath, sfxPath, framesDir, digits = 3 }) {
  const dur        = durationSec || 21;
  const framesPath = framesDir || FRAMES_DIR;
  const frameGlob  = path.join(framesPath, `element-%0${digits}d.jpeg`);

  const inputs = ['-y', '-framerate', '30', '-i', frameGlob];

  // Audio inputs per mode
  const audioInputs = [];
  if (audioMode !== 'music' && narrationPath && fs.existsSync(narrationPath)) {
    audioInputs.push({ path: narrationPath, role: 'narration' });
  }
  if (audioMode !== 'narration' && bgmPath && fs.existsSync(bgmPath)) {
    audioInputs.push({ path: bgmPath, role: 'bgm' });
  }
  if (sfxPath && fs.existsSync(sfxPath)) {
    audioInputs.push({ path: sfxPath, role: 'sfx' });
  }

  audioInputs.forEach(a => inputs.push('-i', a.path));

  // Build filter_complex
  let filterComplex, mapAudio;
  const n = audioInputs.length;
  const roles = audioInputs.map(a => a.role);

  if (n === 0) {
    // Silent
    filterComplex = 'aevalsrc=0:c=stereo:s=44100:d=' + dur + '[aout]';
    mapAudio = '[aout]';
  } else if (n === 1) {
    const vol = roles[0] === 'bgm' ? '0.25' : '1.0';
    filterComplex = `[1:a]volume=${vol}[aout]`;
    mapAudio = '[aout]';
  } else {
    // Build per-track labels
    const parts = audioInputs.map((a, i) => {
      const idx = i + 1;
      if (a.role === 'narration') return `[${idx}:a]volume=1.0[t${i}]`;
      if (a.role === 'bgm')       return `[${idx}:a]volume=0.22[t${i}]`;
      if (a.role === 'sfx')       return `[${idx}:a]adelay=18500|18500,volume=2.5[t${i}]`;
      return `[${idx}:a]volume=0.5[t${i}]`;
    });
    const labels = audioInputs.map((_, i) => `[t${i}]`).join('');
    filterComplex = parts.join(';') + `;${labels}amix=inputs=${n}:duration=first[aout]`;
    mapAudio = '[aout]';
  }

  const args = [
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '0:v',
    '-map', mapAudio,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', '18',
    '-preset', 'fast',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-t', String(dur),
    outputPath,
  ];

  await execFileAsync(FFMPEG, args, { timeout: 600000 }); // 10 min timeout for production
  return outputPath;
}

// ─── Remotion bundle cache ────────────────────────────────────────────────────
// Bundle is expensive (~30s first time); cache URL + compositions in-memory.
let _bundleUrl = null;
let _compositions = null;

async function getBundle() {
  if (_bundleUrl) return _bundleUrl;
  const entryPoint = path.join(__dirname, "src", "index.ts");
  console.log("📦 Bundling Remotion project (first render — cached after)...");
  // publicDir makes Remotion serve public/ files so staticFile('clients/x/logo.png') resolves correctly
  _bundleUrl = await bundle({
    entryPoint,
    publicDir: PUBLIC_DIR,
    webpackOverride: (c) => c,
  });
  console.log("✅ Bundle ready:", _bundleUrl);
  return _bundleUrl;
}

async function getCachedCompositions(serveUrl) {
  if (_compositions) return _compositions;
  _compositions = await getCompositions(serveUrl);
  return _compositions;
}



/**
 * Resolve format string to pixel dimensions.
 */
function formatDimensions(format) {
  if (format === "16:9") return { width: 1920, height: 1080 };
  if (format === "1:1")  return { width: 1080, height: 1080 };
  return { width: 1080, height: 1920 }; // 9:16 default
}

/**
 * Render frames for a job using Remotion.
 * Returns { framesDir, digitPad } so stitch knows the frame glob pattern.
 */
async function renderVideoFrames({
  jobId, brand, scenes, format, durationSeconds, transition,
  sceneImageUrls = [],
  onProgress,
}) {
  const serveUrl = await getBundle();

  // Find the base ClientVideo composition — always fetch via getCachedCompositions
  // so _compositions is never null on first render (pre-warm only builds the bundle)
  const allComps = await getCachedCompositions(serveUrl);
  const comp = allComps.find(c => c.id === "ClientVideo");
  if (!comp) {
    const ids = allComps.map(c => c.id).join(', ');
    throw new Error(`ClientVideo composition not found in bundle. Available: [${ids}]`);
  }

  const { width, height } = formatDimensions(format);
  const fps            = 30;
  const durationFrames = Math.round(Number(durationSeconds) * fps);

  // The actual props we want the component to receive
  const componentProps = {
    brand,
    scenes,
    hasVoiceover:    false,
    hasBgm:          false,
    hasSfxCta:       false,
    format,
    durationSeconds: Number(durationSeconds),
    transition:      transition || "zoom-in",
    sceneImageUrls,
  };

  console.log(`🎬 Rendering ${jobId} — brand="${brand.displayName}" scenes=${scenes.length} format=${format} dur=${durationSeconds}s images=${sceneImageUrls.filter(Boolean).length}`);

  // CRITICAL: Override the composition's defaultProps (which contain hapee defaults) with our
  // actual data. Remotion merges defaultProps + inputProps, but overriding here ensures
  // our data is used regardless of how Remotion handles the merge.
  const overriddenComp = {
    ...comp,
    width,
    height,
    durationInFrames: durationFrames,
    fps,
    defaultProps: componentProps, // base defaults
    props: componentProps,        // ← CRITICAL: Remotion 4.x uses composition.props as resolved props
  };

  const framesDir = path.join(__dirname, ".tmp", jobId, "frames");
  fs.mkdirSync(framesDir, { recursive: true });

  await renderFrames({
    composition: overriddenComp,
    serveUrl,
    outputDir: framesDir,
    imageFormat: "jpeg",
    jpegQuality: 90,
    inputProps: componentProps,
    chromiumOptions: { headless: true, disableWebSecurity: true },
    chromiumOptions: { headless: true, disableWebSecurity: true }, ...(BROWSER_EXECUTABLE ? { browserExecutable: BROWSER_EXECUTABLE } : {}),
    onFrameUpdate: (frame) => {
      if (frame % 10 === 0 && onProgress) {
        const pct = Math.round(60 + (frame / durationFrames) * 28);
        onProgress({ label: `🖼 Frame ${frame}/${durationFrames} — ${Math.round(frame/durationFrames*100)}%`, percent: Math.min(pct, 88) });
      }
    },
  });

  // Detect actual digit padding from first frame filename
  const firstFrame = fs.readdirSync(framesDir)
    .filter(f => f.startsWith("element-") && f.endsWith(".jpeg"))
    .sort()[0];

  if (!firstFrame) throw new Error("No frames were rendered. Check Remotion composition.");

  const digits = firstFrame.match(/element-(\d+)\.jpeg/)?.[1]?.length ?? 3;
  return { framesDir, digits };
}

// ─── Express setup ────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(PUBLIC_DIR));
app.use(express.static(path.join(__dirname, 'studio-frontend')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'studio-frontend', 'index.html')));

// ── Brand scraping ────────────────────────────────────────────────────────────
app.post('/api/brand/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: 'url required' });

  try {
    const brand = await scrapeBrand(url);
    res.json({ success: true, brand });
  } catch (err) {
    console.error('Scrape error:', err.message);
    res.status(500).json({ success: false, error: `No se pudo scrapear: ${err.message}` });
  }
});

// ── Script generation ─────────────────────────────────────────────────────────
app.post('/api/script/generate', async (req, res) => {
  const { prompt, brandName: rawBrandName, clientId, tone, durationSeconds, rrss, creativity = 50 } = req.body;
  if (!prompt) return res.status(400).json({ success: false, error: 'prompt required' });

  // Resolve brand name + description from clientId
  let brandName = rawBrandName;
  let brandDesc = '';
  let brand = null;
  if (clientId) {
    try {
      const bf = path.join(CLIENTS_DIR, clientId, 'brand-identity.json');
      brand = JSON.parse(fs.readFileSync(bf, 'utf8'));
      if (!brandName) brandName = brand.displayName || clientId;
      brandDesc = [brand.description, brand.website ? `Sitio web: ${brand.website}` : ''].filter(Boolean).join('. ');
    } catch (_) { if (!brandName) brandName = clientId; }
  }

  const keys = loadApiKeys();

  try {
    let result;
    if (keys.GEMINI_API_KEY) {
      // Gemini Flash — premium AI copywriter
      console.log(`✨ Gemini script: "${brandName}" creativity=${creativity}`);
      result = await generateScriptWithGemini({
        prompt,
        brandName: brandName || 'la marca',
        brandDesc,
        brandFull: brand,
        tone: tone || 'Inspirador',
        durationSeconds: Number(durationSeconds) || 21,
        rrss: rrss || 'TikTok',
        creativity: Number(creativity),
        geminiApiKey: keys.GEMINI_API_KEY,
      });
    } else {
      return res.status(400).json({ success: false, error: 'GEMINI_API_KEY no configurada. Agrégala en Environment Variables.' });
    }
    res.json({ success: true, ...result, engine: 'gemini' });
  } catch (err) {
    console.error('Script generate error:', err.message);
    res.status(500).json({ success: false, error: `Gemini error: ${err.message}` });
  }
});

// ── TTS Preview — instant ElevenLabs preview for edited script ───────────────
app.post('/api/tts-preview', async (req, res) => {
  const { script, apiKey: reqKey } = req.body;
  if (!script) return res.status(400).json({ success: false, error: 'script required' });
  const apiKey = resolveElKey(reqKey);
  if (!apiKey) return res.status(400).json({ success: false, error: 'ElevenLabs API key not configured' });

  try {
    const audioBuffer = await ttsNarration(script, apiKey);
    const tmpFile = path.join(PUBLIC_DIR, 'renders', `tts-preview-${Date.now()}.mp3`);
    fs.writeFileSync(tmpFile, audioBuffer);
    res.json({ success: true, url: '/renders/' + path.basename(tmpFile) });
    // Auto-delete after 5 minutes
    setTimeout(() => { try { fs.unlinkSync(tmpFile); } catch (_) {} }, 300000);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Assets upload (up to 25 files) ───────────────────────────────────────────
app.post('/api/assets/upload', upload.array('files', 25), (req, res) => {
  const { clientId } = req.body;
  const dir = clientId
    ? path.join(ASSETS_DIR, clientId)
    : path.join(ASSETS_DIR, 'uploads');
  fs.mkdirSync(dir, { recursive: true });

  const saved = (req.files || []).map(file => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const dest = path.join(dir, safe);
    fs.writeFileSync(dest, file.buffer);
    const relative = '/assets/' + (clientId ? `${clientId}/` : 'uploads/') + safe;
    return { originalName: file.originalname, url: relative, size: file.size, ext };
  });

  res.json({ success: true, files: saved });
});

// ── Clients ───────────────────────────────────────────────────────────────────
app.get('/api/clients', (req, res) => {
  try {
    const clients = fs.readdirSync(CLIENTS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('_'))
      .map(e => {
        let brand = null;
        try { brand = JSON.parse(fs.readFileSync(path.join(CLIENTS_DIR, e.name, 'brand-identity.json'), 'utf8')); } catch (_) {}
        const logoExists = fs.existsSync(path.join(PUB_CLIENTS, e.name, 'logo.png'));
        return {
          clientId: e.name,
          displayName: brand?.displayName || e.name,
          primaryColor: brand?.colors?.primary || '#000',
          logoUrl: logoExists ? `/clients/${e.name}/logo.png` : null,
          website: brand?.website || '',
        };
      });
    res.json({ success: true, clients });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/clients/:id', (req, res) => {
  const bp = path.join(CLIENTS_DIR, req.params.id, 'brand-identity.json');
  if (!fs.existsSync(bp)) return res.status(404).json({ success: false, error: 'Not found' });
  try {
    res.json({ success: true, brand: JSON.parse(fs.readFileSync(bp, 'utf8')) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/clients', (req, res) => {
  const { clientId, displayName, colors, fonts, website, description } = req.body;
  if (!clientId || !displayName) return res.status(400).json({ success: false, error: 'clientId and displayName required' });

  const safeId   = clientId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const clientDir = path.join(CLIENTS_DIR, safeId);
  if (fs.existsSync(clientDir)) return res.status(409).json({ success: false, error: 'Already exists' });

  const primary   = colors?.primary   || '#000000';
  const secondary = colors?.secondary || '#444444';
  const brand = {
    clientId: safeId, displayName, website: website || '', description: description || '',
    colors: {
      primary, secondary,
      background: colors?.background || '#FFFFFF',
      bgAlt: '#F5F5F5', bgSoft: '#FAFAFA',
      heading: '#111111', body: '#444444', muted: '#888888', card: '#FFFFFF', border: 'rgba(0,0,0,0.1)',
    },
    fonts: { display: fonts?.display || 'Impact, sans-serif', body: fonts?.body || 'system-ui, sans-serif' },
    googleFonts: '',
    gradient: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`,
  };

  fs.mkdirSync(clientDir, { recursive: true });
  fs.writeFileSync(path.join(clientDir, 'brand-identity.json'), JSON.stringify(brand, null, 2));
  fs.mkdirSync(path.join(PUB_CLIENTS, safeId), { recursive: true });
  res.json({ success: true, brand });
});

app.post('/api/clients/:id/upload-logo', upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file' });
  const dir = path.join(CLIENTS_DIR, req.params.id);
  if (!fs.existsSync(dir)) return res.status(404).json({ success: false, error: 'Client not found' });
  const pubDir = path.join(PUB_CLIENTS, req.params.id);
  fs.mkdirSync(pubDir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'logo.png'), req.file.buffer);
  fs.writeFileSync(path.join(pubDir, 'logo.png'), req.file.buffer);
  res.json({ success: true, logoUrl: `/clients/${req.params.id}/logo.png` });
});

// ── Main render pipeline ──────────────────────────────────────────────────────
app.post('/api/render', async (req, res) => {
  const {
    clientId, script, musicMood, sfxOnCta, apiKey,
    format = '9:16', durationSeconds = 21, audioMode = 'both',
    transition = 'zoom-in', scenes: scenesFromClient = null,
  } = req.body;

  if (!clientId || !script) return res.status(400).json({ success: false, error: 'clientId and script required' });
  const elKey = resolveElKey(apiKey);
  if (!elKey && audioMode !== 'music' && audioMode !== 'none') return res.status(400).json({ success: false, error: 'ElevenLabs API key required for narration' });

  const jobId = `${clientId}-${Date.now()}`;
  createJob(jobId);
  res.json({ success: true, jobId, message: 'Render started' });

  (async () => {
    try {
      const tmpDir = path.join(__dirname, '.tmp', jobId);
      fs.mkdirSync(tmpDir, { recursive: true });

      // Validate client
      const brandFile = path.join(CLIENTS_DIR, clientId, 'brand-identity.json');
      if (!fs.existsSync(brandFile)) throw new Error(`Client '${clientId}' not found`);

      // Step 1: Narration
      let narrationPath = null;
      if (audioMode !== 'music' && elKey) {
        emitProgress(jobId, 'progress', { step: 1, total: 5, label: '🎙 Generando narración con ElevenLabs...', percent: 5 });
        const buf = await ttsNarration(script, elKey);
        narrationPath = path.join(tmpDir, 'narration.mp3');
        fs.writeFileSync(narrationPath, buf);
        emitProgress(jobId, 'progress', { step: 1, total: 5, label: '🎙 Narración lista ✓', percent: 22 });
      }

      // Step 2: Background Music
      let bgmPath = null;
      if (audioMode !== 'narration') {
        const moodKey = musicMood || 'Cinematic';
        const moodPrompt = MUSIC_PROMPTS[moodKey] || MUSIC_PROMPTS.Cinematic;
        const bgmDur    = Math.ceil(Number(durationSeconds) + 2);
        if (elKey) {
          emitProgress(jobId, 'progress', { step: 2, total: 5, label: `🎵 Generando música (${moodKey})...`, percent: 30 });
          const buf = await generateSound(moodPrompt, Math.min(bgmDur, 22), elKey);
          bgmPath = path.join(tmpDir, 'bgm.mp3');
          fs.writeFileSync(bgmPath, buf);
          emitProgress(jobId, 'progress', { step: 2, total: 5, label: '🎵 Música lista ✓', percent: 50 });
        } else {
          const fallback = path.join(PUBLIC_DIR, 'background-music.mp3');
          if (fs.existsSync(fallback)) bgmPath = fallback;
        }
      }

      // Step 3: SFX
      let sfxPath = null;
      if (sfxOnCta) {
        const cached = path.join(PUBLIC_DIR, 'audio', 'sfx-cta.mp3');
        if (fs.existsSync(cached)) {
          sfxPath = cached;
          emitProgress(jobId, 'progress', { step: 3, total: 5, label: '⚡ SFX cargado ✓', percent: 55 });
        } else if (apiKey) {
          try {
            emitProgress(jobId, 'progress', { step: 3, total: 5, label: '⚡ Generando SFX...', percent: 52 });
            const buf = await generateSound(
              'futuristic tech whoosh, digital reveal, premium UI sound, 2 seconds', 2, apiKey
            );
            sfxPath = path.join(tmpDir, 'sfx.mp3');
            fs.writeFileSync(sfxPath, buf);
            emitProgress(jobId, 'progress', { step: 3, total: 5, label: '⚡ SFX listo ✓', percent: 58 });
          } catch (e) {
            console.warn('SFX failed (non-fatal):', e.message);
          }
        }
      }

      // Step 4: Copy logo + generate AI scene images
      emitProgress(jobId, 'progress', { step: 4, total: 5, label: '🖼 Preparando assets...', percent: 58 });
      const logoSrc  = path.join(CLIENTS_DIR, clientId, 'logo.png');
      const logoDest = path.join(PUB_CLIENTS, clientId, 'logo.png');
      if (fs.existsSync(logoSrc)) {
        fs.mkdirSync(path.dirname(logoDest), { recursive: true });
        fs.copyFileSync(logoSrc, logoDest);
      }

      const brand = JSON.parse(fs.readFileSync(brandFile, 'utf8'));

      // Use scenes passed from frontend if available, else generate from script
      let scenesForRender = (Array.isArray(scenesFromClient) && scenesFromClient.length)
        ? scenesFromClient
        : []; // No scenes from client and no local engine — render with empty scenes

      // Generate AI images for each scene
      const toneEl = req.body.tone || 'Inspirador';
      const imageStyle = req.body.imageStyle || 'photorealistic';
      const imageProvider = req.body.imageProvider || 'auto';
      emitProgress(jobId, 'progress', { step: 4, total: 5, label: `🎨 Generando ${scenesForRender.length} imágenes AI...`, percent: 60 });

      const sceneImages = await generateAllSceneImages({
        scenes: scenesForRender, brand, tone: toneEl, format,
        jobId, imageStyle, imageProvider,
        onProgress: ({ scene, total }) => {
          const pct = 60 + Math.round((scene / total) * 10);
          emitProgress(jobId, 'progress', { step: 4, total: 5, label: `🎨 Imagen ${scene + 1}/${total} generada...`, percent: pct });
        },
      });

      // Copy scene images to public/assets and pass ABSOLUTE URLs so Remotion's Chromium can fetch them.
      // Relative URLs resolve against the webpack bundle serve URL, not the Express server — use http://localhost:PORT
      const sceneImageUrls = sceneImages.map((imgPath, i) => {
        if (!imgPath || !fs.existsSync(imgPath)) return null;
        const imgDir = path.join(PUBLIC_DIR, 'assets', 'scenes', jobId);
        fs.mkdirSync(imgDir, { recursive: true });
        const dest = path.join(imgDir, `scene-${i}.jpg`);
        fs.copyFileSync(imgPath, dest);
        return `${BASE_URL}/assets/scenes/${jobId}/scene-${i}.jpg`;
      });

      emitProgress(jobId, 'progress', { step: 4, total: 5, label: `✅ ${sceneImages.filter(Boolean).length}/${scenesForRender.length} imágenes listas ✓`, percent: 71 });

      // Step 5: Render frames with Remotion
      emitProgress(jobId, 'progress', { step: 5, total: 5, label: '🎬 Renderizando frames con Remotion...', percent: 72 });

      const { framesDir: jobFramesDir, digits } = await renderVideoFrames({
        jobId, brand, scenes: scenesForRender,
        format, durationSeconds: Number(durationSeconds), transition,
        sceneImageUrls,
        onProgress: (p) => emitProgress(jobId, 'progress', { step: 5, total: 5, ...p }),
      });

      emitProgress(jobId, 'progress', { step: 5, total: 5, label: '🔗 Stitching audio + video...', percent: 90 });
      const timestamp = Date.now();
      const filename  = `${clientId}-${timestamp}.mp4`;
      const outPath   = path.join(RENDERS_DIR, filename);

      await stitchVideo({
        outputPath: outPath,
        durationSec: Number(durationSeconds),
        audioMode,
        narrationPath,
        bgmPath,
        sfxPath,
        framesDir: jobFramesDir,
        digits,
      });

      emitProgress(jobId, 'progress', { step: 5, total: 5, label: '✅ Video listo ✓', percent: 98 });

      // Cleanup
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

      // Save metadata
      const metaPath = path.join(RENDERS_DIR, filename.replace('.mp4', '.json'));
      fs.writeFileSync(metaPath, JSON.stringify({
        clientId, format, durationSeconds, audioMode, musicMood, transition,
        script: script.substring(0, 200),
        createdAt: new Date().toISOString(),
      }, null, 2));

      emitProgress(jobId, 'done', {
        videoUrl: `/renders/${filename}`,
        filename,
        label: '🎉 ¡Renderizado completo!',
        format, durationSeconds,
      });

    } catch (err) {
      console.error(`❌ Job ${jobId} failed:`, err);
      // Categorize error for better UI messaging
      const msg = err.message || 'Error desconocido';
      let userMsg = msg;
      if (msg.includes('composition not found')) {
        userMsg = `Error Remotion: composición no encontrada — ${msg}`;
      } else if (msg.includes('No image provider')) {
        userMsg = `Error imágenes: ${msg}`;
      } else if (msg.includes('ElevenLabs') || msg.includes('tts') || msg.includes('narration')) {
        userMsg = `Error ElevenLabs (narración): ${msg}`;
      } else if (msg.includes('Kling') || msg.includes('kling')) {
        userMsg = `Error Kling AI (video): ${msg}`;
      } else if (msg.includes('Runway') || msg.includes('runway')) {
        userMsg = `Error Runway (video): ${msg}`;
      } else if (msg.includes('ffmpeg') || msg.includes('stitch')) {
        userMsg = `Error FFmpeg (mezcla audio/video): ${msg}`;
      }
      emitProgress(jobId, 'error', { message: userMsg });
    }
  })();
});

// ── Render graphic still (PNG) ────────────────────────────────────────────────
const GRAPHICS_DIR = path.join(PUBLIC_DIR, 'graphics');
if (!fs.existsSync(GRAPHICS_DIR)) fs.mkdirSync(GRAPHICS_DIR, { recursive: true });

/**
 * Generate an AI background image using OpenAI DALL-E 3.
 * Returns a URL to the generated image.
 */
/**
 * Generate an AI background image for graphics.
 * Provider cascade (respects imageProvider preference):
 *   runway → Runway Gen-4 Image (premium quality)
 *   gemini → Gemini Imagen 3 (fast)
 *   auto   → Gemini → Runway → OpenAI → Pexels
 * Returns a local file path (saved under .tmp/bg-<timestamp>.jpg).
 */
async function generateAiBackground(brand, graphicType, apiKeys, imageProvider = 'auto') {
  const prompt = `High-impact ${graphicType} background for brand "${brand.displayName}". Abstract, cinematic, professional. Primary color: ${brand.colors?.primary || '#000'}. No text, no logos. Dark overlay background. Style: modern, editorial, bold graphic design.`;
  const destPath = path.join(__dirname, '.tmp', `bg-${Date.now()}.jpg`);
  fs.mkdirSync(path.join(__dirname, '.tmp'), { recursive: true });

  const tryRunway = async () => {
    if (!apiKeys.RUNWAY_API_KEY) throw new Error('No RUNWAY_API_KEY');
    console.log('  🎨 AI background: Runway Gen-4 Image');
    const buf = await generateWithRunwayImage(prompt, 1080, 1080, apiKeys.RUNWAY_API_KEY);
    fs.writeFileSync(destPath, buf);
    return destPath;
  };

  const tryGemini = async () => {
    if (!apiKeys.GEMINI_API_KEY) throw new Error('No GEMINI_API_KEY');
    console.log('  🎨 AI background: Gemini Imagen 3');
    const buf = await generateWithGeminiImagen(prompt, 1080, 1080, apiKeys.GEMINI_API_KEY);
    fs.writeFileSync(destPath, buf);
    return destPath;
  };

  const cascade = imageProvider === 'runway'
    ? [tryRunway, tryGemini]
    : imageProvider === 'gemini'
      ? [tryGemini, tryRunway]
      : [tryGemini, tryRunway]; // auto: gemini first (faster), runway fallback

  for (const fn of cascade) {
    try { return await fn(); } catch (e) { console.warn(`  ⚠️  bg provider failed: ${e.message}`); }
  }

  // OpenAI DALL-E 3 fallback
  if (apiKeys.OPENAI_API_KEY) {
    try {
      console.log('  🎨 AI background: OpenAI DALL-E 3');
      const url = await generateWithOpenAI(prompt, 1080, 1080, apiKeys.OPENAI_API_KEY);
      await downloadImage(url, destPath);
      return destPath;
    } catch (e) { console.warn('  ⚠️  OpenAI bg failed:', e.message); }
  }

  // Pexels stock (free fallback)
  if (apiKeys.PEXELS_API_KEY) {
    try {
      console.log('  🎨 AI background: Pexels stock');
      const url = await fetchPexelsPhoto(`${brand.displayName || graphicType} abstract professional`, '1:1', apiKeys.PEXELS_API_KEY);
      await downloadImage(url, destPath);
      return destPath;
    } catch (e) { console.warn('  ⚠️  Pexels bg failed:', e.message); }
  }

  throw new Error('No image provider available for AI background (needs RUNWAY_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, or PEXELS_API_KEY)');
}

app.post('/api/render/graphic', async (req, res) => {
  const { clientId, type = 'post', bgStyle = 'dark', headline, subheadline, body, cta, stats, quoteAuthor, imageUrl, animated = false, width: reqW, height: reqH, useAiBg, imageProvider = 'auto' } = req.body;
  if (!clientId || !headline) return res.status(400).json({ success: false, error: 'clientId and headline required' });

  const brandFile = path.join(CLIENTS_DIR, clientId, 'brand-identity.json');
  if (!fs.existsSync(brandFile)) return res.status(404).json({ success: false, error: 'Client not found' });
  const brand = JSON.parse(fs.readFileSync(brandFile, 'utf8'));

  // Dimensions by type
  const DIMS = {
    post:     { w: 1080, h: 1080 },
    story:    { w: 1080, h: 1920 },
    banner:   { w: 1920, h: 1080 },
    carousel: { w: 1080, h: 1080 },
    quote:    { w: 1080, h: 1080 },
    stats:    { w: 1080, h: 1080 },
    product:  { w: 1080, h: 1080 },
  };
  const { w, h } = DIMS[type] || DIMS.post;
  const width  = reqW || w;
  const height = reqH || h;

  // Auto-enable AI background when any image provider key is available
  const aiKeys = loadApiKeys();
  const hasImageProvider = !!(aiKeys.RUNWAY_API_KEY || aiKeys.GEMINI_API_KEY || aiKeys.OPENAI_API_KEY || aiKeys.PEXELS_API_KEY);
  const shouldUseAiBg = useAiBg !== undefined ? useAiBg : hasImageProvider;

  // Generate AI background (local path → copy to public/assets → serve via BASE_URL)
  let bgImageUrl = imageUrl || null;
  if (shouldUseAiBg && !bgImageUrl) {
    try {
      console.log(`  🎨 Generating AI background [${imageProvider}] for graphic type="${type}"...`);
      const localBgPath = await generateAiBackground(brand, type, aiKeys, imageProvider);
      // Copy to public/assets/graphics so Remotion's Chromium can fetch it via HTTP
      const bgDir = path.join(PUBLIC_DIR, 'assets', 'graphics');
      fs.mkdirSync(bgDir, { recursive: true });
      const bgFilename = `bg-${clientId}-${Date.now()}.jpg`;
      fs.copyFileSync(localBgPath, path.join(bgDir, bgFilename));
      try { fs.unlinkSync(localBgPath); } catch (_) {}
      bgImageUrl = `${BASE_URL}/assets/graphics/${bgFilename}`;
      console.log(`  ✅ AI background ready: ${bgImageUrl}`);
    } catch (e) {
      console.warn(`  ⚠️  AI background failed (non-fatal): ${e.message}`);
    }
  }

  const graphicProps = {
    type, bgStyle, headline,
    subheadline: subheadline || '',
    body: body || '',
    cta: cta || '',
    stats: stats || [],
    quoteAuthor: quoteAuthor || '',
    imageUrl: bgImageUrl,
    bgImageUrl: bgImageUrl || null,
    logoUrl: null,
    animated,
    brand: {
      clientId: brand.clientId,
      displayName: brand.displayName,
      colors: brand.colors,
      fonts: brand.fonts,
      gradient: brand.gradient,
      website: brand.website || '',
    },
  };

  try {
    const serveUrl = await getBundle();
    const comps    = await getCachedCompositions(serveUrl);
    const comp     = comps.find(c => c.id === 'BrandGraphic');
    if (!comp) throw new Error('BrandGraphic composition not found');

    const timestamp = Date.now();

    if (animated) {
      // Render animated MP4 (2s loop, 60 frames)
      const filename = `graphic-${clientId}-${timestamp}.mp4`;
      const outPath  = path.join(GRAPHICS_DIR, filename);
      const overriddenComp = { ...comp, width, height, durationInFrames: 60, fps: 30, defaultProps: graphicProps, props: graphicProps };
      await renderMedia({
        composition: overriddenComp,
        serveUrl,
        codec: 'h264',
        outputLocation: outPath,
        inputProps: graphicProps,
        chromiumOptions: { headless: true, disableWebSecurity: true }, ...(BROWSER_EXECUTABLE ? { browserExecutable: BROWSER_EXECUTABLE } : {}),
      });
      return res.json({ success: true, url: `/graphics/${filename}`, filename });
    }

    // Static PNG
    const filename  = `graphic-${clientId}-${timestamp}.png`;
    const outPath   = path.join(GRAPHICS_DIR, filename);
    const overriddenComp = { ...comp, width, height, durationInFrames: 1, fps: 30, defaultProps: graphicProps, props: graphicProps };

    await renderStill({
      composition: overriddenComp,
      serveUrl,
      output: outPath,
      inputProps: graphicProps,
      imageFormat: 'png',
      chromiumOptions: { headless: true, disableWebSecurity: true }, ...(BROWSER_EXECUTABLE ? { browserExecutable: BROWSER_EXECUTABLE } : {}),
    });

    res.json({ success: true, url: `/graphics/${filename}`, filename });
  } catch (err) {
    console.error('Graphic render failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Render carousel (multiple graphics) ─────────────────────────────────────
app.post('/api/render/carousel', async (req, res) => {
  const { clientId, slides } = req.body;
  if (!clientId || !Array.isArray(slides) || !slides.length) return res.status(400).json({ success: false, error: 'clientId and slides[] required' });

  const brandFile = path.join(CLIENTS_DIR, clientId, 'brand-identity.json');
  if (!fs.existsSync(brandFile)) return res.status(404).json({ success: false, error: 'Client not found' });
  const brand = JSON.parse(fs.readFileSync(brandFile, 'utf8'));

  try {
    const serveUrl = await getBundle();
    const comps    = await getCachedCompositions(serveUrl);
    const comp     = comps.find(c => c.id === 'BrandGraphic');
    if (!comp) throw new Error('BrandGraphic composition not found');

    const timestamp = Date.now();
    const urls = [];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const graphicProps = {
        type: 'carousel',
        bgStyle: slide.bgStyle || req.body.bgStyle || 'dark',
        headline:    slide.headline || '',
        subheadline: slide.subheadline || '',
        body:        slide.body || '',
        cta:         slide.cta || req.body.cta || '',
        stats:       slide.stats || [],
        imageUrl:    slide.imageUrl || null,
        logoUrl:     null,
        animated:    false,
        slideIndex:  i,
        totalSlides: slides.length,
        brand: { clientId: brand.clientId, displayName: brand.displayName, colors: brand.colors, fonts: brand.fonts, gradient: brand.gradient, website: brand.website || '' },
      };
      const overriddenComp = { ...comp, width: 1080, height: 1080, durationInFrames: 1, fps: 30, defaultProps: graphicProps, props: graphicProps };
      const filename = `carousel-${clientId}-${timestamp}-${i + 1}.png`;
      const outPath  = path.join(GRAPHICS_DIR, filename);

      await renderStill({ composition: overriddenComp, serveUrl, output: outPath, inputProps: graphicProps, imageFormat: 'png', chromiumOptions: { headless: true, disableWebSecurity: true }, ...(BROWSER_EXECUTABLE ? { browserExecutable: BROWSER_EXECUTABLE } : {}) });
      urls.push({ slide: i + 1, url: `/graphics/${filename}`, filename });
    }

    res.json({ success: true, slides: urls, urls: urls.map(u => u.url) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Serve generated graphics
app.use('/graphics', express.static(GRAPHICS_DIR));

// ── Click to Ad — full campaign from URL + context ────────────────────────────
app.post('/api/click-to-ad', async (req, res) => {
  const { url: websiteUrl, context = '', clientId, format = '9:16', durationSeconds = 21, tone = 'Inspirador', rrss = 'Instagram', mode = 'both' } = req.body;
  if (!websiteUrl && !context && !clientId) return res.status(400).json({ success: false, error: 'url or clientId required' });

  const keys = loadApiKeys();

  try {
    // 1. Get brand data
    let brand = null;
    let brandDesc = '';
    if (clientId) {
      try {
        const bf = path.join(CLIENTS_DIR, clientId, 'brand-identity.json');
        brand = JSON.parse(fs.readFileSync(bf, 'utf8'));
        brandDesc = [brand.description, brand.website ? `Sitio: ${brand.website}` : ''].filter(Boolean).join('. ');
      } catch (_) {}
    }

    // 2. Scrape website if URL provided
    let scrapedInfo = '';
    if (websiteUrl) {
      try {
        const scraped = await scrapeBrand(websiteUrl);
        scrapedInfo = [scraped.displayName, scraped.description || ''].filter(Boolean).join('. ');
        if (!brand) brand = scraped;
        if (!brandDesc) brandDesc = scrapedInfo;
      } catch (e) {
        console.warn('Click-to-Ad scrape warn:', e.message);
      }
    }

    const fullContext = [context, brandDesc, scrapedInfo].filter(s => s && s.trim().length > 3).join('. ');
    const brandName = brand?.displayName || clientId || 'la marca';

    // 3. Generate script
    let scriptResult;
    if (keys.GEMINI_API_KEY) {
      try {
        scriptResult = await generateScriptWithGemini({
          prompt: fullContext || `video publicitario para ${brandName}`,
          brandName, brandDesc: fullContext,
          tone, durationSeconds: Number(durationSeconds),
          rrss, creativity: 75, geminiApiKey: keys.GEMINI_API_KEY,
        });
      } catch (_) {}
    }
    if (!scriptResult) {
      throw new Error('Gemini no disponible para generar el guion. Configura GEMINI_API_KEY.');
    }

    // 4. Generate graphic content (post + story if mode includes graphics)
    const graphicsResults = [];
    if ((mode === 'graphics' || mode === 'both') && clientId && keys) {
      const serveUrl = await getBundle();
      const comps    = await getCachedCompositions(serveUrl);
      const comp     = comps.find(c => c.id === 'BrandGraphic');
      const brandObj = brand ? { clientId: brand.clientId || clientId, displayName: brandName, colors: brand.colors, fonts: brand.fonts || { display: 'Impact', body: 'system-ui' }, gradient: brand.gradient || '#f97316' } : null;

      if (comp && brandObj) {
        for (const gType of ['post', 'story']) {
          try {
            const dims = gType === 'story' ? { w: 1080, h: 1920 } : { w: 1080, h: 1080 };
            const props = {
              type: gType, bgStyle: 'dark',
              headline: scriptResult.scenes?.[1]?.title || brandName,
              subheadline: scriptResult.scenes?.[0]?.subtitle || '',
              body: '', cta: scriptResult.scenes?.[scriptResult.scenes.length - 1]?.badge || 'Saber más',
              stats: [], imageUrl: null, logoUrl: null, animated: false,
              brand: brandObj,
            };
            const oc = { ...comp, ...dims, width: dims.w, height: dims.h, durationInFrames: 1, fps: 30, defaultProps: props, props };
            const ts = Date.now();
            const fname = `cta-${clientId}-${gType}-${ts}.png`;
            const outP  = path.join(GRAPHICS_DIR, fname);
            await renderStill({ composition: oc, serveUrl, output: outP, inputProps: props, imageFormat: 'png', chromiumOptions: { headless: true, disableWebSecurity: true }, ...(BROWSER_EXECUTABLE ? { browserExecutable: BROWSER_EXECUTABLE } : {}) });
            graphicsResults.push({ type: gType, url: `/graphics/${fname}` });
          } catch (e) { console.warn('Click-to-Ad graphic error:', e.message); }
        }
      }
    }

    res.json({
      success: true,
      script: scriptResult.script,
      scenes: scriptResult.scenes,
      wordCount: scriptResult.wordCount,
      problem: scriptResult.problem,
      benefit: scriptResult.benefit,
      category: scriptResult.category,
      engine: scriptResult.engine || 'pas',
      brandName,
      graphics: graphicsResults,
    });
  } catch (err) {
    console.error('Click-to-Ad error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Graphic variants — 10 styles from same content ───────────────────────────
app.post('/api/render/graphic-variants', async (req, res) => {
  const { clientId, headline, subheadline = '', body = '', cta = '', count = 10 } = req.body;
  if (!clientId || !headline) return res.status(400).json({ success: false, error: 'clientId and headline required' });

  const brandFile = path.join(CLIENTS_DIR, clientId, 'brand-identity.json');
  if (!fs.existsSync(brandFile)) return res.status(404).json({ success: false, error: 'Client not found' });
  const brand = JSON.parse(fs.readFileSync(brandFile, 'utf8'));

  const VARIANT_STYLES = [
    { type: 'post',    bgStyle: 'dark',     label: 'Dark Post' },
    { type: 'post',    bgStyle: 'gradient', label: 'Gradient Post' },
    { type: 'post',    bgStyle: 'mesh',     label: 'Mesh Post' },
    { type: 'quote',   bgStyle: 'dark',     label: 'Quote Dark' },
    { type: 'quote',   bgStyle: 'gradient', label: 'Quote Gradient' },
    { type: 'stats',   bgStyle: 'dark',     label: 'Stats Dark' },
    { type: 'stats',   bgStyle: 'gradient', label: 'Stats Gradient' },
    { type: 'banner',  bgStyle: 'dark',     label: 'Banner Dark' },
    { type: 'banner',  bgStyle: 'gradient', label: 'Banner Gradient' },
    { type: 'story',   bgStyle: 'mesh',     label: 'Story Mesh' },
  ];
  const selected = VARIANT_STYLES.slice(0, Math.min(Number(count), 10));

  try {
    const serveUrl = await getBundle();
    const comps = await getCachedCompositions(serveUrl);
    const comp  = comps.find(c => c.id === 'BrandGraphic');
    if (!comp) throw new Error('BrandGraphic composition not found');

    const timestamp = Date.now();
    const brandObj  = { clientId: brand.clientId, displayName: brand.displayName, colors: brand.colors, fonts: brand.fonts, gradient: brand.gradient, website: brand.website || '' };
    const results   = [];

    for (let i = 0; i < selected.length; i++) {
      const v = selected[i];
      const DIMS = { post: { w: 1080, h: 1080 }, quote: { w: 1080, h: 1080 }, stats: { w: 1080, h: 1080 }, banner: { w: 1920, h: 1080 }, story: { w: 1080, h: 1920 } };
      const { w, h } = DIMS[v.type] || DIMS.post;
      const props = { type: v.type, bgStyle: v.bgStyle, headline, subheadline, body, cta, stats: [], quoteAuthor: '', imageUrl: null, logoUrl: null, animated: false, brand: brandObj };
      const oc = { ...comp, width: w, height: h, durationInFrames: 1, fps: 30, defaultProps: props, props };
      const fname = `variant-${clientId}-${timestamp}-${i + 1}.png`;
      const outPath = path.join(GRAPHICS_DIR, fname);
      try {
        await renderStill({ composition: oc, serveUrl, output: outPath, inputProps: props, imageFormat: 'png', chromiumOptions: { headless: true, disableWebSecurity: true }, ...(BROWSER_EXECUTABLE ? { browserExecutable: BROWSER_EXECUTABLE } : {}) });
        results.push({ label: v.label, type: v.type, bgStyle: v.bgStyle, url: `/graphics/${fname}` });
      } catch (e) {
        results.push({ label: v.label, type: v.type, bgStyle: v.bgStyle, error: e.message });
      }
    }

    res.json({ success: true, variants: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── AI Edit — edit graphic or video via prompt ────────────────────────────────
app.post('/api/ai-edit', async (req, res) => {
  const { type, clientId, currentProps, editPrompt } = req.body;
  if (!editPrompt) return res.status(400).json({ success: false, error: 'editPrompt required' });

  const keys = loadApiKeys();
  let updated = { ...(currentProps || {}) };

  // Use Gemini or fallback to rule-based parsing
  if (keys.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(keys.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite', generationConfig: { temperature: 0.4, maxOutputTokens: 512, responseMimeType: 'application/json' } });
      const result = await model.generateContent([
        { text: `You are editing a graphic/video configuration. Current config: ${JSON.stringify(currentProps)}. User wants: "${editPrompt}". Return ONLY a JSON object with ONLY the fields that need to change. Keep all other fields as-is.` }
      ]);
      const changes = JSON.parse(result.response.text());
      updated = { ...updated, ...changes };
    } catch (_) {}
  } else {
    // Rule-based fallback
    const ep = editPrompt.toLowerCase();
    if (/fondo.*oscuro|dark/i.test(ep)) updated.bgStyle = 'dark';
    if (/fondo.*gradiente|gradient/i.test(ep)) updated.bgStyle = 'gradient';
    if (/fondo.*mesh|malla/i.test(ep)) updated.bgStyle = 'mesh';
    if (/fondo.*claro|light/i.test(ep)) updated.bgStyle = 'light';
    const headlineMatch = ep.match(/título[:\s]+["']?(.+?)["']?\s*$/i);
    if (headlineMatch) updated.headline = headlineMatch[1].trim();
    const ctaMatch = ep.match(/cta[:\s]+["']?(.+?)["']?\s*$/i);
    if (ctaMatch) updated.cta = ctaMatch[1].trim();
    if (/post|1:1/i.test(ep)) updated.type = 'post';
    if (/story|9:16/i.test(ep)) updated.type = 'story';
    if (/banner|16:9/i.test(ep)) updated.type = 'banner';
    if (/quote|cita/i.test(ep)) updated.type = 'quote';
    if (/stats|estadística/i.test(ep)) updated.type = 'stats';
  }

  // If it's a graphic type, re-render with updated props
  if (type === 'graphic' && clientId) {
    try {
      const brandFile = path.join(CLIENTS_DIR, clientId, 'brand-identity.json');
      const brand = JSON.parse(fs.readFileSync(brandFile, 'utf8'));
      const brandObj = { clientId: brand.clientId, displayName: brand.displayName, colors: brand.colors, fonts: brand.fonts, gradient: brand.gradient, website: brand.website || '' };
      const mergedProps = { ...updated, brand: brandObj };

      const DIMS = { post: { w: 1080, h: 1080 }, quote: { w: 1080, h: 1080 }, stats: { w: 1080, h: 1080 }, banner: { w: 1920, h: 1080 }, story: { w: 1080, h: 1920 }, carousel: { w: 1080, h: 1080 } };
      const { w, h } = DIMS[mergedProps.type] || DIMS.post;

      const serveUrl = await getBundle();
      const comps = await getCachedCompositions(serveUrl);
      const comp  = comps.find(c => c.id === 'BrandGraphic');
      const oc = { ...comp, width: w, height: h, durationInFrames: 1, fps: 30, defaultProps: mergedProps, props: mergedProps };
      const fname = `edited-${clientId}-${Date.now()}.png`;
      const outPath = path.join(GRAPHICS_DIR, fname);
      await renderStill({ composition: oc, serveUrl, output: outPath, inputProps: mergedProps, imageFormat: 'png', chromiumOptions: { headless: true, disableWebSecurity: true }, ...(BROWSER_EXECUTABLE ? { browserExecutable: BROWSER_EXECUTABLE } : {}) });
      return res.json({ success: true, url: `/graphics/${fname}`, updatedProps: mergedProps });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // For video/script — return updated props for client to apply
  res.json({ success: true, updatedProps: updated });
});

// ── SSE progress ──────────────────────────────────────────────────────────────
app.get('/api/render/progress/:jobId', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.setHeader('X-Accel-Buffering', 'no');   // Nginx: disable buffering
  res.setHeader('Cache-Control', 'no-cache, no-store');

  if (!sseJobs.has(req.params.jobId)) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Job not found' })}\n\n`);
    return res.end();
  }

  const job = sseJobs.get(req.params.jobId);
  job.events.forEach(ev => res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`));
  if (job.done) return res.end();
  job.clients.push(res);

  // Heartbeat every 10s to keep connection alive during long Remotion renders
  const heartbeat = setInterval(() => {
    if (job.done) return clearInterval(heartbeat);
    try { res.write(': heartbeat\n\n'); } catch (_) { clearInterval(heartbeat); }
  }, 10000); // 10s heartbeat — keeps SSE alive through Nginx/proxy 60s timeouts

  req.on('close', () => {
    clearInterval(heartbeat);
    const idx = job.clients.indexOf(res);
    if (idx !== -1) job.clients.splice(idx, 1);
  });
});

// ── Library ───────────────────────────────────────────────────────────────────
app.get('/api/library', (req, res) => {
  try {
    if (!fs.existsSync(RENDERS_DIR)) return res.json({ success: true, videos: [] });
    const videos = fs.readdirSync(RENDERS_DIR)
      .filter(f => f.endsWith('.mp4'))
      .map(filename => {
        const stat   = fs.statSync(path.join(RENDERS_DIR, filename));
        const metaP  = path.join(RENDERS_DIR, filename.replace('.mp4', '.json'));
        let meta = {};
        try { meta = JSON.parse(fs.readFileSync(metaP, 'utf8')); } catch (_) {}
        const m = filename.match(/^(.+)-(\d+)\.mp4$/);
        return {
          filename, videoUrl: `/renders/${filename}`,
          clientId: m?.[1] || filename.replace('.mp4', ''),
          createdAt: meta.createdAt || stat.mtime.toISOString(),
          size: stat.size,
          format: meta.format || '9:16',
          durationSeconds: meta.durationSeconds || 21,
          musicMood: meta.musicMood,
          script: meta.script,
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, videos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── AI Refine (brand editor) ──────────────────────────────────────────────────
app.post('/api/ai-refine', (req, res) => {
  const { prompt, clientId, currentBrand } = req.body;
  if (!prompt || !clientId) return res.status(400).json({ success: false, error: 'prompt and clientId required' });

  const brandPath = path.join(CLIENTS_DIR, clientId, 'brand-identity.json');
  if (!fs.existsSync(brandPath)) return res.status(404).json({ success: false, error: 'Client not found' });

  let brand = JSON.parse(fs.readFileSync(brandPath, 'utf8'));
  if (currentBrand) brand = { ...brand, ...currentBrand, colors: { ...brand.colors, ...currentBrand.colors } };

  const p = prompt.toLowerCase();
  let message = '';

  const namedColors = {
    rojo: '#e53e3e', red: '#e53e3e', azul: '#3182ce', blue: '#3182ce',
    verde: '#38a169', green: '#38a169', amarillo: '#d69e2e', yellow: '#d69e2e',
    naranja: '#dd6b20', orange: '#dd6b20', morado: '#805ad5', purple: '#805ad5',
    rosa: '#d53f8c', pink: '#d53f8c', negro: '#000000', black: '#000000',
    blanco: '#ffffff', white: '#ffffff', gris: '#718096', gray: '#718096',
    cyan: '#0bc5ea', dorado: '#d4af37', gold: '#d4af37',
  };

  const hexMatch = prompt.match(/#([0-9a-fA-F]{3,6})/);
  const hexColor = hexMatch ? hexMatch[0] : null;
  const detectColor = (text) => {
    if (hexColor) return hexColor;
    for (const [n, h] of Object.entries(namedColors)) if (text.includes(n)) return h;
    return null;
  };

  const color = detectColor(p);

  if (/color\s*(primario|principal|primary|de\s*marca)|primario/.test(p) && color) {
    brand.colors.primary = color; message += `Color primario → ${color}. `;
  }
  if (/color\s*(secundario|secondary|acento)|secundario/.test(p) && color) {
    brand.colors.secondary = color; message += `Color secundario → ${color}. `;
  }
  if (/fondo|background|bg/.test(p)) {
    if (color) { brand.colors.background = color; message += `Fondo → ${color}. `; }
    else if (/oscuro|dark/.test(p)) {
      Object.assign(brand.colors, { background: '#0f172a', bgAlt: '#1e293b', card: '#1e293b', heading: '#f8fafc', body: '#cbd5e1' });
      message += 'Modo oscuro activado. ';
    } else if (/claro|light/.test(p)) {
      Object.assign(brand.colors, { background: '#ffffff', bgAlt: '#f9fafb', card: '#ffffff', heading: '#111827', body: '#374151' });
      message += 'Modo claro activado. ';
    }
  }
  if (/modo\s*oscuro|dark\s*mode/.test(p)) {
    Object.assign(brand.colors, { background: '#0f172a', bgAlt: '#1e293b', bgSoft: '#0f172a', card: '#1e293b', heading: '#f8fafc', body: '#cbd5e1', muted: '#64748b' });
    message += 'Modo oscuro activado. ';
  }
  if (/modo\s*claro|light\s*mode/.test(p)) {
    Object.assign(brand.colors, { background: '#ffffff', bgAlt: '#f9fafb', bgSoft: '#f3f4f6', card: '#ffffff', heading: '#111827', body: '#374151', muted: '#9ca3af' });
    message += 'Modo claro activado. ';
  }
  if (/fuente|font|tipograf/.test(p)) {
    if (/sans[\s-]?serif|sans/.test(p)) { brand.fonts.body = 'Inter, system-ui, sans-serif'; message += 'Fuente → Inter sans-serif. '; }
    if (/serif/.test(p) && !/sans/.test(p)) { brand.fonts.display = "Georgia, 'Times New Roman', serif"; message += 'Display → Georgia serif. '; }
    if (/mono|código/.test(p)) { brand.fonts.body = "'Courier New', monospace"; message += 'Fuente → monospace. '; }
  }

  brand.gradient = `linear-gradient(135deg, ${brand.colors.primary} 0%, ${brand.colors.secondary} 100%)`;

  if (!message) {
    return res.json({ success: true, updatedBrand: brand, message: "No entendí. Prueba: 'color primario azul', 'modo oscuro', 'color secundario #ff6b35'.", noChange: true });
  }

  fs.writeFileSync(brandPath, JSON.stringify(brand, null, 2));
  res.json({ success: true, updatedBrand: brand, message: message.trim() });
});

// ── Google Drive OAuth (server-side — works without JS Origins config) ────────
// User must add http://localhost:4000/api/auth/google/callback to their OAuth redirect URIs
// (already done per screenshot), and also need to set GOOGLE_CLIENT_SECRET in .api-keys.json

app.get('/api/auth/google', (req, res) => {
  const keys = loadApiKeys();
  const clientId = keys.GOOGLE_CLIENT_ID;
  const clientSecret = keys.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(400).send('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the AI keys panel');
  }
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  `${BASE_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/drive.readonly',
    access_type:   'offline',
    prompt:        'consent',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.status(400).send(`OAuth error: ${error}`);
  const keys = loadApiKeys();
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     keys.GOOGLE_CLIENT_ID,
        client_secret: keys.GOOGLE_CLIENT_SECRET,
        redirect_uri:  `${BASE_URL}/api/auth/google/callback`,
        grant_type:    'authorization_code',
      }),
    });
    const token = await tokenRes.json();
    if (token.error) throw new Error(token.error_description || token.error);
    // Store token in memory (not disk for security)
    app._driveToken = token.access_token;
    // Return HTML that sends token to parent window and closes popup
    res.send(`<script>
      window.opener?.postMessage({type:'drive_auth',token:'${token.access_token}'},'${BASE_URL}');
      window.close();
    </script><p>Autorizado ✓ — puedes cerrar esta ventana.</p>`);
  } catch (e) {
    res.status(500).send(`Token error: ${e.message}`);
  }
});

// List Drive files — folders + files, with folder navigation
app.get('/api/drive/files', async (req, res) => {
  const token = app._driveToken || req.headers.authorization?.replace('Bearer ','');
  if (!token) return res.status(401).json({ success: false, error: 'Not authenticated. Click Google Drive button first.' });

  const { q: search = '', pageToken = '', mimeFilter = 'all', folderId = '' } = req.query;

  // Build query parts
  const q_parts = [];
  if (folderId) {
    q_parts.push(`'${folderId}' in parents`);
  } else {
    q_parts.push(`'root' in parents`);
  }
  if (mimeFilter === 'video') {
    q_parts.push(`mimeType contains 'video/'`);
  } else if (mimeFilter === 'image') {
    q_parts.push(`mimeType contains 'image/'`);
  } else {
    q_parts.push(`(mimeType = 'application/vnd.google-apps.folder' OR mimeType contains 'image/' OR mimeType contains 'video/')`);
  }
  if (search) q_parts.push(`name contains '${search.replace(/'/g, "\\'")}'`);
  q_parts.push('trashed = false');

  const q = q_parts.join(' and ');

  const params = new URLSearchParams({
    q,
    fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink,hasThumbnail,modifiedTime,size,parents)',
    pageSize: '50',
    orderBy: 'folder,modifiedTime desc',
  });
  if (pageToken) params.set('pageToken', pageToken);

  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`,
      { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      const err = await r.json();
      return res.status(r.status).json({ success: false, error: err.error?.message || 'Drive API error' });
    }
    const data = await r.json();
    const files = (data.files || []).map(item => ({
      ...item,
      isFolder: item.mimeType === 'application/vnd.google-apps.folder',
    }));
    // Sort: folders first, then files
    files.sort((a, b) => (b.isFolder ? 1 : 0) - (a.isFolder ? 1 : 0));
    res.json({ success: true, files, nextPageToken: data.nextPageToken || null });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Thumbnail proxy — avoids CORS & serves resized thumbnails with caching
app.get('/api/drive/thumbnail/:fileId', async (req, res) => {
  const token = app._driveToken;
  if (!token) return res.status(401).end();
  try {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${req.params.fileId}?fields=thumbnailLink`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await r.json();
    if (data.thumbnailLink) {
      const imgR = await fetch(data.thumbnailLink.replace('=s220', '=s400'));
      const buf = Buffer.from(await imgR.arrayBuffer());
      res.set('Content-Type', 'image/jpeg').set('Cache-Control', 'public, max-age=86400').send(buf);
    } else {
      res.status(404).end();
    }
  } catch (_) { res.status(500).end(); }
});

// Proxy download from Drive (avoids CORS)
app.get('/api/drive/download/:fileId', async (req, res) => {
  const token = app._driveToken;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const filename = req.query.name || 'drive-file';
  const safeFile = filename.replace(/[^a-zA-Z0-9._-]/g,'_');
  const destDir  = path.join(ASSETS_DIR, req.query.clientId || 'uploads');
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, safeFile);

  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${req.params.fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return res.status(r.status).json({ error: 'Drive API error' });

  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  const relUrl = '/assets/' + (req.query.clientId || 'uploads') + '/' + safeFile;
  res.json({ success: true, url: relUrl, originalName: filename, size: buf.length });
});

// ── Send to channel ───────────────────────────────────────────────────────────
app.post('/api/send-channel', (req, res) => {
  const { platform, videoUrl } = req.body;
  if (!platform || !videoUrl) return res.status(400).json({ success: false, error: 'platform and videoUrl required' });
  console.log(`📤  Send to ${platform}: ${videoUrl}`);
  res.json({ success: true, message: `Enviado a ${platform} (configuración pendiente)` });
});

// ── API Keys management ───────────────────────────────────────────────────────

// Cache for handshake results (60 second TTL)
let _apiStatusCache = null;
let _apiStatusCacheTs = 0;
const API_STATUS_CACHE_TTL = 60000;

async function performApiHandshakes(keys) {
  const results = {};

  const checks = [];

  // OpenAI: GET /v1/models
  if (keys.OPENAI_API_KEY) {
    checks.push({ key: 'OPENAI_API_KEY', fn: async () => {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${keys.OPENAI_API_KEY}` },
        signal: AbortSignal.timeout(8000),
      });
      if (r.status === 200) return { active: true };
      throw new Error(`HTTP ${r.status}`);
    }});
  }

  // ElevenLabs: GET /v1/voices (lighter than /v1/user, no subscription required)
  if (keys.ELEVENLABS_API_KEY) {
    checks.push({ key: 'ELEVENLABS_API_KEY', fn: async () => {
      const r = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': keys.ELEVENLABS_API_KEY },
        signal: AbortSignal.timeout(8000),
      });
      if (r.status === 200) return { active: true };
      throw new Error(`HTTP ${r.status}`);
    }});
  }

  // Gemini: REST models list (lighter than generateContent, avoids quota)
  if (keys.GEMINI_API_KEY) {
    checks.push({ key: 'GEMINI_API_KEY', fn: async () => {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${keys.GEMINI_API_KEY}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (r.status === 200) return { active: true };
      throw new Error(`HTTP ${r.status}`);
    }});
  }

  // Kling: build JWT and check reachability
  if (keys.KLING_ACCESS_KEY && keys.KLING_SECRET_KEY) {
    checks.push({ key: 'KLING_ACCESS_KEY', fn: async () => {
      const jwt = buildKlingJWT(keys.KLING_ACCESS_KEY, keys.KLING_SECRET_KEY);
      const r = await fetch('https://api.klingai.com/v1/videos/text2video?pageNum=1&pageSize=1', {
        headers: { Authorization: `Bearer ${jwt}` },
        signal: AbortSignal.timeout(8000),
      });
      // 200/401/403 all mean API is reachable
      if ([200, 401, 403].includes(r.status)) return { active: r.status === 200 };
      throw new Error(`HTTP ${r.status}`);
    }});
  }

  // Runway: any HTTP response means key is configured (401 = key present, billing issue)
  if (keys.RUNWAY_API_KEY) {
    checks.push({ key: 'RUNWAY_API_KEY', fn: async () => {
      const r = await fetch('https://api.dev.runwayml.com/v1/organization', {
        headers: {
          Authorization: `Bearer ${keys.RUNWAY_API_KEY}`,
          'X-Runway-Version': '2024-11-06',
        },
        signal: AbortSignal.timeout(8000),
      });
      // Any HTTP response = API is reachable, key is configured
      if (r.status < 500) return { active: true };
      throw new Error(`HTTP ${r.status}`);
    }});
  }

  // For remaining keys (Stability, Fal, Replicate, Pexels, Pixabay) — presence check only
  const presenceOnly = ['STABILITY_API_KEY', 'FAL_API_KEY', 'REPLICATE_API_KEY', 'PEXELS_API_KEY', 'PIXABAY_API_KEY'];
  for (const k of presenceOnly) {
    if (keys[k]) results[k] = { active: true, checked: false };
    else results[k] = { active: false, checked: false };
  }

  // Google Drive: presence check
  if (keys.GOOGLE_CLIENT_ID) results['GOOGLE_CLIENT_ID'] = { active: true, checked: false };
  else results['GOOGLE_CLIENT_ID'] = { active: false, checked: false };

  // Run live checks in parallel
  const settled = await Promise.allSettled(checks.map(c => c.fn().then(r => ({ key: c.key, ...r })).catch(e => ({ key: c.key, active: false, error: e.message }))));
  settled.forEach(s => {
    if (s.status === 'fulfilled') results[s.value.key] = { active: s.value.active, checked: true, error: s.value.error };
  });

  return results;
}

app.get('/api/keys', async (req, res) => {
  const keys = loadApiKeys();
  const masked = {};

  const PROVIDERS = {
    OPENAI_API_KEY:       { name: 'OpenAI', color: '#10b981' },
    ELEVENLABS_API_KEY:   { name: 'ElevenLabs', color: '#f97316' },
    RUNWAY_API_KEY:       { name: 'Runway', color: '#dc2626' },
    KLING_ACCESS_KEY:     { name: 'Kling Native', color: '#8b5cf6' },
    GEMINI_API_KEY:       { name: 'Gemini', color: '#1a73e8' },
    STABILITY_API_KEY:    { name: 'Stability AI', color: '#7c3aed' },
    FAL_API_KEY:          { name: 'Fal.ai', color: '#6366f1' },
    REPLICATE_API_KEY:    { name: 'Replicate', color: '#0891b2' },
    PEXELS_API_KEY:       { name: 'Pexels', color: '#05a081' },
    PIXABAY_API_KEY:      { name: 'Pixabay', color: '#2563eb' },
    GOOGLE_CLIENT_ID:     { name: 'Google Drive', color: '#4285f4' },
  };

  for (const [k, v] of Object.entries(keys)) {
    masked[k] = v ? v.substring(0, 6) + '•'.repeat(Math.max(0, v.length - 10)) + v.slice(-4) : '';
  }

  // Use cached status if fresh
  let handshakeResults = {};
  const now = Date.now();
  if (_apiStatusCache && (now - _apiStatusCacheTs) < API_STATUS_CACHE_TTL) {
    handshakeResults = _apiStatusCache;
  } else {
    try {
      handshakeResults = await performApiHandshakes(keys);
      _apiStatusCache = handshakeResults;
      _apiStatusCacheTs = now;
    } catch (e) {
      console.warn('API handshake check failed:', e.message);
    }
  }

  const status = {};
  for (const [k, meta] of Object.entries(PROVIDERS)) {
    const handshake = handshakeResults[k];
    const hasKey = !!keys[k];
    status[k] = {
      active: handshake ? handshake.active : hasKey,
      checked: handshake?.checked || false,
      error: handshake?.error || null,
      ...meta,
    };
  }

  res.json({ success: true, keys: masked, status });
});

app.post('/api/keys', (req, res) => {
  const incoming = req.body; // { KEY_NAME: "value", ... }
  const current = loadApiKeys();
  for (const [k, v] of Object.entries(incoming)) {
    if (v === '') delete current[k]; // empty string = delete key
    else if (v) current[k] = v;
  }
  saveApiKeys(current);
  res.json({ success: true, message: 'API keys saved' });
});

/**
 * Assign uploaded client videos to scenes using Gemini intelligence.
 * Returns an array of { sceneIndex, videoFile } assignments.
 * Falls back to round-robin if Gemini fails or unavailable.
 */
async function assignVideosWithGemini(scenes, availableVideoFiles, apiKeys) {
  if (!apiKeys.GEMINI_API_KEY || !availableVideoFiles.length) {
    // Round-robin fallback
    return scenes.map((_, i) => ({ sceneIndex: i, videoFile: availableVideoFiles[i % availableVideoFiles.length] }));
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKeys.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024, responseMimeType: 'application/json' },
    });

    const sceneList = scenes.map((s, i) => `Scene ${i}: title="${s.title}", subtitle="${s.subtitle || ''}", type="${s.type}"`).join('\n');
    const fileList = availableVideoFiles.join(', ');

    const prompt = `You are a video editor. Match each scene to the best available video file.

Scenes:
${sceneList}

Available video files: ${fileList}

Return a JSON array matching each scene to the most appropriate video file:
[{ "sceneIndex": 0, "videoFile": "filename.mp4", "reason": "brief reason" }, ...]

Rules:
- Every scene must have an assignment
- Use files that best match the scene's title and type
- Distribute videos evenly, don't overuse one file`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed) && parsed.length > 0) {
      console.log(`  🧠 Gemini assigned videos to ${parsed.length} scenes`);
      return parsed;
    }
    throw new Error('Empty or invalid Gemini response');
  } catch (e) {
    console.warn(`  ⚠️  Gemini video assignment failed (${e.message}) — using round-robin`);
    return scenes.map((_, i) => ({ sceneIndex: i, videoFile: availableVideoFiles[i % availableVideoFiles.length] }));
  }
}

// ── Video render endpoint with Mashup mode support ────────────────────────────
app.post('/api/render/video', async (req, res) => {
  const { clientId, scenes, mashupMode = 'intelligent', clientVideos = [], format = '9:16', durationSeconds = 21 } = req.body;
  if (!clientId) return res.status(400).json({ success: false, error: 'clientId required' });

  const keys = loadApiKeys();
  const jobId = `mashup-${clientId}-${Date.now()}`;
  createJob(jobId);
  res.json({ success: true, jobId, message: 'Mashup render started' });

  (async () => {
    try {
      const tmpDir = path.join(__dirname, '.tmp', jobId);
      fs.mkdirSync(tmpDir, { recursive: true });

      emitProgress(jobId, 'progress', { step: 1, total: 3, label: '🎬 Preparando clips de video...', percent: 10 });

      let videoAssignments;
      if (mashupMode === 'manual') {
        // Manual: concatenate in upload order
        videoAssignments = clientVideos.map((file, i) => ({ sceneIndex: i, videoFile: file }));
        console.log(`  📋 Manual mashup: ${videoAssignments.length} clips in order`);
      } else {
        // Intelligent: use Gemini to assign
        videoAssignments = await assignVideosWithGemini(scenes || [], clientVideos, keys);
        console.log(`  🧠 Intelligent mashup: ${videoAssignments.length} assignments`);
      }

      if (!videoAssignments.length) {
        throw new Error('No video assignments could be made — upload client videos first');
      }

      emitProgress(jobId, 'progress', { step: 2, total: 3, label: '🎞 Concatenando clips con fade transitions...', percent: 40 });

      // Build ffmpeg concat with fade transitions
      const concatList = path.join(tmpDir, 'concat.txt');
      const resolvedPaths = videoAssignments.map(a => {
        // Try clientId folder first, then uploads fallback
        const p1 = path.join(ASSETS_DIR, clientId, a.videoFile);
        const p2 = path.join(ASSETS_DIR, 'uploads', a.videoFile);
        if (fs.existsSync(p1)) return p1;
        if (fs.existsSync(p2)) return p2;
        // Accept absolute paths passed directly
        if (path.isAbsolute(a.videoFile) && fs.existsSync(a.videoFile)) return a.videoFile;
        console.warn(`  ⚠️  Video not found: ${a.videoFile} (tried ${p1} and ${p2})`);
        return null;
      }).filter(Boolean);

      if (!resolvedPaths.length) {
        throw new Error('No valid video files found at expected paths');
      }

      const listContent = resolvedPaths.map(p => `file '${p}'`).join('\n');
      fs.writeFileSync(concatList, listContent);

      const timestamp = Date.now();
      const filename = `mashup-${clientId}-${timestamp}.mp4`;
      const outPath = path.join(RENDERS_DIR, filename);

      // Get actual clip durations via ffprobe for correct xfade offsets
      const FFPROBE = FFMPEG.replace(/ffmpeg$/, 'ffprobe');
      async function getClipDuration(filePath) {
        try {
          const { stdout } = await execFileAsync(FFPROBE, [
            '-v', 'quiet', '-print_format', 'json', '-show_format', filePath,
          ], { timeout: 30000 });
          return parseFloat(JSON.parse(stdout).format?.duration) || 5;
        } catch (_) { return 5; }
      }

      if (resolvedPaths.length === 1) {
        // Single clip: just re-encode to standard format
        await execFileAsync(FFMPEG, [
          '-y', '-i', resolvedPaths[0],
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'fast',
          '-c:a', 'aac', '-b:a', '128k',
          outPath,
        ], { timeout: 600000 });
      } else {
        // Get actual durations for correct xfade offset calculation
        const durations = await Promise.all(resolvedPaths.map(getClipDuration));
        const fadeDuration = 0.5;

        try {
          const inputs = resolvedPaths.flatMap(p => ['-i', p]);
          const filterParts = [];
          let prevLabel = '[0:v]';
          let cumulativeDur = 0;

          for (let i = 1; i < resolvedPaths.length; i++) {
            cumulativeDur += durations[i - 1];
            const offset = Math.max(0, cumulativeDur - fadeDuration);
            const outLabel = i === resolvedPaths.length - 1 ? '[vout]' : `[xfade${i}]`;
            filterParts.push(`${prevLabel}[${i}:v]xfade=transition=fade:duration=${fadeDuration}:offset=${offset}${outLabel}`);
            prevLabel = outLabel === `[xfade${i}]` ? `[xfade${i}]` : '[vout]';
          }

          await execFileAsync(FFMPEG, [
            '-y', ...inputs,
            '-filter_complex', filterParts.join(';'),
            '-map', '[vout]',
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'fast',
            '-an', // audio handled separately if needed
            outPath,
          ], { timeout: 600000 });
        } catch (xfadeErr) {
          console.warn(`  ⚠️  xfade failed (${xfadeErr.message}) — falling back to simple concat`);
          // Simple concat fallback: re-encode all clips to uniform codec/resolution
          await execFileAsync(FFMPEG, [
            '-y', '-f', 'concat', '-safe', '0', '-i', concatList,
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'fast',
            '-c:a', 'aac', '-b:a', '128k',
            outPath,
          ], { timeout: 600000 });
        }
      }

      emitProgress(jobId, 'progress', { step: 3, total: 3, label: '✅ Mashup listo', percent: 98 });

      const metaPath = path.join(RENDERS_DIR, filename.replace('.mp4', '.json'));
      fs.writeFileSync(metaPath, JSON.stringify({ clientId, format, durationSeconds, mashupMode, createdAt: new Date().toISOString() }, null, 2));

      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

      emitProgress(jobId, 'done', { videoUrl: `/renders/${filename}`, filename, label: '🎉 Mashup completo!' });
    } catch (err) {
      console.error(`❌ Mashup job ${jobId} failed:`, err);
      emitProgress(jobId, 'error', { message: err.message });
    }
  })();
});

// ── Video clip generation (single scene) ─────────────────────────────────────
app.post('/api/generate/video-clip', async (req, res) => {
  const { scene, brand, tone, format, index, jobId, prompt } = req.body;
  if (!scene) return res.status(400).json({ success: false, error: 'scene required' });

  const jid = jobId || `videoclip-${Date.now()}`;
  try {
    const localPath = await generateSceneVideo({ scene, brand: brand || {}, tone, format: format || '9:16', index: index || 0, jobId: jid, prompt });
    if (localPath && fs.existsSync(localPath)) {
      const clipDir = path.join(PUBLIC_DIR, 'assets', 'clips');
      fs.mkdirSync(clipDir, { recursive: true });
      const filename = `${jid}-scene-${index || 0}.mp4`;
      const pubPath = path.join(clipDir, filename);
      fs.copyFileSync(localPath, pubPath);
      res.json({ success: true, url: `/assets/clips/${filename}` });
    } else {
      res.json({ success: true, url: null, message: 'No video AI keys configured — add Runway or Kling key' });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Image generation preview (storyboard) ────────────────────────────────────
app.post('/api/generate/images', async (req, res) => {
  const { scenes, brand, tone, format, imageStyle } = req.body;
  if (!scenes?.length) return res.status(400).json({ success: false, error: 'scenes required' });

  const jobId = `preview-${Date.now()}`;
  const results = [];

  try {
    const imagePaths = await generateAllSceneImages({
      scenes, brand: brand || {}, tone, format: format || '9:16', jobId, imageStyle,
    });

    for (let i = 0; i < imagePaths.length; i++) {
      const localPath = imagePaths[i];
      if (localPath && fs.existsSync(localPath)) {
        // Copy to public/assets/previews/ so browser can access it
        const previewDir = path.join(PUBLIC_DIR, 'assets', 'previews');
        fs.mkdirSync(previewDir, { recursive: true });
        const filename = `${jobId}-scene-${i}.jpg`;
        const pubPath = path.join(previewDir, filename);
        fs.copyFileSync(localPath, pubPath);
        results.push({ index: i, url: `/assets/previews/${filename}` }); // relative OK for browser preview
      } else {
        results.push({ index: i, url: null });
      }
    }

    res.json({ success: true, images: results });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Gemini Content Director ───────────────────────────────────────────────────

/**
 * Deterministic fallback layout combos when Gemini is unavailable / rate-limited.
 */
const FALLBACK_LAYOUTS = [
  { layout: 'hero-left',  bgStyle: 'dark',     copy_angle: 'authority',     composition_note: 'Large image left, text stacked right' },
  { layout: 'hero-right', bgStyle: 'gradient', copy_angle: 'emotional',     composition_note: 'Text left, large image right' },
  { layout: 'centered',   bgStyle: 'mesh',     copy_angle: 'curiosity',     composition_note: 'All elements centered, full-bleed bg' },
  { layout: 'split',      bgStyle: 'light',    copy_angle: 'social_proof',  composition_note: 'Bold color split 50/50 vertical' },
  { layout: 'minimal',    bgStyle: 'solid',    copy_angle: 'urgency',       composition_note: 'Minimal white space, single focal element' },
  { layout: 'bold',       bgStyle: 'dark',     copy_angle: 'emotional',     composition_note: 'Giant oversized headline, small supporting text' },
  { layout: 'editorial',  bgStyle: 'gradient', copy_angle: 'authority',     composition_note: 'Magazine-style column layout' },
  { layout: 'magazine',   bgStyle: 'light',    copy_angle: 'curiosity',     composition_note: 'Pull-quote dominant, multiple text sizes' },
  { layout: 'cinematic',  bgStyle: 'mesh',     copy_angle: 'emotional',     composition_note: 'Full-bleed image, text overlaid at bottom' },
  { layout: 'geometric',  bgStyle: 'solid',    copy_angle: 'social_proof',  composition_note: 'Geometric shapes frame the content' },
];

/**
 * Generate a content plan with Gemini as Creative Director.
 * Falls back to deterministic combos if Gemini is rate-limited or unavailable.
 */
async function generateContentPlanWithGemini({ brandName, brandDesc, count, contentTypes, tone, context: campaignContext, creativity = 80, geminiApiKey }) {
  const layoutOptions = ['hero-left','hero-right','centered','split','minimal','bold','editorial','magazine','cinematic','geometric'];
  const bgOptions     = ['dark','gradient','mesh','light','solid'];
  const angleOptions  = ['emotional','social_proof','urgency','curiosity','authority'];

  const systemPrompt = `You are a world-class creative director specializing in social media graphics.
Your job is to plan ${count} unique marketing pieces for ${brandName}.
Brand description: ${brandDesc || 'A modern brand'}
Campaign context: ${campaignContext || 'General brand awareness'}
Tone: ${tone || 'Professional'}

Rules:
1. EVERY piece must have a UNIQUE combination of layout + bgStyle — no duplicates allowed.
2. Each piece must have a distinct visual identity and copy angle.
3. Write concise, punchy copy appropriate for social media.
4. Return ONLY a valid JSON array, no markdown, no explanation.

Available layouts: ${layoutOptions.join(', ')}
Available bgStyles: ${bgOptions.join(', ')}
Available copy_angles: ${angleOptions.join(', ')}
Content types requested: ${contentTypes.join(', ')}`;

  const userPrompt = `Generate ${count} unique content plan items as a JSON array. Each item must have these exact fields:
{
  "type": one of ${JSON.stringify([...new Set(contentTypes)])},
  "layout": string from available layouts,
  "bgStyle": string from available bgStyles,
  "headline": "main headline (max 8 words)",
  "subheadline": "supporting text (max 12 words)",
  "body": "body copy (max 20 words)",
  "cta": "call to action (max 5 words)",
  "visual_concept": "brief description of the visual",
  "copy_angle": string from available copy_angles,
  "composition_note": "specific layout instruction for the designer"
}

Return ONLY the JSON array.`;

  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const tempNorm = Math.min(1.0, Math.max(0.1, creativity / 100));
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { temperature: tempNorm, maxOutputTokens: 4096 },
      systemInstruction: systemPrompt,
    });

    const result = await model.generateContent(userPrompt);
    const text = result.response.text().trim();

    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array in Gemini response');
    const plans = JSON.parse(match[0]);
    if (!Array.isArray(plans) || plans.length === 0) throw new Error('Empty plans array');

    // Enforce unique layout+bgStyle combos
    const seen = new Set();
    const deduped = [];
    let fallbackIdx = 0;
    for (const plan of plans) {
      const key = `${plan.layout}-${plan.bgStyle}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(plan);
      } else {
        // Find an unused fallback combo
        while (fallbackIdx < FALLBACK_LAYOUTS.length) {
          const fb = FALLBACK_LAYOUTS[fallbackIdx++];
          const fbKey = `${fb.layout}-${fb.bgStyle}`;
          if (!seen.has(fbKey)) {
            seen.add(fbKey);
            deduped.push({ ...plan, ...fb });
            break;
          }
        }
      }
    }
    return deduped.slice(0, count);
  } catch (e) {
    console.warn(`⚠️  Gemini content plan failed (${e.message}) — using deterministic fallback`);
    // Deterministic fallback: cycle through predefined combos
    const headlines = [
      `Transforma tu negocio con ${brandName}`,
      `${brandName}: La diferencia que buscabas`,
      `Resultados reales con ${brandName}`,
      `El futuro es ${brandName}`,
      `${brandName} — Calidad sin compromiso`,
      `Únete a miles que confían en ${brandName}`,
      `${brandName}: Tu mejor inversión`,
      `Descubre el poder de ${brandName}`,
      `${brandName} cambia las reglas`,
      `Con ${brandName}, todo es posible`,
    ];
    return contentTypes.slice(0, count).map((type, i) => {
      const fb = FALLBACK_LAYOUTS[i % FALLBACK_LAYOUTS.length];
      return {
        type,
        layout: fb.layout,
        bgStyle: fb.bgStyle,
        headline: headlines[i % headlines.length],
        subheadline: `Soluciones profesionales para tu empresa`,
        body: `${brandDesc || brandName} — diseñado para resultados excepcionales.`,
        cta: 'Contáctanos hoy',
        visual_concept: `Professional ${type} graphic with ${fb.bgStyle} background for ${brandName}`,
        copy_angle: fb.copy_angle,
        composition_note: fb.composition_note,
      };
    });
  }
}

// ── Content Grid endpoint — Gemini plans + BrandGraphic renders ───────────────
app.post('/api/render/content-grid', async (req, res) => {
  const { clientId, count: reqCount, contentTypes = ['post'], tone = 'Profesional', creativity = 80, context: campaignContext } = req.body;
  if (!clientId) return res.status(400).json({ success: false, error: 'clientId required' });

  const count = Math.min(15, Math.max(1, reqCount || contentTypes.length || 1));

  try {
    // Load brand
    const clientDir = path.join(CLIENTS_DIR, clientId);
    const brandFile = path.join(clientDir, 'brand.json');
    let brand = null;
    if (fs.existsSync(brandFile)) {
      try { brand = JSON.parse(fs.readFileSync(brandFile, 'utf8')); } catch (_) {}
    }

    const keys = loadApiKeys();
    const geminiKey = keys.GEMINI_API_KEY;
    if (!geminiKey) return res.status(400).json({ success: false, error: 'GEMINI_API_KEY not configured' });

    // Get content plan from Gemini
    const plans = await generateContentPlanWithGemini({
      brandName: brand?.displayName || clientId,
      brandDesc: brand?.description || '',
      count,
      contentTypes,
      tone,
      context: campaignContext,
      creativity,
      geminiApiKey: geminiKey,
    });

    // Render each plan using BrandGraphic
    const serveUrl = await getBundle();
    const comps = await getCachedCompositions(serveUrl);
    const comp  = comps.find(c => c.id === 'BrandGraphic');
    if (!comp) return res.status(500).json({ success: false, error: 'BrandGraphic composition not found' });

    const brandObj = brand ? {
      clientId: brand.clientId || clientId,
      displayName: brand.displayName,
      colors: brand.colors,
      fonts: brand.fonts || { display: 'Impact', body: 'system-ui' },
      gradient: brand.gradient || '#f97316',
    } : null;

    const logoFile = path.join(PUB_CLIENTS, clientId, 'logo.png');
    const logoUrl  = fs.existsSync(logoFile) ? `/clients/${clientId}/logo.png` : null;

    const items = [];
    const timestamp = Date.now();

    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      const typeMap = { post: { w: 1080, h: 1080 }, story: { w: 1080, h: 1920 }, banner: { w: 1920, h: 1080 }, quote: { w: 1080, h: 1080 }, stats: { w: 1080, h: 1080 } };
      const { w, h } = typeMap[plan.type] || typeMap.post;

      const graphicProps = {
        type: plan.type,
        bgStyle: plan.bgStyle,
        layout: plan.layout,
        headline: plan.headline,
        subheadline: plan.subheadline,
        body: plan.body,
        cta: plan.cta,
        stats: [],
        quoteAuthor: '',
        imageUrl: null,
        logoUrl,
        animated: false,
        brand: brandObj,
      };

      const oc = { ...comp, width: w, height: h, durationInFrames: 1, fps: 30, defaultProps: graphicProps, props: graphicProps };
      const fname = `grid-${clientId}-${timestamp}-${i + 1}.png`;
      const outPath = path.join(GRAPHICS_DIR, fname);

      try {
        await renderStill({ composition: oc, serveUrl, output: outPath, inputProps: graphicProps, imageFormat: 'png', chromiumOptions: { headless: true, disableWebSecurity: true }, ...(BROWSER_EXECUTABLE ? { browserExecutable: BROWSER_EXECUTABLE } : {}) });
        items.push({ label: `${plan.layout}-${plan.bgStyle}`, url: `/graphics/${fname}`, plan });
      } catch (e) {
        console.warn(`⚠️  Content grid render ${i + 1} failed:`, e.message);
        items.push({ label: `${plan.layout}-${plan.bgStyle}`, url: null, plan, error: e.message });
      }
    }

    res.json({ success: true, items });
  } catch (e) {
    console.error('Content grid error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Render debug ─────────────────────────────────────────────────────────────
app.get('/api/render/debug/:jobId', (req, res) => {
  const framesDir = path.join(__dirname, '.tmp', req.params.jobId, 'frames');
  if (!fs.existsSync(framesDir)) return res.json({ exists: false });
  const frames = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpeg'));
  res.json({ exists: true, frameCount: frames.length, first: frames[0], last: frames[frames.length - 1] });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log(`\n🎬  Digitals Creative Powerhouse v2`);
  console.log(`   Studio: http://localhost:${PORT}`);
  console.log(`   Clients: ${CLIENTS_DIR}`);
  console.log(`   Renders: ${RENDERS_DIR}`);
  console.log(`   ffmpeg: ${FFMPEG}\n`);

  // Pre-warm Remotion bundle so first render doesn't wait ~30s
  setTimeout(() => {
    console.log("⚙️  Pre-warming Remotion bundle...");
    getBundle()
      .then(() => console.log("✅ Remotion bundle ready — first render will be fast"))
      .catch(e => console.warn("⚠️  Bundle pre-warm failed:", e.message));
  }, 2000);
});
