/**
 * SceneIntro — cinematic 3-second (90-frame) opening card.
 *
 * Timeline:
 *  0–15   Letterbox bars + particles emerge
 *  10–35  "A message for" tag slides in
 *  22–55  Prospect company name reveals word by word
 *  38–65  Client logo scales in with glow + pulse rings
 *  55–78  Sender logo appears bottom-right with "from" label
 *  78–90  Cross-fade out
 */

import React from 'react';
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig,
  spring, interpolate, Img,
} from 'remotion';
import ParticleField from './ParticleField';
import PulseRings from './PulseRings';
import { hexToHue } from '../utils/colorUtils';

export const INTRO_FRAMES = 90;

interface SceneIntroProps {
  client_logo_url: string;
  user_logo_url: string;
  company_name?: string;
  accent_color?: string;
}

const SceneIntro: React.FC<SceneIntroProps> = ({
  client_logo_url,
  user_logo_url,
  company_name = '',
  accent_color = '#8b5cf6',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const hue = hexToHue(accent_color);

  // ── Background aurora ─────────────────────────────────────────────────────
  const bgOp    = interpolate(frame, [0, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [INTRO_FRAMES - 12, INTRO_FRAMES], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const spotX   = interpolate(frame, [0, INTRO_FRAMES], [30, 60], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // ── Letterbox bars ────────────────────────────────────────────────────────
  const barH = spring({ fps, frame, config: { damping: 22, stiffness: 85 }, from: 0, to: 120 });

  // ── "A message for" label ─────────────────────────────────────────────────
  const tagOp = interpolate(frame, [10, 28], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const tagX  = spring({ fps, frame: Math.max(0, frame - 10), config: { damping: 18, stiffness: 90 }, from: -40, to: 0 });

  // ── Company name (word by word) ────────────────────────────────────────────
  const words = company_name.toUpperCase().split(' ');

  // ── Client logo ───────────────────────────────────────────────────────────
  const logoScale = spring({ fps, frame: Math.max(0, frame - 38), config: { damping: 11, stiffness: 85 }, from: 0, to: 1 });
  const logoOp    = interpolate(frame, [38, 55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const glowPulse = interpolate(frame % 50, [0, 25, 50], [0.6, 1.0, 0.6], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const glowPx    = frame > 55 ? 48 * glowPulse : 0;

  // ── Sender logo ───────────────────────────────────────────────────────────
  const senderOp = interpolate(frame, [55, 72], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const senderY  = spring({ fps, frame: Math.max(0, frame - 55), config: { damping: 16, stiffness: 80 }, from: 20, to: 0 });

  // ── Divider line (shows with sender) ─────────────────────────────────────
  const lineW = interpolate(frame, [60, 80], [0, 180], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const masterOp = Math.min(bgOp, fadeOut);

  return (
    <AbsoluteFill style={{ opacity: masterOp }}>
      {/* Aurora background */}
      <AbsoluteFill style={{
        background: `
          radial-gradient(ellipse at ${spotX}% 45%, hsla(${hue}, 75%, 18%, 1) 0%, transparent 55%),
          radial-gradient(ellipse at ${100 - spotX}% 65%, hsla(${hue + 40}, 65%, 12%, 1) 0%, transparent 50%),
          linear-gradient(165deg, hsl(${hue - 12}, 55%, 5%) 0%, hsl(${hue + 28}, 45%, 3%) 100%)
        `,
      }} />

      {/* Particles */}
      <div style={{ opacity: 0.55, pointerEvents: 'none', mixBlendMode: 'screen' }}>
        <ParticleField hue={hue} count={26} />
      </div>

      {/* Pulse rings behind logo */}
      <div style={{ position: 'absolute', inset: 0, opacity: logoOp * 0.35, pointerEvents: 'none' }}>
        <PulseRings hue={hue} cx="50%" cy="40%" baseSize={220} />
      </div>

      {/* Scanlines */}
      <AbsoluteFill style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px)',
        pointerEvents: 'none',
      }} />
      {/* Vignette */}
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.78) 100%)',
        pointerEvents: 'none',
      }} />

      {/* Top letterbox bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: barH,
        background: '#000', borderBottom: `1px solid ${accent_color}33`,
      }} />
      {/* Bottom letterbox bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: barH,
        background: '#000', borderTop: `1px solid ${accent_color}33`,
      }} />

      {/* ── "A message for" tag ── */}
      <div style={{
        position: 'absolute', left: '10%', top: '28%',
        opacity: tagOp, transform: `translateX(${tagX}px)`,
        fontSize: 20, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 500,
        color: accent_color, letterSpacing: '0.30em', textTransform: 'uppercase',
      }}>A Message For</div>

      {/* ── Accent rule ── */}
      <div style={{
        position: 'absolute', left: '10%', top: 'calc(28% + 30px)',
        width: `${tagOp * 55}%`, height: 1, background: accent_color,
        opacity: tagOp, boxShadow: `0 0 12px ${accent_color}`,
      }} />

      {/* ── Company name: word-by-word ── */}
      <div style={{
        position: 'absolute', left: '10%', top: 'calc(28% + 46px)',
        width: '80%', display: 'flex', flexWrap: 'wrap', gap: '0.14em',
      }}>
        {words.map((word, i) => {
          const delay  = 22 + i * 12;
          const wordY  = spring({ fps, frame: Math.max(0, frame - delay), config: { damping: 13, stiffness: 70 }, from: 50, to: 0 });
          const wordOp = interpolate(frame, [delay, delay + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <span key={`word-${i}`} style={{
              display: 'inline-block',
              fontSize: 80, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
              color: i % 2 === 0 ? '#ffffff' : accent_color,
              letterSpacing: '-0.025em', lineHeight: 1.05,
              opacity: wordOp, transform: `translateY(${wordY}px)`,
              textShadow: i % 2 !== 0 ? `0 0 55px ${accent_color}` : '0 0 40px rgba(255,255,255,0.15)',
            }}>{word}</span>
          );
        })}
      </div>

      {/* ── Client logo (centered-ish) with glow ── */}
      {client_logo_url && (
        <div style={{
          position: 'absolute', right: '10%', top: '50%',
          transform: `translateY(-50%) scale(${logoScale})`,
          opacity: logoOp,
          filter: `drop-shadow(0 0 ${glowPx}px ${accent_color}88)`,
        }}>
          <Img src={client_logo_url} style={{
            width: 140, height: 140, objectFit: 'contain',
            filter: 'brightness(1.1)',
          }} />
        </div>
      )}

      {/* ── Sender logo + "from" label ── */}
      <div style={{
        position: 'absolute', bottom: 'calc(13% + 24px)', right: '10%',
        opacity: senderOp, transform: `translateY(${senderY}px)`,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: lineW, height: 1,
          background: `linear-gradient(90deg, transparent, ${accent_color}88)`,
        }} />
        <span style={{
          fontSize: 16, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 500,
          color: `${accent_color}cc`, letterSpacing: '0.22em', textTransform: 'uppercase',
        }}>from</span>
        {user_logo_url && (
          <Img src={user_logo_url} style={{
            width: 48, height: 48, objectFit: 'contain',
            filter: `drop-shadow(0 0 10px ${accent_color}88) drop-shadow(0 2px 6px rgba(0,0,0,0.9))`,
          }} />
        )}
      </div>

      {/* ── Light flash at reveal peak ── */}
      <AbsoluteFill style={{
        background: `linear-gradient(135deg, transparent 30%, rgba(255,255,255,${interpolate(frame, [38, 42, 50], [0, 0.08, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}) 50%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
    </AbsoluteFill>
  );
};

export default SceneIntro;
