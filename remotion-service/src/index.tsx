import { registerRoot, Composition } from 'remotion';
import React from 'react';
import SocialFlowVideo, { FPS, SocialFlowVideoProps } from './compositions/SocialFlowVideo';
import SocialFlowVideoShorts from './compositions/SocialFlowVideoShorts';

const defaultProps: SocialFlowVideoProps = {
  voiceover_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  bgm_url: 'https://d2nbx2qjod9qta.cloudfront.net/background_music.mp3',
  client_logo_url: '',
  user_logo_url: '',
  template_video_url: '',
  subtitle_segments: [
    { text: 'Hello and welcome to SocialFlow.', start: 0, end: 2.5 },
    { text: 'AI-powered social media management at scale.', start: 2.5, end: 5 },
    { text: 'Generate, schedule and publish — all in one place.', start: 5, end: 8 },
    { text: 'Start your free trial today.', start: 8, end: 10 },
  ],
  scene_descriptors: [
    { segment_index: 0, template: 'CinematicReveal', headline: 'WELCOME', subtext: 'SocialFlow AI', accent_color: '#4f9eff', transition_out: 'cross_fade' },
    { segment_index: 1, template: 'WaveText',        headline: 'AI POWERED', subtext: 'Social Media at Scale', accent_color: '#8b5cf6', transition_out: 'cross_fade' },
    { segment_index: 2, template: 'NeonFrame',       headline: 'ONE PLATFORM', subtext: 'Generate · Schedule · Publish', accent_color: '#00d4ff', transition_out: 'flash' },
    { segment_index: 3, template: 'CTABurst',        headline: 'START TODAY', subtext: 'Free Trial Available', accent_color: '#00ff88', transition_out: 'none' },
  ],
  text_layovers: [],
  voiceover_duration_seconds: 10,
};

const Root: React.FC = () => (
  <>
    {/* Landscape 16:9 — YouTube / Instagram Reels (horizontal) */}
    <Composition
      id="SocialFlowVideo"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      component={SocialFlowVideo as any}
      durationInFrames={Math.ceil((defaultProps.voiceover_duration_seconds ?? 10) * FPS)}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={defaultProps}
    />

    {/* Portrait 9:16 — TikTok / YouTube Shorts */}
    <Composition
      id="SocialFlowVideoShorts"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      component={SocialFlowVideoShorts as any}
      durationInFrames={Math.ceil((defaultProps.voiceover_duration_seconds ?? 10) * FPS)}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
    />
  </>
);

registerRoot(Root);
