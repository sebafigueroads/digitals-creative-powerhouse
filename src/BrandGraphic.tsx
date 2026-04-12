/**
 * BrandGraphic.tsx — Agency-quality brand graphic renderer
 * Supports: post, story, banner, carousel-slide, quote, stats, product
 * Rendered as still PNG via renderStill() or animated MP4
 *
 * Visual features: noise grain, glass effects, glow orbs, grid patterns,
 * premium typography with text shadows, glowing accent lines & CTA buttons.
 */
import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, spring } from "remotion";

// ─── Types ────────────────────────────────────────────────────────────────────
export type GraphicType = "post" | "story" | "banner" | "carousel" | "quote" | "stats" | "product";
export type GraphicBg   = "gradient" | "solid" | "mesh" | "dark" | "light" | "image";

export interface GraphicStat { label: string; value: string; icon?: string; }

export interface BrandGraphicProps {
  type:        GraphicType;
  bgStyle:     GraphicBg;
  headline:    string;
  subheadline?: string;
  body?:       string;
  cta?:        string;
  stats?:      GraphicStat[];
  quoteAuthor?: string;
  imageUrl?:   string;
  logoUrl?:    string;
  animated?:   boolean;
  slideIndex?:  number;
  totalSlides?: number;
  brand: {
    clientId:   string;
    displayName: string;
    colors: {
      primary: string;
      secondary: string;
      background: string;
      heading: string;
      body: string;
      muted: string;
    };
    fonts: { display: string; body: string };
    gradient: string;
    website?: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const clamp = (v: number) => Math.min(1, Math.max(0, v));



// ─── Decorative Components ────────────────────────────────────────────────────

/** CSS-based noise/grain overlay using tiny repeated radial-gradients */
const NoiseOverlay: React.FC<{ opacity?: number }> = ({ opacity = 0.035 }) => (
  <AbsoluteFill
    style={{
      opacity,
      backgroundImage: [
        "radial-gradient(circle at 25% 25%, rgba(255,255,255,0.15) 1px, transparent 1px)",
        "radial-gradient(circle at 75% 75%, rgba(255,255,255,0.1) 1px, transparent 1px)",
        "radial-gradient(circle at 50% 10%, rgba(255,255,255,0.12) 0.5px, transparent 0.5px)",
        "radial-gradient(circle at 10% 60%, rgba(255,255,255,0.08) 0.8px, transparent 0.8px)",
        "radial-gradient(circle at 90% 40%, rgba(255,255,255,0.1) 0.6px, transparent 0.6px)",
      ].join(", "),
      backgroundSize: "4px 4px, 7px 7px, 3px 3px, 5px 5px, 6px 6px",
      pointerEvents: "none",
    }}
  />
);

/** Subtle grid lines overlay using repeating-linear-gradient */
const GridPattern: React.FC<{ opacity?: number; size?: number; color?: string }> = ({
  opacity = 0.05,
  size = 60,
  color = "rgba(255,255,255,0.15)",
}) => (
  <AbsoluteFill
    style={{
      opacity,
      backgroundImage: `repeating-linear-gradient(0deg, ${color} 0px, ${color} 1px, transparent 1px, transparent ${size}px), repeating-linear-gradient(90deg, ${color} 0px, ${color} 1px, transparent 1px, transparent ${size}px)`,
      pointerEvents: "none",
    }}
  />
);

/** Decorative blurred color orb that adds depth */
const GlowOrb: React.FC<{
  color: string;
  size?: number;
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  opacity?: number;
}> = ({ color, size = 300, top, left, right, bottom, opacity = 0.2 }) => (
  <div
    style={{
      position: "absolute",
      width: size,
      height: size,
      top,
      left,
      right,
      bottom,
      borderRadius: "50%",
      background: color,
      opacity,
      filter: `blur(${Math.round(size * 0.4)}px)`,
      pointerEvents: "none",
    }}
  />
);

/** Simulated frosted glass card (no backdrop-filter, uses layered semitransparent divs) */
const GlassCard: React.FC<{
  children: React.ReactNode;
  dark?: boolean;
  padding?: string;
  borderRadius?: number;
  style?: React.CSSProperties;
}> = ({ children, dark = true, padding = "24px 32px", borderRadius = 20, style }) => (
  <div
    style={{
      position: "relative",
      borderRadius,
      overflow: "hidden",
      ...style,
    }}
  >
    {/* Base fill */}
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
        borderRadius,
      }}
    />
    {/* Secondary fill for depth */}
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: dark
          ? "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)"
          : "linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.6) 100%)",
        borderRadius,
      }}
    />
    {/* Border */}
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius,
        border: `1px solid ${dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)"}`,
        pointerEvents: "none",
      }}
    />
    {/* Content */}
    <div style={{ position: "relative", padding }}>{children}</div>
  </div>
);

/** Glowing accent line replacing the old thin AccentBar */
const GlowLine: React.FC<{ gradient: string; width?: number }> = ({ gradient, width = 60 }) => (
  <div style={{ position: "relative", width, height: 4, marginBottom: 20 }}>
    <div style={{ width: "100%", height: "100%", borderRadius: 4, background: gradient }} />
    <div
      style={{
        position: "absolute",
        inset: -4,
        borderRadius: 8,
        background: gradient,
        opacity: 0.3,
        filter: "blur(8px)",
      }}
    />
  </div>
);

/** CTA button with outer glow halo */
const GlowButton: React.FC<{
  text: string;
  gradient: string;
  primaryColor: string;
  fontSize?: number;
  arrow?: boolean;
}> = ({ text, gradient, primaryColor, fontSize = 17, arrow }) => (
  <div style={{ position: "relative", display: "inline-flex" }}>
    <div
      style={{
        position: "absolute",
        inset: -6,
        borderRadius: 56,
        background: gradient,
        opacity: 0.35,
        filter: "blur(16px)",
      }}
    />
    <div
      style={{
        position: "relative",
        background: gradient,
        borderRadius: 50,
        padding: "16px 36px",
        fontSize,
        fontWeight: 700,
        color: "#fff",
        boxShadow: `0 8px 32px ${primaryColor}55`,
        letterSpacing: 0.2,
      }}
    >
      {text}{arrow ? " \u2192" : ""}
    </div>
  </div>
);

// ─── Background Layer ─────────────────────────────────────────────────────────
const BgLayer: React.FC<{
  bgStyle: GraphicBg;
  brand: BrandGraphicProps["brand"];
  imageUrl?: string;
}> = ({ bgStyle, brand, imageUrl }) => {
  const { colors } = brand;
  const p = colors.primary;
  const s = colors.secondary;

  if (bgStyle === "gradient")
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ background: `linear-gradient(135deg, ${p} 0%, ${s} 100%)` }} />
        {/* Glass orb decoration */}
        <GlowOrb color={`${s}`} size={400} top="-10%" right="-8%" opacity={0.25} />
        <GlowOrb color={`${p}`} size={250} bottom="5%" left="-5%" opacity={0.15} />
        <NoiseOverlay opacity={0.04} />
      </AbsoluteFill>
    );

  if (bgStyle === "dark")
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ background: "#0a0a0f" }} />
        {/* Grid pattern */}
        <GridPattern opacity={0.04} size={50} color="rgba(255,255,255,0.08)" />
        {/* Glow spots */}
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at 20% 20%, ${p}30 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, ${s}25 0%, transparent 55%)`,
          }}
        />
        {/* Extra subtle glow spot center */}
        <GlowOrb color={p} size={500} top="30%" left="40%" opacity={0.06} />
        <NoiseOverlay opacity={0.05} />
      </AbsoluteFill>
    );

  if (bgStyle === "light")
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ background: "#ffffff" }} />
        {/* Dot pattern */}
        <AbsoluteFill
          style={{
            opacity: 0.3,
            backgroundImage: `radial-gradient(circle, ${p}18 0.8px, transparent 0.8px)`,
            backgroundSize: "20px 20px",
          }}
        />
        {/* Soft corner shadows */}
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at 80% 10%, ${p}15 0%, transparent 50%), radial-gradient(ellipse at 0% 100%, ${s}10 0%, transparent 40%)`,
          }}
        />
        <NoiseOverlay opacity={0.02} />
      </AbsoluteFill>
    );

  if (bgStyle === "mesh")
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ background: colors.background || "#0f172a" }} />
        <AbsoluteFill
          style={{
            background: [
              `radial-gradient(at 30% 15%, ${p}55 0px, transparent 50%)`,
              `radial-gradient(at 85% 5%, ${s}50 0px, transparent 50%)`,
              `radial-gradient(at 5% 55%, ${p}40 0px, transparent 50%)`,
              `radial-gradient(at 75% 90%, ${s}45 0px, transparent 50%)`,
              `radial-gradient(at 0% 100%, ${p}30 0px, transparent 50%)`,
              `radial-gradient(at 50% 50%, ${s}15 0px, transparent 60%)`,
            ].join(", "),
          }}
        />
        <NoiseOverlay opacity={0.05} />
      </AbsoluteFill>
    );

  if (bgStyle === "image" && imageUrl)
    return (
      <AbsoluteFill>
        <Img src={imageUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <AbsoluteFill style={{ background: "rgba(0,0,0,0.55)" }} />
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.7) 100%)",
          }}
        />
        <NoiseOverlay opacity={0.04} />
      </AbsoluteFill>
    );

  // solid
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: colors.background || "#0f172a" }} />
      {/* Subtle diagonal stripes */}
      <AbsoluteFill
        style={{
          opacity: 0.03,
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.05) 11px)",
        }}
      />
      <NoiseOverlay opacity={0.03} />
    </AbsoluteFill>
  );
};

// ─── Logo ─────────────────────────────────────────────────────────────────────
const Logo: React.FC<{
  brand: BrandGraphicProps["brand"];
  size?: number;
  logoUrl?: string;
}> = ({ brand, size = 48, logoUrl }) => {
  const src = logoUrl || staticFile(`clients/${brand.clientId}/logo.png`);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Img
        src={src}
        style={{
          height: size,
          width: "auto",
          maxWidth: size * 3,
          objectFit: "contain",
        }}
      />
    </div>
  );
};

// ─── Stat Card (glass-style) ─────────────────────────────────────────────────
const StatCard: React.FC<{
  stat: GraphicStat;
  brand: BrandGraphicProps["brand"];
  dark: boolean;
  delay: number;
  animated: boolean;
}> = ({ stat, brand, dark, delay, animated }) => {
  const frame = useCurrentFrame();
  const opacity = animated ? clamp((frame - delay) / 12) : 1;
  const y = animated
    ? interpolate(frame, [delay, delay + 15], [20, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        flex: 1,
        minWidth: 0,
        textAlign: "center",
        position: "relative",
      }}
    >
      <GlassCard dark={dark} padding="24px 20px">
        {stat.icon && (
          <div style={{ fontSize: 30, marginBottom: 10 }}>{stat.icon}</div>
        )}
        <div
          style={{
            position: "relative",
            fontSize: 44,
            fontWeight: 900,
            fontFamily: brand.fonts.display,
            background: brand.gradient,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            lineHeight: 1,
            textShadow: "none", // gradient text, glow handled below
          }}
        >
          {stat.value}
        </div>
        {/* Glow behind stat value */}
        <div
          style={{
            position: "absolute",
            top: stat.icon ? 48 : 16,
            left: "50%",
            transform: "translateX(-50%)",
            width: 80,
            height: 30,
            background: brand.colors.primary,
            opacity: 0.15,
            filter: "blur(20px)",
            borderRadius: "50%",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            fontSize: 14,
            color: dark ? brand.colors.muted || "#94a3b8" : "#666",
            fontFamily: brand.fonts.body,
            marginTop: 10,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: "uppercase" as const,
          }}
        >
          {stat.label}
        </div>
      </GlassCard>
    </div>
  );
};

// ─── Typography helpers ───────────────────────────────────────────────────────
const headlineShadow = (dark: boolean, primaryColor: string) =>
  dark
    ? `0 2px 20px rgba(0,0,0,0.3), 0 0 40px ${primaryColor}40`
    : "0 2px 20px rgba(0,0,0,0.08)";

// ─── POST graphic (1:1 or 4:5) ────────────────────────────────────────────────
const PostGraphic: React.FC<BrandGraphicProps & { dark: boolean }> = ({
  headline,
  subheadline,
  body,
  cta,
  brand,
  bgStyle,
  imageUrl,
  logoUrl,
  animated,
  dark,
}) => {
  const frame = useCurrentFrame();
  const headOp = animated ? clamp(frame / 16) : 1;
  const headY = animated
    ? interpolate(frame, [0, 18], [30, 0], { extrapolateRight: "clamp" })
    : 0;
  const subOp = animated ? clamp((frame - 10) / 14) : 1;
  const ctaScale = animated
    ? spring({
        fps: 30,
        frame: frame - 25,
        config: { damping: 12, stiffness: 100 },
        durationInFrames: 20,
      })
    : 1;

  const isDark = bgStyle !== "light";
  const textColor = isDark ? "#fff" : "#111";
  const mutedColor = isDark ? "rgba(255,255,255,0.78)" : "#555";

  return (
    <AbsoluteFill>
      <BgLayer bgStyle={bgStyle} brand={brand} imageUrl={imageUrl} />

      {/* Decorative glow orb top-right */}
      <GlowOrb color={brand.colors.primary} size={350} top="-5%" right="-8%" opacity={0.18} />

      {/* Subtle grid overlay */}
      <GridPattern opacity={0.04} size={55} />

      <AbsoluteFill
        style={{
          padding: "56px 60px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          zIndex: 2,
        }}
      >
        {/* Top: Logo in frosted pill */}
        <div>
          <GlassCard dark={isDark} padding="10px 20px" borderRadius={40}>
            <Logo brand={brand} size={36} logoUrl={logoUrl} />
          </GlassCard>
        </div>

        {/* Center: Text */}
        <div>
          <GlowLine gradient={brand.gradient} width={70} />
          <div
            style={{
              opacity: headOp,
              transform: `translateY(${headY}px)`,
              fontSize: 58,
              fontWeight: 900,
              color: textColor,
              fontFamily: brand.fonts.display,
              lineHeight: 1.08,
              marginBottom: 18,
              letterSpacing: -0.5,
              textShadow: headlineShadow(isDark, brand.colors.primary),
            }}
          >
            {headline}
          </div>
          {subheadline && (
            <div
              style={{
                opacity: subOp,
                fontSize: 24,
                color: mutedColor,
                fontFamily: brand.fonts.body,
                lineHeight: 1.5,
                marginBottom: 14,
                letterSpacing: 0.2,
              }}
            >
              {subheadline}
            </div>
          )}
          {body && (
            <div
              style={{
                fontSize: 17,
                color: mutedColor,
                fontFamily: brand.fonts.body,
                lineHeight: 1.65,
                letterSpacing: 0.15,
                marginBottom: 24,
              }}
            >
              {body}
            </div>
          )}
          {cta && (
            <div style={{ transform: `scale(${ctaScale})` }}>
              <GlowButton
                text={cta}
                gradient={brand.gradient}
                primaryColor={brand.colors.primary}
                fontSize={18}
              />
            </div>
          )}
        </div>

        {/* Bottom: website + decoration strip */}
        <div>
          {brand.website && (
            <div
              style={{
                fontSize: 12,
                color: mutedColor,
                fontFamily: brand.fonts.body,
                letterSpacing: 1.2,
                marginBottom: 12,
              }}
            >
              {brand.website.replace(/^https?:\/\/(www\.)?/, "")}
            </div>
          )}
          <div
            style={{
              height: 3,
              borderRadius: 3,
              background: brand.gradient,
              opacity: 0.5,
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── STORY graphic (9:16) ─────────────────────────────────────────────────────
const StoryGraphic: React.FC<BrandGraphicProps & { dark: boolean }> = ({
  headline,
  subheadline,
  body,
  cta,
  brand,
  bgStyle,
  imageUrl,
  logoUrl,
  animated,
  dark,
}) => {
  const frame = useCurrentFrame();
  const headOp = animated ? clamp(frame / 18) : 1;
  const headY = animated
    ? interpolate(frame, [0, 22], [40, 0], { extrapolateRight: "clamp" })
    : 0;
  const subOp = animated ? clamp((frame - 14) / 14) : 1;
  const ctaScale = animated
    ? spring({
        fps: 30,
        frame: frame - 30,
        config: { damping: 12, stiffness: 100 },
        durationInFrames: 20,
      })
    : 1;

  const isDark = bgStyle !== "light";
  const textColor = isDark ? "#fff" : "#111";
  const mutedColor = isDark ? "rgba(255,255,255,0.78)" : "#555";

  return (
    <AbsoluteFill>
      <BgLayer bgStyle={bgStyle} brand={brand} imageUrl={imageUrl} />

      {/* Decorative glow orbs */}
      <GlowOrb color={brand.colors.primary} size={400} top="-8%" left="-10%" opacity={0.2} />
      <GlowOrb color={brand.colors.secondary} size={350} bottom="-5%" right="-10%" opacity={0.15} />

      {/* Grid overlay */}
      <GridPattern opacity={0.03} size={50} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 56px",
          zIndex: 2,
        }}
      >
        {/* Top strip */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <GlassCard dark={isDark} padding="8px 18px" borderRadius={30}>
            <Logo brand={brand} size={40} logoUrl={logoUrl} />
          </GlassCard>
          {brand.website && (
            <div
              style={{
                fontSize: 11,
                color: mutedColor,
                letterSpacing: 1.2,
                fontFamily: brand.fonts.body,
              }}
            >
              {brand.website.replace(/^https?:\/\/(www\.)?/, "")}
            </div>
          )}
        </div>

        {/* Floating accent shape decoration */}
        <div
          style={{
            position: "absolute",
            top: "25%",
            right: 40,
            width: 80,
            height: 80,
            borderRadius: 20,
            border: `2px solid ${brand.colors.primary}25`,
            transform: "rotate(15deg)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "30%",
            left: 30,
            width: 50,
            height: 50,
            borderRadius: "50%",
            border: `2px solid ${brand.colors.secondary}20`,
            pointerEvents: "none",
          }}
        />

        {/* Center content */}
        <div>
          <GlowLine gradient={brand.gradient} width={56} />
          <div
            style={{
              opacity: headOp,
              transform: `translateY(${headY}px)`,
              fontSize: 68,
              fontWeight: 900,
              color: textColor,
              fontFamily: brand.fonts.display,
              lineHeight: 1.05,
              marginBottom: 22,
              letterSpacing: -0.5,
              textShadow: headlineShadow(isDark, brand.colors.primary),
            }}
          >
            {headline}
          </div>
          {subheadline && (
            <div
              style={{
                opacity: subOp,
                fontSize: 26,
                color: mutedColor,
                fontFamily: brand.fonts.body,
                lineHeight: 1.55,
                marginBottom: 16,
                letterSpacing: 0.2,
              }}
            >
              {subheadline}
            </div>
          )}
          {body && (
            <div
              style={{
                fontSize: 20,
                color: mutedColor,
                fontFamily: brand.fonts.body,
                lineHeight: 1.65,
                letterSpacing: 0.15,
                marginBottom: 32,
              }}
            >
              {body}
            </div>
          )}
          {cta && (
            <div style={{ transform: `scale(${ctaScale})` }}>
              <GlowButton
                text={cta}
                gradient={brand.gradient}
                primaryColor={brand.colors.primary}
                fontSize={20}
                arrow
              />
            </div>
          )}
        </div>

        {/* Bottom decoration strip with gradient */}
        <div style={{ position: "relative" }}>
          <div
            style={{
              height: 4,
              background: brand.gradient,
              borderRadius: 4,
              opacity: 0.5,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: "-3px 0",
              background: brand.gradient,
              borderRadius: 8,
              opacity: 0.2,
              filter: "blur(6px)",
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── QUOTE graphic ────────────────────────────────────────────────────────────
const QuoteGraphic: React.FC<BrandGraphicProps & { dark: boolean }> = ({
  headline,
  quoteAuthor,
  brand,
  bgStyle,
  logoUrl,
  animated,
}) => {
  const frame = useCurrentFrame();
  const op = animated ? clamp(frame / 20) : 1;
  const scale = animated
    ? spring({
        fps: 30,
        frame,
        config: { damping: 14, stiffness: 80 },
        durationInFrames: 30,
      })
    : 1;
  const isDark = bgStyle !== "light";
  const textColor = isDark ? "#fff" : "#111";
  const mutedColor = isDark ? "rgba(255,255,255,0.6)" : "#666";

  return (
    <AbsoluteFill>
      <BgLayer bgStyle={bgStyle} brand={brand} />

      {/* Glow orbs */}
      <GlowOrb color={brand.colors.primary} size={350} top="-5%" left="-5%" opacity={0.12} />
      <GlowOrb color={brand.colors.secondary} size={300} bottom="-5%" right="-5%" opacity={0.1} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 70px",
          textAlign: "center",
          zIndex: 2,
        }}
      >
        {/* Large decorative quote mark with glow */}
        <div style={{ position: "relative", marginBottom: 16 }}>
          <div
            style={{
              fontSize: 120,
              color: brand.colors.primary,
              fontFamily: brand.fonts.display,
              lineHeight: 0.5,
              opacity: 0.5,
              transform: `scale(${scale})`,
              textShadow: `0 0 60px ${brand.colors.primary}50`,
            }}
          >
            {"\u201C"}
          </div>
        </div>

        {/* Quote in glass card container */}
        <GlassCard
          dark={isDark}
          padding="40px 48px"
          borderRadius={24}
          style={{
            maxWidth: "92%",
            boxShadow: `0 0 60px ${brand.colors.primary}12, 0 20px 60px rgba(0,0,0,0.15)`,
          }}
        >
          <div
            style={{
              opacity: op,
              fontSize: 48,
              fontWeight: 800,
              color: textColor,
              fontFamily: brand.fonts.display,
              lineHeight: 1.25,
              letterSpacing: -0.5,
              textShadow: headlineShadow(isDark, brand.colors.primary),
            }}
          >
            {headline}
          </div>
          {quoteAuthor && (
            <div
              style={{
                opacity: op,
                fontSize: 17,
                color: mutedColor,
                fontFamily: brand.fonts.body,
                letterSpacing: 1.5,
                marginTop: 24,
                fontWeight: 500,
              }}
            >
              {"\u2014"} {quoteAuthor}
            </div>
          )}
        </GlassCard>

        <div style={{ marginTop: 28 }}>
          <GlowLine gradient={brand.gradient} width={80} />
        </div>
        <Logo brand={brand} size={36} logoUrl={logoUrl} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── STATS graphic ────────────────────────────────────────────────────────────
const StatsGraphic: React.FC<BrandGraphicProps & { dark: boolean }> = ({
  headline,
  subheadline,
  stats = [],
  brand,
  bgStyle,
  logoUrl,
  animated,
}) => {
  const isDark = bgStyle !== "light";
  const textColor = isDark ? brand.colors.heading || "#f8fafc" : "#111";
  const frame = useCurrentFrame();
  const titleOp = animated ? clamp(frame / 14) : 1;

  return (
    <AbsoluteFill>
      <BgLayer bgStyle={bgStyle} brand={brand} />

      {/* Glow orbs */}
      <GlowOrb color={brand.colors.primary} size={300} top="5%" right="10%" opacity={0.1} />
      <GlowOrb color={brand.colors.secondary} size={250} bottom="10%" left="5%" opacity={0.08} />

      {/* Grid */}
      <GridPattern opacity={0.03} size={45} />

      <AbsoluteFill
        style={{
          padding: "56px 60px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <GlassCard dark={isDark} padding="8px 18px" borderRadius={30}>
            <Logo brand={brand} size={36} logoUrl={logoUrl} />
          </GlassCard>
        </div>

        <div>
          <GlowLine gradient={brand.gradient} />
          <div
            style={{
              opacity: titleOp,
              fontSize: 48,
              fontWeight: 900,
              color: textColor,
              fontFamily: brand.fonts.display,
              lineHeight: 1.1,
              marginBottom: 10,
              textShadow: headlineShadow(isDark, brand.colors.primary),
            }}
          >
            {headline}
          </div>
          {subheadline && (
            <div
              style={{
                fontSize: 20,
                color: isDark ? brand.colors.muted || "#94a3b8" : "#666",
                fontFamily: brand.fonts.body,
                marginBottom: 36,
                letterSpacing: 0.3,
                lineHeight: 1.5,
              }}
            >
              {subheadline}
            </div>
          )}
          <div style={{ display: "flex", gap: 16 }}>
            {stats.slice(0, 3).map((s, i) => (
              <React.Fragment key={i}>
                <StatCard
                  stat={s}
                  brand={brand}
                  dark={isDark}
                  delay={10 + i * 8}
                  animated={animated || false}
                />
                {/* Divider line between cards */}
                {i < Math.min(stats.length, 3) - 1 && (
                  <div
                    style={{
                      width: 1,
                      alignSelf: "stretch",
                      margin: "12px 0",
                      background: isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.06)",
                    }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {brand.website && (
          <div
            style={{
              fontSize: 12,
              color: isDark ? brand.colors.muted || "#64748b" : "#888",
              fontFamily: brand.fonts.body,
              letterSpacing: 1.2,
            }}
          >
            {brand.website.replace(/^https?:\/\/(www\.)?/, "")}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── BANNER graphic (16:9) ────────────────────────────────────────────────────
const BannerGraphic: React.FC<BrandGraphicProps & { dark: boolean }> = ({
  headline,
  subheadline,
  cta,
  brand,
  bgStyle,
  imageUrl,
  logoUrl,
  animated,
}) => {
  const frame = useCurrentFrame();
  const headOp = animated ? clamp(frame / 16) : 1;
  const headX = animated
    ? interpolate(frame, [0, 20], [-60, 0], { extrapolateRight: "clamp" })
    : 0;
  const subOp = animated ? clamp((frame - 12) / 14) : 1;
  const isDark = bgStyle !== "light";
  const textColor = isDark ? "#fff" : "#111";

  return (
    <AbsoluteFill>
      <BgLayer bgStyle={bgStyle} brand={brand} imageUrl={imageUrl} />

      {/* Glow orb */}
      <GlowOrb color={brand.colors.primary} size={400} top="-10%" left="30%" opacity={0.12} />

      {/* Grid */}
      <GridPattern opacity={0.03} size={50} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          padding: "0 100px",
          gap: 80,
          zIndex: 2,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 24 }}>
            <GlassCard dark={isDark} padding="10px 20px" borderRadius={35}>
              <Logo brand={brand} size={48} logoUrl={logoUrl} />
            </GlassCard>
          </div>
          <GlowLine gradient={brand.gradient} width={80} />
          <div
            style={{
              opacity: headOp,
              transform: `translateX(${headX}px)`,
              fontSize: 64,
              fontWeight: 900,
              color: textColor,
              fontFamily: brand.fonts.display,
              lineHeight: 1.05,
              letterSpacing: -1,
              marginBottom: 18,
              textShadow: headlineShadow(isDark, brand.colors.primary),
            }}
          >
            {headline}
          </div>
          {subheadline && (
            <div
              style={{
                opacity: subOp,
                fontSize: 26,
                color: isDark ? "rgba(255,255,255,0.78)" : "#555",
                fontFamily: brand.fonts.body,
                lineHeight: 1.5,
                marginBottom: 30,
                letterSpacing: 0.2,
              }}
            >
              {subheadline}
            </div>
          )}
          {cta && (
            <GlowButton
              text={cta}
              gradient={brand.gradient}
              primaryColor={brand.colors.primary}
              fontSize={19}
            />
          )}
        </div>
        {imageUrl && (
          <div
            style={{
              width: 480,
              height: 360,
              borderRadius: 24,
              overflow: "hidden",
              flexShrink: 0,
              boxShadow: `0 24px 64px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06)`,
            }}
          >
            <Img
              src={imageUrl}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── PRODUCT graphic ──────────────────────────────────────────────────────────
const ProductGraphic: React.FC<BrandGraphicProps & { dark: boolean }> = ({
  headline,
  subheadline,
  cta,
  brand,
  bgStyle,
  imageUrl,
  logoUrl,
  animated,
}) => {
  const frame = useCurrentFrame();
  const imgScale = animated
    ? spring({
        fps: 30,
        frame,
        config: { damping: 16, stiffness: 80 },
        durationInFrames: 35,
      })
    : 1;
  const textOp = animated ? clamp((frame - 10) / 16) : 1;
  const isDark = bgStyle !== "light";
  const textColor = isDark ? "#fff" : "#111";

  return (
    <AbsoluteFill>
      <BgLayer bgStyle={bgStyle} brand={brand} />

      {/* Glow orbs */}
      <GlowOrb color={brand.colors.primary} size={350} top="-5%" right="-5%" opacity={0.15} />
      <GlowOrb color={brand.colors.secondary} size={250} bottom="5%" left="-5%" opacity={0.1} />

      {/* Grid */}
      <GridPattern opacity={0.03} size={50} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px",
          gap: 28,
          zIndex: 2,
        }}
      >
        <div style={{ position: "absolute", top: 40, left: 56 }}>
          <GlassCard dark={isDark} padding="8px 16px" borderRadius={30}>
            <Logo brand={brand} size={34} logoUrl={logoUrl} />
          </GlassCard>
        </div>
        {imageUrl && (
          <div
            style={{
              transform: `scale(${imgScale})`,
              width: 320,
              height: 320,
              borderRadius: 24,
              overflow: "hidden",
              boxShadow: `0 24px 64px ${brand.colors.primary}40, 0 0 0 1px rgba(255,255,255,0.06)`,
            }}
          >
            <Img
              src={imageUrl}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        )}
        <div style={{ opacity: textOp, textAlign: "center" }}>
          <GlowLine gradient={brand.gradient} width={60} />
          <div
            style={{
              fontSize: 42,
              fontWeight: 900,
              color: textColor,
              fontFamily: brand.fonts.display,
              marginBottom: 10,
              textShadow: headlineShadow(isDark, brand.colors.primary),
            }}
          >
            {headline}
          </div>
          {subheadline && (
            <div
              style={{
                fontSize: 20,
                color: isDark ? brand.colors.muted || "#94a3b8" : "#666",
                fontFamily: brand.fonts.body,
                letterSpacing: 0.3,
                lineHeight: 1.5,
              }}
            >
              {subheadline}
            </div>
          )}
          {cta && (
            <div style={{ marginTop: 24 }}>
              <GlowButton
                text={cta}
                gradient={brand.gradient}
                primaryColor={brand.colors.primary}
                fontSize={17}
              />
            </div>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── CAROUSEL SLIDE ── continuous canvas (panoramic stitching) ────────────────
const CarouselSlideGraphic: React.FC<
  BrandGraphicProps & { dark: boolean; slideIndex?: number; totalSlides?: number }
> = ({
  headline,
  subheadline,
  body,
  cta,
  brand,
  bgStyle,
  logoUrl,
  animated,
  dark,
  slideIndex = 0,
  totalSlides = 1,
}) => {
  const frame = useCurrentFrame();
  const headOp = animated ? clamp(frame / 16) : 1;
  const headY = animated
    ? interpolate(frame, [0, 20], [24, 0], { extrapolateRight: "clamp" })
    : 0;
  const subOp = animated ? clamp((frame - 10) / 14) : 1;

  const isDark = bgStyle !== "light";
  const textColor = isDark ? "#fff" : "#111";
  const mutedColor = isDark ? "rgba(255,255,255,0.72)" : "#555";
  const isFirst = slideIndex === 0;
  const isLast = slideIndex === totalSlides - 1;

  return (
    <AbsoluteFill>
      <BgLayer bgStyle={bgStyle} brand={brand} />

      {/* Glow orb per slide */}
      <GlowOrb
        color={slideIndex % 2 === 0 ? brand.colors.primary : brand.colors.secondary}
        size={300}
        top="10%"
        right={slideIndex % 2 === 0 ? "-5%" : undefined}
        left={slideIndex % 2 !== 0 ? "-5%" : undefined}
        opacity={0.12}
      />

      {/* Grid */}
      <GridPattern opacity={0.03} size={50} />

      {/* Left edge connector (not on first slide) */}
      {!isFirst && (
        <div style={{ position: "relative" }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 6,
              background: brand.gradient,
              opacity: 0.7,
              zIndex: 5,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: -4,
              top: 0,
              bottom: 0,
              width: 14,
              background: brand.gradient,
              opacity: 0.15,
              filter: "blur(8px)",
              zIndex: 4,
            }}
          />
        </div>
      )}
      {/* Right edge connector (not on last slide) */}
      {!isLast && (
        <div style={{ position: "relative" }}>
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 6,
              background: brand.gradient,
              opacity: 0.7,
              zIndex: 5,
            }}
          />
          <div
            style={{
              position: "absolute",
              right: -4,
              top: 0,
              bottom: 0,
              width: 14,
              background: brand.gradient,
              opacity: 0.15,
              filter: "blur(8px)",
              zIndex: 4,
            }}
          />
        </div>
      )}

      {/* Slide number indicator */}
      <div
        style={{
          position: "absolute",
          top: 44,
          right: 52,
          zIndex: 10,
          display: "flex",
          gap: 6,
        }}
      >
        {Array.from({ length: totalSlides }).map((_, i) => (
          <div
            key={i}
            style={{
              width: i === slideIndex ? 22 : 6,
              height: 6,
              borderRadius: 3,
              background:
                i === slideIndex ? brand.colors.primary : "rgba(255,255,255,0.25)",
              boxShadow:
                i === slideIndex ? `0 0 8px ${brand.colors.primary}60` : "none",
              transition: "width 0.3s",
            }}
          />
        ))}
      </div>

      <AbsoluteFill
        style={{
          padding: "56px 60px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          zIndex: 2,
        }}
      >
        {/* Top: Logo on first, accent on others */}
        <div>
          {isFirst ? (
            <GlassCard dark={isDark} padding="8px 16px" borderRadius={30}>
              <Logo brand={brand} size={34} logoUrl={logoUrl} />
            </GlassCard>
          ) : (
            <GlowLine gradient={brand.gradient} width={40} />
          )}
        </div>

        {/* Main content */}
        <div>
          <GlowLine gradient={brand.gradient} width={50} />
          <div
            style={{
              opacity: headOp,
              transform: `translateY(${headY}px)`,
              fontSize: 50,
              fontWeight: 900,
              color: textColor,
              fontFamily: brand.fonts.display,
              lineHeight: 1.1,
              marginBottom: 16,
              textShadow: headlineShadow(isDark, brand.colors.primary),
            }}
          >
            {headline}
          </div>
          {subheadline && (
            <div
              style={{
                opacity: subOp,
                fontSize: 22,
                color: mutedColor,
                fontFamily: brand.fonts.body,
                lineHeight: 1.5,
                marginBottom: 14,
                letterSpacing: 0.2,
              }}
            >
              {subheadline}
            </div>
          )}
          {body && (
            <div
              style={{
                fontSize: 17,
                color: mutedColor,
                fontFamily: brand.fonts.body,
                lineHeight: 1.65,
                letterSpacing: 0.15,
                marginBottom: 22,
              }}
            >
              {body}
            </div>
          )}
          {cta && isLast && (
            <GlowButton
              text={cta}
              gradient={brand.gradient}
              primaryColor={brand.colors.primary}
              fontSize={17}
              arrow
            />
          )}
          {!isLast && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 14,
                color: brand.colors.primary,
                fontFamily: brand.fonts.body,
                fontWeight: 600,
                textShadow: `0 0 20px ${brand.colors.primary}30`,
              }}
            >
              Desliza {"\u2192"}{" "}
              <span style={{ fontSize: 18 }}>{"\u203A"}</span>
            </div>
          )}
        </div>

        {/* Bottom */}
        <div
          style={{
            fontSize: 11,
            color: mutedColor,
            fontFamily: brand.fonts.body,
            letterSpacing: 1,
          }}
        >
          {isFirst && brand.website
            ? brand.website.replace(/^https?:\/\/(www\.)?/, "")
            : `${slideIndex + 1} / ${totalSlides}`}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── ROOT: BrandGraphic ───────────────────────────────────────────────────────
export const BrandGraphic: React.FC<
  BrandGraphicProps & { slideIndex?: number; totalSlides?: number }
> = (props) => {
  const { type, bgStyle } = props;
  const dark = bgStyle !== "light";

  return (
    <AbsoluteFill>
      {type === "quote" && <QuoteGraphic {...props} dark={dark} />}
      {type === "stats" && <StatsGraphic {...props} dark={dark} />}
      {type === "banner" && <BannerGraphic {...props} dark={dark} />}
      {type === "product" && <ProductGraphic {...props} dark={dark} />}
      {type === "story" && <StoryGraphic {...props} dark={dark} />}
      {type === "carousel" && (
        <CarouselSlideGraphic
          {...props}
          dark={dark}
          slideIndex={props.slideIndex ?? 0}
          totalSlides={props.totalSlides ?? 1}
        />
      )}
      {type === "post" && <PostGraphic {...props} dark={dark} />}
    </AbsoluteFill>
  );
};
