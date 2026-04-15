import React from 'react';
import { AbsoluteFill, Html5Audio, Sequence } from 'remotion';
import SceneCard, { SubtitleSegment } from '../components/SceneCard';
import type { TemplateSceneSpec } from '../components/TemplateScene';
import SubtitleOverlay from '../components/SubtitleOverlay';
import LogoReveal from '../components/LogoReveal';

export interface SocialFlowVideoProps {
  voiceover_url: string;
  bgm_url: string;
  client_logo_url: string;
  user_logo_url: string;
  company_name?: string;           // displayed in LogoReveal intro
  logo_intro_seconds?: number;     // seconds for logo reveal before scenes (default 0 = disabled)
  template_video_url?: string;
  subtitle_segments: SubtitleSegment[];
  caption_segments?: SubtitleSegment[];
  scene_descriptors: TemplateSceneSpec[];
  text_layovers?: Array<{ text: string; start: number; end: number }>;
  show_captions?: boolean;
  voiceover_duration_seconds?: number;
}

export const FPS = 30;

const FALLBACK_TEMPLATES = ['CinematicReveal', 'WaveText', 'NeonFrame', 'IconHero', 'CTABurst'];
const FALLBACK_COLORS    = ['#4f9eff', '#8b5cf6', '#00d4ff', '#f5a623', '#00ff88'];

const FALLBACK_SPEC = (i: number): TemplateSceneSpec => ({
  segment_index: i,
  template: FALLBACK_TEMPLATES[i % 5],
  headline: '',
  subtext: '',
  accent_color: FALLBACK_COLORS[i % 5],
  transition_out: 'cross_fade',
});

const SocialFlowVideo: React.FC<SocialFlowVideoProps> = ({
  voiceover_url,
  bgm_url,
  client_logo_url,
  user_logo_url,
  company_name,
  logo_intro_seconds = 0,
  subtitle_segments,
  caption_segments,
  scene_descriptors,
  show_captions = true,
}) => {
  const captionSegs = (caption_segments && caption_segments.length > 0) ? caption_segments : subtitle_segments;
  const logoFrames  = Math.ceil(logo_intro_seconds * FPS);

  return (
    <AbsoluteFill style={{ backgroundColor: '#050510' }}>

      {/* ── Logo intro (optional) ────────────────────────────────────────── */}
      {logoFrames > 0 && (
        <Sequence from={0} durationInFrames={logoFrames}>
          <LogoReveal
            client_logo_url={client_logo_url}
            user_logo_url={user_logo_url}
            company_name={company_name}
          />
        </Sequence>
      )}

      {/* ── Scene cards (offset by logo intro) ──────────────────────────── */}
      {subtitle_segments.map((segment, i) => {
        const spec = scene_descriptors?.[i] ?? FALLBACK_SPEC(i);
        return (
          <SceneCard
            key={`seg-${segment.start}-${i}`}
            segment={segment}
            spec={spec}
            fps={FPS}
            frameOffset={logoFrames}
            client_logo_url={client_logo_url}
            user_logo_url={user_logo_url}
            isFirst={i === 0}
          />
        );
      })}

      {/* ── Captions (offset by logo intro) ─────────────────────────────── */}
      {show_captions && captionSegs.length > 0 && (
        <SubtitleOverlay segments={captionSegs} fps={FPS} frame_offset={logoFrames} />
      )}

      {/* ── Audio (starts immediately — logo plays over silence or BGM) ─── */}
      {bgm_url       && <Html5Audio src={bgm_url}       volume={0.08} startFrom={0} />}
      {voiceover_url && <Html5Audio src={voiceover_url} volume={1}    startFrom={0} />}
    </AbsoluteFill>
  );
};

export default SocialFlowVideo;
