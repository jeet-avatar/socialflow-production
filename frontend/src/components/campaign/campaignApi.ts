import { API_BASE_URL } from '../../config/api';
import { getAuthHeaders } from '../../utils/getAuthToken';
import { DEFAULT_COMPANY_LOGO } from './campaignConstants';
import type {
  Company, SenderMode, AnalyzeResult, SourceData,
} from './campaignTypes';

export interface GenerateContentResult {
  video_title: string;
  video_dialogue: string;
  social_caption: string;
  source_data?: SourceData;
  detail?: { error: string; [key: string]: unknown };
}

export interface GenerateVideoResult {
  success: boolean;
  video_url: string;
  scene_descriptors?: unknown[];
  subtitle_segments?: unknown[];
  detail?: { error: string; [key: string]: unknown };
}

export async function fetchUserProfile(): Promise<{ success: boolean; user?: unknown }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}/auth/user-profile`, { headers });
  return res.json();
}

export async function fetchCompanies(): Promise<{ companies?: Company[] }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}/companies`, { method: 'GET', headers });
  return res.json();
}

export async function generateContent(
  payload: { company_name?: string; prompt?: string; sender_mode: SenderMode },
): Promise<{ status: number; data: GenerateContentResult }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return { status: res.status, data };
}

export async function saveCampaignDialogue(payload: {
  company_name: string;
  video_title?: string;
  video_dialogue?: string;
  social_caption?: string;
  generated_prompt?: string;
}): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    await fetch(`${API_BASE_URL}/campaigns/dialogue/save-or-update`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch {
    // intentional — save failures are non-critical
  }
}

export async function analyzeScript(payload: {
  dialogue: string;
  company_name: string;
  client_logo_url: string;
  user_logo_url: string;
  voice_id?: string;
  bgm_url?: string;
}, signal: AbortSignal): Promise<{ status: number; data: AnalyzeResult & { error?: string } }> {
  const headers = await getAuthHeaders();
  const body: Record<string, unknown> = {
    dialogue: payload.dialogue,
    company_name: payload.company_name,
    client_logo_url: payload.client_logo_url,
    user_logo_url: payload.user_logo_url,
    bgm: payload.bgm_url ?? '',
  };
  if (payload.voice_id) body.voice_id = payload.voice_id;
  const res = await fetch(`${API_BASE_URL}/video-remotion/analyze`, {
    method: 'POST', headers, signal,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

export interface GenerateVideoOptions {
  videoTitle?: string;
  socialCaption?: string;
  voiceId?: string;
  showCaptions?: boolean;
  jobId?: string;
  useVeo3?: boolean;
}

export async function generateVideo(
  dialogue: string,
  companyName: string,
  analyzeData: AnalyzeResult,
  bgm_url: string,
  signal: AbortSignal,
  opts: GenerateVideoOptions = {},
): Promise<{ status: number; data: GenerateVideoResult & { error?: string; detail?: unknown } }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}/video-remotion`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      dialogue,
      company_name: companyName,
      video_title: opts.videoTitle,
      social_caption: opts.socialCaption,
      voice_id: opts.voiceId,
      show_captions: opts.showCaptions ?? true,
      job_id: opts.jobId ?? '',
      use_veo3: opts.useVeo3 ?? false,
      voiceover_url: analyzeData.voiceover_url,
      subtitle_segments: analyzeData.subtitle_segments,
      caption_segments: analyzeData.caption_segments,
      scene_descriptors: analyzeData.scene_descriptors,
      voiceover_duration_seconds: analyzeData.voiceover_duration_seconds,
      client_logo_url: analyzeData.client_logo_url,
      user_logo_url: analyzeData.user_logo_url,
      bgm: bgm_url,
    }),
  });
  const data = await res.json();
  return { status: res.status, data };
}

export async function pollRenderProgress(jobId: string): Promise<{ percent: number; stage: string; detail: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/video-remotion/progress/${jobId}`, { headers });
    if (!res.ok) return { percent: 0, stage: 'queued', detail: '' };
    return res.json();
  } catch {
    return { percent: 0, stage: 'queued', detail: '' };
  }
}

export function getCompanyLogoUrl(companies: Company[], selectedCompany: string): string {
  return companies.find(c => c.name === selectedCompany)?.logo_url ?? DEFAULT_COMPANY_LOGO;
}

// Social posting helpers — each throws if the backend reports failure
async function _postJSON(url: string, body: object): Promise<Record<string, unknown>> {
  const headers = await getAuthHeaders();
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const data: Record<string, unknown> = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error((data.error as string) || (data.detail as string) || `Request failed (${res.status})`);
  }
  return data;
}

export async function postToFacebook(videoUrl: string, caption: string) {
  return _postJSON(`${API_BASE_URL}/post-to-facebook`, { video_url: videoUrl, caption });
}

export async function postToLinkedIn(videoUrl: string, caption: string, title: string) {
  return _postJSON(`${API_BASE_URL}/post-to-linkedin`, { video_url: videoUrl, caption, title });
}

export async function postToInstagram(videoUrl: string, caption: string, postType: 'reel' | 'feed') {
  return _postJSON(`${API_BASE_URL}/post-to-instagram`, { video_url: videoUrl, caption, post_type: postType });
}

export async function postToYouTube(videoUrl: string, title: string, description: string) {
  return _postJSON(`${API_BASE_URL}/post-to-youtube`, { video_url: videoUrl, title, description });
}

export async function sendVideoEmail(payload: {
  video_url: string;
  recipient_email: string;
  company_name: string;
  subject: string;
}) {
  return _postJSON(`${API_BASE_URL}/send-video-email`, payload);
}

export function getProxyDownloadUrl(videoUrl: string, filename: string): string {
  return `${API_BASE_URL}/videos/proxy-download?url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(filename)}`;
}

// Voice preview cache — fetched once from backend (which calls ElevenLabs API)
let _voicePreviewCache: Record<string, string> | null = null;

export async function fetchVoicePreviews(): Promise<Record<string, string>> {
  if (_voicePreviewCache) return _voicePreviewCache;
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/voice-previews`, { headers });
    if (!res.ok) return {};
    const data = await res.json();
    _voicePreviewCache = data.previews ?? {};
    return _voicePreviewCache;
  } catch {
    return {};
  }
}
