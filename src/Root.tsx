import "./index.css";
import React from "react";
import { Composition } from "remotion";
import { MyComposition } from "./Composition";
import { HapeeVideo } from "./HapeeVideo";
import { ClientVideo as ClientVideoComponent, type ClientVideoProps, type AspectRatio, type TransitionType } from "./ClientVideo";
import { BrandGraphic as BrandGraphicComponent, type BrandGraphicProps } from "./BrandGraphic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BrandGraphic = BrandGraphicComponent as React.ComponentType<any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ClientVideo = ClientVideoComponent as React.ComponentType<any>;

// ─── Default hapee brand for Studio preview ───────────────────────────────────
const hapeeBrand = {
  clientId: "hapee",
  displayName: "Hapee",
  colors: {
    primary: "#FA5000",
    secondary: "#CD2349",
    background: "#FFFFFF",
    bgAlt: "#F5F5F5",
    bgSoft: "#FAFAFA",
    heading: "#111111",
    body: "#444444",
    muted: "#888888",
    card: "#FFFFFF",
    border: "rgba(0,0,0,0.1)",
  },
  fonts: {
    display: "'Bebas Neue', Impact, sans-serif",
    body: "'Plus Jakarta Sans', system-ui, sans-serif",
  },
  gradient: "linear-gradient(135deg, #FA5000 0%, #CD2349 100%)",
};

const defaultScenes = [
  {
    type: "hook" as const,
    title: "¿Te pasa esto?",
    subtitle: "Hay una solución.",
    painPoints: [
      { emoji: "😤", text: "Leads sin respuesta" },
      { emoji: "🌙", text: "Ventas perdidas de noche" },
      { emoji: "😩", text: "Equipo saturado" },
    ],
  },
  {
    type: "brand" as const,
    title: "Hapee | lo cambia todo",
    subtitle: "La plataforma all-in-one para tu negocio.",
    badge: "Plataforma IA Certificada",
    items: ["24/7", "3x ROI", "100% Auto"],
  },
  {
    type: "feature" as const,
    title: "Chat IA 24/7",
    subtitle: "Hapee en acción",
    badge: "⚡ Automatización",
    items: ["Respuesta en <1s", "Sin configuración", "Multi-idioma"],
  },
  {
    type: "feature" as const,
    title: "Analytics Real-time",
    subtitle: "Decisiones más rápidas",
    badge: "📊 Datos",
    items: ["Dashboard en vivo", "Alertas automáticas", "Reportes IA"],
  },
  {
    type: "cta" as const,
    title: "Empieza Hoy. |Gratis.",
    subtitle: "Sin compromisos. Cancela cuando quieras.",
    badge: "Comenzar Gratis",
    items: ["hapee.ai", "¡Sin tarjeta de crédito!"],
  },
];

// ─── Format dimensions ────────────────────────────────────────────────────────
function getDimensions(format: AspectRatio): { width: number; height: number } {
  if (format === "16:9") return { width: 1920, height: 1080 };
  if (format === "1:1")  return { width: 1080, height: 1080 };
  return { width: 1080, height: 1920 }; // 9:16 default
}

export const RemotionRoot: React.FC = () => {
  // Preview formats
  const formats: AspectRatio[] = ["9:16", "16:9", "1:1"];
  const transitions: TransitionType[] = ["zoom-in", "fade", "slide-left", "blur", "glitch"];
  const durations = [15, 21, 30, 45, 60];

  return (
    <>
      {/* Original test */}
      <Composition
        id="MyComp"
        component={MyComposition}
        durationInFrames={150}
        fps={30}
        width={1280}
        height={720}
      />

      {/* Hapee brand demo — vertical */}
      <Composition
        id="HapeeDemo"
        component={HapeeVideo}
        durationInFrames={630}
        fps={30}
        width={1080}
        height={1920}
      />

      {/* ClientVideo — all format/duration/transition combinations for Studio preview */}
      {formats.map(format => {
        const dims = getDimensions(format);

        return durations.map(dur =>
          transitions.map(trans => (
            <Composition
              key={`ClientVideo-${format.replace(":", "x")}-${dur}-${trans}`}
              id={`ClientVideo-${format.replace(":", "x")}-${dur}-${trans}`}
              component={ClientVideo}
              durationInFrames={dur * 30}
              fps={30}
              width={dims.width}
              height={dims.height}
              defaultProps={{
                brand: hapeeBrand,
                scenes: defaultScenes,
                hasVoiceover: false,
                hasSfxCta: false,
                hasBgm: false,
                format,
                durationSeconds: dur,
                transition: trans,
              } satisfies ClientVideoProps}
            />
          ))
        );
      })}

      {/* Generic ClientVideo composition — props injected via inputProps at render time */}
      <Composition
        id="ClientVideo"
        component={ClientVideo}
        durationInFrames={630}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          brand: {
            clientId: "preview",
            displayName: "Your Brand",
            colors: {
              primary: "#3B82F6",
              secondary: "#8B5CF6",
              background: "#0f172a",
              bgAlt: "#1e293b",
              bgSoft: "#0f172a",
              heading: "#f8fafc",
              body: "#cbd5e1",
              muted: "#64748b",
              card: "#1e293b",
              border: "rgba(255,255,255,0.1)",
            },
            fonts: { display: "Impact, sans-serif", body: "system-ui, sans-serif" },
            gradient: "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)",
          },
          scenes: defaultScenes,
          hasVoiceover: false,
          hasSfxCta: false,
          hasBgm: false,
          format: "9:16" as AspectRatio,
          durationSeconds: 21,
          transition: "zoom-in" as TransitionType,
        } satisfies ClientVideoProps}
      />

      {/* BrandGraphic — used by renderStill for PNG graphics */}
      <Composition
        id="BrandGraphic"
        component={BrandGraphic}
        durationInFrames={60}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={{
          type: "post",
          bgStyle: "dark",
          headline: "Tu Marca Aquí",
          brand: {
            clientId: "preview",
            displayName: "Preview",
            colors: { primary: "#f97316", secondary: "#ec4899", background: "#0f172a", heading: "#f8fafc", body: "#cbd5e1", muted: "#64748b" },
            fonts: { display: "Impact, sans-serif", body: "system-ui, sans-serif" },
            gradient: "linear-gradient(135deg,#f97316,#ec4899)",
          },
        } satisfies BrandGraphicProps}
      />
    </>
  );
};
