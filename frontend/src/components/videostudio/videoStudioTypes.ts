export type TargetDuration = 'short' | 'medium' | 'long';

export type VideoSubStep = 'config' | 'planning' | 'editor' | 'rendering' | 'result';

export type SceneRenderState = 'idle' | 'rendering' | 'rendered' | 'error';

export type VideoStudioMode =
  | 'none'      // gradient background, no AI (formerly 'template')
  | 'template'  // alias for 'none' — kept for backward compat
  | 'dalle'     // DALL-E 3 generated image background
  | 'fal-ai/kling-video/v1.6/standard/text-to-video'
  | 'fal-ai/kling-video/v1.6/pro/text-to-video'
  | 'fal-ai/kling-video/v2/master/text-to-video';

export interface BgOption { 
  id: VideoStudioMode; 
  label: string; 
  tag: string; 
  color: string; 
  bgColor: string; 
  icon: string;
}

export const ALL_TEMPLATES = [
  'CinematicReveal', 'WaveText', 'NeonFrame', 'IconHero', 'CTABurst',
  'DataStream', 'GlitchReveal', 'ElectricPulse', 'ZoomPunch', 'HorizontalSlam',
  'CinematicBars', 'ChromaSlice', 'SplitReveal', 'GravityDrop', 'TypeBurn',
  'WordBurst', 'StatShot',
] as const;

export interface StudioScene {
  template?: string;
  headline?: string;
  description?: string;
  subtext?: string;
  icon?: string;
  accent_color?: string;
  transition_out?: string;
  segment_index?: number;
  start?: number;
  end?: number;
  // Derived from subtitle_segments: how long this scene lasts in the final render.
  duration_seconds?: number;
  // Editorial purpose label used to guide prompt generation.
  purpose?: string;
  text?: string;
  video_prompt?: string;
  background_video_url?: string;
  background_image_url?: string;
  // Per-scene mode and render state
  scene_mode?: VideoStudioMode | 'template';
  render_state?: SceneRenderState;
  rendered_url?: string;
  render_error?: string;
  // Per-scene typography
  font_family?: 'inter' | 'poppins' | 'serif' | 'mono' | 'display';
  font_size?: 'sm' | 'md' | 'lg' | 'xl';
  font_weight?: 'semibold' | 'bold' | 'black';
  font_color?: string;
  // Per-scene background opacity (0.1–1.0; default 0.85 image / 1.0 video)
  background_opacity?: number;
  // Per-scene template overlay opacity (0–1; default 1 — how strong the text/effects layer is)
  template_opacity?: number;
  // Per-scene effects
  particle_intensity?: number;              // 0–1, default 1 (0 = off)
  pulse_rings?: boolean;                    // default true
  template_blend?: 'screen' | 'normal';    // default: screen when video bg, normal otherwise
  [key: string]: unknown;
}

export interface StudioAnalyzeResult {
  success: boolean;
  voiceover_url: string;
  voiceover_duration_seconds: number;
  subtitle_segments: StudioScene[];
  caption_segments?: StudioScene[];
  scene_descriptors: StudioScene[];
  client_logo_url: string;
  user_logo_url: string;
  video_concept?: string;
  video_style?: unknown;
  agent_prompt?: { system: string; user: string };
}

export interface StudioError {
  message: string;
  retryable: boolean;
  onRetry?: () => void;
}

export const MODEL_INFO: Record<string, { label: string; costPer5s: number; maxClip: number; tag: string }> = {
  'none':                                              { label: 'Gradient',      costPer5s: 0,    maxClip: 0,  tag: 'Free'       },
  'template':                                          { label: 'Gradient',      costPer5s: 0,    maxClip: 0,  tag: 'Free'       },
  'dalle':                                             { label: 'DALL·E 3',      costPer5s: 0.04, maxClip: 0,  tag: '$0.04/img'  },
  'fal-ai/kling-video/v1.6/standard/text-to-video':   { label: 'Kling Std',     costPer5s: 0.23, maxClip: 5,  tag: '$0.23/clip' },
  'fal-ai/kling-video/v1.6/pro/text-to-video':        { label: 'Kling Pro',     costPer5s: 0.45, maxClip: 10, tag: '$0.45/clip' },
  'fal-ai/kling-video/v2/master/text-to-video':       { label: 'Kling Master',  costPer5s: 0.7, maxClip: 10, tag: '$0.70/clip' },
};

export const DURATION_INFO: Record<TargetDuration, { label: string; hint: string; scenes: number; words: string }> = {
  short:  { label: 'Short',  hint: '~5s · 1 scene',  scenes: 1, words: '12–15 words' },
  medium: { label: 'Medium', hint: '~15s · 3 scenes', scenes: 3, words: '35–45 words' },
  long:   { label: 'Long',   hint: '~20s · 4 scenes', scenes: 4, words: '50–60 words' },
};

export const BG_OPTIONS: BgOption[] = [
  { id: 'none',                                              label: 'Gradient',     tag: 'Free',       color: 'text-blue-400',    bgColor: 'bg-blue-500/10 border-blue-500/25',      icon: '◈' },
  { id: 'dalle',                                             label: 'DALL·E 3',     tag: 'Image',      color: 'text-sky-400',     bgColor: 'bg-sky-500/10 border-sky-500/25',        icon: '🎨' },
  { id: 'fal-ai/kling-video/v1.6/standard/text-to-video',   label: 'Kling Std',    tag: '$0.23/clip', color: 'text-purple-400',  bgColor: 'bg-purple-500/10 border-purple-500/25',  icon: '▶' },
  { id: 'fal-ai/kling-video/v1.6/pro/text-to-video',        label: 'Kling Pro',    tag: '$0.45/clip', color: 'text-violet-400',  bgColor: 'bg-violet-500/10 border-violet-500/25',  icon: '▶' },
  { id: 'fal-ai/kling-video/v2/master/text-to-video',       label: 'Kling Master', tag: '$0.70/clip', color: 'text-fuchsia-400', bgColor: 'bg-fuchsia-500/10 border-fuchsia-500/25', icon: '▶' },
];
