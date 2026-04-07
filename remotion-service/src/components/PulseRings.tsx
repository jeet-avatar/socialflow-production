import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';

interface PulseRingsProps {
  hue: number;
  cx?: string; // center x (CSS %)
  cy?: string; // center y (CSS %)
  baseSize?: number; // px at rest
}

const Ring: React.FC<{ hue: number; cx: string; cy: string; baseSize: number; delay: number }> = ({
  hue, cx, cy, baseSize, delay,
}) => {
  const frame = useCurrentFrame();
  const period = 70;
  const localFrame = (frame + delay) % period;

  const scale = interpolate(localFrame, [0, period], [1, 2.6], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = interpolate(localFrame, [0, period * 0.6, period], [0.5, 0.2, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const size = baseSize * scale;

  return (
    <div
      style={{
        position: 'absolute',
        left: cx,
        top: cy,
        width: size,
        height: size,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        border: `2px solid hsla(${hue}, 80%, 65%, ${opacity})`,
        boxShadow: `0 0 ${size * 0.08}px hsla(${hue}, 80%, 65%, ${opacity * 0.4})`,
        pointerEvents: 'none',
      }}
    />
  );
};

const PulseRings: React.FC<PulseRingsProps> = ({
  hue,
  cx = '50%',
  cy = '50%',
  baseSize = 120,
}) => {
  return (
    <>
      <Ring hue={hue} cx={cx} cy={cy} baseSize={baseSize} delay={0} />
      <Ring hue={hue + 15} cx={cx} cy={cy} baseSize={baseSize} delay={23} />
      <Ring hue={hue + 30} cx={cx} cy={cy} baseSize={baseSize} delay={46} />
    </>
  );
};

export default PulseRings;
