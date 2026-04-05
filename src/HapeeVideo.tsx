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

// ─── Brand tokens — Light mode ────────────────────────────────────────────────
const ORANGE    = "#FA5000";
const PINK      = "#CD2349";
const BG        = "#FFFFFF";
const BG_ALT    = "#F5F3F0";
const BG_SOFT   = "#F8FAFC";
const HEADING   = "#1a1a1a";
const BODY      = "#4a4a4a";
const MUTED     = "#777e8f";
const CARD      = "#FFFFFF";
const BORDER    = "rgba(0,0,0,0.09)";
const GRAD      = `linear-gradient(135deg, ${ORANGE} 0%, ${PINK} 100%)`;

const FONT_DISPLAY = "'Bebas Neue', 'Impact', sans-serif";
const FONT_BODY    = "'Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', sans-serif";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const sceneFade = (frame: number, total: number) =>
  Math.min(clamp(frame / 16), clamp((total - frame) / 16));

// ─── Shared: Soft particle field (light) ─────────────────────────────────────
const ParticleField: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      {Array.from({ length: 38 }).map((_, i) => {
        const px     = (i * 71 + 13) % 100;
        const py     = (i * 53 + 37) % 100;
        const size   = (i % 3) + 1.5;
        const speed  = 0.22 + (i % 5) * 0.07;
        const drift  = interpolate(
          Math.sin(((frame + i * 7) * Math.PI * speed) / 60),
          [-1, 1], [-10, 10]
        );
        const twinkle = interpolate(
          Math.sin(((frame + i * 11) * Math.PI) / 50),
          [-1, 1], [0.04, 0.22]
        );
        return (
          <div key={i} style={{
            position: "absolute",
            left: `${px}%`, top: `${py}%`,
            width: size, height: size,
            borderRadius: "50%",
            background: i % 2 === 0 ? ORANGE : PINK,
            opacity: twinkle,
            transform: `translateY(${drift}px)`,
          }} />
        );
      })}
    </>
  );
};

// ─── Shared: Soft glow orb (light-friendly) ───────────────────────────────────
const GlowOrb: React.FC<{
  x: string; y: string; size: number; color: string; delay?: number;
}> = ({ x, y, size, color, delay = 0 }) => {
  const frame = useCurrentFrame();
  const pulse = interpolate(
    Math.sin(((frame + delay) * Math.PI) / 45),
    [-1, 1], [0.9, 1.1]
  );
  return (
    <div style={{
      position: "absolute",
      left: x, top: y,
      width: size, height: size,
      borderRadius: "50%",
      background: color,
      transform: `translate(-50%,-50%) scale(${pulse})`,
      filter: "blur(90px)",
      opacity: 0.18,
    }} />
  );
};

// ─── Shared: Logo ─────────────────────────────────────────────────────────────
const HapeeLogo: React.FC<{ width?: number; style?: React.CSSProperties }> = ({
  width = 220, style
}) => (
  <Img
    src={staticFile("logo-hapee.png")}
    style={{ width, height: "auto", objectFit: "contain", ...style }}
  />
);

// ─── Shared: Card ─────────────────────────────────────────────────────────────
const Card: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div style={{
    background: CARD,
    border: `1px solid ${BORDER}`,
    borderRadius: 20,
    boxShadow: "0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)",
    ...style,
  }}>
    {children}
  </div>
);

// ─── Phone Mockup ─────────────────────────────────────────────────────────────
const Phone: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    width: 300, height: 600,
    borderRadius: 44,
    border: "2px solid rgba(0,0,0,0.12)",
    background: BG_SOFT,
    position: "relative",
    overflow: "hidden",
    boxShadow: `0 0 0 6px rgba(0,0,0,0.04), 0 32px 80px rgba(0,0,0,0.18), 0 0 60px rgba(250,80,0,0.08)`,
  }}>
    {/* Notch */}
    <div style={{
      position: "absolute", top: 14, left: "50%",
      transform: "translateX(-50%)",
      width: 88, height: 22, borderRadius: 11,
      background: "#e5e7eb", zIndex: 10,
    }} />
    {/* Status bar */}
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, height: 50,
      background: "rgba(248,250,252,0.95)", zIndex: 9,
      display: "flex", alignItems: "flex-end",
      justifyContent: "space-between", padding: "0 20px 6px",
    }}>
      <span style={{ fontSize: 13, color: MUTED, fontFamily: FONT_BODY }}>9:41</span>
      <span style={{ fontSize: 13, color: MUTED, fontFamily: FONT_BODY }}>●●●</span>
    </div>
    <div style={{ position: "absolute", inset: 0 }}>{children}</div>
  </div>
);

// ─── Phone screen: AI Chat ────────────────────────────────────────────────────
const ChatScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const messages = [
    { from: "lead", text: "Hola, me interesa el plan Pro",         delay: 0  },
    { from: "ai",   text: "¡Hola! 😊 Cuéntame más sobre tu negocio y te ayudo.", delay: 18 },
    { from: "lead", text: "Tenemos 200 leads/mes sin gestión",     delay: 36 },
    { from: "ai",   text: "Perfecto. ¿Te hago una demo ahora? 🚀", delay: 54 },
  ];
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: BG_SOFT, paddingTop: 56,
      display: "flex", flexDirection: "column",
      gap: 10, padding: "56px 14px 14px",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "0 4px 10px",
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: "50%",
          background: GRAD, display: "flex",
          alignItems: "center", justifyContent: "center", fontSize: 17,
        }}>🤖</div>
        <div>
          <div style={{ fontSize: 13, color: HEADING, fontWeight: 700, fontFamily: FONT_BODY }}>
            Agente IA Hapee
          </div>
          <div style={{ fontSize: 10, color: "#16a34a", fontFamily: FONT_BODY }}>● En línea 24/7</div>
        </div>
      </div>
      {/* Messages */}
      {messages.map((m, i) => {
        const op   = clamp((frame - m.delay) / 10);
        const isAI = m.from === "ai";
        return (
          <div key={i} style={{ opacity: op, display: "flex", justifyContent: isAI ? "flex-start" : "flex-end" }}>
            <div style={{
              maxWidth: "82%", padding: "8px 12px",
              borderRadius: isAI ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
              background: isAI ? `rgba(250,80,0,0.08)` : GRAD,
              border: isAI ? `1px solid rgba(250,80,0,0.2)` : "none",
              fontSize: 11, color: isAI ? BODY : "#fff",
              fontFamily: FONT_BODY, lineHeight: 1.5,
            }}>
              {m.text}
            </div>
          </div>
        );
      })}
      {frame >= 70 && frame < 90 && (
        <div style={{ display: "flex", gap: 5, padding: "4px 8px" }}>
          {[0, 6, 12].map((d) => (
            <div key={d} style={{
              width: 7, height: 7, borderRadius: "50%", background: ORANGE,
              opacity: interpolate(Math.sin(((frame + d) * Math.PI) / 8), [-1, 1], [0.3, 1]),
            }} />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Phone screen: CRM Pipeline ───────────────────────────────────────────────
const CRMScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const cols = [
    { label: "Leads",      color: "#3b82f6", count: 24, cards: ["Ana García", "Carlos M."] },
    { label: "En proceso", color: ORANGE,    count: 11, cards: ["Sofía R."] },
    { label: "Cerrado ✓",  color: "#16a34a", count: 8,  cards: ["Luis P."] },
  ];
  return (
    <div style={{ position: "absolute", inset: 0, background: BG_ALT, paddingTop: 56, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: HEADING, fontWeight: 700, fontFamily: FONT_BODY }}>Pipeline CRM</span>
        <span style={{ fontSize: 10, background: GRAD, borderRadius: 20, padding: "3px 10px", color: "#fff", fontFamily: FONT_BODY }}>
          +12% ↑
        </span>
      </div>
      <div style={{ display: "flex", gap: 7, padding: "4px 10px", flex: 1 }}>
        {cols.map((col, ci) => (
          <div key={ci} style={{ flex: 1, opacity: clamp((frame - ci * 14) / 14), display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 9, color: col.color, fontWeight: 700, fontFamily: FONT_BODY, textAlign: "center", padding: "4px 0", borderBottom: `2px solid ${col.color}` }}>
              {col.label} <span style={{ background: `${col.color}18`, borderRadius: 8, padding: "1px 5px" }}>{col.count}</span>
            </div>
            {col.cards.map((name, ki) => (
              <div key={ki} style={{
                background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
                padding: "7px 8px",
                opacity: clamp((frame - ci * 14 - ki * 10) / 14),
                boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
              }}>
                <div style={{ fontSize: 10, color: HEADING, fontFamily: FONT_BODY, fontWeight: 600 }}>{name}</div>
                <div style={{ width: "60%", height: 3, borderRadius: 2, background: col.color, marginTop: 4, opacity: 0.7 }} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ padding: "8px 14px", display: "flex", justifyContent: "center", gap: 14, borderTop: `1px solid ${BORDER}`, background: CARD }}>
        {["$48k cerrado", "3.2x ROI", "2h resp."].map((s, i) => (
          <span key={i} style={{ fontSize: 9, color: MUTED, fontFamily: FONT_BODY, opacity: clamp((frame - 30 - i * 8) / 14) }}>{s}</span>
        ))}
      </div>
    </div>
  );
};

// ─── Phone screen: Omnichannel ────────────────────────────────────────────────
const InboxScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const channels = [
    { icon: "💬", name: "WhatsApp",  msg: "Quiero más info del plan...", time: "ahora", color: "#25d366", unread: 3 },
    { icon: "📸", name: "Instagram", msg: "Vi tu anuncio, ¿tienen...?",  time: "1m",   color: "#e1306c", unread: 1 },
    { icon: "✉️", name: "Email",     msg: "Re: Propuesta comercial",     time: "5m",   color: "#4285f4", unread: 0 },
    { icon: "💬", name: "SMS",       msg: "Cotización urgente pls",       time: "12m",  color: ORANGE,    unread: 2 },
  ];
  return (
    <div style={{ position: "absolute", inset: 0, background: BG_SOFT, paddingTop: 56, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "6px 14px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: HEADING, fontWeight: 700, fontFamily: FONT_BODY }}>Bandeja Unificada</span>
        <span style={{ fontSize: 10, color: ORANGE, fontFamily: FONT_BODY, fontWeight: 700 }}>6 nuevos</span>
      </div>
      {channels.map((ch, i) => {
        const op = clamp((frame - i * 12) / 14);
        return (
          <div key={i} style={{
            opacity: op,
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px",
            background: i === 0 ? `rgba(250,80,0,0.05)` : CARD,
            borderBottom: `1px solid ${BORDER}`,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: `${ch.color}15`, border: `1.5px solid ${ch.color}40`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, flexShrink: 0,
            }}>{ch.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: HEADING, fontWeight: 700, fontFamily: FONT_BODY }}>{ch.name}</span>
                <span style={{ fontSize: 9, color: MUTED, fontFamily: FONT_BODY }}>{ch.time}</span>
              </div>
              <div style={{ fontSize: 10, color: MUTED, fontFamily: FONT_BODY, marginTop: 2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                {ch.msg}
              </div>
            </div>
            {ch.unread > 0 && (
              <div style={{
                width: 18, height: 18, borderRadius: "50%", background: ch.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, color: "#fff", fontFamily: FONT_BODY, fontWeight: 700, flexShrink: 0,
              }}>{ch.unread}</div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 1 — Hook / Problem  (0:00 → 0:03)
// ═════════════════════════════════════════════════════════════════════════════
const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const TOTAL = 90;
  const op = sceneFade(frame, TOTAL);

  const s1 = spring({ fps, frame,       config: { damping: 15, stiffness: 120 }, durationInFrames: 28 });
  const s2 = spring({ fps, frame: frame - 18, config: { damping: 15, stiffness: 120 }, durationInFrames: 28 });
  const s3 = spring({ fps, frame: frame - 34, config: { damping: 15, stiffness: 120 }, durationInFrames: 28 });
  const s4 = spring({ fps, frame: frame - 50, config: { damping: 14, stiffness: 110 }, durationInFrames: 28 });

  const eyebrowOp = clamp(frame / 14);

  return (
    <AbsoluteFill style={{ opacity: op, background: BG }}>
      {/* Subtle tinted bg */}
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at 15% 20%, rgba(250,80,0,0.06) 0%, transparent 55%),
                     radial-gradient(ellipse at 85% 80%, rgba(205,35,73,0.06) 0%, transparent 55%)`,
      }} />
      <ParticleField />

      <AbsoluteFill style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "0 88px", gap: 24,
      }}>

        {/* Logo */}
        <div style={{ opacity: eyebrowOp, marginBottom: 8 }}>
          <HapeeLogo width={180} />
        </div>

        {/* Eyebrow */}
        <div style={{
          opacity: eyebrowOp,
          background: `rgba(250,80,0,0.08)`,
          border: `1.5px solid rgba(250,80,0,0.22)`,
          borderRadius: 40, padding: "10px 28px",
          fontSize: 26, color: ORANGE, fontWeight: 700,
          letterSpacing: 3, fontFamily: FONT_BODY,
          textTransform: "uppercase",
        }}>
          ¿Te suena esto?
        </div>

        {/* Pain points */}
        {[
          { text: "Leads sin respuesta",     emoji: "😤", scale: s1 },
          { text: "Ventas perdidas de noche", emoji: "🌙", scale: s2 },
          { text: "Equipo saturado",          emoji: "😩", scale: s3 },
        ].map(({ text, emoji, scale }, i) => (
          <div key={i} style={{
            transform: `scale(${scale})`,
            display: "flex", alignItems: "center", gap: 16,
            background: CARD, border: `1px solid ${BORDER}`,
            borderRadius: 18, padding: "18px 28px", width: "100%",
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          }}>
            <span style={{ fontSize: 38 }}>{emoji}</span>
            <span style={{ fontSize: 36, color: HEADING, fontWeight: 700, fontFamily: FONT_BODY }}>
              {text}
            </span>
          </div>
        ))}

        {/* Answer line */}
        <div style={{
          transform: `scale(${s4})`,
          fontSize: 50, fontWeight: 900,
          textAlign: "center", fontFamily: FONT_DISPLAY,
          background: GRAD, WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          letterSpacing: 1, marginTop: 6,
        }}>
          Hay una solución.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 2 — Brand Reveal  (0:03 → 0:07)
// ═════════════════════════════════════════════════════════════════════════════
const BrandReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const TOTAL = 120;
  const op = sceneFade(frame, TOTAL);

  const logoScale = spring({ fps, frame, config: { damping: 11, stiffness: 85 }, durationInFrames: 44 });
  const tagOp     = interpolate(frame, [32, 56], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tagY      = interpolate(frame, [32, 56], [28, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const subOp     = interpolate(frame, [55, 76], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const badgeOp   = interpolate(frame, [14, 32], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Expanding ring
  const r1 = interpolate(frame, [8,  56], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const r2 = interpolate(frame, [20, 68], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity: op, background: BG }}>
      {/* Warm glow center */}
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at 50% 44%, rgba(250,80,0,0.07) 0%, rgba(205,35,73,0.05) 45%, transparent 70%)`,
      }} />
      <ParticleField />

      {/* Rings */}
      {[{ r: r1, base: 200 }, { r: r2, base: 320 }].map(({ r, base }, i) => (
        <div key={i} style={{
          position: "absolute", top: "43%", left: "50%",
          transform: "translate(-50%,-50%)",
          width: base * r, height: base * r,
          borderRadius: "50%",
          border: `1.5px solid rgba(250,80,0,${0.35 * (1 - r)})`,
        }} />
      ))}

      <AbsoluteFill style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 18,
      }}>
        {/* Real logo */}
        <div style={{ transform: `scale(${logoScale})` }}>
          <HapeeLogo width={300} />
        </div>

        {/* AI pill */}
        <div style={{
          opacity: badgeOp,
          transform: `scale(${interpolate(frame, [14, 32], [0.8, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })})`,
          background: GRAD, borderRadius: 30,
          padding: "8px 24px",
          fontSize: 20, color: "#fff",
          fontFamily: FONT_BODY, letterSpacing: 3, fontWeight: 700,
        }}>
          Plataforma IA Certificada
        </div>

        {/* Tagline */}
        <div style={{
          opacity: tagOp, transform: `translateY(${tagY}px)`,
          fontSize: 40, fontWeight: 800, color: HEADING,
          textAlign: "center", fontFamily: FONT_DISPLAY,
          letterSpacing: 1, lineHeight: 1.2, padding: "0 70px",
          marginTop: 8,
        }}>
          Automatiza tu Negocio.{" "}
          <span style={{ background: GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Multiplica tus Ventas.
          </span>
        </div>

        {/* Sub */}
        <div style={{
          opacity: subOp,
          fontSize: 28, color: MUTED, textAlign: "center",
          fontFamily: FONT_BODY, lineHeight: 1.4, padding: "0 80px",
        }}>
          Cero tareas manuales · Cierre de ventas 24/7
        </div>

        {/* Stats row */}
        <div style={{
          opacity: interpolate(frame, [72, 92], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          display: "flex", gap: 20, marginTop: 10,
        }}>
          {[["24/7", "Disponible"], ["3x", "Más ventas"], ["0", "Tareas manuales"]].map(([val, label], i) => (
            <Card key={i} style={{ padding: "14px 20px", textAlign: "center", minWidth: 100 }}>
              <div style={{ fontSize: 34, fontWeight: 900, fontFamily: FONT_DISPLAY, background: GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: 1 }}>
                {val}
              </div>
              <div style={{ fontSize: 16, color: MUTED, fontFamily: FONT_BODY, marginTop: 2 }}>{label}</div>
            </Card>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// Feature scene template
// ═════════════════════════════════════════════════════════════════════════════
interface FeatProps {
  title: string; subtitle: string; icon: string;
  badge: string; badgeColor: string;
  items: string[]; screen: React.ReactNode;
}

const FeatureScene: React.FC<FeatProps> = ({
  title, subtitle, icon, badge, badgeColor, items, screen,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const TOTAL   = 120;
  const op      = sceneFade(frame, TOTAL);

  const headerOp = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  const headerY  = interpolate(frame, [0, 18], [22, 0], { extrapolateRight: "clamp" });

  const phoneScale = spring({ fps, frame: frame - 8, config: { damping: 13, stiffness: 88 }, durationInFrames: 40 });
  const phoneFloat = interpolate(Math.sin((frame * Math.PI) / 48), [-1, 1], [-6, 6]);

  return (
    <AbsoluteFill style={{ opacity: op, background: BG_ALT }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at 80% 20%, ${badgeColor}0d 0%, transparent 50%),
                     radial-gradient(ellipse at 20% 80%, rgba(205,35,73,0.05) 0%, transparent 50%)`,
      }} />
      <ParticleField />

      <AbsoluteFill style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", paddingTop: 120, gap: 0,
      }}>
        {/* Header */}
        <div style={{
          opacity: headerOp, transform: `translateY(${headerY}px)`,
          textAlign: "center", marginBottom: 14, padding: "0 70px",
        }}>
          {/* Badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: `${badgeColor}12`, border: `1.5px solid ${badgeColor}35`,
            borderRadius: 30, padding: "7px 20px", marginBottom: 12,
          }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span style={{ fontSize: 20, color: badgeColor, fontFamily: FONT_BODY, fontWeight: 700, letterSpacing: 0.5 }}>
              {badge}
            </span>
          </div>
          {/* Title */}
          <div style={{ fontSize: 60, fontWeight: 900, color: HEADING, fontFamily: FONT_DISPLAY, letterSpacing: 1, lineHeight: 1.05 }}>
            {title}
          </div>
          <div style={{ fontSize: 28, color: badgeColor, fontFamily: FONT_BODY, fontWeight: 700, marginTop: 4 }}>
            {subtitle}
          </div>
        </div>

        {/* Phone */}
        <div style={{ transform: `scale(${phoneScale}) translateY(${phoneFloat}px)`, marginBottom: 22 }}>
          <Phone>{screen}</Phone>
        </div>

        {/* Feature bullets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", padding: "0 64px" }}>
          {items.map((item, i) => {
            const iOp = interpolate(frame, [38 + i * 12, 56 + i * 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const iX  = interpolate(frame, [38 + i * 12, 56 + i * 12], [-16, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <Card key={i} style={{
                opacity: iOp, transform: `translateX(${iX}px)`,
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 22px",
              }}>
                <div style={{
                  width: 9, height: 9, borderRadius: "50%",
                  background: badgeColor, flexShrink: 0,
                  boxShadow: `0 0 8px ${badgeColor}88`,
                }} />
                <span style={{ fontSize: 26, color: HEADING, fontFamily: FONT_BODY, fontWeight: 600 }}>
                  {item}
                </span>
              </Card>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 6 — CTA  (0:18:30 → 0:21)
// ═════════════════════════════════════════════════════════════════════════════
const CTAScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const TOTAL  = 75;
  const op     = sceneFade(frame, TOTAL);

  const titleScale = spring({ fps, frame,       config: { damping: 11, stiffness: 100 }, durationInFrames: 36 });
  const btnScale   = spring({ fps, frame: frame - 22, config: { damping: 9,  stiffness: 120 }, durationInFrames: 28 });
  const btnPulse   = interpolate(Math.sin((frame * Math.PI) / 18), [-1, 1], [1, 1.04]);
  const urlOp      = interpolate(frame, [36, 55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fineOp     = interpolate(frame, [50, 65], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const logoOp     = interpolate(frame, [8,  28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity: op, background: BG }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at 50% 50%, rgba(250,80,0,0.06) 0%, rgba(205,35,73,0.04) 45%, transparent 70%)`,
      }} />
      <ParticleField />

      <AbsoluteFill style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 28, padding: "0 90px",
      }}>
        {/* Logo */}
        <div style={{ opacity: logoOp }}>
          <HapeeLogo width={200} />
        </div>

        {/* Headline */}
        <div style={{
          transform: `scale(${titleScale})`,
          fontSize: 88, fontWeight: 900,
          color: HEADING, textAlign: "center",
          lineHeight: 1.05, fontFamily: FONT_DISPLAY, letterSpacing: 1,
        }}>
          Empieza Hoy.{" "}
          <span style={{ background: GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Gratis.
          </span>
        </div>

        <div style={{
          opacity: interpolate(frame, [18, 36], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          fontSize: 30, color: BODY, textAlign: "center",
          fontFamily: FONT_BODY, lineHeight: 1.5,
        }}>
          Agentes IA Certificados.{"\n"}Cierre de ventas 24/7.
        </div>

        {/* CTA Button */}
        <div style={{
          transform: `scale(${Math.min(btnScale, 1) * btnPulse})`,
          background: GRAD, borderRadius: 64,
          padding: "26px 72px",
          fontSize: 42, fontWeight: 800, color: "#fff",
          fontFamily: FONT_BODY,
          boxShadow: `0 12px 40px rgba(250,80,0,0.4), 0 4px 12px rgba(205,35,73,0.3)`,
        }}>
          hapee.ai
        </div>

        {/* URL */}
        <div style={{ opacity: urlOp, fontSize: 28, color: MUTED, fontFamily: FONT_BODY, letterSpacing: 1 }}>
          www.hapee.ai
        </div>

        {/* Fine print */}
        <div style={{ opacity: fineOp, fontSize: 22, color: MUTED, fontFamily: FONT_BODY, letterSpacing: 0.5 }}>
          Sin tarjeta de crédito · Cancela cuando quieras
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// ROOT COMPOSITION
// ═════════════════════════════════════════════════════════════════════════════
// Whether ElevenLabs audio files exist (set to true after running generate-audio.mjs)
const USE_VOICEOVER = true;

// Volume levels
const VO_VOL  = 1.0;   // voiceover
const BGM_VOL = 0.18;  // background music (optional)

export const HapeeVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: BG }}>

      {/*
       * ── OPTIONAL BACKGROUND MUSIC ────────────────────────────────────────
       * Drop a royalty-free track at public/hapee-bgm.mp3 and set to true:
       */}
      {false && (
        <Audio src={staticFile("hapee-bgm.mp3")} volume={BGM_VOL} />
      )}

      {/* ── VOICEOVER PER SCENE (generated by generate-audio.mjs) ─────────── */}
      {USE_VOICEOVER && (
        <>
          {/* Scene 1 — Hook  0:00 */}
          <Sequence from={0}   durationInFrames={90}  layout="none">
            <Audio src={staticFile("audio/scene-1-hook.mp3")}  volume={VO_VOL} />
          </Sequence>
          {/* Scene 2 — Brand  0:03 */}
          <Sequence from={90}  durationInFrames={120} layout="none">
            <Audio src={staticFile("audio/scene-2-brand.mp3")} volume={VO_VOL} />
          </Sequence>
          {/* Scene 3 — Chat  0:07 */}
          <Sequence from={210} durationInFrames={120} layout="none">
            <Audio src={staticFile("audio/scene-3-chat.mp3")}  volume={VO_VOL} />
          </Sequence>
          {/* Scene 4 — CRM  0:11 */}
          <Sequence from={330} durationInFrames={120} layout="none">
            <Audio src={staticFile("audio/scene-4-crm.mp3")}   volume={VO_VOL} />
          </Sequence>
          {/* Scene 5 — Omni  0:15 */}
          <Sequence from={450} durationInFrames={105} layout="none">
            <Audio src={staticFile("audio/scene-5-omni.mp3")}  volume={VO_VOL} />
          </Sequence>
          {/* Scene 6 — CTA  0:18.5 */}
          <Sequence from={555} durationInFrames={75}  layout="none">
            <Audio src={staticFile("audio/scene-6-cta.mp3")}   volume={VO_VOL} />
          </Sequence>
        </>
      )}

      {/* ── VISUAL SCENES ─────────────────────────────────────────────────── */}

      {/* Scene 1 — Hook            0:00 → 0:03  */}
      <Sequence from={0}   durationInFrames={90}  layout="none"><HookScene /></Sequence>

      {/* Scene 2 — Brand Reveal    0:03 → 0:07  */}
      <Sequence from={90}  durationInFrames={120} layout="none"><BrandReveal /></Sequence>

      {/* Scene 3 — IA Conversacional  0:07 → 0:11  */}
      <Sequence from={210} durationInFrames={120} layout="none">
        <FeatureScene
          icon="🤖" badge="IA Conversacional" badgeColor={ORANGE}
          title="Responde al instante" subtitle="Califica leads automáticamente"
          items={["Chatbots y agentes de voz", "Calificación automática 24/7", "Citas sin intervención humana"]}
          screen={<ChatScreen />}
        />
      </Sequence>

      {/* Scene 4 — CRM & Pipeline     0:11 → 0:15  */}
      <Sequence from={330} durationInFrames={120} layout="none">
        <FeatureScene
          icon="📊" badge="CRM & Pipeline" badgeColor="#3b82f6"
          title="Cierra más ventas" subtitle="Pipeline visual en tiempo real"
          items={["Gestión visual de leads", "Pagos integrados (Stripe)", "Seguimiento automático"]}
          screen={<CRMScreen />}
        />
      </Sequence>

      {/* Scene 5 — Omnicanal          0:15 → 0:18:30  */}
      <Sequence from={450} durationInFrames={105} layout="none">
        <FeatureScene
          icon="📡" badge="Omnicanal" badgeColor={PINK}
          title="Un solo inbox" subtitle="WhatsApp · Email · SMS · Instagram"
          items={["Bandeja unificada multi-canal", "Respuesta automática inteligente", "Nunca pierdas un mensaje"]}
          screen={<InboxScreen />}
        />
      </Sequence>

      {/* Scene 6 — CTA               0:18:30 → 0:21  */}
      <Sequence from={555} durationInFrames={75} layout="none"><CTAScene /></Sequence>
    </AbsoluteFill>
  );
};
