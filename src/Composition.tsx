import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Audio,
  staticFile,
} from "remotion";

const Orb: React.FC<{
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
}> = ({ x, y, size, color, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pulse = interpolate(
    Math.sin(((frame - delay) * Math.PI) / 40),
    [-1, 1],
    [0.85, 1.15]
  );

  const drift = interpolate(
    Math.sin(((frame - delay) * Math.PI) / 60),
    [-1, 1],
    [-20, 20]
  );

  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        transform: `translate(-50%, -50%) scale(${pulse}) translateY(${drift}px)`,
        filter: "blur(60px)",
        opacity: 0.6,
      }}
    />
  );
};

export const MyComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Background gradient animation
  const hue1 = interpolate(frame, [0, durationInFrames], [220, 300]);
  const hue2 = interpolate(frame, [0, durationInFrames], [270, 180]);
  const hue3 = interpolate(frame, [0, durationInFrames], [310, 240]);

  // Text spring entrance
  const textScale = spring({
    fps,
    frame,
    config: { damping: 12, stiffness: 120, mass: 0.8 },
    durationInFrames: 40,
  });

  const textOpacity = interpolate(frame, [0, 25], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Glow pulse
  const glowSize = interpolate(
    Math.sin((frame * Math.PI) / 30),
    [-1, 1],
    [40, 80]
  );

  // Subtitle fade in
  const subtitleOpacity = interpolate(frame, [35, 55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const subtitleY = interpolate(frame, [35, 55], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 30% 40%, hsl(${hue1}, 80%, 25%) 0%, transparent 60%),
                     radial-gradient(ellipse at 70% 60%, hsl(${hue2}, 90%, 20%) 0%, transparent 60%),
                     radial-gradient(ellipse at 50% 50%, hsl(${hue3}, 70%, 10%) 0%, 100%)`,
        backgroundColor: `hsl(${hue3}, 60%, 8%)`,
        overflow: "hidden",
      }}
    >
      {/* Ambient orbs */}
      <Orb x={20} y={25} size={500} color="rgba(120, 60, 255, 0.5)" delay={0} />
      <Orb x={75} y={65} size={400} color="rgba(255, 60, 180, 0.4)" delay={20} />
      <Orb x={55} y={20} size={350} color="rgba(60, 180, 255, 0.4)" delay={10} />
      <Orb x={30} y={75} size={300} color="rgba(255, 150, 50, 0.3)" delay={30} />

      {/* Stars / particles */}
      {Array.from({ length: 30 }).map((_, i) => {
        const px = ((i * 37 + 13) % 100);
        const py = ((i * 53 + 7) % 100);
        const twinkle = interpolate(
          Math.sin(((frame + i * 7) * Math.PI) / 25),
          [-1, 1],
          [0.2, 1]
        );
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${px}%`,
              top: `${py}%`,
              width: i % 3 === 0 ? 3 : 2,
              height: i % 3 === 0 ? 3 : 2,
              borderRadius: "50%",
              background: "white",
              opacity: twinkle * 0.7,
            }}
          />
        );
      })}

      {/* Center content */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
        }}
      >
        {/* Main text */}
        <div
          style={{
            transform: `scale(${textScale})`,
            opacity: textOpacity,
            fontSize: 110,
            fontWeight: 900,
            color: "white",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            textShadow: `0 0 ${glowSize}px rgba(180, 100, 255, 0.9),
                         0 0 ${glowSize * 1.5}px rgba(255, 60, 180, 0.6),
                         0 4px 20px rgba(0,0,0,0.5)`,
            letterSpacing: "-2px",
            textAlign: "center",
            lineHeight: 1,
          }}
        >
          ¡Ya funciona!
        </div>

        {/* Subtitle */}
        <div
          style={{
            opacity: subtitleOpacity,
            transform: `translateY(${subtitleY}px)`,
            fontSize: 32,
            color: "rgba(255,255,255,0.7)",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontWeight: 400,
            letterSpacing: "4px",
            textTransform: "uppercase",
          }}
        >
          Remotion • React • Video
        </div>
      </AbsoluteFill>

      {/* Optional audio — drop an MP3 at public/music.mp3 to enable */}
      {/* <Audio src={staticFile("music.mp3")} /> */}
    </AbsoluteFill>
  );
};
