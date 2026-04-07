/**
 * TemplateScene — image/video background + text template, no extra effects.
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Img, OffthreadVideo } from 'remotion';
import { getTemplate } from '../templates/registry';
import type { IconName } from './SceneIcon';

export interface TemplateSceneSpec {
  segment_index?: number;
  segment_indices?: number[];
  template: string;
  headline: string;
  subtext?: string;
  accent_color: string;
  icon?: string;
  transition_out: 'cross_fade' | 'flash' | 'zoom_out' | 'none' | 'cut';
  description?: string;
  background_image_url?: string;
  background_video_url?: string;
  background_opacity?: number;
  // Template overlay opacity (0–1; default 1 — controls how strong the text/effects layer is)
  template_opacity?: number;
  // kept in type for API compatibility but no longer rendered
  particle_intensity?: number;
  pulse_rings?: boolean;
  template_blend?: 'screen' | 'normal';
}

interface TemplateSceneProps {
  text: string;
  spec: TemplateSceneSpec;
  client_logo_url: string;
  user_logo_url: string;
  transitionOut?: TemplateSceneSpec['transition_out'];
}

const TemplateScene: React.FC<TemplateSceneProps> = ({
  text,
  spec,
  client_logo_url,
  user_logo_url,
  transitionOut,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const tOut = transitionOut ?? spec.transition_out;

  // Fade in
  const fadeIn = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Cross-fade exit
  const crossFadeOp = tOut === 'cross_fade'
    ? interpolate(frame, [Math.max(0, durationInFrames - 8), durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;

  const exitOpacity = crossFadeOp;

  // Background fade-in (slight delay to avoid pop)
  const hasBgVideo = !!spec.background_video_url;
  const hasBgImage = !!spec.background_image_url;
  const bgOp = (hasBgVideo || hasBgImage)
    ? interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0;

  const TemplateComponent = getTemplate(spec.template);

  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, exitOpacity) }}>
      {/* Fallback dark background when no bg image/video */}
      {!hasBgVideo && !hasBgImage && (
        <AbsoluteFill style={{ background: '#050510' }} />
      )}

      {/* Background video */}
      {hasBgVideo && (
        <AbsoluteFill style={{ opacity: bgOp * (spec.background_opacity ?? 1), pointerEvents: 'none' }}>
          <OffthreadVideo
            src={spec.background_video_url!}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </AbsoluteFill>
      )}

      {/* Background image — full opacity so it's clearly visible */}
      {!hasBgVideo && hasBgImage && (
        <AbsoluteFill style={{ opacity: bgOp * (spec.background_opacity ?? 1), pointerEvents: 'none' }}>
          <Img
            src={spec.background_image_url!}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </AbsoluteFill>
      )}

      {/* Text template — opacity controlled by template_opacity so user can dial in the overlay strength */}
      <AbsoluteFill style={{ opacity: spec.template_opacity ?? 1 }}>
        <TemplateComponent
          headline={spec.headline}
          subtext={spec.subtext ?? ''}
          accentColor={spec.accent_color}
          icon={spec.icon as IconName | undefined}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default TemplateScene;
