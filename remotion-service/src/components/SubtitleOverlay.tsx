import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';

export interface SubtitleSegment {
  text: string;
  start: number; // seconds (from Whisper)
  end: number;   // seconds (from Whisper)
}

interface SubtitleOverlayProps {
  segments: SubtitleSegment[];
  fps: number;
  frame_offset: number; // frames to add to align with voiceover start in the composition
}

const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({ segments, fps, frame_offset }) => {
  const frame = useCurrentFrame();

  // Find the active segment at the current frame
  const activeSegment = segments.find((seg) => {
    const startFrame = Math.round(seg.start * fps) + frame_offset;
    const endFrame = Math.round(seg.end * fps) + frame_offset;
    return frame >= startFrame && frame < endFrame;
  });

  if (!activeSegment) return null;

  const startFrame = Math.round(activeSegment.start * fps) + frame_offset;
  const endFrame = Math.round(activeSegment.end * fps) + frame_offset;
  const segDuration = endFrame - startFrame;

  // Fade in/out within each subtitle segment (8 frames each side)
  const fadeFrames = Math.min(8, Math.floor(segDuration / 4));
  const localFrame = frame - startFrame;
  const opacity = interpolate(
    localFrame,
    [0, fadeFrames, segDuration - fadeFrames, segDuration],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 100,
        left: '10%',
        width: '80%',
        textAlign: 'center',
        opacity,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          color: '#ffffff',
          fontSize: 44,
          fontFamily: 'Inter, Arial, sans-serif',
          fontWeight: 700,
          lineHeight: 1.3,
          textShadow: '0 2px 12px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,1)',
          background: 'rgba(0,0,0,0.55)',
          borderRadius: 10,
          padding: '8px 20px',
          letterSpacing: '-0.02em',
        }}
      >
        {activeSegment.text.trim()}
      </span>
    </div>
  );
};

export default SubtitleOverlay;
