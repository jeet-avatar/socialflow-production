import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import ParticleField from './ParticleField';

// Hue palette — each scene gets a distinct colour identity
const SCENE_HUES = [220, 265, 190, 250, 200, 285, 170, 240, 210, 300, 180, 230];

export const getSceneHue = (segmentIndex: number): number =>
  SCENE_HUES[segmentIndex % SCENE_HUES.length];

interface AnimatedBackgroundProps {
  hue: number;
}

const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({ hue }) => {
  const frame = useCurrentFrame();

  // Hue shifts slowly across the scene like an aurora
  const hueDrift = interpolate(frame, [0, 90], [0, 22], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const h = hue + hueDrift;

  // Moving spotlight that drifts across the scene
  const spotX = interpolate(frame, [0, 90], [22, 75], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const spotY = interpolate(frame, [0, 90], [38, 52], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Diagonal light sweep bar (cinematic lens flare feel)
  const sweepX = interpolate(frame, [0, 90], [-25, 125], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sweepOp = interpolate(frame, [0, 18, 55, 90], [0, 0.07, 0.07, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Slow centre pulse — breathes every ~45 frames
  const pulseOp = interpolate(frame % 45, [0, 22, 45], [0.07, 0.16, 0.07], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      {/* Deep dark aurora-gradient base — spotlight moves */}
      <AbsoluteFill style={{
        background: `
          radial-gradient(ellipse at ${spotX}% ${spotY}%, hsla(${h}, 78%, 18%, 1) 0%, transparent 52%),
          radial-gradient(ellipse at ${100 - spotX}% ${100 - spotY}%, hsla(${h + 40}, 68%, 12%, 1) 0%, transparent 48%),
          radial-gradient(ellipse at 50% 100%, hsla(${h - 20}, 55%, 8%, 0.6) 0%, transparent 60%),
          linear-gradient(165deg, hsl(${h - 12}, 58%, 5%) 0%, hsl(${h + 28}, 48%, 3%) 100%)
        `,
      }} />

      {/* Pulsing centre accent glow */}
      <AbsoluteFill style={{
        background: `radial-gradient(ellipse at 50% 50%, hsla(${h}, 85%, 52%, ${pulseOp}) 0%, transparent 42%)`,
        pointerEvents: 'none',
      }} />

      {/* Diagonal light sweep */}
      <AbsoluteFill style={{
        background: `linear-gradient(108deg, transparent ${sweepX - 14}%, hsla(${h}, 75%, 72%, ${sweepOp}) ${sweepX}%, transparent ${sweepX + 14}%)`,
        pointerEvents: 'none',
      }} />

      {/* Ambient particles — larger, more visible */}
      <ParticleField hue={h} count={32} />

      {/* Subtle grid */}
      <AbsoluteFill style={{
        backgroundImage: `
          linear-gradient(hsla(${h}, 65%, 62%, 0.06) 1px, transparent 1px),
          linear-gradient(90deg, hsla(${h}, 65%, 62%, 0.06) 1px, transparent 1px)
        `,
        backgroundSize: '80px 80px',
        pointerEvents: 'none',
      }} />

      {/* Scanlines */}
      <AbsoluteFill style={{
        backgroundImage:
          'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.05) 3px, rgba(0,0,0,0.05) 4px)',
        pointerEvents: 'none',
      }} />

      {/* Vignette */}
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,0.75) 100%)',
        pointerEvents: 'none',
      }} />
    </AbsoluteFill>
  );
};

export default AnimatedBackground;
