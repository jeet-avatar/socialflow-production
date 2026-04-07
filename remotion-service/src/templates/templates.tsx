/**
 * Expert-designed scene templates for SocialFlow video generation.
 * Each template has a completely unique visual identity.
 * GPT picks which template to use at runtime — it does NOT design the visuals.
 *
 * Templates:
 *  1.  CinematicReveal  — horizontal line + headline slides up beneath it
 *  2.  StatShot         — giant animated number counter + pulsing rings
 *  3.  SplitStage       — left/right split panel, icon left + headline right
 *  4.  WordBurst        — single massive full-screen word, maximum impact
 *  5.  NeonFrame        — corner bracket accents + centered headline
 *  6.  TimelineStep     — large ghost step number + rule + headline
 *  7.  IconHero         — large centered icon + orbital ring + headline below
 *  8.  WaveText         — word-by-word staggered reveal, alternating colors
 *  9.  QuoteReveal      — giant quote mark + italic text + attribution
 * 10.  CTABurst         — animated arrows + CTA headline + scanlines
 * 11.  GlitchReveal     — RGB channel split + glitch bars, snaps clean
 * 12.  ZoomPunch        — headline zooms 350%→100% with blur, explosive
 * 13.  HorizontalSlam   — accent panels slam from both sides, headline punches center
 * 14.  DataStream       — matrix data chars fall + scan line sweeps revealing headline
 * 15.  CinematicBars    — letterbox bars slide in, expanding letter-spacing headline
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import SceneIcon from '../components/SceneIcon';
import type { IconName } from '../components/SceneIcon';

export interface TemplateProps {
  headline: string;
  subtext: string;
  accentColor: string;
  icon?: IconName;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CinematicReveal
// Best for: speaker intro, key statements, brand moments
// Visual: Thin accent line sweeps in. Subtext above, headline slides up below.
// ─────────────────────────────────────────────────────────────────────────────
export const CinematicReveal: React.FC<TemplateProps> = ({ headline, subtext, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const lineW  = spring({ fps, frame,                       config: { damping: 22, stiffness: 55 }, from: 0,  to: 84 });
  const headY  = spring({ fps, frame: Math.max(0, frame - 22), config: { damping: 14, stiffness: 65 }, from: 55, to: 0  });
  const headOp = interpolate(frame, [22, 38], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subOp  = interpolate(frame, [38, 52], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: 'transparent' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 25% 50%, rgba(255,255,255,0.03) 0%, transparent 65%)' }} />

      {subtext && (
        <div style={{
          position: 'absolute', top: 'calc(44% - 44px)', left: '8%',
          fontSize: 18, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 600,
          color: accentColor, letterSpacing: '0.28em', textTransform: 'uppercase', opacity: subOp,
        }}>{subtext}</div>
      )}

      <div style={{
        position: 'absolute', top: '44%', left: '8%',
        width: `${lineW}%`, height: 2,
        background: `linear-gradient(90deg, ${accentColor}, ${accentColor}00)`,
        boxShadow: `0 0 16px ${accentColor}`,
      }} />

      <div style={{
        position: 'absolute', top: 'calc(44% + 18px)', left: '8%', width: '84%',
        fontSize: 108, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
        color: '#fff', letterSpacing: '-0.025em', lineHeight: 1.05,
        opacity: headOp, transform: `translateY(${headY}px)`,
        textShadow: `0 0 80px ${accentColor}55`,
      }}>{headline}</div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. StatShot
// Best for: statistics, metrics, achievements ("3.2x faster", "97% accuracy")
// Visual: Giant animated number counts up. Two expanding rings. Radial glow.
// ─────────────────────────────────────────────────────────────────────────────
export const StatShot: React.FC<TemplateProps> = ({ headline, subtext, accentColor }) => {
  const frame = useCurrentFrame();

  const numMatch = headline.match(/^([\d.]+)(.*)/);
  const displayValue = numMatch
    ? (() => {
        const t     = Math.min(1, frame / 45);
        const eased = 1 - Math.pow(1 - t, 3);
        const val   = parseFloat(numMatch[1]) * eased;
        return `${numMatch[1].includes('.') ? val.toFixed(1) : Math.round(val)}${numMatch[2]}`;
      })()
    : headline;

  const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subOp  = interpolate(frame, [30, 48], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const r1S  = interpolate(frame % 70, [0, 70], [0.5, 1.7], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const r1Op = interpolate(frame % 70, [0, 35, 70], [0.5, 0.15, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const r2S  = interpolate((frame + 35) % 70, [0, 70], [0.5, 1.7], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const r2Op = interpolate((frame + 35) % 70, [0, 35, 70], [0.5, 0.15, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, ${accentColor}28 0%, #050510 65%)` }}>
      {[{ s: r1S, o: r1Op }, { s: r2S, o: r2Op }].map((r, i) => (
        <div key={i} style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 360, height: 360,
          transform: `translate(-50%, -50%) scale(${r.s})`,
          borderRadius: '50%', border: `2px solid ${accentColor}`, opacity: r.o,
        }} />
      ))}

      <div style={{
        position: 'absolute', width: '100%', textAlign: 'center', top: '25%',
        fontSize: 168, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
        color: '#fff', letterSpacing: '-0.04em',
        textShadow: `0 0 130px ${accentColor}`, opacity: fadeIn,
      }}>{displayValue}</div>

      {subtext && (
        <div style={{
          position: 'absolute', width: '100%', textAlign: 'center', top: 'calc(25% + 190px)',
          fontSize: 28, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 500,
          color: `${accentColor}cc`, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: subOp,
        }}>{subtext}</div>
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. SplitStage
// Best for: product / feature intro with an icon, company + offering
// Visual: Left dark panel (icon + label) | vertical accent line | right headline
// ─────────────────────────────────────────────────────────────────────────────
export const SplitStage: React.FC<TemplateProps> = ({ headline, subtext, accentColor, icon }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const iconScale = spring({ fps, frame,                          config: { damping: 12, stiffness: 80 }, from: 0,   to: 1 });
  const headX    = spring({ fps, frame: Math.max(0, frame - 15), config: { damping: 16, stiffness: 70 }, from: 80,  to: 0 });
  const headOp   = interpolate(frame, [15, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subOp    = interpolate(frame, [30, 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const displayIcon: IconName = (icon && icon !== 'none') ? icon : 'globe';

  return (
    <AbsoluteFill style={{ background: 'transparent' }}>
      {/* Left panel */}
      <div style={{
        position: 'absolute', left: 0, top: 0, width: '38%', height: '100%',
        background: `linear-gradient(180deg, ${accentColor}12 0%, ${accentColor}05 100%)`,
        borderRight: `1px solid ${accentColor}22`,
      }}>
        <div style={{
          position: 'absolute', top: '42%', left: '50%',
          transform: `translate(-50%, -50%) scale(${iconScale})`,
        }}>
          <SceneIcon icon={displayIcon} size={124} color={accentColor} />
        </div>
        {subtext && (
          <div style={{
            position: 'absolute', bottom: '26%', left: 0, width: '100%', textAlign: 'center',
            fontSize: 21, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 600,
            color: `${accentColor}cc`, letterSpacing: '0.15em', textTransform: 'uppercase', opacity: subOp,
          }}>{subtext}</div>
        )}
      </div>

      {/* Vertical accent line */}
      <div style={{
        position: 'absolute', left: '38%', top: '10%', width: 2, height: '80%',
        background: `linear-gradient(180deg, transparent, ${accentColor}, transparent)`,
      }} />

      {/* Right headline */}
      <div style={{
        position: 'absolute', left: 'calc(38% + 52px)', top: '28%', width: 'calc(54% - 52px)',
        fontSize: 86, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
        color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.12,
        opacity: headOp, transform: `translateX(${headX}px)`,
        textShadow: `0 0 60px ${accentColor}44`,
      }}>{headline}</div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. WordBurst
// Best for: single powerful word/phrase — maximum visual impact
// Visual: Giant word fills most of the screen. Pure power.
// ─────────────────────────────────────────────────────────────────────────────
export const WordBurst: React.FC<TemplateProps> = ({ headline, subtext, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale  = spring({ fps, frame, config: { damping: 18, stiffness: 60 }, from: 0.7, to: 1 });
  const op     = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subOp  = interpolate(frame, [22, 38], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: 'transparent' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, ${accentColor}1a 0%, transparent 68%)` }} />

      <div style={{
        position: 'absolute', width: '100%', textAlign: 'center', top: '24%',
        fontSize: 172, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
        color: '#fff', letterSpacing: '-0.03em', lineHeight: 1,
        opacity: op, transform: `scale(${scale})`,
        textShadow: `0 0 150px ${accentColor}99`,
      }}>{headline}</div>

      {subtext && (
        <div style={{
          position: 'absolute', width: '100%', textAlign: 'center', top: 'calc(24% + 200px)',
          fontSize: 26, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 400,
          color: `${accentColor}bb`, letterSpacing: '0.22em', textTransform: 'uppercase', opacity: subOp,
        }}>{subtext}</div>
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. NeonFrame
// Best for: corporate, trust-building, established brand moments
// Visual: Corner L-bracket accents glow in. Headline fades in center.
// ─────────────────────────────────────────────────────────────────────────────
export const NeonFrame: React.FC<TemplateProps> = ({ headline, subtext, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const bracketOp = interpolate(frame, [0, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const headOp    = interpolate(frame, [18, 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const headY     = spring({ fps, frame: Math.max(0, frame - 18), config: { damping: 16, stiffness: 70 }, from: 30, to: 0 });
  const subOp     = interpolate(frame, [34, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const B = 52; const M = 76; const T = 3;
  const glow = `0 0 12px ${accentColor}, 0 0 24px ${accentColor}66`;
  const shared: React.CSSProperties = { position: 'absolute', borderColor: accentColor, boxShadow: glow, opacity: bracketOp };

  return (
    <AbsoluteFill style={{ background: 'transparent' }}>
      {/* Corner brackets */}
      <div style={{ ...shared, top: M, left: M,         width: B, height: B, borderTop: `${T}px solid`, borderLeft:  `${T}px solid` }} />
      <div style={{ ...shared, top: M, right: M,        width: B, height: B, borderTop: `${T}px solid`, borderRight: `${T}px solid` }} />
      <div style={{ ...shared, bottom: M, left: M,      width: B, height: B, borderBottom: `${T}px solid`, borderLeft:  `${T}px solid` }} />
      <div style={{ ...shared, bottom: M, right: M,     width: B, height: B, borderBottom: `${T}px solid`, borderRight: `${T}px solid` }} />

      <div style={{
        position: 'absolute', width: '78%', left: '11%', textAlign: 'center', top: '34%',
        fontSize: 94, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
        color: '#fff', letterSpacing: '-0.02em',
        opacity: headOp, transform: `translateY(${headY}px)`,
        textShadow: `0 0 70px ${accentColor}55`,
      }}>{headline}</div>

      {subtext && (
        <div style={{
          position: 'absolute', width: '100%', textAlign: 'center', top: 'calc(34% + 120px)',
          fontSize: 24, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 500,
          color: accentColor, letterSpacing: '0.22em', textTransform: 'uppercase', opacity: subOp,
        }}>{subtext}</div>
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. TimelineStep
// Best for: process steps, feature lists, how-it-works sequences
// Visual: Ghost step number top-right. Horizontal rule. Headline below.
// ─────────────────────────────────────────────────────────────────────────────
export const TimelineStep: React.FC<TemplateProps> = ({ headline, subtext, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const lineW  = spring({ fps, frame,                          config: { damping: 22, stiffness: 58 }, from: 0,   to: 60 });
  const headX  = spring({ fps, frame: Math.max(0, frame - 20), config: { damping: 15, stiffness: 65 }, from: -60, to: 0  });
  const headOp = interpolate(frame, [20, 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subOp  = interpolate(frame, [35, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Extract step number from subtext if it starts with digits, else use '◆'
  const stepNum = subtext?.match(/^\d+/)?.[0] ?? '◆';

  return (
    <AbsoluteFill style={{ background: 'transparent' }}>
      {/* Ghost step number */}
      <div style={{
        position: 'absolute', right: 72, top: 48,
        fontSize: 230, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
        color: accentColor, lineHeight: 1, opacity: 0.12, userSelect: 'none',
        letterSpacing: '-0.05em',
      }}>{stepNum}</div>

      {/* Horizontal rule */}
      <div style={{
        position: 'absolute', top: '40%', left: '8%',
        width: `${lineW}%`, height: 2,
        background: `linear-gradient(90deg, ${accentColor}, ${accentColor}22)`,
      }} />

      {/* Headline */}
      <div style={{
        position: 'absolute', top: 'calc(40% + 22px)', left: '8%', width: '76%',
        fontSize: 92, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
        color: '#fff', letterSpacing: '-0.025em', lineHeight: 1.1,
        opacity: headOp, transform: `translateX(${headX}px)`,
      }}>{headline}</div>

      {subtext && (
        <div style={{
          position: 'absolute', top: 'calc(40% + 130px)', left: '8%',
          fontSize: 26, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 400,
          color: `${accentColor}bb`, letterSpacing: '0.05em', opacity: subOp,
        }}>{subtext}</div>
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. IconHero
// Best for: feature highlights, AI capabilities, product icons
// Visual: Large icon centered with orbital ring. Headline below.
// ─────────────────────────────────────────────────────────────────────────────
export const IconHero: React.FC<TemplateProps> = ({ headline, subtext, accentColor, icon }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const iconScale = spring({ fps, frame,                          config: { damping: 12, stiffness: 75 }, from: 0,  to: 1  });
  const headOp    = interpolate(frame, [20, 36], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const headY     = spring({ fps, frame: Math.max(0, frame - 20), config: { damping: 15, stiffness: 70 }, from: 35, to: 0 });
  const subOp     = interpolate(frame, [36, 52], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ring      = interpolate(frame % 80, [0, 40, 80], [1, 1.1, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const displayIcon: IconName = (icon && icon !== 'none') ? icon : 'star';

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, ${accentColor}1e 0%, #050510 65%)` }}>
      {/* Orbital ring */}
      <div style={{
        position: 'absolute', top: '13%', left: '50%',
        width: 290, height: 290,
        transform: `translate(-50%, 0) scale(${ring})`,
        borderRadius: '50%', border: `1px solid ${accentColor}30`,
      }} />

      {/* Icon */}
      <div style={{ position: 'absolute', top: '15%', left: '50%', transform: `translate(-50%, 0) scale(${iconScale})` }}>
        <SceneIcon icon={displayIcon} size={132} color={accentColor} />
      </div>

      {/* Headline */}
      <div style={{
        position: 'absolute', width: '80%', left: '10%', textAlign: 'center', top: '53%',
        fontSize: 80, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
        color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1,
        opacity: headOp, transform: `translateY(${headY}px)`,
        textShadow: `0 0 60px ${accentColor}44`,
      }}>{headline}</div>

      {subtext && (
        <div style={{
          position: 'absolute', width: '70%', left: '15%', textAlign: 'center', top: 'calc(53% + 96px)',
          fontSize: 25, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 400,
          color: `${accentColor}cc`, opacity: subOp,
        }}>{subtext}</div>
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. WaveText
// Best for: core message, key value props, emotional moments
// Visual: Words reveal one-by-one from bottom, alternating white + accent color.
// ─────────────────────────────────────────────────────────────────────────────
export const WaveText: React.FC<TemplateProps> = ({ headline, subtext, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const words   = headline.split(' ');
  const subOp   = interpolate(frame, [words.length * 10 + 10, words.length * 10 + 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: 'transparent' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 20% 55%, ${accentColor}14 0%, transparent 60%)` }} />

      <div style={{ position: 'absolute', top: '25%', left: '8%', width: '84%' }}>
        {words.map((word, i) => {
          const delay  = i * 10;
          const wordY  = spring({ fps, frame: Math.max(0, frame - delay), config: { damping: 14, stiffness: 65 }, from: 62, to: 0 });
          const wordOp = interpolate(frame, [delay, delay + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <span key={i} style={{
              display: 'inline-block', marginRight: '0.18em',
              fontSize: 108, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
              color: i % 2 === 0 ? '#fff' : accentColor,
              letterSpacing: '-0.025em', lineHeight: 1.1,
              opacity: wordOp, transform: `translateY(${wordY}px)`,
              textShadow: i % 2 !== 0 ? `0 0 55px ${accentColor}` : 'none',
            }}>{word}</span>
          );
        })}
      </div>

      {subtext && (
        <div style={{
          position: 'absolute', bottom: '24%', left: '8%',
          fontSize: 26, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 400,
          color: `${accentColor}aa`, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: subOp,
        }}>{subtext}</div>
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. QuoteReveal
// Best for: testimonials, customer quotes, bold claims
// Visual: Giant translucent quote mark. Italic quote text. Attribution line.
// ─────────────────────────────────────────────────────────────────────────────
export const QuoteReveal: React.FC<TemplateProps> = ({ headline, subtext, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const quoteOp = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const headOp  = interpolate(frame, [18, 36], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const headY   = spring({ fps, frame: Math.max(0, frame - 18), config: { damping: 16, stiffness: 65 }, from: 30, to: 0 });
  const subOp   = interpolate(frame, [36, 52], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const lineH   = spring({ fps, frame: Math.max(0, frame - 18), config: { damping: 20, stiffness: 60 }, from: 0, to: 220 });

  return (
    <AbsoluteFill style={{ background: 'transparent' }}>
      {/* Giant background quote mark */}
      <div style={{
        position: 'absolute', top: -60, left: 36,
        fontSize: 400, fontFamily: 'Georgia, serif', fontWeight: 900,
        color: accentColor, lineHeight: 1,
        opacity: quoteOp * 0.11, userSelect: 'none',
      }}>"</div>

      {/* Accent left bar */}
      <div style={{
        position: 'absolute', top: '26%', left: '10%',
        width: 5, height: lineH,
        background: accentColor,
        opacity: headOp,
      }} />

      {/* Quote text */}
      <div style={{
        position: 'absolute', top: '26%', left: 'calc(10% + 30px)', width: '76%',
        fontSize: 62, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 700,
        color: '#fff', lineHeight: 1.35, fontStyle: 'italic',
        opacity: headOp, transform: `translateY(${headY}px)`,
      }}>"{headline}"</div>

      {subtext && (
        <div style={{
          position: 'absolute', top: 'calc(26% + 238px)', left: 'calc(10% + 30px)',
          fontSize: 23, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 500,
          color: accentColor, letterSpacing: '0.1em', opacity: subOp,
        }}>— {subtext}</div>
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. CTABurst
// Best for: closing CTA, next steps, urgency moments
// Visual: Arrows burst in from left. Bold headline below. Scanline energy.
// ─────────────────────────────────────────────────────────────────────────────
export const CTABurst: React.FC<TemplateProps> = ({ headline, subtext, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const a1X  = spring({ fps, frame,                          config: { damping: 18, stiffness: 80 }, from: -120, to: 0 });
  const a2X  = spring({ fps, frame: Math.max(0, frame - 8),  config: { damping: 18, stiffness: 80 }, from: -120, to: 0 });
  const a3X  = spring({ fps, frame: Math.max(0, frame - 16), config: { damping: 18, stiffness: 80 }, from: -120, to: 0 });
  const headOp = interpolate(frame, [24, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const headY  = spring({ fps, frame: Math.max(0, frame - 24), config: { damping: 14, stiffness: 70 }, from: 40, to: 0 });
  const subOp  = interpolate(frame, [40, 55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: 'transparent' }}>
      {/* Scanline overlay */}
      <AbsoluteFill style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.025) 3px, rgba(255,255,255,0.025) 4px)',
        pointerEvents: 'none',
      }} />
      {/* Bottom sweep */}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, transparent 45%, ${accentColor}18 100%)`, pointerEvents: 'none' }} />

      {/* Arrows */}
      {[{ x: a1X, top: '32%', op: 0.9 }, { x: a2X, top: '37%', op: 0.6 }, { x: a3X, top: '42%', op: 0.35 }].map((a, i) => (
        <div key={i} style={{
          position: 'absolute', top: a.top, left: '8%',
          fontSize: 58, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
          color: accentColor, letterSpacing: -4,
          transform: `translateX(${a.x}px)`, opacity: a.op,
          textShadow: `0 0 30px ${accentColor}`,
        }}>›› ›</div>
      ))}

      {/* Headline */}
      <div style={{
        position: 'absolute', top: '50%', left: '8%', width: '84%',
        fontSize: 94, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
        color: '#fff', letterSpacing: '-0.02em',
        opacity: headOp, transform: `translateY(${headY}px)`,
        textShadow: `0 0 80px ${accentColor}66`,
      }}>{headline}</div>

      {subtext && (
        <div style={{
          position: 'absolute', top: 'calc(50% + 108px)', left: '8%',
          fontSize: 28, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 500,
          color: accentColor, letterSpacing: '0.08em', opacity: subOp,
        }}>{subtext}</div>
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 11. GlitchReveal
// Best for: AI/tech reveals, disruptive statements, data science moments
// Visual: RGB channel split + scanline bars glitch for 15 frames, then snaps
//         clean with a neon line. Subtle pulse glitch every 90 frames after.
// ─────────────────────────────────────────────────────────────────────────────
export const GlitchReveal: React.FC<TemplateProps> = ({ headline, subtext, accentColor }) => {
  const frame = useCurrentFrame();

  const glitchIntensity = Math.max(0, 1 - frame / 15);
  const glitchX = ((frame * 7) % 20 - 10) * glitchIntensity;
  const glitchY = ((frame * 13) % 10 - 5) * glitchIntensity;

  const pulseFrame = frame > 20 ? (frame - 20) % 90 : 999;
  const pulsing    = pulseFrame < 4;
  const offsetR    = glitchIntensity > 0.05 ? ((frame * 5) % 16 - 8) * glitchIntensity : (pulsing ? 5 : 0);
  const offsetB    = glitchIntensity > 0.05 ? ((frame * 11) % 16 - 8) * glitchIntensity : (pulsing ? -5 : 0);

  const headOp  = interpolate(frame, [8, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const lineW   = interpolate(frame, [5, 28], [0, 84], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subOp   = interpolate(frame, [22, 38], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const headlineBase: React.CSSProperties = {
    position: 'absolute', left: '8%', top: '36%', width: '84%',
    fontSize: 100, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
    color: '#fff', letterSpacing: '-0.025em', lineHeight: 1.05,
    opacity: headOp,
  };

  return (
    <AbsoluteFill style={{ background: 'transparent', overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, ${accentColor}22 0%, transparent 65%)` }} />

      {/* Glitch bar overlays */}
      {glitchIntensity > 0.1 && [0.22, 0.48, 0.71].map((pos, gi) => (
        frame % 3 === gi % 3 ? (
          <div key={gi} style={{
            position: 'absolute', top: `${pos * 100}%`, left: 0, right: 0,
            height: `${2 + (frame * 3) % 6}%`,
            background: `${accentColor}${Math.floor(glitchIntensity * 55).toString(16).padStart(2, '0')}`,
            mixBlendMode: 'overlay',
          }} />
        ) : null
      ))}

      {/* RGB channel split */}
      <div style={{ ...headlineBase, color: '#ff2255', opacity: headOp * Math.min(glitchIntensity + (pulsing ? 0.4 : 0), 0.65), mixBlendMode: 'screen', transform: `translate(${glitchX + offsetR}px, ${glitchY}px)` }}>{headline}</div>
      <div style={{ ...headlineBase, color: '#0066ff', opacity: headOp * Math.min(glitchIntensity + (pulsing ? 0.4 : 0), 0.65), mixBlendMode: 'screen', transform: `translate(${glitchX + offsetB}px, ${glitchY}px)` }}>{headline}</div>

      {/* Clean headline */}
      <div style={{ ...headlineBase, transform: `translate(${glitchX * 0.2}px, ${glitchY * 0.2}px)`, textShadow: `0 0 60px ${accentColor}88` }}>{headline}</div>

      {/* Accent scan line */}
      <div style={{
        position: 'absolute', left: '8%', top: 'calc(36% - 8px)',
        width: `${lineW}%`, height: 2,
        background: `linear-gradient(90deg, ${accentColor}, ${accentColor}00)`,
        boxShadow: `0 0 16px ${accentColor}`, opacity: headOp,
      }} />

      {subtext && (
        <div style={{
          position: 'absolute', left: '8%', top: 'calc(36% + 122px)',
          fontFamily: 'monospace', fontSize: 20, fontWeight: 600,
          color: accentColor, letterSpacing: '0.22em', opacity: subOp,
        }}>{`> ${subtext}`}</div>
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 12. ZoomPunch
// Best for: high-impact moments, achievements, power statements
// Visual: Headline starts at 350% scale + heavy blur, springs to 100% sharp.
//         Radial glow pulses on impact. Explosive kinetic energy.
// ─────────────────────────────────────────────────────────────────────────────
export const ZoomPunch: React.FC<TemplateProps> = ({ headline, subtext, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale       = spring({ fps, frame, config: { damping: 9, stiffness: 130, mass: 0.8 }, from: 3.5, to: 1 });
  const blurPx      = interpolate(frame, [0, 18], [22, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const op          = interpolate(frame, [0, 8],  [0, 1],  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const impactGlow  = interpolate(frame, [8, 13, 22], [0, 0.55, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subOp       = interpolate(frame, [22, 38], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const glowHex     = Math.floor(impactGlow * 60 + 20).toString(16).padStart(2, '0');

  return (
    <AbsoluteFill style={{ background: 'transparent' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, ${accentColor}${glowHex} 0%, transparent 70%)` }} />

      <div style={{
        position: 'absolute', width: '88%', left: '6%', textAlign: 'center', top: '26%',
        fontSize: 112, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
        color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.05,
        opacity: op, transform: `scale(${scale})`,
        filter: `blur(${blurPx}px)`,
        textShadow: `0 0 90px ${accentColor}88`,
      }}>{headline}</div>

      {subtext && (
        <div style={{
          position: 'absolute', width: '100%', textAlign: 'center', top: 'calc(26% + 158px)',
          fontSize: 24, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 500,
          color: accentColor, letterSpacing: '0.22em', textTransform: 'uppercase', opacity: subOp,
        }}>{subtext}</div>
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 13. HorizontalSlam
// Best for: B2B collaboration, partnership reveals, bold propositions
// Visual: Two thin accent slabs slam in from left + right edges with spring.
//         Headline punches in from center with elastic scale.
// ─────────────────────────────────────────────────────────────────────────────
export const HorizontalSlam: React.FC<TemplateProps> = ({ headline, subtext, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const leftX    = spring({ fps, frame, config: { damping: 22, stiffness: 130 }, from: -960, to: 0 });
  const rightX   = spring({ fps, frame, config: { damping: 22, stiffness: 130 }, from: 960,  to: 0 });
  const headOp   = interpolate(frame, [10, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const headScale = spring({ fps, frame: Math.max(0, frame - 10), config: { damping: 13, stiffness: 90 }, from: 0.65, to: 1 });
  const subOp    = interpolate(frame, [28, 44], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: 'transparent', overflow: 'hidden' }}>
      {/* Left accent slab */}
      <div style={{
        position: 'absolute', left: 0, top: 0, width: 10, height: '100%',
        background: accentColor, transform: `translateX(${leftX}px)`,
        boxShadow: `0 0 50px ${accentColor}, 0 0 100px ${accentColor}66`,
      }} />
      {/* Right accent slab */}
      <div style={{
        position: 'absolute', right: 0, top: 0, width: 10, height: '100%',
        background: accentColor, transform: `translateX(${rightX}px)`,
        boxShadow: `0 0 50px ${accentColor}, 0 0 100px ${accentColor}66`,
      }} />

      {/* Horizontal ruling lines */}
      <div style={{ position: 'absolute', left: 0, top: '20%', right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${accentColor}55, transparent)`, opacity: headOp }} />
      <div style={{ position: 'absolute', left: 0, bottom: '20%', right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${accentColor}55, transparent)`, opacity: headOp }} />

      <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, ${accentColor}18 0%, transparent 60%)`, opacity: headOp }} />

      <div style={{
        position: 'absolute', width: '80%', left: '10%', textAlign: 'center', top: '30%',
        fontSize: 98, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
        color: '#fff', letterSpacing: '-0.025em', lineHeight: 1.1,
        opacity: headOp, transform: `scale(${headScale})`,
        textShadow: `0 0 70px ${accentColor}55`,
      }}>{headline}</div>

      {subtext && (
        <div style={{
          position: 'absolute', width: '80%', left: '10%', textAlign: 'center', top: 'calc(30% + 135px)',
          fontSize: 24, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 500,
          color: accentColor, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: subOp,
        }}>{subtext}</div>
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 14. DataStream
// Best for: data engineering, analytics, AI capabilities, technical moments
// Visual: Matrix-style data chars fall in background. A neon scan line sweeps
//         top-to-bottom revealing the headline beneath it. Monospace energy.
// ─────────────────────────────────────────────────────────────────────────────
export const DataStream: React.FC<TemplateProps> = ({ headline, subtext, accentColor }) => {
  const frame = useCurrentFrame();

  const scanY  = interpolate(frame, [0, 28], [-2, 102], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const scanOp = interpolate(frame, [0, 5, 25, 32], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const headOp = interpolate(frame, [20, 36], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const lineW  = interpolate(frame, [18, 38], [0, 84], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subOp  = interpolate(frame, [36, 52], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const DATA_CHARS = ['0','1','∑','∆','Ω','λ','π','∞','//','{}','∇','⊕','#','</>','01'];
  const COLS = 22;

  return (
    <AbsoluteFill style={{ background: 'transparent', overflow: 'hidden' }}>
      {/* Falling data columns */}
      {Array.from({ length: COLS }).map((_, col) => {
        const xPct   = (col / COLS) * 100;
        const speed  = 0.38 + ((col * 7) % 10) * 0.07;
        const ci1    = Math.floor((frame * speed + col * 3) % DATA_CHARS.length);
        const ci2    = Math.floor((frame * speed + col * 5 + 4) % DATA_CHARS.length);
        const yOff   = ((frame * speed * 18) + col * 44) % 1120;
        const colOp  = 0.05 + ((col * 3) % 7) * 0.035;
        return (
          <div key={`col-${col}`} style={{
            position: 'absolute', left: `${xPct}%`, top: yOff,
            fontFamily: 'monospace', fontSize: 13, fontWeight: 700,
            color: accentColor, opacity: colOp, whiteSpace: 'nowrap',
            lineHeight: 1.6,
          }}>
            {DATA_CHARS[ci1]}{'\n'}{DATA_CHARS[ci2]}
          </div>
        );
      })}

      {/* Neon scan line */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: `${scanY}%`, height: 3,
        background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
        boxShadow: `0 0 24px ${accentColor}, 0 0 60px ${accentColor}66`,
        opacity: scanOp,
      }} />

      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 40% 50%, ${accentColor}14 0%, transparent 60%)`, opacity: headOp }} />

      {/* Accent rule */}
      <div style={{
        position: 'absolute', left: '8%', top: 'calc(36% - 10px)',
        width: `${lineW}%`, height: 2, background: accentColor,
        opacity: headOp, boxShadow: `0 0 14px ${accentColor}`,
      }} />

      <div style={{
        position: 'absolute', left: '8%', width: '84%', top: '36%',
        fontSize: 96, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
        color: '#fff', letterSpacing: '-0.025em', lineHeight: 1.1,
        opacity: headOp, textShadow: `0 0 60px ${accentColor}88`,
      }}>{headline}</div>

      {subtext && (
        <div style={{
          position: 'absolute', left: '8%', top: 'calc(36% + 120px)',
          fontFamily: 'monospace', fontSize: 20, fontWeight: 600,
          color: accentColor, letterSpacing: '0.2em', opacity: subOp,
        }}>{`> ${subtext}_`}</div>
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 15. CinematicBars
// Best for: premium brand moments, speaker credentials, editorial statements
// Visual: Black letterbox bars slide in from top + bottom edges (cinematic 2.35:1).
//         Letter-spacing expands from tight → normal as headline reveals.
// ─────────────────────────────────────────────────────────────────────────────
export const CinematicBars: React.FC<TemplateProps> = ({ headline, subtext, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const barH          = spring({ fps, frame, config: { damping: 22, stiffness: 90 }, from: 0, to: 165 });
  const headOp        = interpolate(frame, [12, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const letterSpacing = interpolate(frame, [12, 32], [-0.06, -0.015], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subOp         = interpolate(frame, [30, 46], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const lineW         = interpolate(frame, [14, 36], [0, 60], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: 'transparent' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 30% 50%, ${accentColor}12 0%, transparent 65%)` }} />

      {/* Top letterbox bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: barH,
        background: '#000',
        borderBottom: `1px solid ${accentColor}33`,
        boxShadow: `0 4px 30px rgba(0,0,0,0.8)`,
      }} />
      {/* Bottom letterbox bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: barH,
        background: '#000',
        borderTop: `1px solid ${accentColor}33`,
        boxShadow: `0 -4px 30px rgba(0,0,0,0.8)`,
      }} />

      {/* Accent rule */}
      <div style={{
        position: 'absolute', left: '8%', top: 'calc(38% - 16px)',
        width: `${lineW}%`, height: 1, background: accentColor,
        opacity: headOp * 0.85,
      }} />

      <div style={{
        position: 'absolute', width: '84%', left: '8%', top: '38%',
        fontSize: 90, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
        color: '#fff', letterSpacing: `${letterSpacing}em`, lineHeight: 1.08,
        opacity: headOp, textShadow: `0 0 80px ${accentColor}44`,
      }}>{headline}</div>

      {subtext && (
        <div style={{
          position: 'absolute', left: '8%', top: 'calc(38% + 112px)',
          fontSize: 22, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 400,
          color: `${accentColor}cc`, letterSpacing: '0.28em', textTransform: 'uppercase', opacity: subOp,
        }}>{subtext}</div>
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 16. ChromaSlice
// Best for: partnership reveals, brand moments, "X meets Y" openers
// Visual: Bold diagonal accent slash slices across frame from off-screen.
//         Headline punches in to the right of the slash. Vertical subtext left.
// ─────────────────────────────────────────────────────────────────────────────
export const ChromaSlice: React.FC<TemplateProps> = ({ headline, subtext, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slashX    = spring({ fps, frame, config: { damping: 18, stiffness: 120 }, from: -800, to: 0 });
  const headOp    = interpolate(frame, [14, 28], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const headX     = spring({ fps, frame: Math.max(0, frame - 14), config: { damping: 16, stiffness: 75 }, from: 70, to: 0 });
  const subOp     = interpolate(frame, [22, 38], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const glowPulse = interpolate(frame % 60, [0, 30, 60], [0.55, 1.0, 0.55], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: 'transparent', overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 70% 50%, ${accentColor}18 0%, transparent 60%)` }} />

      {/* Thin secondary slash — trailing glow */}
      <div style={{
        position: 'absolute', left: `calc(28% + ${slashX}px + 18px)`,
        top: '-25%', width: 4, height: '150%',
        background: accentColor, transform: 'rotate(10deg)',
        opacity: glowPulse * 0.45, boxShadow: `0 0 20px ${accentColor}`,
      }} />
      {/* Main diagonal slash */}
      <div style={{
        position: 'absolute', left: `calc(28% + ${slashX}px)`,
        top: '-25%', width: 12, height: '150%',
        background: `linear-gradient(180deg, ${accentColor}88, ${accentColor}, ${accentColor}88)`,
        transform: 'rotate(10deg)',
        boxShadow: `0 0 60px ${accentColor}, 0 0 120px ${accentColor}55`,
        opacity: glowPulse,
      }} />

      {/* Subtext vertical — left of slash */}
      {subtext && (
        <div style={{
          position: 'absolute', left: '6%', top: '50%',
          transform: 'translateY(-50%) rotate(-90deg)',
          transformOrigin: '50% 50%',
          fontSize: 16, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 700,
          color: accentColor, letterSpacing: '0.35em', textTransform: 'uppercase',
          opacity: subOp, whiteSpace: 'nowrap',
        }}>{subtext}</div>
      )}

      {/* Headline — right of slash */}
      <div style={{
        position: 'absolute', left: '34%', top: '28%', width: '58%',
        fontSize: 90, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
        color: '#fff', letterSpacing: '-0.025em', lineHeight: 1.1,
        opacity: headOp, transform: `translateX(${headX}px)`,
        textShadow: `0 0 70px ${accentColor}55`,
      }}>{headline}</div>

      {/* Accent rule under headline */}
      <div style={{
        position: 'absolute', left: '34%', top: 'calc(28% + 6px)',
        width: `${headOp * 52}%`, height: 1,
        background: `linear-gradient(90deg, ${accentColor}, transparent)`,
        opacity: headOp * 0.6,
      }} />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 17. ElectricPulse
// Best for: AI reveals, tech capabilities, high-impact single statements
// Visual: Radial rays burst from centre. Concentric rings pulse outward.
//         Headline materialises from a central glow flash.
// ─────────────────────────────────────────────────────────────────────────────
export const ElectricPulse: React.FC<TemplateProps> = ({ headline, subtext, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const burstOp   = interpolate(frame, [0, 6, 18], [0, 0.85, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const headOp    = interpolate(frame, [8, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const headScale = spring({ fps, frame: Math.max(0, frame - 8), config: { damping: 12, stiffness: 110, mass: 0.8 }, from: 0.65, to: 1 });
  const subOp     = interpolate(frame, [22, 38], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const r1S  = interpolate(frame % 55, [0, 55], [0.3, 1.9], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const r1Op = interpolate(frame % 55, [0, 28, 55], [0.75, 0.25, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const r2S  = interpolate((frame + 18) % 55, [0, 55], [0.3, 1.9], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const r2Op = interpolate((frame + 18) % 55, [0, 28, 55], [0.75, 0.25, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const r3S  = interpolate((frame + 36) % 55, [0, 55], [0.3, 1.9], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const r3Op = interpolate((frame + 36) % 55, [0, 28, 55], [0.75, 0.25, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const RAY_COUNT = 10;

  return (
    <AbsoluteFill style={{ background: 'transparent', overflow: 'hidden' }}>
      {/* Radial rays burst from center */}
      {Array.from({ length: RAY_COUNT }).map((_, i) => {
        const angle  = (i / RAY_COUNT) * 360;
        const rayLen = interpolate(frame, [0, 20], [0, 520], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const rayOp  = interpolate(frame, [0, 10, 28], [0, 0.55, 0.08], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <div key={i} style={{
            position: 'absolute', left: '50%', top: '50%',
            width: rayLen, height: 1,
            background: `linear-gradient(90deg, ${accentColor}cc, transparent)`,
            transformOrigin: '0 50%',
            transform: `rotate(${angle}deg)`,
            opacity: rayOp,
          }} />
        );
      })}

      {/* Expanding rings */}
      {[{ s: r1S, o: r1Op }, { s: r2S, o: r2Op }, { s: r3S, o: r3Op }].map((r, i) => (
        <div key={i} style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 380 + i * 60, height: 380 + i * 60,
          transform: `translate(-50%, -50%) scale(${r.s})`,
          borderRadius: '50%',
          border: `${2 - i * 0.5}px solid ${accentColor}`,
          opacity: r.o * (frame > 6 ? 1 : 0),
        }} />
      ))}

      {/* Central flash burst */}
      <AbsoluteFill style={{
        background: `radial-gradient(ellipse at center, ${accentColor}${Math.floor(burstOp * 99).toString(16).padStart(2, '0')} 0%, transparent 40%)`,
        opacity: burstOp,
      }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, ${accentColor}1a 0%, transparent 55%)` }} />

      {/* Headline */}
      <div style={{
        position: 'absolute', width: '80%', left: '10%', textAlign: 'center', top: '30%',
        fontSize: 104, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
        color: '#fff', letterSpacing: '-0.025em', lineHeight: 1.1,
        opacity: headOp, transform: `scale(${headScale})`,
        textShadow: `0 0 100px ${accentColor}88`,
      }}>{headline}</div>

      {subtext && (
        <div style={{
          position: 'absolute', width: '80%', left: '10%', textAlign: 'center', top: 'calc(30% + 135px)',
          fontSize: 23, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 500,
          color: accentColor, letterSpacing: '0.22em', textTransform: 'uppercase', opacity: subOp,
        }}>{subtext}</div>
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 18. SplitReveal
// Best for: duality moments, "before vs after", contrast statements
// Visual: Top and bottom halves slide apart, content is revealed in the gap.
//         Accent lines glow at the split seam.
// ─────────────────────────────────────────────────────────────────────────────
export const SplitReveal: React.FC<TemplateProps> = ({ headline, subtext, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const topY   = spring({ fps, frame, config: { damping: 20, stiffness: 88 }, from: 0, to: -320 });
  const botY   = spring({ fps, frame, config: { damping: 20, stiffness: 88 }, from: 0, to: 320 });
  const headOp = interpolate(frame, [16, 32], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const headY  = spring({ fps, frame: Math.max(0, frame - 16), config: { damping: 16, stiffness: 72 }, from: 22, to: 0 });
  const subOp  = interpolate(frame, [32, 48], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const seamOp = interpolate(frame, [5, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: 'transparent', overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, ${accentColor}14 0%, transparent 60%)` }} />

      {/* Top panel */}
      <div style={{
        position: 'absolute', left: 0, top: 0, right: 0, height: '50%',
        background: `linear-gradient(180deg, #050510 0%, ${accentColor}0c 100%)`,
        transform: `translateY(${topY}px)`,
        borderBottom: `2px solid ${accentColor}`,
        boxShadow: `0 6px 50px ${accentColor}44`,
      }} />
      {/* Bottom panel */}
      <div style={{
        position: 'absolute', left: 0, bottom: 0, right: 0, height: '50%',
        background: `linear-gradient(0deg, #050510 0%, ${accentColor}0c 100%)`,
        transform: `translateY(${botY}px)`,
        borderTop: `2px solid ${accentColor}`,
        boxShadow: `0 -6px 50px ${accentColor}44`,
      }} />

      {/* Seam glow lines */}
      <div style={{
        position: 'absolute', left: '5%', top: 'calc(50% - 1px)', width: '90%', height: 1,
        background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
        boxShadow: `0 0 22px ${accentColor}`,
        opacity: seamOp,
      }} />

      {/* Headline */}
      <div style={{
        position: 'absolute', width: '80%', left: '10%', textAlign: 'center', top: '36%',
        fontSize: 96, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
        color: '#fff', letterSpacing: '-0.025em', lineHeight: 1.1,
        opacity: headOp, transform: `translateY(${headY}px)`,
        textShadow: `0 0 80px ${accentColor}66`,
      }}>{headline}</div>

      {subtext && (
        <div style={{
          position: 'absolute', width: '100%', textAlign: 'center', top: 'calc(36% + 122px)',
          fontSize: 22, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 500,
          color: accentColor, letterSpacing: '0.24em', textTransform: 'uppercase', opacity: subOp,
        }}>{subtext}</div>
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 19. TypeBurn
// Best for: tech/AI moments, data reveals, hacker energy, key facts
// Visual: Characters burn into existence one-by-one with a glowing flare.
//         Blinking cursor at the end. Pure monospace hacker energy.
// ─────────────────────────────────────────────────────────────────────────────
export const TypeBurn: React.FC<TemplateProps> = ({ headline, subtext, accentColor }) => {
  const frame = useCurrentFrame();

  const chars          = headline.split('');
  const charsPerFrame  = Math.max(0.8, chars.length / 38);
  const visibleCount   = Math.min(chars.length, Math.floor(frame * charsPerFrame));
  const cursorBlink    = Math.floor(frame / 7) % 2 === 0;
  const subOp          = interpolate(frame, [44, 58], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const scanOp         = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: 'transparent' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 18% 45%, ${accentColor}14 0%, transparent 58%)` }} />

      {/* Scanning accent rule */}
      <div style={{
        position: 'absolute', left: '8%', top: 'calc(36% - 12px)', width: '84%', height: 1,
        background: `linear-gradient(90deg, ${accentColor}00, ${accentColor}88, ${accentColor}00)`,
        opacity: scanOp,
      }} />

      {/* Typewriter headline */}
      <div style={{
        position: 'absolute', left: '8%', top: '36%', width: '84%',
        fontSize: 88, fontFamily: 'monospace', fontWeight: 700,
        color: '#fff', letterSpacing: '-0.01em', lineHeight: 1.15,
        display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: '0 0',
      }}>
        {chars.slice(0, visibleCount).map((char, i) => {
          const isNew = i === visibleCount - 1;
          return (
            <span key={i} style={{
              display: 'inline-block',
              color: isNew ? accentColor : '#fff',
              textShadow: isNew
                ? `0 0 40px ${accentColor}, 0 0 80px ${accentColor}66`
                : '0 0 16px rgba(255,255,255,0.15)',
              whiteSpace: char === ' ' ? 'pre' : undefined,
            }}>{char}</span>
          );
        })}
        {/* Cursor */}
        {cursorBlink && (
          <span style={{
            display: 'inline-block', width: 7, height: '0.82em',
            background: accentColor, boxShadow: `0 0 18px ${accentColor}`,
            marginLeft: 3, verticalAlign: 'middle',
          }} />
        )}
      </div>

      {subtext && (
        <div style={{
          position: 'absolute', left: '8%', top: 'calc(36% + 130px)',
          fontFamily: 'monospace', fontSize: 22, fontWeight: 400,
          color: `${accentColor}bb`, letterSpacing: '0.08em', opacity: subOp,
        }}>{`// ${subtext}`}</div>
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 20. GravityDrop
// Best for: listing benefits, feature reveals, multi-word punchy moments
// Visual: Each word free-falls from above with spring bounce on landing.
//         Words squish on impact then spring to natural size. Exhilarating.
// ─────────────────────────────────────────────────────────────────────────────
export const GravityDrop: React.FC<TemplateProps> = ({ headline, subtext, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const words  = headline.split(' ');
  const subOp  = interpolate(frame, [words.length * 8 + 8, words.length * 8 + 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const groundOp = interpolate(frame, [words.length * 8, words.length * 8 + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: 'transparent', overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 80%, ${accentColor}14 0%, transparent 55%)` }} />

      {/* Ground accent line */}
      <div style={{
        position: 'absolute', left: '8%', bottom: '30%', width: '84%', height: 1,
        background: `linear-gradient(90deg, transparent, ${accentColor}55, transparent)`,
        opacity: groundOp,
      }} />

      {/* Dropping words */}
      <div style={{
        position: 'absolute', left: '8%', top: '16%', width: '84%',
        display: 'flex', flexWrap: 'wrap', gap: '0 0.12em', alignItems: 'flex-end',
      }}>
        {words.map((word, i) => {
          const startFrame = i * 8;
          const dropY = spring({
            fps,
            frame: Math.max(0, frame - startFrame),
            config: { damping: 9, stiffness: 115, mass: 1.3 },
            from: -380, to: 0,
          });
          const wordOp = interpolate(frame, [startFrame, startFrame + 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

          // Landing squish: compress vertically at impact, spring back
          const landFrame = Math.max(0, frame - startFrame - 14);
          const squishY = landFrame < 10
            ? spring({ fps, frame: landFrame, config: { damping: 6, stiffness: 220 }, from: 0.72, to: 1 })
            : 1;
          const squishX = landFrame < 10
            ? spring({ fps, frame: landFrame, config: { damping: 6, stiffness: 220 }, from: 1.22, to: 1 })
            : 1;

          return (
            <span key={i} style={{
              display: 'inline-block',
              fontSize: 98, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900,
              color: i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? accentColor : `${accentColor}cc`,
              letterSpacing: '-0.03em', lineHeight: 1.1,
              opacity: wordOp,
              transform: `translateY(${dropY}px) scaleY(${squishY}) scaleX(${squishX})`,
              transformOrigin: '50% 100%',
              textShadow: `0 0 55px ${accentColor}44`,
            }}>{word}</span>
          );
        })}
      </div>

      {subtext && (
        <div style={{
          position: 'absolute', left: '8%', bottom: '22%',
          fontSize: 24, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 500,
          color: `${accentColor}aa`, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: subOp,
        }}>{subtext}</div>
      )}
    </AbsoluteFill>
  );
};
