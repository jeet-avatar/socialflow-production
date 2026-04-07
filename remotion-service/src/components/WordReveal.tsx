import React from 'react';
import { useCurrentFrame, spring, interpolate, Sequence, useVideoConfig } from 'remotion';

interface WordProps {
  word: string;
  hue: number;
  isHighlight: boolean; // every Nth word gets a color accent
}

const AnimatedWord: React.FC<WordProps> = ({ word, hue, isHighlight }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const translateY = spring({
    fps,
    frame,
    config: { damping: 16, stiffness: 90, mass: 0.7 },
    from: 32,
    to: 0,
  });

  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const scale = spring({
    fps,
    frame,
    config: { damping: 20, stiffness: 120, mass: 0.5 },
    from: 0.85,
    to: 1,
  });

  return (
    <span
      style={{
        display: 'inline-block',
        transform: `translateY(${translateY}px) scale(${scale})`,
        opacity,
        color: isHighlight ? `hsl(${hue}, 95%, 72%)` : '#ffffff',
        textShadow: isHighlight
          ? `0 0 24px hsla(${hue}, 90%, 65%, 0.8), 0 2px 8px rgba(0,0,0,0.9)`
          : '0 2px 12px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,1)',
        marginRight: '0.28em',
        whiteSpace: 'nowrap',
      }}
    >
      {word}
    </span>
  );
};

interface WordRevealProps {
  text: string;
  hue: number;
  startFrameInSequence?: number; // additional offset inside a Sequence
  highlightEvery?: number; // highlight every Nth word
}

const WordReveal: React.FC<WordRevealProps> = ({
  text,
  hue,
  startFrameInSequence = 4,
  highlightEvery = 4,
}) => {
  const words = text.trim().split(/\s+/);
  const WORD_STAGGER = 3; // frames between each word entrance

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 130,
        left: '6%',
        width: '88%',
        textAlign: 'center',
        lineHeight: 1.35,
        overflow: 'hidden',
        padding: '16px 24px',
        background: 'rgba(0,0,0,0.35)',
        borderRadius: 16,
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        style={{
          fontSize: 54,
          fontFamily: 'Inter, Arial, sans-serif',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '0 0',
        }}
      >
        {words.map((word, i) => (
          <Sequence key={i} from={startFrameInSequence + i * WORD_STAGGER} layout="none">
            <AnimatedWord
              word={word}
              hue={hue}
              isHighlight={(i + 1) % highlightEvery === 0}
            />
          </Sequence>
        ))}
      </div>
    </div>
  );
};

export default WordReveal;
