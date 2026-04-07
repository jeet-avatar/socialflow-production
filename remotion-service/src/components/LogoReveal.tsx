import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Img,
} from 'remotion';
import ParticleField from './ParticleField';

interface LogoRevealProps {
  client_logo_url: string;
  user_logo_url: string;
  company_name?: string;
}

const LogoReveal: React.FC<LogoRevealProps> = ({
  client_logo_url,
  user_logo_url,
  company_name,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // ── Background ──────────────────────────────────────────────────────────
  const bgHue = interpolate(frame, [0, durationInFrames], [225, 245], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Light ray flash at frame 55 ─────────────────────────────────────────
  const flashOpacity = interpolate(frame, [52, 58, 65, 80], [0, 0.55, 0.2, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Company name ────────────────────────────────────────────────────────
  const nameDelay = 18;
  const nameY = spring({
    fps,
    frame: Math.max(0, frame - nameDelay),
    config: { damping: 14, stiffness: 70, mass: 0.8 },
    from: 40,
    to: 0,
  });
  const nameOpacity = interpolate(frame, [nameDelay, nameDelay + 16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Client logo ─────────────────────────────────────────────────────────
  const clientDelay = 35;
  const clientScale = spring({
    fps,
    frame: Math.max(0, frame - clientDelay),
    config: { damping: 12, stiffness: 90, mass: 0.6 },
    from: 0,
    to: 1,
  });
  const clientOpacity = interpolate(frame, [clientDelay, clientDelay + 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // Glow pulse on client logo after it appears
  const glowPulse = interpolate(
    frame % 50,
    [0, 25, 50],
    [0.6, 1.0, 0.6],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const glowSize = frame > clientDelay + 20 ? 40 * glowPulse : 0;

  // ── User logo ────────────────────────────────────────────────────────────
  const userDelay = 60;
  const userScale = spring({
    fps,
    frame: Math.max(0, frame - userDelay),
    config: { damping: 14, stiffness: 80, mass: 0.7 },
    from: 0,
    to: 1,
  });
  const userOpacity = interpolate(frame, [userDelay, userDelay + 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Separator line ───────────────────────────────────────────────────────
  const lineWidth = interpolate(frame, [userDelay + 5, userDelay + 30], [0, 300], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Overall fade out at end ──────────────────────────────────────────────
  const fadeOut = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ opacity: fadeOut }}>
      {/* Deep gradient background */}
      <AbsoluteFill
        style={{
          background: `
            radial-gradient(ellipse at 40% 50%, hsla(${bgHue}, 70%, 12%, 1) 0%, transparent 65%),
            radial-gradient(ellipse at 65% 55%, hsla(${bgHue + 25}, 60%, 8%, 1) 0%, transparent 60%),
            linear-gradient(160deg, hsl(${bgHue - 10}, 50%, 5%) 0%, hsl(${bgHue + 20}, 40%, 3%) 100%)
          `,
        }}
      />

      {/* Rising particle field */}
      <ParticleField hue={bgHue} count={18} />

      {/* Scanlines */}
      <AbsoluteFill
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px)',
          pointerEvents: 'none',
        }}
      />

      {/* Vignette */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.75) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Light ray flash */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(135deg, transparent 30%, rgba(255,255,255,${flashOpacity}) 50%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Center content */}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 32,
        }}
      >
        {/* Client logo with glow */}
        {client_logo_url && (
          <div
            style={{
              transform: `scale(${clientScale})`,
              opacity: clientOpacity,
              filter: `drop-shadow(0 0 ${glowSize}px hsla(${bgHue}, 80%, 65%, 0.7))`,
            }}
          >
            <Img
              src={client_logo_url}
              style={{
                width: 200,
                height: 200,
                objectFit: 'contain',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 28,
                padding: 20,
              }}
            />
          </div>
        )}

        {/* Company name */}
        {company_name && (
          <div
            style={{
              transform: `translateY(${nameY}px)`,
              opacity: nameOpacity,
              color: '#ffffff',
              fontSize: 52,
              fontFamily: 'Inter, Arial, sans-serif',
              fontWeight: 900,
              letterSpacing: '-0.02em',
              textShadow: `0 0 40px hsla(${bgHue}, 80%, 70%, 0.6), 0 4px 16px rgba(0,0,0,0.9)`,
              textAlign: 'center',
              maxWidth: '80%',
            }}
          >
            {company_name}
          </div>
        )}

        {/* Separator + user logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            opacity: userOpacity,
          }}
        >
          <div
            style={{
              width: lineWidth / 2,
              height: 1,
              background: `linear-gradient(90deg, transparent, hsla(${bgHue}, 70%, 65%, 0.6))`,
            }}
          />

          {user_logo_url && (
            <div style={{ transform: `scale(${userScale})` }}>
              <Img
                src={user_logo_url}
                style={{
                  width: 90,
                  height: 90,
                  objectFit: 'contain',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: 16,
                  padding: 10,
                }}
              />
            </div>
          )}

          <div
            style={{
              width: lineWidth / 2,
              height: 1,
              background: `linear-gradient(90deg, hsla(${bgHue}, 70%, 65%, 0.6), transparent)`,
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default LogoReveal;
