export const DEFAULT_COMPANY_LOGO =
  'https://img.freepik.com/premium-vector/abstract-logo-design-any-corporate-brand-business-company_1253202-84182.jpg';
export const DEFAULT_USER_LOGO =
  'https://img.freepik.com/premium-vector/abstract-modern-business-logo-design-template_1253202-84181.jpg';
export const DEFAULT_VIDEO_TITLE = 'AI Generated Marketing Video';

const CDN = import.meta.env.VITE_CDN_URL ?? 'https://d2nbx2qjod9qta.cloudfront.net';

export const VOICE_OPTIONS = [
  { id: '',                       label: 'Auto',    description: 'Backend default',           gender: 'neutral' as const, accent: '',           preview: '' },
  // Male voices (verified ElevenLabs IDs + preview URLs)
  { id: 'pNInz6obpgDQGcFmaJgB',  label: 'Adam',    description: 'Deep & authoritative',      gender: 'male'    as const, accent: 'American',   preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/d6905d7a-dd26-4187-bfff-1bd3a5ea7cac.mp3' },
  { id: 'onwK4e9ZLuTAKqWW03F9',  label: 'Daniel',  description: 'Polished & refined',        gender: 'male'    as const, accent: 'British',    preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/onwK4e9ZLuTAKqWW03F9/7eee0236-1a72-4b86-b303-5dcadc007ba9.mp3' },
  { id: 'N2lVS1w4EtoT3dr4eOWO',  label: 'Callum',  description: 'Energetic & bold',          gender: 'male'    as const, accent: 'Australian',  preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/N2lVS1w4EtoT3dr4eOWO/ac833bd8-ffda-4938-9ebc-b0f99ca25481.mp3' },
  // Female voices
  { id: 'EXAVITQu4vr4xnSDxMaL',  label: 'Sarah',   description: 'Mature & confident',        gender: 'female'  as const, accent: 'American',   preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/01a3e33c-6e99-4ee7-8543-ff2216a32186.mp3' },
] as const;

export const BGM_TRACKS = [
  { id: 'corporate',      label: 'Corporate',      url: `${CDN}/background_music.mp3`,       mood: 'Professional & polished', emoji: '💼' },
  { id: 'upbeat',         label: 'Upbeat',         url: `${CDN}/bgm_upbeat.mp3`,             mood: 'Energetic & motivating',  emoji: '🚀' },
  { id: 'calm',           label: 'Calm',           url: `${CDN}/bgm_calm.mp3`,               mood: 'Relaxed & trustworthy',   emoji: '🌊' },
  { id: 'inspirational',  label: 'Inspirational',  url: `${CDN}/bgm_inspirational.mp3`,      mood: 'Uplifting & emotional',   emoji: '✨' },
  { id: 'tech',           label: 'Tech',           url: `${CDN}/bgm_tech.mp3`,               mood: 'Modern & innovative',     emoji: '⚡' },
  { id: 'cinematic',      label: 'Cinematic',      url: `${CDN}/bgm_cinematic.mp3`,          mood: 'Epic & dramatic',         emoji: '🎬' },
  { id: 'lofi',           label: 'Lo-Fi',          url: `${CDN}/bgm_lofi.mp3`,               mood: 'Chill & casual',          emoji: '🎧' },
  { id: 'acoustic',       label: 'Acoustic',       url: `${CDN}/bgm_acoustic.mp3`,           mood: 'Warm & organic',          emoji: '🎸' },
  { id: 'electronic',     label: 'Electronic',     url: `${CDN}/bgm_electronic.mp3`,         mood: 'Futuristic & dynamic',    emoji: '🎹' },
  { id: 'none',           label: 'No Music',       url: '',                                   mood: 'Voice only',              emoji: '🔇' },
] as const;

export type VoiceId = typeof VOICE_OPTIONS[number]['id'];
export type BgmId = typeof BGM_TRACKS[number]['id'];

export const DEFAULT_VOICE_ID: VoiceId = '';
export const DEFAULT_BGM_ID: BgmId = 'corporate';
