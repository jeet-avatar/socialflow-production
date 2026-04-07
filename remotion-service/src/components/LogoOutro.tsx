/**
 * LogoOutro — 4-second (120-frame) sender end-card.
 *
 * From the SENDER's perspective — your company's moment to shine.
 *
 * Timeline:
 *  0–18   Aurora background fades in + particle field emerges
 *  8–25   Logo springs up elastically from bottom with bounce
 *  12–35  Three concentric rings burst outward from logo centre
 *  30–50  Sender name slides up + glows in
 *  48–64  Divider line grows outward from centre
 *  55–70  CTA card scales in with glass-morphism border
 *  108–120 Everything fades out elegantly
 */

import React from 'react';
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig,
  spring, interpolate, Img,
} from 'remotion';
import ParticleField from './ParticleField';
import { hexToHue } from '../utils/colorUtils';

export const OUTRO_FRAMES = 120;

interface LogoOutroProps {
  user_logo_url: string;
  client_logo_url?: string;
  sender_name?: string;
  cta_text?: string;
  accent_color?: string;
}

const LogoOutro: React.FC<LogoOutroProps> = ({
  user_logo_url,
  client_logo_url,
  sender_name = '',
  cta_text = 'Book a Discovery Call',
  accent_color = '#8b5cf6',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const hue = hexToHue(accent_color);
  const C = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

  // ── Master opacity ────────────────────────────────────────────────────────
  const fadeIn  = interpolate(frame, [0, 18], [0, 1], C);
  const fadeOut = interpolate(frame, [OUTRO_FRAMES - 12, OUTRO_FRAMES], [1, 0], C);
  const masterOp = Math.min(fadeIn, fadeOut);

  // Slow push-in
  const cameraZoom = interpolate(frame, [0, OUTRO_FRAMES], [1.0, 1.04], C);

  // ── Logo — elastic bounce from below ──────────────────────────────────────
  const logoY     = spring({ fps, frame: Math.max(0, frame - 8), config: { damping: 8, stiffness: 85, mass: 1.1 }, from: 120, to: 0 });
  const logoScale = spring({ fps, frame: Math.max(0, frame - 8), config: { damping: 8, stiffness: 85, mass: 1.1 }, from: 0.01, to: 1 });
  const logoOp    = interpolate(frame, [8, 24], [0, 1], C);
  const glowPulse = interpolate(frame % 50, [0, 25, 50], [0.65, 1.0, 0.65], C);
  const glowPx    = frame > 28 ? 58 * glowPulse : 0;

  // ── Ring burst — 3 rings expanding from logo ──────────────────────────────
  const ring1S  = spring({ fps, frame: Math.max(0, frame - 12), config: { damping: 16, stiffness: 55 }, from: 0.01, to: 1 });
  const ring1Op = interpolate(frame, [12, 20, 52], [0, 0.7, 0.12], C);
  const ring2S  = spring({ fps, frame: Math.max(0, frame - 17), config: { damping: 16, stiffness: 45 }, from: 0, to: 1 });
  const ring2Op = interpolate(frame, [17, 25, 60], [0, 0.5, 0.08], C);
  const ring3S  = spring({ fps, frame: Math.max(0, frame - 22), config: { damping: 16, stiffness: 38 }, from: 0, to: 1 });
  const ring3Op = interpolate(frame, [22, 30, 68], [0, 0.35, 0.05], C);

  // ── Sender name ───────────────────────────────────────────────────────────
  const nameY  = spring({ fps, frame: Math.max(0, frame - 30), config: { damping: 16, stiffness: 72 }, from: 28, to: 0 });
  const nameOp = interpolate(frame, [30, 48], [0, 1], C);

  // ── Divider line ──────────────────────────────────────────────────────────
  const lineW = interpolate(frame, [48, 64], [0, 260], C);
  const lineOp = interpolate(frame, [48, 62], [0, 1], C);

  // ── CTA card ──────────────────────────────────────────────────────────────
  const ctaScale = spring({ fps, frame: Math.max(0, frame - 55), config: { damping: 18, stiffness: 82 }, from: 0.82, to: 1 });
  const ctaOp   = interpolate(frame, [55, 70], [0, 1], C);

  // ── Client logo watermark ─────────────────────────────────────────────────
  const clientOp = interpolate(frame, [58, 74], [0, 0.45], C);

  const LOGO_CENTER_Y = '38%';
  const namePad = sender_name ? 120 : 70;

  return (
    <AbsoluteFill style={{ opacity: masterOp, transform: `scale(${cameraZoom})` }}>
      {/* ── Aurora background ── */}
      <AbsoluteFill style={{
        background: `
          radial-gradient(ellipse at 50% 40%, hsla(${hue}, 82%, 18%, 1) 0%, transparent 52%),
          radial-gradient(ellipse at 18% 72%, hsla(${hue + 38}, 66%, 12%, 1) 0%, transparent 50%),
          radial-gradient(ellipse at 82% 28%, hsla(${hue - 28}, 62%, 10%, 1) 0%, transparent 46%),
          linear-gradient(168deg, hsl(${hue - 14}, 54%, 5%) 0%, hsl(${hue + 32}, 44%, 3%) 100%)
        `,
      }} />

      {/* Pulsing centre glow */}
      <AbsoluteFill style={{
        background: `radial-gradient(ellipse at 50% 40%, hsla(${hue}, 90%, 54%, 0.13) 0%, transparent 44%)`,
        pointerEvents: 'none',
      }} />

      {/* Particles */}
      <div style={{ opacity: 0.48, pointerEvents: 'none', mixBlendMode: 'screen' }}>
        <ParticleField hue={hue} count={30} />
      </div>

      {/* Scanlines */}
      <AbsoluteFill style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.05) 3px, rgba(0,0,0,0.05) 4px)',
        pointerEvents: 'none',
      }} />
      {/* Vignette */}
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse at center, transparent 36%, rgba(0,0,0,0.88) 100%)',
        pointerEvents: 'none',
      }} />

      {/* ── Expanding ring burst behind logo ── */}
      {[
        { s: ring1S, o: ring1Op, size: 220, id: 'r1', bw: 1.5 },
        { s: ring2S, o: ring2Op, size: 340, id: 'r2', bw: 1.1 },
        { s: ring3S, o: ring3Op, size: 460, id: 'r3', bw: 0.7 },
      ].map((r) => (
        <div key={r.id} style={{
          position: 'absolute', left: '50%', top: LOGO_CENTER_Y,
          width: r.size, height: r.size,
          transform: `translate(-50%, -50%) scale(${r.s})`,
          borderRadius: '50%',
          border: `${r.bw}px solid ${accent_color}`,
          opacity: r.o,
          pointerEvents: 'none',
        }} />
      ))}

      {/* ── Sender logo (centrepiece) ── */}
      {user_logo_url && (
        <div style={{
          position: 'absolute', left: '50%', top: LOGO_CENTER_Y,
          transform: `translate(-50%, calc(-50% + ${logoY}px)) scale(${logoScale})`,
          opacity: logoOp,
          filter: `drop-shadow(0 0 ${glowPx}px ${accent_color}99) drop-shadow(0 4px 22px rgba(0,0,0,0.95))`,
        }}>
          <Img src={user_logo_url} style={{ width: 186, height: 186, objectFit: 'contain' }} />
        </div>
      )}

      {/* ── Sender name ── */}
      {sender_name && (
        <div style={{
          position: 'absolute', width: '82%', left: '9%', textAlign: 'center',
          top: `calc(${LOGO_CENTER_Y} + ${namePad}px)`,
          opacity: nameOp, transform: `translateY(${nameY}px)`,
          fontSize: 46, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
          color: '#ffffff', letterSpacing: '-0.02em',
          textShadow: `0 0 50px ${accent_color}66, 0 2px 18px rgba(0,0,0,0.9)`,
        }}>{sender_name}</div>
      )}

      {/* ── Divider ── */}
      <div style={{
        position: 'absolute', left: '50%', transform: 'translateX(-50%)',
        top: `calc(${LOGO_CENTER_Y} + ${namePad + (sender_name ? 62 : 12)}px)`,
        width: lineW, height: 1,
        background: `linear-gradient(90deg, transparent, ${accent_color}, transparent)`,
        boxShadow: `0 0 16px ${accent_color}`,
        opacity: lineOp,
      }} />

      {/* ── CTA card ── */}
      <div style={{
        position: 'absolute', left: '50%',
        top: `calc(${LOGO_CENTER_Y} + ${namePad + (sender_name ? 82 : 30)}px)`,
        transform: `translateX(-50%) scale(${ctaScale})`,
        opacity: ctaOp,
        background: `linear-gradient(135deg, ${accent_color}28, ${accent_color}0e)`,
        border: `1px solid ${accent_color}55`,
        borderRadius: 14,
        padding: '14px 52px',
        backdropFilter: 'blur(10px)',
        boxShadow: `0 0 36px ${accent_color}33, inset 0 1px 0 rgba(255,255,255,0.12)`,
        whiteSpace: 'nowrap',
      }}>
        <span style={{
          fontSize: 21, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 700,
          color: accent_color, letterSpacing: '0.14em', textTransform: 'uppercase',
          textShadow: `0 0 28px ${accent_color}88`,
        }}>{cta_text}</span>
      </div>

      {/* ── Client logo — top-right watermark ── */}
      {client_logo_url && (
        <div style={{
          position: 'absolute', top: 28, right: 28, opacity: clientOp,
          filter: `drop-shadow(0 0 8px ${accent_color}66)`,
        }}>
          <Img src={client_logo_url} style={{ width: 52, height: 52, objectFit: 'contain' }} />
        </div>
      )}
    </AbsoluteFill>
  );
};

export default LogoOutro;
