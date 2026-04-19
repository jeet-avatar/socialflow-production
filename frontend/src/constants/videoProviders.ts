/**
 * Video provider FE mirror — kept in sync with backend/app/utils/video_providers.py.
 *
 * The picker grid in GenerationStudio fetches /api/models for the live list +
 * platform_key_available flag. This file is the static fallback / type contract.
 *
 * Adding a model = append a row here AND in video_providers.py PROVIDER_REGISTRY.
 */

export type Ratio = '16:9' | '9:16' | '1:1';

export interface VideoProvider {
  model_id: string;
  display_name: string;
  route_via: 'fal' | 'vertex' | 'kuaishou' | 'runway' | 'luma' | 'higgsfield' | 'openai';
  byok_key: string;
  durations_sec: number[];
  ratios: Ratio[];
  cost_per_sec_usd: number;
  where_to_get_url: string;
  brand_color: string;
  /** True when the platform env var is set on the server (i.e. user can pay with credits) */
  platform_key_available: boolean;
  /** True when only BYOK is available — picker shows BYOK badge, hides "use credits" radio */
  byok_only: boolean;
}

export interface ModelsResponse {
  models: VideoProvider[];
}

export const PLATFORM_MARKUP = 1.25;

export function estimateCostUsd(provider: VideoProvider, durationSec: number, useByok: boolean): number {
  if (useByok) return 0;
  return Math.round(provider.cost_per_sec_usd * durationSec * PLATFORM_MARKUP * 100) / 100;
}

/**
 * Static fallback list — used only if /api/models fails. Real values come from the API.
 * platform_key_available is `false` here because the FE cannot know server env state.
 */
export const VIDEO_PROVIDERS_FALLBACK: VideoProvider[] = [
  { model_id: 'veo3-fal',      display_name: 'Veo 3 (fal)',         route_via: 'fal',        byok_key: 'fal',        durations_sec: [8],      ratios: ['16:9','9:16','1:1'], cost_per_sec_usd: 0.50, where_to_get_url: 'https://fal.ai/dashboard/keys',                  brand_color: '#a855f7', platform_key_available: false, byok_only: true },
  { model_id: 'veo3-vertex',   display_name: 'Veo 3 (Google)',      route_via: 'vertex',     byok_key: 'vertex',     durations_sec: [8],      ratios: ['16:9','9:16'],       cost_per_sec_usd: 0.40, where_to_get_url: 'https://console.cloud.google.com/apis/credentials', brand_color: '#4285f4', platform_key_available: false, byok_only: true },
  { model_id: 'kling2-fal',    display_name: 'Kling 2.0 Master',    route_via: 'fal',        byok_key: 'fal',        durations_sec: [5,10],   ratios: ['16:9','9:16','1:1'], cost_per_sec_usd: 0.35, where_to_get_url: 'https://fal.ai/dashboard/keys',                  brand_color: '#06b6d4', platform_key_available: false, byok_only: true },
  { model_id: 'kling2-direct', display_name: 'Kling 2.0 (direct)',  route_via: 'kuaishou',   byok_key: 'kling',      durations_sec: [5,10],   ratios: ['16:9','9:16','1:1'], cost_per_sec_usd: 0.30, where_to_get_url: 'https://klingai.com/dev',                        brand_color: '#0891b2', platform_key_available: false, byok_only: true },
  { model_id: 'runway-gen4',   display_name: 'Runway Gen-4 Turbo',  route_via: 'runway',     byok_key: 'runway',     durations_sec: [5,10],   ratios: ['16:9','9:16'],       cost_per_sec_usd: 0.50, where_to_get_url: 'https://app.runwayml.com/account',               brand_color: '#10b981', platform_key_available: false, byok_only: true },
  { model_id: 'pika2-fal',     display_name: 'Pika 2.0',            route_via: 'fal',        byok_key: 'fal',        durations_sec: [5],      ratios: ['16:9','9:16','1:1'], cost_per_sec_usd: 0.20, where_to_get_url: 'https://fal.ai/dashboard/keys',                  brand_color: '#ec4899', platform_key_available: false, byok_only: true },
  { model_id: 'hailuo-fal',    display_name: 'MiniMax Hailuo 02',   route_via: 'fal',        byok_key: 'fal',        durations_sec: [6],      ratios: ['16:9'],              cost_per_sec_usd: 0.25, where_to_get_url: 'https://fal.ai/dashboard/keys',                  brand_color: '#ef4444', platform_key_available: false, byok_only: true },
  { model_id: 'higgsfield',    display_name: 'Higgsfield',          route_via: 'higgsfield', byok_key: 'higgsfield', durations_sec: [5,8],    ratios: ['16:9','9:16'],       cost_per_sec_usd: 0.45, where_to_get_url: 'https://platform.higgsfield.ai',                 brand_color: '#8b5cf6', platform_key_available: false, byok_only: true },
  { model_id: 'sora2-openai',  display_name: 'Sora 2',              route_via: 'openai',     byok_key: 'openai',     durations_sec: [4,8,12], ratios: ['16:9','9:16','1:1'], cost_per_sec_usd: 0.50, where_to_get_url: 'https://platform.openai.com/api-keys',           brand_color: '#000000', platform_key_available: false, byok_only: true },
];
