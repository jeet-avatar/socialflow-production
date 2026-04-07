import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

export interface TextLayoverItem {
  text: string;
  start_time: number; // seconds (absolute, from start of full video)
  duration: number;   // seconds
}

interface TextLayoverProps {
  items: TextLayoverItem[];
}

const SingleLayover: React.FC<{ item: TextLayoverItem; fps: number }> = ({ item, fps }) => {
  const frame = useCurrentFrame();
  const startFrame = Math.round(item.start_time * fps);
  const endFrame = startFrame + Math.round(item.duration * fps);

  const localFrame = frame - startFrame;

  if (frame < startFrame || frame >= endFrame) return null;

  const fadeIn = interpolate(localFrame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(localFrame, [endFrame - startFrame - 12, endFrame - startFrame], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = Math.min(fadeIn, fadeOut);

  const scale = spring({
    fps,
    frame: localFrame,
    config: { damping: 20, stiffness: 120, mass: 0.5 },
    from: 0.85,
    to: 1,
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) scale(${scale})`,
        textAlign: 'center',
        opacity,
        width: '80%',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          color: '#ffffff',
          fontSize: 96,
          fontFamily: 'Inter, Arial, sans-serif',
          fontWeight: 900,
          lineHeight: 1.1,
          textShadow: '0 4px 24px rgba(0,0,0,0.95)',
          letterSpacing: '-0.03em',
        }}
      >
        {item.text}
      </span>
    </div>
  );
};

const TextLayover: React.FC<TextLayoverProps> = ({ items }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {items.map((item, i) => (
        <SingleLayover key={i} item={item} fps={fps} />
      ))}
    </>
  );
};

export default TextLayover;
