export type CampaignMode = 'manual' | 'intelligent';
export type SenderMode = 'personal' | 'company';
export type VideoStage = 'idle' | 'voiceover' | 'scenes' | 'composing' | 'complete' | 'error';

export interface Company {
  name: string;
  industry?: string;
  logo_url?: string;
  [key: string]: unknown;
}

export interface SenderCtx {
  name: string;
  company: string;
  what_we_do: string;
  angles: string[];
}

export interface UserProfile {
  full_name?: string;
  company_name?: string;
  avatar_url?: string;
  sender_identity?: {
    full_name?: string;
    company_name?: string;
    company_logo_url?: string;
    value_proposition?: string;
  };
  ai_summary?: {
    company_positioning?: string;
    outreach_angles?: string[];
  };
  [key: string]: unknown;
}

export interface VideoStyle {
  mood?: string;
  color_palette?: string[];
  motion_style?: string;
}

export interface AgentPrompt {
  system: string;
  user: string;
}

export interface AnalyzeResult {
  success: boolean;
  voiceover_url: string;
  voiceover_duration_seconds: number;
  subtitle_segments: SceneDescriptor[];
  caption_segments?: SceneDescriptor[];
  scene_descriptors: SceneDescriptor[];
  client_logo_url: string;
  user_logo_url: string;
  video_concept?: string;
  video_style?: VideoStyle;
  agent_prompt?: AgentPrompt;
}

export interface SceneDescriptor {
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
  text?: string;
  [key: string]: unknown;
}

export interface SourceData {
  generated_prompt?: string;
  hiring_signals?: number;
  business_signals?: number;
  social_signals?: number;
  news_links?: unknown[];
  ai_opportunities?: string[];
  company_name?: string;
  industry?: string;
  company_size?: string;
  [key: string]: unknown;
}

export interface CampaignNotification {
  type: 'success' | 'error' | 'info';
  message: string;
}

export interface SubscriptionError {
  error: string;
  limit?: number;
  used?: number;
  plan?: string;
  [key: string]: unknown;
}

export interface CampaignError {
  message: string;
  category: 'auth' | 'network' | 'limit' | 'timeout' | 'validation' | 'unknown';
  retryable: boolean;
  retryHandler?: () => void;
  failedStage?: VideoStage;
}
