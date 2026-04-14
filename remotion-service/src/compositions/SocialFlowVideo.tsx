import React from 'react';
import { AbsoluteFill, Html5Audio } from 'remotion';
import SceneCard, { SubtitleSegment } from '../components/SceneCard';
import type { TemplateSceneSpec } from '../components/TemplateScene';
import SubtitleOverlay from '../components/SubtitleOverlay';

export interface SocialFlowVideoProps {
  voiceover_url: string;
  bgm_url: string;
  client_logo_url: string;
  user_logo_url: string;
  template_video_url?: string;          // optional background video URL
  subtitle_segments: SubtitleSegment[];
  caption_segments?: SubtitleSegment[];  // fine-grained Whisper phrases for subtitle overlay
  scene_descriptors: TemplateSceneSpec[];
  text_layovers?: Array<{ text: string; start: number; end: number }>;  // optional text overlays
  show_captions?: boolean;    // default true — renders SubtitleOverlay on every video
  voiceover_duration_seconds?: number;  // total voiceover duration in seconds
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
  subtitle_segments,
  caption_segments,
  scene_descriptors,
  show_captions = true,
}) => {
  const captionSegs = (caption_segments && caption_segments.length > 0) ? caption_segments : subtitle_segments;

  return (
    <AbsoluteFill style={{ backgroundColor: '#050510' }}>
      {/* ── Scene cards ─────────────────────────────────────────────────── */}
      {subtitle_segments.map((segment, i) => {
        const spec = scene_descriptors?.[i] ?? FALLBACK_SPEC(i);
        return (
          <SceneCard
            key={`seg-${segment.start}-${i}`}
            segment={segment}
            spec={spec}
            fps={FPS}
            frameOffset={0}
            client_logo_url={client_logo_url}
            user_logo_url={user_logo_url}
            isFirst={i === 0}
          />
        );
      })}

      {/* ── Captions ────────────────────────────────────────────────────── */}
      {show_captions && captionSegs.length > 0 && (
        <SubtitleOverlay segments={captionSegs} fps={FPS} frame_offset={0} />
      )}

      {/* ── Audio ───────────────────────────────────────────────────────── */}
      {bgm_url       && <Html5Audio src={bgm_url}       volume={0.08} />}
      {voiceover_url && <Html5Audio src={voiceover_url} volume={1}    />}
    </AbsoluteFill>
  );
};

export default SocialFlowVideo;
