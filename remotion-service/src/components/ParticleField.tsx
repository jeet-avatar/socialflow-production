import React from 'react';
import { useCurrentFrame } from 'remotion';

interface ParticleOrbProps {
  x: number;
  baseY: number;
  size: number;
  hue: number;
  speed: number;
  phase: number;
  amplitude: number;
  opacity: number;
}

const ParticleOrb: React.FC<ParticleOrbProps> = ({
  x, baseY, size, hue, speed, phase, amplitude, opacity,
}) => {
  const frame = useCurrentFrame();
  const y     = baseY + Math.sin(frame * speed + phase) * amplitude;
  const xDrift = Math.cos(frame * speed * 0.6 + phase) * (amplitude * 0.5);

  return (
    <div style={{
      position: 'absolute',
      left: `${x + xDrift}%`,
      top: `${y}%`,
      width: size,
      height: size,
      borderRadius: '50%',
      background: `radial-gradient(circle, hsla(${hue}, 92%, 72%, ${opacity}) 0%, hsla(${hue}, 80%, 52%, 0) 70%)`,
      transform: 'translate(-50%, -50%)',
      filter: `blur(${size * 0.28}px)`,
    }} />
  );
};

interface ParticleFieldProps {
  hue: number;
  count?: number;
}

const det = (seed: number, range: number, offset = 0) =>
  offset + ((seed * 137.508 + 41) % range);

const ParticleField: React.FC<ParticleFieldProps> = ({ hue, count = 28 }) => {
  const particles = Array.from({ length: count }, (_, i) => ({
    x:         det(i * 3,  100),
    baseY:     det(i * 7,  90, 5),
    size:      det(i * 11, 58, 18),   // 18–76px (was 12–52)
    hue:       hue + det(i * 5, 50, -25),
    speed:     det(i * 13, 0.028, 0.012),
    phase:     det(i * 17, Math.PI * 2),
    amplitude: det(i * 19, 8, 2),
    opacity:   det(i * 23, 0.38, 0.10),  // slightly more visible
  }));

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {particles.map((p, i) => (
        <ParticleOrb key={`p-${i}`} {...p} />
      ))}
    </div>
  );
};

export default ParticleField;
