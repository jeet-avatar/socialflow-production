import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import TemplateScene from './TemplateScene';
export type { TemplateSceneSpec } from './TemplateScene';

export const TRANSITION_FRAMES = 8;
const MAX_SCENE_FRAMES = 150; // 5 seconds at 30fps — matches fal.ai clip duration

export interface SubtitleSegment {
  text: string;
  start: number;
  end: number;
}

interface SceneCardProps {
  segment: SubtitleSegment;
  spec: import('./TemplateScene').TemplateSceneSpec;
  fps: number;
  frameOffset: number;
  client_logo_url: string;
  user_logo_url: string;
  isFirst: boolean;
}

const SceneCard: React.FC<SceneCardProps> = ({
  segment, spec, fps, frameOffset, client_logo_url, user_logo_url, isFirst,
}) => {
  const naturalStart     = Math.round(segment.start * fps) + frameOffset;
  const naturalEnd       = Math.round(segment.end   * fps) + frameOffset;
  const T                = spec.transition_out === 'none' ? 0 : TRANSITION_FRAMES;
  const startFrame       = isFirst ? naturalStart : Math.max(0, naturalStart - T);
  const durationInFrames = Math.min(Math.max(naturalEnd - startFrame, 1), MAX_SCENE_FRAMES);

  return (
    <Sequence from={startFrame} durationInFrames={durationInFrames}>
      <AbsoluteFill>
        <TemplateScene
          text={segment.text}
          spec={spec}
          transitionOut={spec.transition_out}
          client_logo_url={client_logo_url}
          user_logo_url={user_logo_url}
        />
      </AbsoluteFill>
    </Sequence>
  );
};

export default SceneCard;
