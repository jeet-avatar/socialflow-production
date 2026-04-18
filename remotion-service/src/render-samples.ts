/**
 * Standalone render script: produces 3 silent 9:16 landing-page sample clips.
 *
 * Usage: cd remotion-service && npx ts-node src/render-samples.ts
 * Output: /tmp/sf-prod/frontend/public/sample-videos/{cinematic,neon,burst}.mp4
 */
import * as path from 'path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import type { SocialFlowVideoProps } from './compositions/SocialFlowVideo';

const OUTPUT_DIR = path.resolve(__dirname, '../../frontend/public/sample-videos');
const DURATION = 12;
const FPS = 30;

const SAMPLES: Array<{ slug: string; props: SocialFlowVideoProps }> = [
  {
    slug: 'cinematic',
    props: {
      voiceover_url: '',
      bgm_url: '',
      client_logo_url: '',
      user_logo_url: '',
      template_video_url: '',
      subtitle_segments: [
        { text: '', start: 0, end: 3 },
        { text: '', start: 3, end: 6 },
        { text: '', start: 6, end: 9 },
        { text: '', start: 9, end: 12 },
      ],
      show_captions: false,
      scene_descriptors: [
        { segment_index: 0, template: 'CinematicReveal', headline: 'YOUR CHANNEL', subtext: 'on autopilot',        accent_color: '#06b6d4', transition_out: 'cross_fade' },
        { segment_index: 1, template: 'WaveText',        headline: 'AI VOICEOVER',   subtext: 'studio-grade',      accent_color: '#06b6d4', transition_out: 'cross_fade' },
        { segment_index: 2, template: 'IconHero',        headline: 'DAILY POSTS',    subtext: 'while you sleep',   accent_color: '#06b6d4', transition_out: 'cross_fade' },
        { segment_index: 3, template: 'CTABurst',        headline: 'GROW FAST',      subtext: 'start today',       accent_color: '#06b6d4', transition_out: 'none' },
      ],
      text_layovers: [],
      voiceover_duration_seconds: DURATION,
    },
  },
  {
    slug: 'neon',
    props: {
      voiceover_url: '',
      bgm_url: '',
      client_logo_url: '',
      user_logo_url: '',
      template_video_url: '',
      subtitle_segments: [
        { text: '', start: 0, end: 3 },
        { text: '', start: 3, end: 6 },
        { text: '', start: 6, end: 9 },
        { text: '', start: 9, end: 12 },
      ],
      show_captions: false,
      scene_descriptors: [
        { segment_index: 0, template: 'NeonFrame',     headline: 'FINANCE',     subtext: 'explained daily',  accent_color: '#a855f7', transition_out: 'flash' },
        { segment_index: 1, template: 'ElectricPulse', headline: 'AI NEWS',     subtext: 'hot takes',        accent_color: '#a855f7', transition_out: 'flash' },
        { segment_index: 2, template: 'ChromaSlice',   headline: 'VIRAL',       subtext: 'every time',       accent_color: '#a855f7', transition_out: 'flash' },
        { segment_index: 3, template: 'GlitchReveal',  headline: 'SUBSCRIBE',   subtext: 'now',              accent_color: '#a855f7', transition_out: 'none' },
      ],
      text_layovers: [],
      voiceover_duration_seconds: DURATION,
    },
  },
  {
    slug: 'burst',
    props: {
      voiceover_url: '',
      bgm_url: '',
      client_logo_url: '',
      user_logo_url: '',
      template_video_url: '',
      subtitle_segments: [
        { text: '', start: 0, end: 3 },
        { text: '', start: 3, end: 6 },
        { text: '', start: 6, end: 9 },
        { text: '', start: 9, end: 12 },
      ],
      show_captions: false,
      scene_descriptors: [
        { segment_index: 0, template: 'WordBurst',    headline: 'FITNESS',    subtext: 'tips daily',       accent_color: '#10b981', transition_out: 'cross_fade' },
        { segment_index: 1, template: 'ZoomPunch',    headline: '60 SECONDS', subtext: 'that is it',        accent_color: '#10b981', transition_out: 'cross_fade' },
        { segment_index: 2, template: 'StatShot',     headline: '10× GROWTH', subtext: 'proven',            accent_color: '#10b981', transition_out: 'cross_fade' },
        { segment_index: 3, template: 'TypeBurn',     headline: 'LEVEL UP',   subtext: 'today',             accent_color: '#10b981', transition_out: 'none' },
      ],
      text_layovers: [],
      voiceover_duration_seconds: DURATION,
    },
  },
];

async function main() {
  console.log('Bundling Remotion project...');
  const serveUrl = await bundle({
    entryPoint: path.resolve(__dirname, 'index.tsx'),
  });
  console.log('Bundle ready.');

  for (const sample of SAMPLES) {
    console.log(`\n→ Rendering ${sample.slug}...`);
    const inputProps = sample.props as unknown as Record<string, unknown>;
    const composition = await selectComposition({
      serveUrl,
      id: 'SocialFlowVideoShorts',
      inputProps,
    });
    const outputLocation = path.join(OUTPUT_DIR, `${sample.slug}.mp4`);
    await renderMedia({
      composition: { ...composition, durationInFrames: DURATION * FPS },
      serveUrl,
      codec: 'h264',
      outputLocation,
      inputProps,
      crf: 28,
    });
    console.log(`  ✓ ${outputLocation}`);
  }
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
