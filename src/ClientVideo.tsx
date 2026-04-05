/**
 * ClientVideo.tsx  v2
 * Multi-format (9:16 / 16:9 / 1:1), dynamic duration, transition library.
 * Brand tokens injected at render time from brand-identity.json.
 */
import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
  Img,
  staticFile,
  Audio,
} from "remotion";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface BrandIdentity {
  clientId: string;
  displayName: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    bgAlt: string;
    bgSoft: string;
    heading: string;
    body: string;
    muted: string;
    card: string;
    border: string;
  };
  fonts: {
    display: string;
    body: string;
  };
  gradient: string;
}

export type AspectRatio = "9:16" | "16:9" | "1:1";
export type TransitionType =
  | "fade" | "zoom-in" | "zoom-out"
  | "slide-left" | "slide-right" | "slide-up"
  | "blur" | "glitch" | "wipe" | "bounce";

export interface SceneData {
  type: "hook" | "brand" | "feature" | "cta";
  title?: string;
  subtitle?: string;
  badge?: string;
  items?: string[];
  painPoints?: Array<{ emoji: string; text: string }>;
  voiceover?: string;
}

export interface ClientVideoProps {
  brand: BrandIdentity;
  scenes: SceneData[];
  hasVoiceover?: boolean;
  hasSfxCta?: boolean;
  hasBgm?: boolean;
  format?: AspectRatio;
  durationSeconds?: number;
  transition?: TransitionType;
  /** AI-generated image URLs (one per scene, from /assets/scenes/{jobId}/scene-{i}.jpg) */
  sceneImageUrls?: (string | null)[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Returns a 0→1→0 opacity envelope over the full scene */
const sceneFade = (frame: number, total: number) =>
  Math.min(clamp(frame / 14), clamp((total - frame) / 14));

/** Build the transition in/out transform based on type */
function transitionTransform(
  frame: number,
  totalFrames: number,
  type: TransitionType
): string {
  const pIn  = clamp(frame / 18);
  const pOut = clamp((totalFrames - frame) / 18);

  switch (type) {
    case "zoom-in":
      return `scale(${0.88 + pIn * 0.12})`;
    case "zoom-out":
      return `scale(${1 + (1 - pOut) * 0.10})`;
    case "slide-left":
      return `translateX(${(1 - pIn) * -60}px)`;
    case "slide-right":
      return `translateX(${(1 - pIn) * 60}px)`;
    case "slide-up":
      return `translateY(${(1 - pIn) * 50}px)`;
    case "bounce": {
      const s = spring({ fps: 30, frame, config: { damping: 10, stiffness: 100 }, durationInFrames: 28 });
      return `scale(${s})`;
    }
    default:
      return "none";
  }
}

function transitionFilter(frame: number, totalFrames: number, type: TransitionType): string {
  if (type === "blur") {
    const pIn  = clamp(frame / 18);
    const pOut = clamp((totalFrames - frame) / 18);
    const blur = (1 - Math.min(pIn, pOut)) * 14;
    return `blur(${blur}px)`;
  }
  if (type === "glitch") {
    const noise = Math.sin(frame * 23.7) * (frame < 12 ? 2 : frame > totalFrames - 12 ? 2 : 0);
    return `hue-rotate(${noise * 30}deg) saturate(${1 + Math.abs(noise) * 0.5})`;
  }
  // Subtle motion blur on fast transitions (first 6 and last 6 frames)
  const isEntering = frame < 6;
  const isExiting  = frame > totalFrames - 6;
  if ((type === "zoom-in" || type === "slide-left" || type === "slide-up") && (isEntering || isExiting)) {
    const strength = isEntering ? (6 - frame) * 0.6 : (frame - (totalFrames - 6)) * 0.6;
    return `blur(${Math.min(strength, 3)}px)`;
  }
  return "none";
}

/** Subtle camera shake — makes the video "breathe" and feel cinematic */
function cameraShake(frame: number, intensity: number = 1): string {
  const x = (Math.sin(frame * 0.73) * 1.8 + Math.cos(frame * 1.17) * 1.1) * intensity;
  const y = (Math.cos(frame * 0.61) * 1.4 + Math.sin(frame * 0.89) * 0.9) * intensity;
  return `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
}

// ─── Particle Field ───────────────────────────────────────────────────────────
const ParticleField: React.FC<{ primary: string; secondary: string; count?: number }> = ({
  primary, secondary, count = 32,
}) => {
  const frame = useCurrentFrame();
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const px = (i * 71 + 13) % 100;
        const py = (i * 53 + 37) % 100;
        const size = (i % 3) + 1.5;
        const drift = interpolate(
          Math.sin(((frame + i * 7) * Math.PI * (0.22 + (i % 5) * 0.07)) / 60),
          [-1, 1], [-8, 8]
        );
        const twinkle = interpolate(
          Math.sin(((frame + i * 11) * Math.PI) / 50),
          [-1, 1], [0.04, 0.18]
        );
        return (
          <div key={i} style={{
            position: "absolute", left: `${px}%`, top: `${py}%`,
            width: size, height: size, borderRadius: "50%",
            background: i % 2 === 0 ? primary : secondary,
            opacity: twinkle, transform: `translateY(${drift}px)`,
          }} />
        );
      })}
    </>
  );
};

// ─── AI Scene Background ──────────────────────────────────────────────────────
const AISceneBackground: React.FC<{
  imageUrl: string;
  primaryColor: string;
  totalFrames: number;
}> = ({ imageUrl, primaryColor, totalFrames }) => {
  const frame = useCurrentFrame();
  // Slow Ken-Burns zoom + subtle camera shake for cinematic life
  const scale   = interpolate(frame, [0, totalFrames], [1.0, 1.09], { extrapolateRight: "clamp" });
  const opacity = Math.min(clamp(frame / 20), clamp((totalFrames - frame) / 20));
  const shake   = cameraShake(frame, 0.4); // very subtle

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* AI image with slow zoom + camera breathe */}
      <AbsoluteFill style={{
        transform: `scale(${scale}) ${shake}`,
        opacity,
      }}>
        <Img
          src={imageUrl}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
      {/* Dark gradient overlay so text is always readable */}
      <AbsoluteFill style={{
        background: `linear-gradient(
          to bottom,
          rgba(0,0,0,0.35) 0%,
          rgba(0,0,0,0.15) 40%,
          rgba(0,0,0,0.55) 100%
        )`,
      }} />
      {/* Brand color tint strip at bottom */}
      <AbsoluteFill style={{
        background: `linear-gradient(to top, ${primaryColor}33 0%, transparent 35%)`,
      }} />
    </AbsoluteFill>
  );
};

// ─── Scene Wrapper (applies transition + optional AI background) ──────────────
const SceneWrapper: React.FC<{
  children: React.ReactNode;
  totalFrames: number;
  transition: TransitionType;
  aiImageUrl?: string | null;
  primaryColor?: string;
}> = ({ children, totalFrames, transition, aiImageUrl, primaryColor = "#000" }) => {
  const frame = useCurrentFrame();
  const opacity = transition === "fade" || transition === "wipe"
    ? sceneFade(frame, totalFrames)
    : clamp(frame / 12);

  return (
    <AbsoluteFill style={{
      opacity,
      transform: transitionTransform(frame, totalFrames, transition),
      filter: transitionFilter(frame, totalFrames, transition),
    }}>
      {/* AI-generated background image if available */}
      {aiImageUrl && (
        <AISceneBackground
          imageUrl={aiImageUrl}
          primaryColor={primaryColor}
          totalFrames={totalFrames}
        />
      )}
      {/* Scene content on top */}
      {children}
    </AbsoluteFill>
  );
};

// ─── Layout helpers per format ────────────────────────────────────────────────
function getLayout(format: AspectRatio) {
  if (format === "16:9") return {
    padding:    "0 120px",
    titleSize:  72,
    bodySize:   28,
    badgeSize:  18,
    logoW:      260,
    phoneW:     340,
    phoneH:     212,
    isLandscape: true,
    isSquare:    false,
  };
  if (format === "1:1") return {
    padding:    "0 80px",
    titleSize:  64,
    bodySize:   26,
    badgeSize:  18,
    logoW:      220,
    phoneW:     270,
    phoneH:     270,
    isLandscape: false,
    isSquare:    true,
  };
  // 9:16 (default)
  return {
    padding:    "0 80px",
    titleSize:  80,
    bodySize:   30,
    badgeSize:  22,
    logoW:      280,
    phoneW:     260,
    phoneH:     520,
    isLandscape: false,
    isSquare:    false,
  };
}

// ─── HOOK Scene ───────────────────────────────────────────────────────────────
const HookScene: React.FC<{
  brand: BrandIdentity; scene: SceneData; format: AspectRatio;
}> = ({ brand, scene, format }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = getLayout(format);
  const { colors, fonts } = brand;

  const painPoints = scene.painPoints ?? [
    { emoji: "😤", text: "Leads sin respuesta" },
    { emoji: "🌙", text: "Ventas perdidas de noche" },
    { emoji: "😩", text: "Equipo saturado" },
  ];

  const springs = painPoints.map((_, i) =>
    spring({ fps, frame: frame - i * 16, config: { damping: 14, stiffness: 120 }, durationInFrames: 26 })
  );
  const s4 = spring({ fps, frame: frame - painPoints.length * 16, config: { damping: 13, stiffness: 110 }, durationInFrames: 26 });

  return (
    <AbsoluteFill style={{ background: colors.background }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 15% 20%, ${colors.primary}0a 0%, transparent 55%), radial-gradient(ellipse at 85% 80%, ${colors.secondary}0a 0%, transparent 55%)` }} />
      <ParticleField primary={colors.primary} secondary={colors.secondary} />
      <AbsoluteFill style={{
        display: "flex", flexDirection: L.isLandscape ? "row" : "column",
        alignItems: "center", justifyContent: "center",
        padding: L.padding, gap: L.isLandscape ? 40 : 20,
      }}>
        <div style={{ opacity: clamp(frame / 14), background: `${colors.primary}12`, border: `1.5px solid ${colors.primary}30`, borderRadius: 40, padding: "10px 28px", fontSize: L.badgeSize, color: colors.primary, fontWeight: 700, fontFamily: fonts.body, textTransform: "uppercase", letterSpacing: 3, flexShrink: 0 }}>
          {scene.title ?? "¿Te pasa esto?"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: L.isLandscape ? 14 : 18, width: L.isLandscape ? "50%" : "100%" }}>
          {painPoints.map(({ emoji, text }, i) => (
            <div key={i} style={{ transform: `scale(${springs[i]})`, display: "flex", alignItems: "center", gap: 14, background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: "16px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <span style={{ fontSize: L.isLandscape ? 28 : 34 }}>{emoji}</span>
              <span style={{ fontSize: L.isLandscape ? 26 : 32, color: colors.heading, fontWeight: 700, fontFamily: fonts.body }}>{text}</span>
            </div>
          ))}
          <div style={{ transform: `scale(${s4})`, fontSize: L.isLandscape ? 52 : 58, fontWeight: 900, textAlign: "center", fontFamily: fonts.display, background: brand.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: 1, marginTop: 4 }}>
            {scene.subtitle ?? "Hay una solución."}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── BRAND Scene ──────────────────────────────────────────────────────────────
const BrandScene: React.FC<{
  brand: BrandIdentity; scene: SceneData; format: AspectRatio;
}> = ({ brand, scene, format }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = getLayout(format);
  const { colors, fonts } = brand;

  const logoScale = spring({ fps, frame, config: { damping: 11, stiffness: 80 }, durationInFrames: 44 });
  const tagOp  = interpolate(frame, [30, 52], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tagY   = interpolate(frame, [30, 52], [24, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const subOp  = interpolate(frame, [52, 72], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const statOp = interpolate(frame, [68, 88], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: colors.background }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 44%, ${colors.primary}0b 0%, ${colors.secondary}08 45%, transparent 70%)` }} />
      <ParticleField primary={colors.primary} secondary={colors.secondary} />
      <AbsoluteFill style={{
        display: "flex",
        flexDirection: L.isLandscape ? "row" : "column",
        alignItems: "center",
        justifyContent: "center",
        gap: L.isLandscape ? 60 : 18,
        padding: L.padding,
      }}>
        {/* Logo + badge */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={{ transform: `scale(${logoScale})` }}>
            <Img src={staticFile(`clients/${brand.clientId}/logo.png`)} style={{ width: L.logoW, height: "auto", objectFit: "contain" }} />
          </div>
          <div style={{ opacity: interpolate(frame, [14, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), background: brand.gradient, borderRadius: 30, padding: "8px 22px", fontSize: L.badgeSize, color: "#fff", fontFamily: fonts.body, letterSpacing: 2, fontWeight: 700 }}>
            {scene.badge ?? "Plataforma IA Certificada"}
          </div>
        </div>
        {/* Text block */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: L.isLandscape ? "flex-start" : "center", gap: 12 }}>
          <div style={{ opacity: tagOp, transform: `translateY(${tagY}px)`, fontSize: L.titleSize * 0.62, fontWeight: 900, color: colors.heading, textAlign: L.isLandscape ? "left" : "center", fontFamily: fonts.display, letterSpacing: 1, lineHeight: 1.2 }}>
            {scene.title?.split("|")[0]}
            {scene.title?.includes("|") && (
              <span style={{ background: brand.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                {" "}{scene.title.split("|")[1]}
              </span>
            )}
          </div>
          <div style={{ opacity: subOp, fontSize: L.bodySize, color: colors.muted, textAlign: L.isLandscape ? "left" : "center", fontFamily: fonts.body, lineHeight: 1.4 }}>
            {scene.subtitle}
          </div>
          <div style={{ opacity: statOp, display: "flex", gap: 14, flexWrap: "wrap", justifyContent: L.isLandscape ? "flex-start" : "center" }}>
            {(scene.items ?? ["24/7", "3x ventas", "0 tareas"]).map((stat, i) => {
              const [val, label] = stat.split(":");
              return (
                <div key={i} style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 18, padding: "12px 18px", textAlign: "center" }}>
                  <div style={{ fontSize: L.titleSize * 0.42, fontWeight: 900, fontFamily: fonts.display, background: brand.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{val}</div>
                  {label && <div style={{ fontSize: 13, color: colors.muted, fontFamily: fonts.body, marginTop: 2 }}>{label}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── FEATURE Scene ────────────────────────────────────────────────────────────
const FeatureScene: React.FC<{
  brand: BrandIdentity; scene: SceneData; index: number; format: AspectRatio;
}> = ({ brand, scene, index, format }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = getLayout(format);
  const { colors, fonts } = brand;
  const accent = index % 2 === 0 ? colors.primary : colors.secondary;

  const headerOp  = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  const headerY   = interpolate(frame, [0, 18], [20, 0], { extrapolateRight: "clamp" });
  const phoneScl  = spring({ fps, frame: frame - 8, config: { damping: 13, stiffness: 88 }, durationInFrames: 40 });
  const phoneFloat = interpolate(Math.sin((frame * Math.PI) / 48), [-1, 1], [-5, 5]);

  return (
    <AbsoluteFill style={{ background: colors.bgAlt }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 80% 20%, ${accent}0d 0%, transparent 50%)` }} />
      <ParticleField primary={colors.primary} secondary={colors.secondary} />
      <AbsoluteFill style={{
        display: "flex",
        flexDirection: L.isLandscape ? "row" : "column",
        alignItems: "center",
        justifyContent: "center",
        padding: L.padding,
        gap: L.isLandscape ? 60 : 0,
        paddingTop: L.isLandscape ? 0 : 120,
      }}>
        {/* Text */}
        <div style={{ opacity: headerOp, transform: `translateY(${headerY}px)`, textAlign: L.isLandscape ? "left" : "center", marginBottom: L.isLandscape ? 0 : 22, flex: L.isLandscape ? 1 : undefined }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: `${accent}12`, border: `1.5px solid ${accent}35`, borderRadius: 30, padding: "7px 18px", marginBottom: 10 }}>
            <span style={{ fontSize: 18 }}>{scene.badge?.split(" ")[0]}</span>
            <span style={{ fontSize: 18, color: accent, fontFamily: fonts.body, fontWeight: 700 }}>{scene.badge?.split(" ").slice(1).join(" ")}</span>
          </div>
          <div style={{ fontSize: L.isLandscape ? L.titleSize * 0.7 : L.titleSize * 0.75, fontWeight: 900, color: colors.heading, fontFamily: fonts.display, letterSpacing: 1, lineHeight: 1.05 }}>{scene.title}</div>
          <div style={{ fontSize: L.bodySize, color: accent, fontFamily: fonts.body, fontWeight: 700, marginTop: 4 }}>{scene.subtitle}</div>
        </div>

        {/* Mockup */}
        <div style={{ transform: `scale(${phoneScl}) translateY(${phoneFloat}px)` }}>
          <div style={{
            width: L.phoneW, height: L.phoneH,
            borderRadius: L.isSquare ? 20 : 36,
            border: `2px solid ${colors.border}`,
            background: colors.bgSoft,
            boxShadow: `0 0 0 4px rgba(0,0,0,0.03), 0 24px 60px rgba(0,0,0,0.14), 0 0 40px ${accent}0d`,
            position: "relative", overflow: "hidden",
          }}>
            {!L.isLandscape && (
              <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", width: 70, height: 18, borderRadius: 9, background: "#e5e7eb", zIndex: 10 }} />
            )}
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: L.isLandscape ? "16px" : "44px 14px 14px", gap: 8 }}>
              {(scene.items ?? []).map((item, i) => {
                const iOp = interpolate(frame, [28 + i * 10, 44 + i * 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
                return (
                  <div key={i} style={{ opacity: iOp, width: "100%", background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 10, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: accent, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: colors.body, fontFamily: fonts.body, fontWeight: 600 }}>{item}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── CTA Scene ────────────────────────────────────────────────────────────────
const CTAScene: React.FC<{
  brand: BrandIdentity; scene: SceneData; format: AspectRatio;
}> = ({ brand, scene, format }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = getLayout(format);
  const { colors, fonts } = brand;

  const titleScale = spring({ fps, frame, config: { damping: 11, stiffness: 100 }, durationInFrames: 34 });
  const btnScale   = spring({ fps, frame: frame - 20, config: { damping: 9, stiffness: 120 }, durationInFrames: 28 });
  const btnPulse   = interpolate(Math.sin((frame * Math.PI) / 18), [-1, 1], [1, 1.04]);
  const logoOp     = interpolate(frame, [6, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const urlOp      = interpolate(frame, [34, 52], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: colors.background }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 50%, ${colors.primary}09 0%, ${colors.secondary}06 45%, transparent 70%)` }} />
      <ParticleField primary={colors.primary} secondary={colors.secondary} />
      <AbsoluteFill style={{
        display: "flex", flexDirection: L.isLandscape ? "row" : "column",
        alignItems: "center", justifyContent: "center",
        gap: L.isLandscape ? 60 : 24,
        padding: L.padding,
      }}>
        {/* Logo */}
        <div style={{ opacity: logoOp }}>
          <Img src={staticFile(`clients/${brand.clientId}/logo.png`)} style={{ width: L.logoW * 0.75, height: "auto", objectFit: "contain" }} />
        </div>
        {/* Text + button */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: L.isLandscape ? "flex-start" : "center", gap: L.isLandscape ? 16 : 20 }}>
          <div style={{ transform: `scale(${titleScale})`, fontSize: L.titleSize, fontWeight: 900, color: colors.heading, textAlign: L.isLandscape ? "left" : "center", lineHeight: 1.05, fontFamily: fonts.display, letterSpacing: 1 }}>
            {(scene.title ?? "Empieza Hoy. |Gratis.").split("|")[0]}
            <span style={{ background: brand.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {(scene.title ?? "Empieza Hoy. |Gratis.").split("|")[1] ?? ""}
            </span>
          </div>
          <div style={{ opacity: interpolate(frame, [16, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), fontSize: L.bodySize, color: colors.body, textAlign: L.isLandscape ? "left" : "center", fontFamily: fonts.body, lineHeight: 1.5 }}>
            {scene.subtitle}
          </div>
          <div style={{ transform: `scale(${Math.min(btnScale, 1) * btnPulse})`, background: brand.gradient, borderRadius: 60, padding: L.isLandscape ? "20px 56px" : "24px 64px", fontSize: L.isLandscape ? 34 : 38, fontWeight: 800, color: "#fff", fontFamily: fonts.body, boxShadow: `0 10px 36px ${colors.primary}55, 0 4px 10px ${colors.secondary}44`, alignSelf: L.isLandscape ? "flex-start" : "center" }}>
            {scene.badge ?? "Comenzar Gratis"}
          </div>
          <div style={{ opacity: urlOp, fontSize: L.bodySize * 0.85, color: colors.muted, fontFamily: fonts.body, letterSpacing: 1 }}>
            {scene.items?.[0] ?? ""}
          </div>
          <div style={{ opacity: interpolate(frame, [48, 62], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), fontSize: L.bodySize * 0.7, color: colors.muted, fontFamily: fonts.body }}>
            {scene.items?.[1] ?? ""}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── Animated Logo Outro (last 1.5s of every video) ──────────────────────────
const LogoOutro: React.FC<{
  brand: BrandIdentity;
  format: AspectRatio;
  durationFrames: number; // total frames of this sequence (45 = 1.5s)
}> = ({ brand, format, durationFrames }) => {
  const frame = useCurrentFrame();
  const { colors, fonts } = brand;
  const L = getLayout(format);

  // Background flash → settle
  const bgOpacity  = clamp(frame / 8);
  // Logo scale spring
  const logoScale  = spring({ fps: 30, frame, config: { damping: 12, stiffness: 120 }, durationInFrames: 25 });
  // Brand name fade + slide up
  const nameOpacity = clamp((frame - 8) / 14);
  const nameY       = interpolate(frame, [8, 22], [30, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Tagline appears after name
  const tagOpacity  = clamp((frame - 18) / 10);
  // Pulse ring
  const ringScale   = interpolate(frame, [0, durationFrames], [0.8, 1.6], { extrapolateRight: "clamp" });
  const ringOpacity = interpolate(frame, [0, durationFrames * 0.7, durationFrames], [0.6, 0.15, 0], { extrapolateRight: "clamp" });

  const logoSrc = `clients/${brand.clientId}/logo.png`;

  return (
    <AbsoluteFill style={{ opacity: bgOpacity, background: colors.background, alignItems: "center", justifyContent: "center" }}>
      {/* Animated gradient radial glow */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 50%, ${colors.primary}30 0%, transparent 65%)` }} />
      {/* Expanding pulse ring */}
      <div style={{
        position: "absolute", width: L.logoW * 1.6, height: L.logoW * 1.6, borderRadius: "50%",
        border: `2px solid ${colors.primary}`, transform: `scale(${ringScale})`, opacity: ringOpacity,
      }} />
      {/* Logo */}
      <div style={{ transform: `scale(${logoScale})`, marginBottom: 20 }}>
        <Img src={staticFile(logoSrc)} style={{ width: L.logoW, height: "auto", objectFit: "contain", maxHeight: 120 }} />
      </div>
      {/* Brand name */}
      <div style={{
        opacity: nameOpacity, transform: `translateY(${nameY}px)`,
        fontSize: L.titleSize * 0.55, fontWeight: 900, fontFamily: fonts.display,
        background: brand.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        letterSpacing: 2, textAlign: "center",
      }}>
        {brand.displayName}
      </div>
      {/* Tagline */}
      <div style={{
        opacity: tagOpacity, fontSize: L.bodySize * 0.65, color: colors.muted,
        fontFamily: fonts.body, marginTop: 8, letterSpacing: 1, textAlign: "center",
      }}>
        {brand.website?.replace(/^https?:\/\/(www\.)?/, '') || ''}
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT: ClientVideo
// ═══════════════════════════════════════════════════════════════════════════════
export const ClientVideo: React.FC<ClientVideoProps> = ({
  brand,
  scenes,
  hasVoiceover    = false,
  hasSfxCta       = false,
  hasBgm          = false,
  format          = "9:16",
  durationSeconds = 21,
  transition      = "zoom-in",
  sceneImageUrls  = [],
}) => {
  const fps         = 30;
  const OUTRO_FRAMES = 45; // 1.5s logo outro
  const totalFrames = durationSeconds * fps;
  const contentFrames = totalFrames - OUTRO_FRAMES; // scene content fits before outro
  const n           = scenes.length;

  // Distribute frames evenly across content (excluding outro)
  const sceneFrames: number[] = Array.from({ length: n }, (_, i) => {
    const equal = Math.floor(contentFrames / n);
    return i < n - 1 ? equal : contentFrames - equal * (n - 1);
  });

  // Cumulative start offsets
  const starts = sceneFrames.reduce<number[]>((acc, dur, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + sceneFrames[i - 1]);
    return acc;
  }, []);

  // CTA scene start (last scene) for SFX placement
  const ctaStart = starts[n - 1] ?? 0;

  return (
    <AbsoluteFill style={{ background: brand.colors.background }}>

      {hasBgm && (
        <Audio src={staticFile("background-music.mp3")} volume={0.20} />
      )}

      {hasVoiceover && (
        <Audio src={staticFile("audio/narration.mp3")} volume={1.0} />
      )}

      {hasSfxCta && (
        <Sequence from={ctaStart} durationInFrames={sceneFrames[n - 1] ?? 75} layout="none">
          <Audio src={staticFile("audio/sfx-cta.mp3")} volume={2.5} />
        </Sequence>
      )}

      {scenes.map((scene, i) => {
        const aiUrl = sceneImageUrls[i] ?? null;
        // When AI image present, scenes use transparent backgrounds so image shows through
        const sceneBrand = aiUrl
          ? {
              ...brand,
              colors: {
                ...brand.colors,
                background: "transparent",
                bgAlt:      "transparent",
                bgSoft:     "transparent",
                card:       "rgba(0,0,0,0.45)",
                border:     "rgba(255,255,255,0.15)",
                heading:    "#ffffff",
                body:       "#f0f0f0",
                muted:      "rgba(255,255,255,0.7)",
              },
            }
          : brand;

        return (
          <Sequence key={i} from={starts[i]} durationInFrames={sceneFrames[i]} layout="none">
            <SceneWrapper
              totalFrames={sceneFrames[i]}
              transition={transition}
              aiImageUrl={aiUrl || null}
              primaryColor={brand.colors.primary}
            >
              {scene.type === "hook"    && <HookScene    brand={sceneBrand} scene={scene} format={format} />}
              {scene.type === "brand"   && <BrandScene   brand={sceneBrand} scene={scene} format={format} />}
              {scene.type === "feature" && <FeatureScene brand={sceneBrand} scene={scene} index={i} format={format} />}
              {scene.type === "cta"     && <CTAScene     brand={sceneBrand} scene={scene} format={format} />}
            </SceneWrapper>
          </Sequence>
        );
      })}

      {/* Animated logo outro — always last 1.5s */}
      <Sequence from={contentFrames} durationInFrames={OUTRO_FRAMES}>
        <LogoOutro brand={brand} format={format} durationFrames={OUTRO_FRAMES} />
      </Sequence>
    </AbsoluteFill>
  );
};
