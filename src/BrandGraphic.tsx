/**
 * BrandGraphic.tsx — Brand-consistent graphic renderer
 * Supports: post, story, banner, carousel-slide, quote, stats, product
 * Rendered as still PNG via renderStill() or animated MP4
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

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

// ─── Background Layer ─────────────────────────────────────────────────────────
const BgLayer: React.FC<{ bgStyle: GraphicBg; brand: BrandGraphicProps["brand"]; imageUrl?: string }> = ({ bgStyle, brand, imageUrl }) => {
  const { colors } = brand;
  const p = colors.primary;
  const s = colors.secondary;

  if (bgStyle === "gradient") return (
    <AbsoluteFill style={{ background: `linear-gradient(135deg, ${p} 0%, ${s} 100%)` }} />
  );
  if (bgStyle === "dark") return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: "#0a0a0f" }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 20% 20%, ${p}25 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, ${s}20 0%, transparent 55%)` }} />
    </AbsoluteFill>
  );
  if (bgStyle === "light") return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: "#ffffff" }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 80% 10%, ${p}18 0%, transparent 50%)` }} />
    </AbsoluteFill>
  );
  if (bgStyle === "mesh") return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: colors.background || "#0f172a" }} />
      <AbsoluteFill style={{ background: `radial-gradient(at 40% 20%, ${p}40 0px, transparent 50%), radial-gradient(at 80% 0%, ${s}35 0px, transparent 50%), radial-gradient(at 0% 50%, ${p}25 0px, transparent 50%), radial-gradient(at 80% 100%, ${s}30 0px, transparent 50%), radial-gradient(at 0% 100%, ${p}20 0px, transparent 50%)` }} />
    </AbsoluteFill>
  );
  if (bgStyle === "image" && imageUrl) return (
    <AbsoluteFill>
      <Img src={imageUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <AbsoluteFill style={{ background: "rgba(0,0,0,0.55)" }} />
      <AbsoluteFill style={{ background: `linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.7) 100%)` }} />
    </AbsoluteFill>
  );
  // solid
  return <AbsoluteFill style={{ background: colors.background || "#0f172a" }} />;
};

// ─── Logo ─────────────────────────────────────────────────────────────────────
const Logo: React.FC<{ brand: BrandGraphicProps["brand"]; size?: number; logoUrl?: string }> = ({ brand, size = 48, logoUrl }) => {
  const src = logoUrl || staticFile(`clients/${brand.clientId}/logo.png`);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Img src={src} style={{ height: size, width: "auto", maxWidth: size * 3, objectFit: "contain" }} />
    </div>
  );
};

// ─── Accent Bar ───────────────────────────────────────────────────────────────
const AccentBar: React.FC<{ gradient: string; width?: number; height?: number }> = ({ gradient, width = 60, height = 4 }) => (
  <div style={{ width, height, borderRadius: height, background: gradient, marginBottom: 16 }} />
);

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard: React.FC<{ stat: GraphicStat; brand: BrandGraphicProps["brand"]; dark: boolean; delay: number; animated: boolean }> = ({ stat, brand, dark, delay, animated }) => {
  const frame = useCurrentFrame();
  const opacity = animated ? clamp((frame - delay) / 12) : 1;
  const y       = animated ? interpolate(frame, [delay, delay + 15], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const textColor = dark ? brand.colors.heading || "#f8fafc" : "#111";

  return (
    <div style={{
      opacity, transform: `translateY(${y}px)`,
      background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
      border: `1px solid ${dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
      borderRadius: 16, padding: "20px 24px", flex: 1, minWidth: 0, textAlign: "center",
    }}>
      {stat.icon && <div style={{ fontSize: 28, marginBottom: 8 }}>{stat.icon}</div>}
      <div style={{ fontSize: 36, fontWeight: 900, fontFamily: brand.fonts.display, background: brand.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1 }}>
        {stat.value}
      </div>
      <div style={{ fontSize: 13, color: dark ? brand.colors.muted || "#94a3b8" : "#666", fontFamily: brand.fonts.body, marginTop: 6, fontWeight: 500 }}>
        {stat.label}
      </div>
    </div>
  );
};

// ─── POST graphic (1:1 or 4:5) ────────────────────────────────────────────────
const PostGraphic: React.FC<BrandGraphicProps & { dark: boolean }> = ({ headline, subheadline, body, cta, brand, bgStyle, imageUrl, logoUrl, animated, dark }) => {
  const frame = useCurrentFrame();
  const headOp  = animated ? clamp(frame / 16) : 1;
  const headY   = animated ? interpolate(frame, [0, 18], [30, 0], { extrapolateRight: "clamp" }) : 0;
  const subOp   = animated ? clamp((frame - 10) / 14) : 1;
  const ctaScale = animated ? spring({ fps: 30, frame: frame - 25, config: { damping: 12, stiffness: 100 }, durationInFrames: 20 }) : 1;

  const textColor = bgStyle === "light" ? "#111" : "#fff";
  const mutedColor = bgStyle === "light" ? "#555" : "rgba(255,255,255,0.75)";

  return (
    <AbsoluteFill style={{ padding: "56px 60px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <BgLayer bgStyle={bgStyle} brand={brand} imageUrl={imageUrl} />
      {/* Top: Logo */}
      <div style={{ position: "relative", zIndex: 2 }}>
        <Logo brand={brand} size={40} logoUrl={logoUrl} />
      </div>
      {/* Center: Text */}
      <div style={{ position: "relative", zIndex: 2 }}>
        <AccentBar gradient={brand.gradient} />
        <div style={{ opacity: headOp, transform: `translateY(${headY}px)`, fontSize: 52, fontWeight: 900, color: textColor, fontFamily: brand.fonts.display, lineHeight: 1.1, marginBottom: 16, letterSpacing: -0.5 }}>
          {headline}
        </div>
        {subheadline && (
          <div style={{ opacity: subOp, fontSize: 22, color: mutedColor, fontFamily: brand.fonts.body, lineHeight: 1.5, marginBottom: 12 }}>
            {subheadline}
          </div>
        )}
        {body && (
          <div style={{ fontSize: 17, color: mutedColor, fontFamily: brand.fonts.body, lineHeight: 1.6, marginBottom: 20 }}>
            {body}
          </div>
        )}
        {cta && (
          <div style={{ transform: `scale(${ctaScale})`, display: "inline-flex", background: brand.gradient, borderRadius: 50, padding: "14px 32px", fontSize: 17, fontWeight: 700, color: "#fff", fontFamily: brand.fonts.body, boxShadow: `0 8px 32px ${brand.colors.primary}55` }}>
            {cta}
          </div>
        )}
      </div>
      {/* Bottom: Website */}
      {brand.website && (
        <div style={{ position: "relative", zIndex: 2, fontSize: 12, color: mutedColor, fontFamily: brand.fonts.body, letterSpacing: 1 }}>
          {brand.website.replace(/^https?:\/\/(www\.)?/, '')}
        </div>
      )}
    </AbsoluteFill>
  );
};

// ─── QUOTE graphic ────────────────────────────────────────────────────────────
const QuoteGraphic: React.FC<BrandGraphicProps & { dark: boolean }> = ({ headline, quoteAuthor, brand, bgStyle, logoUrl, animated }) => {
  const frame = useCurrentFrame();
  const op  = animated ? clamp(frame / 20) : 1;
  const scale = animated ? spring({ fps: 30, frame, config: { damping: 14, stiffness: 80 }, durationInFrames: 30 }) : 1;
  const dark = bgStyle !== "light";
  const textColor = dark ? "#fff" : "#111";
  const mutedColor = dark ? "rgba(255,255,255,0.6)" : "#666";

  return (
    <AbsoluteFill>
      <BgLayer bgStyle={bgStyle} brand={brand} />
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 80px", textAlign: "center", gap: 24 }}>
        <div style={{ fontSize: 100, color: brand.colors.primary, fontFamily: brand.fonts.display, lineHeight: 0.5, opacity: 0.4, transform: `scale(${scale})` }}>"</div>
        <div style={{ opacity: op, fontSize: 44, fontWeight: 800, color: textColor, fontFamily: brand.fonts.display, lineHeight: 1.2, letterSpacing: -0.5 }}>
          {headline}
        </div>
        {quoteAuthor && (
          <div style={{ opacity: op, fontSize: 16, color: mutedColor, fontFamily: brand.fonts.body, letterSpacing: 1 }}>
            — {quoteAuthor}
          </div>
        )}
        <AccentBar gradient={brand.gradient} width={80} />
        <Logo brand={brand} size={36} logoUrl={logoUrl} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── STATS graphic ────────────────────────────────────────────────────────────
const StatsGraphic: React.FC<BrandGraphicProps & { dark: boolean }> = ({ headline, subheadline, stats = [], brand, bgStyle, logoUrl, animated }) => {
  const dark = bgStyle !== "light";
  const textColor = dark ? brand.colors.heading || "#f8fafc" : "#111";
  const frame = useCurrentFrame();
  const titleOp = animated ? clamp(frame / 14) : 1;

  return (
    <AbsoluteFill>
      <BgLayer bgStyle={bgStyle} brand={brand} />
      <AbsoluteFill style={{ padding: "56px 60px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Logo brand={brand} size={40} logoUrl={logoUrl} />
        </div>
        <div>
          <AccentBar gradient={brand.gradient} />
          <div style={{ opacity: titleOp, fontSize: 46, fontWeight: 900, color: textColor, fontFamily: brand.fonts.display, lineHeight: 1.1, marginBottom: 8 }}>
            {headline}
          </div>
          {subheadline && (
            <div style={{ fontSize: 18, color: dark ? brand.colors.muted || "#94a3b8" : "#666", fontFamily: brand.fonts.body, marginBottom: 32 }}>
              {subheadline}
            </div>
          )}
          <div style={{ display: "flex", gap: 16 }}>
            {stats.slice(0, 3).map((s, i) => (
              <StatCard key={i} stat={s} brand={brand} dark={dark} delay={10 + i * 8} animated={animated || false} />
            ))}
          </div>
        </div>
        {brand.website && (
          <div style={{ fontSize: 12, color: dark ? brand.colors.muted || "#64748b" : "#888", fontFamily: brand.fonts.body, letterSpacing: 1 }}>
            {brand.website.replace(/^https?:\/\/(www\.)?/, '')}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── BANNER graphic (16:9) ────────────────────────────────────────────────────
const BannerGraphic: React.FC<BrandGraphicProps & { dark: boolean }> = ({ headline, subheadline, cta, brand, bgStyle, imageUrl, logoUrl, animated }) => {
  const frame = useCurrentFrame();
  const headOp = animated ? clamp(frame / 16) : 1;
  const headX  = animated ? interpolate(frame, [0, 20], [-60, 0], { extrapolateRight: "clamp" }) : 0;
  const subOp  = animated ? clamp((frame - 12) / 14) : 1;
  const dark = bgStyle !== "light";
  const textColor = dark ? "#fff" : "#111";

  return (
    <AbsoluteFill>
      <BgLayer bgStyle={bgStyle} brand={brand} imageUrl={imageUrl} />
      <AbsoluteFill style={{ display: "flex", flexDirection: "row", alignItems: "center", padding: "0 100px", gap: 80 }}>
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 20 }}><Logo brand={brand} size={52} logoUrl={logoUrl} /></div>
          <AccentBar gradient={brand.gradient} width={80} />
          <div style={{ opacity: headOp, transform: `translateX(${headX}px)`, fontSize: 64, fontWeight: 900, color: textColor, fontFamily: brand.fonts.display, lineHeight: 1.05, letterSpacing: -1, marginBottom: 16 }}>
            {headline}
          </div>
          {subheadline && (
            <div style={{ opacity: subOp, fontSize: 24, color: dark ? "rgba(255,255,255,0.75)" : "#555", fontFamily: brand.fonts.body, lineHeight: 1.5, marginBottom: 28 }}>
              {subheadline}
            </div>
          )}
          {cta && (
            <div style={{ display: "inline-flex", background: brand.gradient, borderRadius: 50, padding: "16px 40px", fontSize: 19, fontWeight: 700, color: "#fff", boxShadow: `0 8px 40px ${brand.colors.primary}55` }}>
              {cta}
            </div>
          )}
        </div>
        {imageUrl && (
          <div style={{ width: 480, height: 360, borderRadius: 24, overflow: "hidden", flexShrink: 0 }}>
            <Img src={imageUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── PRODUCT graphic ──────────────────────────────────────────────────────────
const ProductGraphic: React.FC<BrandGraphicProps & { dark: boolean }> = ({ headline, subheadline, cta, brand, bgStyle, imageUrl, logoUrl, animated }) => {
  const frame = useCurrentFrame();
  const imgScale = animated ? spring({ fps: 30, frame, config: { damping: 16, stiffness: 80 }, durationInFrames: 35 }) : 1;
  const textOp  = animated ? clamp((frame - 10) / 16) : 1;
  const dark = bgStyle !== "light";
  const textColor = dark ? "#fff" : "#111";

  return (
    <AbsoluteFill>
      <BgLayer bgStyle={bgStyle} brand={brand} />
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px", gap: 24 }}>
        <div style={{ position: "absolute", top: 40, left: 56 }}><Logo brand={brand} size={38} logoUrl={logoUrl} /></div>
        {imageUrl && (
          <div style={{ transform: `scale(${imgScale})`, width: 320, height: 320, borderRadius: 24, overflow: "hidden", boxShadow: `0 20px 60px ${brand.colors.primary}40` }}>
            <Img src={imageUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        )}
        <div style={{ opacity: textOp, textAlign: "center" }}>
          <div style={{ fontSize: 40, fontWeight: 900, color: textColor, fontFamily: brand.fonts.display, marginBottom: 8 }}>{headline}</div>
          {subheadline && <div style={{ fontSize: 18, color: dark ? brand.colors.muted || "#94a3b8" : "#666", fontFamily: brand.fonts.body }}>{subheadline}</div>}
          {cta && (
            <div style={{ marginTop: 20, display: "inline-flex", background: brand.gradient, borderRadius: 50, padding: "14px 32px", fontSize: 16, fontWeight: 700, color: "#fff" }}>
              {cta}
            </div>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── STORY graphic (9:16) ─────────────────────────────────────────────────────
const StoryGraphic: React.FC<BrandGraphicProps & { dark: boolean }> = ({ headline, subheadline, body, cta, brand, bgStyle, imageUrl, logoUrl, animated, dark }) => {
  const frame = useCurrentFrame();
  const headOp  = animated ? clamp(frame / 18) : 1;
  const headY   = animated ? interpolate(frame, [0, 22], [40, 0], { extrapolateRight: "clamp" }) : 0;
  const subOp   = animated ? clamp((frame - 14) / 14) : 1;
  const ctaScale = animated ? spring({ fps: 30, frame: frame - 30, config: { damping: 12, stiffness: 100 }, durationInFrames: 20 }) : 1;

  const textColor = bgStyle === "light" ? "#111" : "#fff";
  const mutedColor = bgStyle === "light" ? "#555" : "rgba(255,255,255,0.78)";

  return (
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 56px" }}>
      <BgLayer bgStyle={bgStyle} brand={brand} imageUrl={imageUrl} />
      {/* Top strip */}
      <div style={{ position: "relative", zIndex: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Logo brand={brand} size={44} logoUrl={logoUrl} />
        {brand.website && (
          <div style={{ fontSize: 11, color: mutedColor, letterSpacing: 1.2, fontFamily: brand.fonts.body }}>
            {brand.website.replace(/^https?:\/\/(www\.)?/, '')}
          </div>
        )}
      </div>
      {/* Center content */}
      <div style={{ position: "relative", zIndex: 2 }}>
        <AccentBar gradient={brand.gradient} width={56} height={5} />
        <div style={{ opacity: headOp, transform: `translateY(${headY}px)`, fontSize: 62, fontWeight: 900, color: textColor, fontFamily: brand.fonts.display, lineHeight: 1.05, marginBottom: 18, letterSpacing: -0.5 }}>
          {headline}
        </div>
        {subheadline && (
          <div style={{ opacity: subOp, fontSize: 24, color: mutedColor, fontFamily: brand.fonts.body, lineHeight: 1.55, marginBottom: 14 }}>
            {subheadline}
          </div>
        )}
        {body && (
          <div style={{ fontSize: 19, color: mutedColor, fontFamily: brand.fonts.body, lineHeight: 1.6, marginBottom: 28 }}>
            {body}
          </div>
        )}
        {cta && (
          <div style={{ transform: `scale(${ctaScale})`, display: "inline-flex", background: brand.gradient, borderRadius: 60, padding: "17px 40px", fontSize: 19, fontWeight: 700, color: "#fff", fontFamily: brand.fonts.body, boxShadow: `0 10px 40px ${brand.colors.primary}66` }}>
            {cta} →
          </div>
        )}
      </div>
      {/* Bottom decoration */}
      <div style={{ position: "relative", zIndex: 2, height: 4, background: brand.gradient, borderRadius: 4, opacity: 0.4 }} />
    </AbsoluteFill>
  );
};

// ─── CAROUSEL SLIDE — continuous canvas (panoramic stitching) ─────────────────
// Each slide is 1080×1080. The right edge bleeds into the next slide
// via a matching accent strip and consistent bg — swipe feels seamless.
const CarouselSlideGraphic: React.FC<BrandGraphicProps & { dark: boolean; slideIndex?: number; totalSlides?: number }> = ({
  headline, subheadline, body, cta, brand, bgStyle, logoUrl, animated, dark,
  slideIndex = 0, totalSlides = 1,
}) => {
  const frame = useCurrentFrame();
  const headOp  = animated ? clamp(frame / 16) : 1;
  const headY   = animated ? interpolate(frame, [0, 20], [24, 0], { extrapolateRight: "clamp" }) : 0;
  const subOp   = animated ? clamp((frame - 10) / 14) : 1;

  const textColor  = dark ? "#fff" : "#111";
  const mutedColor = dark ? "rgba(255,255,255,0.72)" : "#555";
  const isFirst    = slideIndex === 0;
  const isLast     = slideIndex === totalSlides - 1;

  return (
    <AbsoluteFill>
      <BgLayer bgStyle={bgStyle} brand={brand} />
      {/* Left edge connector (not on first slide) */}
      {!isFirst && (
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, background: brand.gradient, opacity: 0.6 }} />
      )}
      {/* Right edge connector (not on last slide) */}
      {!isLast && (
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, background: brand.gradient, opacity: 0.6 }} />
      )}
      {/* Slide number indicator */}
      <div style={{ position: "absolute", top: 44, right: 52, zIndex: 10, display: "flex", gap: 6 }}>
        {Array.from({ length: totalSlides }).map((_, i) => (
          <div key={i} style={{ width: i === slideIndex ? 20 : 6, height: 6, borderRadius: 3, background: i === slideIndex ? brand.colors.primary : "rgba(255,255,255,0.3)", transition: "width 0.3s" }} />
        ))}
      </div>
      <AbsoluteFill style={{ padding: "56px 60px", display: "flex", flexDirection: "column", justifyContent: "space-between", zIndex: 2 }}>
        {/* Top: Logo on first, just accent on others */}
        <div>
          {isFirst ? <Logo brand={brand} size={38} logoUrl={logoUrl} /> : (
            <div style={{ height: 6, width: 40, background: brand.gradient, borderRadius: 3 }} />
          )}
        </div>
        {/* Main content */}
        <div>
          <AccentBar gradient={brand.gradient} width={50} height={4} />
          <div style={{ opacity: headOp, transform: `translateY(${headY}px)`, fontSize: 50, fontWeight: 900, color: textColor, fontFamily: brand.fonts.display, lineHeight: 1.1, marginBottom: 14 }}>
            {headline}
          </div>
          {subheadline && (
            <div style={{ opacity: subOp, fontSize: 20, color: mutedColor, fontFamily: brand.fonts.body, lineHeight: 1.5, marginBottom: 12 }}>
              {subheadline}
            </div>
          )}
          {body && (
            <div style={{ fontSize: 16, color: mutedColor, fontFamily: brand.fonts.body, lineHeight: 1.65, marginBottom: 20 }}>
              {body}
            </div>
          )}
          {cta && isLast && (
            <div style={{ display: "inline-flex", background: brand.gradient, borderRadius: 50, padding: "13px 30px", fontSize: 16, fontWeight: 700, color: "#fff", boxShadow: `0 8px 30px ${brand.colors.primary}55` }}>
              {cta} →
            </div>
          )}
          {!isLast && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: brand.colors.primary, fontFamily: brand.fonts.body, fontWeight: 600 }}>
              Desliza → <span style={{ fontSize: 16 }}>›</span>
            </div>
          )}
        </div>
        {/* Bottom */}
        <div style={{ fontSize: 11, color: mutedColor, fontFamily: brand.fonts.body, letterSpacing: 1 }}>
          {isFirst && brand.website ? brand.website.replace(/^https?:\/\/(www\.)?/, '') : `${slideIndex + 1} / ${totalSlides}`}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── ROOT: BrandGraphic ───────────────────────────────────────────────────────
export const BrandGraphic: React.FC<BrandGraphicProps & { slideIndex?: number; totalSlides?: number }> = (props) => {
  const { type, bgStyle } = props;
  const dark = bgStyle !== "light";

  return (
    <AbsoluteFill>
      {type === "quote"    && <QuoteGraphic      {...props} dark={dark} />}
      {type === "stats"    && <StatsGraphic      {...props} dark={dark} />}
      {type === "banner"   && <BannerGraphic     {...props} dark={dark} />}
      {type === "product"  && <ProductGraphic    {...props} dark={dark} />}
      {type === "story"    && <StoryGraphic      {...props} dark={dark} />}
      {type === "carousel" && <CarouselSlideGraphic {...props} dark={dark} slideIndex={props.slideIndex ?? 0} totalSlides={props.totalSlides ?? 1} />}
      {type === "post"     && <PostGraphic       {...props} dark={dark} />}
    </AbsoluteFill>
  );
};
