/**
 * ScenePreviewPlayer — live Remotion-powered preview of a single scene.
 *
 * Uses @remotion/player to render the actual template animations in the browser,
 * so what you see in the editor is exactly what you get in the final render.
 *
 * The Player loops a 3-second preview so all animations are visible.
 * templateOpacity and backgroundOpacity update live as sliders move.
 */

import React, { useMemo } from 'react';
import { Player } from '@remotion/player';
import TemplateScene from '@remotion-src/components/TemplateScene';
import type { TemplateSceneSpec } from '@remotion-src/components/TemplateScene';

const PREVIEW_FPS = 30;
const PREVIEW_DURATION = 90; // 3-second loop — enough to show full animation cycle

interface PreviewProps {
  template?: string;
  headline?: string;
  subtext?: string;
  accentColor?: string;
  icon?: string;
  backgroundImageUrl?: string;
  backgroundVideoUrl?: string;
  backgroundOpacity?: number;
  templateOpacity?: number;
}

// Defined at module level so React doesn't recreate the component type on every render,
// which would cause the Player to unmount/remount unnecessarily.
const ScenePreviewComposition: React.FC<PreviewProps> = ({
  template = 'CinematicReveal',
  headline = '',
  subtext = '',
  accentColor = '#4f9eff',
  icon,
  backgroundImageUrl,
  backgroundVideoUrl,
  backgroundOpacity = 1,
  templateOpacity = 1,
}) => {
  const spec: TemplateSceneSpec = {
    template,
    headline,
    subtext,
    accent_color: accentColor,
    icon: icon && icon !== 'none' ? icon : undefined,
    transition_out: 'none',
    background_image_url: backgroundImageUrl,
    background_video_url: backgroundVideoUrl,
    background_opacity: backgroundOpacity,
    template_opacity: templateOpacity,
  };
  return (
    <TemplateScene
      text={headline}
      spec={spec}
      client_logo_url=""
      user_logo_url=""
    />
  );
};

const ScenePreviewPlayer: React.FC<PreviewProps> = ({
  template,
  headline,
  subtext,
  accentColor,
  icon,
  backgroundImageUrl,
  backgroundVideoUrl,
  backgroundOpacity,
  templateOpacity,
}) => {
  // Memoize inputProps to prevent unnecessary Player re-renders
  const inputProps = useMemo<PreviewProps>(() => ({
    template,
    headline,
    subtext,
    accentColor,
    icon,
    backgroundImageUrl,
    backgroundVideoUrl,
    backgroundOpacity,
    templateOpacity,
  }), [template, headline, subtext, accentColor, icon, backgroundImageUrl, backgroundVideoUrl, backgroundOpacity, templateOpacity]);

  return (
    <Player
      component={ScenePreviewComposition}
      inputProps={inputProps}
      durationInFrames={PREVIEW_DURATION}
      fps={PREVIEW_FPS}
      compositionWidth={1920}
      compositionHeight={1080}
      style={{ width: '100%', height: '100%' }}
      autoPlay
      loop
      controls={false}
      showVolumeControls={false}
      clickToPlay={false}
      spaceKeyToPlayOrPause={false}
    />
  );
};

export default ScenePreviewPlayer;
