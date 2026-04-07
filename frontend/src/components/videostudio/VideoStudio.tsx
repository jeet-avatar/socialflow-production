import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film, Wand2, Sparkles, Loader2,
  Mic, Music2, Play, Pause, Volume2,
  Type, ALargeSmall,
  AlertCircle, RefreshCw, X, Download, Copy, CheckCircle2,
  Share2, ZoomIn, ZoomOut, Maximize2, Settings,
  User, Building2, ChevronDown, Search, Send, Mail,
  Linkedin, Facebook, Youtube, Instagram, RotateCcw, Image,
  FolderOpen, Clock, Video,
} from 'lucide-react';
import { useVideoStudioState } from './useVideoStudioState';
import type { StudioScene, VideoStudioMode } from './videoStudioTypes';
import { MODEL_INFO, DURATION_INFO, ALL_TEMPLATES, BG_OPTIONS } from './videoStudioTypes';
import { VideoStudioConfigPopup } from './VideoStudioConfigPopup';
import { VOICE_OPTIONS, BGM_TRACKS, type VoiceId, type BgmId } from '../campaign/campaignConstants';
import {
  getProxyDownloadUrl,
  postToFacebook, postToLinkedIn, postToInstagram, postToYouTube, sendVideoEmail,
} from '../campaign/campaignApi';
import { getAuthHeaders } from '../../utils/getAuthToken';
import { API_BASE_URL } from '../../config/api';

// ── Template gradient map ───────────────────────────────────────────────────
const TEMPLATE_GRADIENTS: Record<string, string> = {
  CinematicReveal: 'from-slate-900 to-slate-700',
  WaveText:        'from-blue-950 to-cyan-900',
  NeonFrame:       'from-purple-950 to-fuchsia-900',
  IconHero:        'from-teal-950 to-emerald-900',
  CTABurst:        'from-orange-950 to-amber-900',
  DataStream:      'from-green-950 to-emerald-800',
  GlitchReveal:    'from-red-950 to-pink-900',
  ElectricPulse:   'from-violet-950 to-purple-900',
  ZoomPunch:       'from-gray-950 to-zinc-800',
  HorizontalSlam:  'from-indigo-950 to-blue-900',
  CinematicBars:   'from-stone-950 to-zinc-800',
  ChromaSlice:     'from-fuchsia-950 to-pink-900',
  SplitReveal:     'from-sky-950 to-blue-900',
  GravityDrop:     'from-zinc-950 to-neutral-800',
  TypeBurn:        'from-amber-950 to-yellow-900',
  WordBurst:       'from-rose-950 to-red-900',
  StatShot:        'from-cyan-950 to-teal-900',
};

const SCENE_TRACK_COLORS = [
  'bg-blue-500/50', 'bg-teal-500/50', 'bg-purple-500/50',
  'bg-emerald-500/50', 'bg-pink-500/50', 'bg-indigo-500/50',
];

type SideTab = 'templates' | 'text' | 'audio' | 'effects' | 'settings' | 'library';

const MODE_OPTIONS = BG_OPTIONS;

const isAiBackground = (m: VideoStudioMode | string | undefined): boolean =>
  typeof m === 'string' && m.length > 0 && m !== 'none' && m !== 'template';

const isVideoBackground = (m: VideoStudioMode | string | undefined): boolean =>
  isAiBackground(m) && m !== 'dalle';

// ── Audio preview hook ──────────────────────────────────────────────────────
// FIX: properly clean up Audio objects to avoid leaks
function useAudioPreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const toggle = (id: string, url: string) => {
    if (!url) return;
    if (playing === id) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlaying(null);
      return;
    }
    // Pause + discard previous
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    const a = new Audio(url);
    a.volume = 0.35;
    a.play().catch(() => {});
    a.onended = () => { audioRef.current = null; setPlaying(null); };
    audioRef.current = a;
    setPlaying(id);
  };

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setPlaying(null);
  };

  // Cleanup on unmount
  useEffect(() => () => stop(), []);  

  return { playing, toggle, stop };
}

// ── Shared publish/email logic ──────────────────────────────────────────────
// FIX: extracted from both Toolbar and FullResultView to avoid duplication

type PostStatus = 'idle' | 'loading' | 'success' | 'error';

interface PublishActionsProps {
  videoUrl: string;
  videoTitle: string;
  socialCaption: string;
  layout: 'dropdown' | 'panel'; // dropdown = Toolbar inline, panel = FullResultView sidebar
}

const PublishActions = ({ videoUrl, videoTitle, socialCaption, layout }: PublishActionsProps) => {
  const [postStatus, setPostStatus] = useState<Record<string, PostStatus>>({});
  const [postError, setPostError] = useState<Record<string, string>>({});
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState('');

  const post = async (platform: string, fn: () => Promise<unknown>) => {
    setPostStatus(s => ({ ...s, [platform]: 'loading' }));
    setPostError(e => ({ ...e, [platform]: '' }));
    try {
      await fn();
      setPostStatus(s => ({ ...s, [platform]: 'success' }));
    } catch (err) {
      setPostStatus(s => ({ ...s, [platform]: 'error' }));
      setPostError(e => ({ ...e, [platform]: err instanceof Error ? err.message : 'Failed' }));
    }
  };

  const platforms = [
    { id: 'linkedin',  label: 'LinkedIn',  Icon: Linkedin,  fn: () => postToLinkedIn(videoUrl, socialCaption, videoTitle) },
    { id: 'facebook',  label: 'Facebook',  Icon: Facebook,  fn: () => postToFacebook(videoUrl, socialCaption) },
    { id: 'instagram', label: 'Instagram', Icon: Instagram, fn: () => postToInstagram(videoUrl, socialCaption, 'reel') },
    { id: 'youtube',   label: 'YouTube',   Icon: Youtube,   fn: () => postToYouTube(videoUrl, videoTitle, socialCaption) },
  ] as const;

  const postAll = async () => {
    const retryable = platforms.filter(({ id }) => postStatus[id] !== 'success');
    if (retryable.length === 0) return;
    retryable.forEach(({ id }) => {
      setPostStatus(s => ({ ...s, [id]: 'loading' }));
      setPostError(e => ({ ...e, [id]: '' }));
    });
    const results = await Promise.allSettled(retryable.map(({ fn }) => fn()));
    results.forEach((result, i) => {
      const id = retryable[i].id;
      if (result.status === 'fulfilled') {
        setPostStatus(s => ({ ...s, [id]: 'success' }));
      } else {
        setPostStatus(s => ({ ...s, [id]: 'error' }));
        setPostError(e => ({ ...e, [id]: result.reason instanceof Error ? result.reason.message : 'Failed' }));
      }
    });
  };

  const allLoading = platforms.some(({ id }) => postStatus[id] === 'loading');
  const allDone = platforms.every(({ id }) => postStatus[id] === 'success');

  const handleEmail = async () => {
    if (!emailTo) return;
    setEmailSending(true);
    setEmailError('');
    try {
      await sendVideoEmail({
        video_url: videoUrl,
        recipient_email: emailTo,
        company_name: videoTitle || 'Video',
        subject: `Your video: ${videoTitle || 'SocialFlow'}`,
      });
      setEmailOpen(false);
      setEmailTo('');
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to send email');
    }
    setEmailSending(false);
  };

  const isPanel = layout === 'panel';
  const btnBase = isPanel
    ? 'w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-xs font-medium'
    : 'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all text-xs font-medium';

  return (
    <>
      {/* Post to All button */}
      <button
        type="button"
        onClick={postAll}
        disabled={allLoading || allDone}
        className={`w-full flex items-center justify-center gap-2 ${isPanel ? 'px-4 py-3' : 'px-3 py-2.5'} rounded-xl border font-semibold text-xs transition-all ${
          allDone    ? 'border-emerald-500/25 bg-emerald-500/8 text-emerald-400 cursor-default' :
          allLoading ? 'border-blue-500/20 bg-blue-500/10 text-blue-300 cursor-wait' :
          'border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:text-blue-200'
        }`}
      >
        {allLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
         allDone    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> :
                      <span className="text-base leading-none">⚡</span>}
        <span>{allDone ? 'Posted to All Platforms' : allLoading ? 'Posting to All...' : 'Post to All Platforms'}</span>
      </button>

      {platforms.map(({ id, label, Icon, fn }) => {
        const st = postStatus[id] ?? 'idle';
        const errMsg = postError[id] ?? '';
        return (
          <div key={id} className="w-full">
            <button type="button" onClick={() => post(id, fn)} disabled={st === 'loading' || st === 'success'}
              className={`${btnBase} w-full ${
                st === 'success' ? 'border-emerald-500/25 bg-emerald-500/8 text-emerald-400' :
                st === 'error'   ? 'border-red-500/25 bg-red-500/8 text-red-400' :
                'border-white/[0.07] bg-white/[0.02] text-white/60 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <div className={`flex items-center ${isPanel ? 'gap-2.5' : 'gap-2'}`}>
                <Icon className={isPanel ? 'h-4 w-4 flex-shrink-0' : 'h-3.5 w-3.5'} />
                <span>{label}</span>
              </div>
              {st === 'loading' && <Loader2 className="h-3 w-3 animate-spin" />}
              {st === 'success' && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
              {st === 'error'   && <span className="text-[9px] text-red-400">Failed</span>}
            </button>
            {st === 'error' && errMsg && (
              <p className="mt-1 px-1 text-[9px] text-red-400/80 leading-tight truncate" title={errMsg}>{errMsg}</p>
            )}
          </div>
        );
      })}

      {/* Copy link */}
      <button type="button" onClick={() => navigator.clipboard.writeText(videoUrl).catch(() => {})}
        className={`${isPanel ? 'w-full flex items-center gap-2.5 px-4 py-3' : 'w-full flex items-center gap-2 px-3 py-2.5'} rounded-xl border border-white/[0.07] bg-white/[0.02] text-white/50 hover:bg-white/[0.06] text-xs font-semibold transition-all`}
      >
        <Copy className={isPanel ? 'h-4 w-4 flex-shrink-0' : 'h-3.5 w-3.5'} />
        <span>Copy Link</span>
      </button>

      {/* Email */}
      <button type="button" onClick={() => setEmailOpen(true)}
        className={`${isPanel ? 'w-full flex items-center gap-2.5 px-4 py-3' : 'w-full flex items-center gap-2 px-3 py-2.5'} rounded-xl border border-white/[0.07] bg-white/[0.02] text-white/55 hover:bg-white/[0.06] hover:text-white text-xs font-medium transition-all`}
      >
        <Mail className={isPanel ? 'h-4 w-4 flex-shrink-0' : 'h-3.5 w-3.5'} />
        <span>Send via Email</span>
      </button>

      {/* Email modal */}
      <AnimatePresence>
        {emailOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setEmailOpen(false); }}
          >
            <motion.div initial={{ scale: 0.94 }} animate={{ scale: 1 }} exit={{ scale: 0.94 }}
              className="w-80 glass-card p-6 space-y-4"
            >
              <p className="text-sm font-bold text-white">Send via Email</p>
              <input type="email" placeholder="recipient@email.com" value={emailTo} onChange={e => setEmailTo(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2.5 text-sm text-white/80 focus:outline-none focus:border-blue-500/30 transition-all placeholder-white/20"
              />
              {emailError && (
                <p className="text-[10px] text-red-400 leading-tight">{emailError}</p>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setEmailOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/[0.07] text-white/40 hover:text-white/70 text-xs transition-all"
                >Cancel</button>
                <button type="button" onClick={handleEmail} disabled={emailSending || !emailTo}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-teal-blue text-white text-xs font-semibold disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                >
                  {emailSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  {emailSending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// ── Company type ────────────────────────────────────────────────────────────
interface CompanyOption { name: string; industry: string; logo_url: string }

// ─────────────────────────────────────────────────────────────────────────────
// TOOLBAR
// ─────────────────────────────────────────────────────────────────────────────
interface ToolbarProps {
  prompt: string; setPrompt: (v: string) => void;
  isGenerating: boolean; isRendering: boolean;
  hasScenes: boolean; showResult: boolean;
  videoUrl: string; videoTitle: string; socialCaption: string;
  onGenerate: () => void; onRender: () => void;
  error: { message: string; retryable: boolean; onRetry?: () => void } | null;
  setError: (e: null) => void;
  onReset: () => void;
}

const Toolbar = ({
  prompt, setPrompt, isGenerating, isRendering, hasScenes, showResult,
  videoUrl, videoTitle, socialCaption, onGenerate, onRender, error, setError, onReset,
}: ToolbarProps) => {
  const [publishOpen, setPublishOpen] = useState(false);
  const filename = `${(videoTitle || 'video').replaceAll(/\s+/g, '_')}_video.mp4`;
  const downloadUrl = videoUrl ? getProxyDownloadUrl(videoUrl, filename) : '';

  return (
    <div className="flex-shrink-0 bg-dark-bg-light/60 backdrop-blur-2xl border-b border-glass-border">
      <div className="h-14 flex items-center gap-3 px-5">
        {/* Brand */}
        <div className="flex items-center gap-2.5 flex-shrink-0 select-none mr-1">
          <div className="w-8 h-8 rounded-xl bg-gradient-teal-blue flex items-center justify-center shadow-glow-teal flex-shrink-0">
            <Film className="h-4 w-4 text-white" />
          </div>
          <div className="hidden md:block">
            <p className="text-[13px] font-bold text-white leading-none">Video Studio</p>
            <p className="text-[10px] leading-none mt-0.5 truncate max-w-[160px]" title={videoTitle || undefined}>
              {videoTitle
                ? <span className="text-blue-400/70">{videoTitle}</span>
                : <span className="text-white/30">AI-powered creator</span>}
            </p>
          </div>
        </div>

        <div className="h-6 w-px bg-white/[0.07] flex-shrink-0" />

        {/* Prompt */}
        <div className="flex-1 min-w-0 flex items-center">
          <input
            type="text" value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder="Describe your video… e.g. 'Product launch for SaaS startup'"
            className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-2 text-sm text-white/80 placeholder-white/20 focus:outline-none focus:border-blue-500/40 focus:bg-white/[0.06] transition-all"
            onKeyDown={e => { if (e.key === 'Enter') onGenerate(); }}
          />
        </div>

        {/* Actions - Moved to Top Right */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Generate */}
          <button type="button" onClick={onGenerate} disabled={!prompt.trim() || isGenerating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isGenerating
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Generating…</span></>
              : <><Sparkles className="h-3.5 w-3.5" /><span>Generate</span></>}
          </button>

          {/* Render All */}
          <button type="button" onClick={onRender} disabled={!hasScenes || isRendering || isGenerating}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-teal-blue text-white text-sm font-bold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-glow-teal"
          >
            {isRendering
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Rendering…</span></>
              : <><Wand2 className="h-3.5 w-3.5" /><span>Render All</span></>}
          </button>

          {/* Post-render: Download + Publish + New Video */}
          {showResult && videoUrl && (
            <>
              <div className="h-6 w-px bg-white/[0.07]" />

              {/* Download */}
              <a href={downloadUrl} download={filename}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-500/25 bg-emerald-500/8 text-emerald-400 hover:bg-emerald-500/15 text-xs font-semibold transition-all"
                title="Download video"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden lg:block">Download</span>
              </a>

              {/* Publish dropdown */}
              <div className="relative">
                <button type="button" onClick={() => setPublishOpen(o => !o)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-500/25 bg-blue-500/8 text-blue-400 hover:bg-blue-500/15 text-xs font-semibold transition-all"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span className="hidden lg:block">Publish</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${publishOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {publishOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-56 glass-card z-50 p-3 space-y-1.5"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-1 pb-1">Post to</p>
                      <PublishActions
                        videoUrl={videoUrl}
                        videoTitle={videoTitle}
                        socialCaption={socialCaption}
                        layout="dropdown"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* New Video */}
              <button type="button" onClick={onReset} title="Start new video"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/[0.07] bg-white/[0.03] text-white/40 hover:text-white/70 hover:bg-white/[0.07] text-xs transition-all"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden lg:block">New</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error strip */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="flex items-center gap-2.5 px-5 py-2 bg-red-500/[0.06] border-t border-red-500/15 overflow-hidden"
          >
            <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
            <span className="text-xs text-red-400/90 flex-1">{error.message}</span>
            {error.retryable && error.onRetry && (
              <button onClick={error.onRetry} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors">
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            )}
            <button onClick={() => setError(null)} className="text-white/20 hover:text-white/50 transition-colors ml-1">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ICON STRIP
// ─────────────────────────────────────────────────────────────────────────────
const SIDE_TABS: { id: SideTab; Icon: typeof Film; label: string }[] = [
  { id: 'templates', Icon: Film,        label: 'Design'  },
  { id: 'text',      Icon: Type,        label: 'Text'    },
  { id: 'audio',     Icon: Mic,         label: 'Audio'   },
  { id: 'effects',   Icon: Sparkles,    label: 'Effects' },
  { id: 'library',   Icon: FolderOpen,  label: 'Library' },
  { id: 'settings',  Icon: Settings,    label: 'Settings'},
];

interface IconStripProps {
  activeTab: SideTab | null;
  onTabClick: (tab: SideTab) => void;
}
const IconStrip = ({ activeTab, onTabClick }: IconStripProps) => (
  <div className="flex-1 flex flex-col items-center py-4 gap-1.5 overflow-y-auto">
    {SIDE_TABS.map(({ id, Icon, label }) => (
      <button key={id} type="button" onClick={() => onTabClick(id)} title={label}
        className={`w-11 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl transition-all ${
          activeTab === id
            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/25'
            : 'text-white/25 hover:bg-white/[0.04] hover:text-white/55 border border-transparent'
        }`}
      >
        <Icon className="h-4 w-4" />
        <span className="text-[8px] font-medium leading-none tracking-wide">{label}</span>
      </button>
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// SLIDING PANEL
// ─────────────────────────────────────────────────────────────────────────────
interface SlidingPanelProps {
  activeTab: SideTab | null;
  scenes: StudioScene[]; selectedIndex: number; onSelectScene: (i: number) => void;
  isGenerating: boolean; videoMode: VideoStudioMode;
  updateScene: (i: number, u: Partial<StudioScene>) => void;
  updateSceneMode: (i: number, mode: VideoStudioMode | 'template') => void;
  onRenderScene: (i: number) => void;
  onGeneratePrompt: (i: number) => void;
  generatingPrompt: boolean;
  dialogue: string; setDialogue: (v: string) => void;
  voiceId: VoiceId; setVoiceId: (v: VoiceId) => void;
  bgmId: BgmId; setBgmId: (b: BgmId) => void;
  showCaptions: boolean; setShowCaptions: (v: boolean) => void;
  voiceVolume: number; setVoiceVolume: (v: number) => void;
  bgmVolume: number; setBgmVolume: (v: number) => void;
  socialCaption: string; videoTitle: string;
  companyName: string; setCompanyName: (v: string) => void;
  senderMode: 'personal' | 'company'; setSenderMode: (v: 'personal' | 'company') => void;
  targetDuration: 'short' | 'medium' | 'long'; setTargetDuration: (d: 'short' | 'medium' | 'long') => void;
  setVideoMode: (m: VideoStudioMode) => void;
  captionStyle: 'pill' | 'bar' | 'outline' | 'highlight'; setCaptionStyle: (v: 'pill' | 'bar' | 'outline' | 'highlight') => void;
  captionFontSize: 'sm' | 'md' | 'lg'; setCaptionFontSize: (v: 'sm' | 'md' | 'lg') => void;
}

const PANEL_W = 288;

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE GRID
// ─────────────────────────────────────────────────────────────────────────────
// ── Template metadata & animations ─────────────────────────────────────────
type AnimType =
  | 'fadeUp' | 'zoomPunch' | 'slideLeft' | 'glitch' | 'neonPulse'
  | 'wave' | 'gravityDrop' | 'wordBurst' | 'bars' | 'electricPulse'
  | 'chromaSlice' | 'splitReveal' | 'dataStream' | 'statShot' | 'typeBurn';

const TEMPLATE_META: Record<string, { animType: AnimType; icon: string; desc: string }> = {
  CinematicReveal: { animType: 'fadeUp',       icon: '🎬', desc: 'Cinematic fade from black' },
  WaveText:        { animType: 'wave',          icon: '〜', desc: 'Flowing wave motion' },
  NeonFrame:       { animType: 'neonPulse',     icon: '⚡', desc: 'Glowing neon border' },
  IconHero:        { animType: 'fadeUp',        icon: '🏆', desc: 'Icon + headline fade up' },
  CTABurst:        { animType: 'zoomPunch',     icon: '💥', desc: 'CTA punch in effect' },
  DataStream:      { animType: 'dataStream',    icon: '📊', desc: 'Data streams across frame' },
  GlitchReveal:    { animType: 'glitch',        icon: '📺', desc: 'RGB glitch effect' },
  ElectricPulse:   { animType: 'electricPulse', icon: '⚡', desc: 'Electric glow flicker' },
  ZoomPunch:       { animType: 'zoomPunch',     icon: '🔍', desc: 'Zoom punch reveal' },
  HorizontalSlam:  { animType: 'slideLeft',     icon: '⇒', desc: 'Text slams in from right' },
  CinematicBars:   { animType: 'bars',          icon: '▬', desc: 'Black bars + text reveal' },
  ChromaSlice:     { animType: 'chromaSlice',   icon: '🌈', desc: 'Chromatic aberration' },
  SplitReveal:     { animType: 'splitReveal',   icon: '◫', desc: 'Split halves reveal' },
  GravityDrop:     { animType: 'gravityDrop',   icon: '↓', desc: 'Text drops with bounce' },
  TypeBurn:        { animType: 'typeBurn',      icon: '⌨', desc: 'Typewriter burn-in' },
  WordBurst:       { animType: 'wordBurst',     icon: '💬', desc: 'Words burst in sequence' },
  StatShot:        { animType: 'statShot',      icon: '📈', desc: 'Stats count up reveal' },
};

// ── Animated template preview ───────────────────────────────────────────────
const TemplateAnimPreview = ({ template, grad }: { template: string; grad: string }) => {
  const animType = TEMPLATE_META[template]?.animType ?? 'fadeUp';

  // statShot counter
  const [count, setCount] = useState(0);
  // typewriter cursor
  const [typeLen, setTypeLen] = useState(0);
  const HEADLINE = 'Your Message';
  useEffect(() => {
    if (animType === 'statShot') {
      let n = 0;
      const t = setInterval(() => { n = (n + 7) % 100; setCount(n); }, 60);
      return () => clearInterval(t);
    }
    if (animType === 'typeBurn') {
      let i = 0; let dir = 1;
      const t = setInterval(() => {
        i += dir;
        if (i >= HEADLINE.length) { dir = -1; }
        if (i <= 0) { dir = 1; }
        setTypeLen(i);
      }, 80);
      return () => clearInterval(t);
    }
  }, [animType]);

  const baseText = (
    <span className="text-white font-black text-[11px] text-center drop-shadow-lg leading-tight">
      {HEADLINE}
    </span>
  );

  const renderAnim = () => {
    switch (animType) {
      case 'fadeUp':
        return (
          <motion.div className="flex flex-col items-center gap-1"
            animate={{ opacity: [0, 1, 1, 0], y: [12, 0, 0, -8] }}
            transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.25, 0.75, 1] }}
          >
            {baseText}
            <motion.span className="text-white/50 text-[8px]"
              animate={{ opacity: [0, 0.7, 0.7, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.35, 0.75, 1] }}
            >Supporting line</motion.span>
          </motion.div>
        );

      case 'zoomPunch':
        return (
          <motion.div
            animate={{ scale: [0.5, 1.08, 1, 1, 0.5], opacity: [0, 1, 1, 1, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, times: [0, 0.2, 0.35, 0.75, 1] }}
          >{baseText}</motion.div>
        );

      case 'slideLeft':
        return (
          <motion.div
            animate={{ x: [70, 0, 0, -70], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.2, 0.75, 1] }}
          >{baseText}</motion.div>
        );

      case 'wave':
        return (
          <div className="flex gap-[2px]">
            {'Your'.split('').map((ch, i) => (
              <motion.span key={i} className="text-white font-black text-[11px] drop-shadow-lg"
                animate={{ y: [0, -5, 0, 5, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.1 }}
              >{ch}</motion.span>
            ))}
          </div>
        );

      case 'glitch':
        return (
          <div className="relative">
            <motion.span className="text-red-400 font-black text-[11px] absolute"
              animate={{ x: [-2, 2, -2], opacity: [0.6, 0.8, 0.6] }}
              transition={{ duration: 0.15, repeat: Infinity }}
            >{HEADLINE}</motion.span>
            <motion.span className="text-cyan-400 font-black text-[11px] absolute"
              animate={{ x: [2, -2, 2], opacity: [0.6, 0.8, 0.6] }}
              transition={{ duration: 0.15, repeat: Infinity }}
            >{HEADLINE}</motion.span>
            <span className="text-white font-black text-[11px] relative z-10">{HEADLINE}</span>
          </div>
        );

      case 'neonPulse':
        return (
          <motion.div className="px-4 py-2 rounded-lg"
            animate={{ boxShadow: ['0 0 4px #a855f7, inset 0 0 4px #a855f740', '0 0 14px #a855f7, 0 0 28px #a855f780, inset 0 0 10px #a855f730', '0 0 4px #a855f7, inset 0 0 4px #a855f740'] }}
            style={{ border: '1px solid #a855f7' }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <motion.span className="font-black text-[11px]"
              animate={{ color: ['#e879f9', '#ffffff', '#e879f9'] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >{HEADLINE}</motion.span>
          </motion.div>
        );

      case 'electricPulse':
        return (
          <motion.span className="font-black text-[11px]"
            animate={{ textShadow: ['0 0 4px #7c3aed', '0 0 16px #7c3aed, 0 0 32px #a78bfa', '0 0 4px #7c3aed', '0 0 2px #7c3aed, 0 0 8px #a78bfa', '0 0 4px #7c3aed'], color: ['#e2e8f0', '#a78bfa', '#e2e8f0', '#c4b5fd', '#e2e8f0'] }}
            transition={{ duration: 1.8, repeat: Infinity, times: [0, 0.2, 0.4, 0.7, 1] }}
          >{HEADLINE}</motion.span>
        );

      case 'gravityDrop':
        return (
          <motion.div
            animate={{ y: [-25, 2, 0, 0, 0], opacity: [0, 1, 1, 1, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.15, 0.28, 0.8, 1], ease: ['easeOut', 'easeOut', 'easeOut', 'easeIn'] }}
          >{baseText}</motion.div>
        );

      case 'bars': {
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <motion.div className="absolute top-0 left-0 right-0 bg-black"
              animate={{ height: ['40%', '18%', '18%', '40%'] }}
              transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.3, 0.7, 1] }}
            />
            <motion.div className="absolute bottom-0 left-0 right-0 bg-black"
              animate={{ height: ['40%', '18%', '18%', '40%'] }}
              transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.3, 0.7, 1] }}
            />
            <motion.div animate={{ opacity: [0, 0, 1, 1, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.28, 0.4, 0.75, 1] }}
            >{baseText}</motion.div>
          </div>
        );
      }

      case 'chromaSlice':
        return (
          <div className="relative">
            <motion.span className="font-black text-[11px] absolute text-red-400/80"
              animate={{ x: [-3, 3, -3], y: [1, -1, 1] }}
              transition={{ duration: 0.2, repeat: Infinity }}
            >{HEADLINE}</motion.span>
            <motion.span className="font-black text-[11px] absolute text-blue-400/80"
              animate={{ x: [3, -3, 3], y: [-1, 1, -1] }}
              transition={{ duration: 0.2, repeat: Infinity }}
            >{HEADLINE}</motion.span>
            <motion.span className="font-black text-[11px] absolute text-green-400/60"
              animate={{ y: [2, -2, 2] }}
              transition={{ duration: 0.3, repeat: Infinity }}
            >{HEADLINE}</motion.span>
            <span className="text-white font-black text-[11px] relative z-10">{HEADLINE}</span>
          </div>
        );

      case 'splitReveal': {
        const top = HEADLINE.slice(0, Math.ceil(HEADLINE.length / 2));
        const bot = HEADLINE.slice(Math.ceil(HEADLINE.length / 2));
        return (
          <div className="relative overflow-hidden h-8 flex items-center justify-center w-24">
            <motion.div className="absolute top-0 left-0 right-0 overflow-hidden flex items-end justify-center"
              style={{ height: '50%' }}
              animate={{ y: ['-100%', '0%', '0%', '-100%'] }}
              transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.2, 0.75, 1] }}
            >
              <span className="text-white font-black text-[11px] translate-y-full">{top}</span>
            </motion.div>
            <motion.div className="absolute bottom-0 left-0 right-0 overflow-hidden flex items-start justify-center"
              style={{ height: '50%' }}
              animate={{ y: ['100%', '0%', '0%', '100%'] }}
              transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.2, 0.75, 1] }}
            >
              <span className="text-white font-black text-[11px] -translate-y-full">{bot}</span>
            </motion.div>
          </div>
        );
      }

      case 'dataStream':
        return (
          <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
            {[0, 1, 2].map(i => (
              <motion.div key={i} className="absolute text-[7px] text-green-400/60 font-mono whitespace-nowrap"
                style={{ left: `${20 + i * 30}%` }}
                animate={{ y: ['60%', '-60%'] }}
                transition={{ duration: 1.5 + i * 0.4, repeat: Infinity, delay: i * 0.3 }}
              >01 10 11 00 10 01</motion.div>
            ))}
            <motion.div className="relative z-10"
              animate={{ opacity: [0, 1, 1, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.3, 0.7, 1] }}
            >{baseText}</motion.div>
          </div>
        );

      case 'statShot':
        return (
          <div className="flex flex-col items-center gap-0.5">
            <motion.span className="text-white font-black text-[20px] leading-none tabular-nums"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 0.06, repeat: Infinity }}
            >{count}%</motion.span>
            <span className="text-white/50 text-[7px] uppercase tracking-widest">metric</span>
          </div>
        );

      case 'typeBurn':
        return (
          <div className="flex items-center gap-[1px]">
            <span className="text-white font-black text-[11px]">{HEADLINE.slice(0, typeLen)}</span>
            <motion.span className="text-blue-400 font-bold text-[11px]"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.6, repeat: Infinity }}
            >|</motion.span>
          </div>
        );

      case 'wordBurst': {
        const words = HEADLINE.split(' ');
        return (
          <div className="flex gap-1.5 flex-wrap justify-center">
            {words.map((w, i) => (
              <motion.span key={i} className="text-white font-black text-[11px]"
                animate={{ scale: [0, 1.2, 1, 1, 0], opacity: [0, 1, 1, 1, 0] }}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.35, times: [0, 0.15, 0.3, 0.8, 1] }}
              >{w}</motion.span>
            ))}
          </div>
        );
      }

      default:
        return <motion.div animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: 2, repeat: Infinity }}>{baseText}</motion.div>;
    }
  };

  return (
    <div className={`w-full h-full bg-gradient-to-br ${grad} flex items-center justify-center relative overflow-hidden`}>
      {renderAnim()}
    </div>
  );
};

// ── Font config maps ─────────────────────────────────────────────────────────
const FONT_FAMILIES: { id: NonNullable<StudioScene['font_family']>; label: string; style: string }[] = [
  { id: 'inter',   label: 'Inter',    style: "'Inter', sans-serif" },
  { id: 'poppins', label: 'Poppins',  style: "'Poppins', sans-serif" },
  { id: 'serif',   label: 'Serif',    style: "Georgia, 'Times New Roman', serif" },
  { id: 'mono',    label: 'Mono',     style: "'Courier New', Courier, monospace" },
  { id: 'display', label: 'Impact',   style: "Impact, 'Arial Narrow', sans-serif" },
];

const FONT_SIZES: { id: NonNullable<StudioScene['font_size']>; label: string; className: string; px: number }[] = [
  { id: 'sm', label: 'S', className: 'text-lg',   px: 18 },
  { id: 'md', label: 'M', className: 'text-2xl',  px: 24 },
  { id: 'lg', label: 'L', className: 'text-3xl',  px: 30 },
  { id: 'xl', label: 'XL',className: 'text-4xl',  px: 36 },
];

const FONT_WEIGHTS: { id: NonNullable<StudioScene['font_weight']>; label: string; style: number }[] = [
  { id: 'semibold', label: 'Regular', style: 600 },
  { id: 'bold',     label: 'Bold',    style: 700 },
  { id: 'black',    label: 'Black',   style: 900 },
];

const FONT_COLORS: { hex: string; label: string }[] = [
  { hex: '#ffffff', label: 'White'  },
  { hex: '#facc15', label: 'Yellow' },
  { hex: '#22d3ee', label: 'Cyan'   },
  { hex: '#4ade80', label: 'Green'  },
  { hex: '#f87171', label: 'Red'    },
  { hex: '#fb923c', label: 'Orange' },
  { hex: '#e879f9', label: 'Pink'   },
  { hex: '#94a3b8', label: 'Silver' },
];

// ── TemplateGrid ─────────────────────────────────────────────────────────────
interface TemplateGridProps {
  scene: StudioScene | undefined;
  selectedIndex: number;
  updateScene: (i: number, u: Partial<StudioScene>) => void;
}
const TemplateGrid = ({ scene, selectedIndex, updateScene }: TemplateGridProps) => {
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  const TOOLTIP_W = 256;
  const TOOLTIP_H = 178;

  const tooltipStyle = useMemo(() => {
    let x = hoverPos.x + 18;
    let y = hoverPos.y - 80;
    // Clamp to viewport
    if (x + TOOLTIP_W > window.innerWidth - 12) x = hoverPos.x - TOOLTIP_W - 12;
    if (y < 8) y = 8;
    if (y + TOOLTIP_H > window.innerHeight - 8) y = window.innerHeight - TOOLTIP_H - 8;
    return { left: x, top: y };
  }, [hoverPos]);

  const ff = scene?.font_family ?? 'inter';
  const fs = scene?.font_size ?? 'md';
  const fw = scene?.font_weight ?? 'bold';

  return (
    <div className="p-4 space-y-5">
      {/* Template picker */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1">Choose Template</p>
        <p className="text-[9px] text-white/20 mb-2.5">Hover to preview animation · Click to apply</p>
        <div className="grid grid-cols-2 gap-2">
          {ALL_TEMPLATES.map(t => {
            const grad = TEMPLATE_GRADIENTS[t] ?? 'from-slate-900 to-slate-700';
            const isSelected = scene?.template === t;
            const meta = TEMPLATE_META[t];
            return (
              <button key={t} type="button"
                onClick={() => scene && updateScene(selectedIndex, { template: t })}
                onMouseEnter={e => { setHoveredTemplate(t); setHoverPos({ x: e.clientX, y: e.clientY }); }}
                onMouseMove={e => setHoverPos({ x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHoveredTemplate(null)}
                className={`rounded-xl overflow-hidden border-2 transition-all group ${
                  isSelected ? 'border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.25)]' : 'border-white/[0.06] hover:border-white/25'
                } cursor-pointer`}
              >
                {/* Mini static preview */}
                <div className={`w-full bg-gradient-to-br ${grad} flex flex-col items-center justify-center gap-0.5 px-2`} style={{ aspectRatio: '16/9' }}>
                  <span className="text-base leading-none">{meta?.icon ?? '▶'}</span>
                  <span className="text-[7px] font-semibold text-white/60 text-center leading-tight">{t.replace(/([A-Z])/g, ' $1').trim()}</span>
                </div>
                <div className={`py-1 px-1.5 ${isSelected ? 'bg-blue-500/10' : 'bg-white/[0.02]'}`}>
                  <span className={`text-[9px] ${isSelected ? 'text-blue-400' : 'text-white/30 group-hover:text-white/50'}`}>
                    {t.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>


      {/* Animated hover tooltip — rendered via portal to escape overflow/transform clipping */}
      {hoveredTemplate && createPortal(
        <div
          className="fixed z-[9999] rounded-2xl overflow-hidden shadow-2xl border border-white/[0.12] pointer-events-none bg-[#0d1117]"
          style={{ ...tooltipStyle, width: TOOLTIP_W }}
        >
          <div style={{ aspectRatio: '16/9', width: TOOLTIP_W, height: Math.round(TOOLTIP_W * 9 / 16) }}>
            <TemplateAnimPreview
              template={hoveredTemplate}
              grad={TEMPLATE_GRADIENTS[hoveredTemplate] ?? 'from-slate-900 to-slate-700'}
            />
          </div>
          <div className="px-3 py-2 border-t border-white/[0.08] bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <span className="text-sm leading-none">{TEMPLATE_META[hoveredTemplate]?.icon ?? '▶'}</span>
              <div>
                <p className="text-[10px] font-bold text-white/80">{hoveredTemplate.replace(/([A-Z])/g, ' $1').trim()}</p>
                <p className="text-[9px] text-white/30 mt-0.5">{TEMPLATE_META[hoveredTemplate]?.desc}</p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const SlidingPanel = ({
  activeTab, scenes, selectedIndex, onSelectScene, isGenerating, videoMode,
  updateScene, updateSceneMode, onRenderScene, onGeneratePrompt, generatingPrompt,
  dialogue, setDialogue, voiceId, setVoiceId, bgmId, setBgmId, showCaptions, setShowCaptions,
  voiceVolume, setVoiceVolume, bgmVolume, setBgmVolume,
  socialCaption, videoTitle,
  companyName, setCompanyName, senderMode, setSenderMode,
  targetDuration, setTargetDuration, setVideoMode,
  captionStyle, setCaptionStyle, captionFontSize, setCaptionFontSize,
}: SlidingPanelProps) => {
  const { playing, toggle, stop } = useAudioPreview();
  const scene = scenes[selectedIndex];

  // Company search state
  // FIX: cache companies so re-opening Settings doesn't re-fetch every time
  const [companies, setCompanies]       = useState<CompanyOption[]>([]);
  const [companiesLoaded, setCompaniesLoaded] = useState(false);
  const [cSearch, setCSearch]           = useState('');
  const [cDropOpen, setCDropOpen]       = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab !== 'settings' || companiesLoaded) return;
    const load = async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_BASE_URL}/companies`, { headers });
        const data = await res.json();
        if (data.companies) {
          setCompanies(data.companies);
          setCompaniesLoaded(true);
        }
      } catch { /* ignore */ }
    };
    void load();
  }, [activeTab, companiesLoaded]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setCDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredCompanies = companies.filter(c => !cSearch || c.name.toLowerCase().includes(cSearch.toLowerCase()));

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">{children}</p>
  );
  const inputCls  = 'w-full bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-blue-500/30 transition-all placeholder-white/15';
  const selectCls = 'w-full bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-blue-500/30 transition-all appearance-none cursor-pointer';

  const renderStateBadge = (s: StudioScene) => {
    const rs = s.render_state ?? 'idle';
    const mode = s.scene_mode ?? videoMode;
    if (mode === 'template') return <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400">TPL</span>;
    if (rs === 'rendered')  return <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">✓</span>;
    if (rs === 'rendering') return <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">⟳</span>;
    if (rs === 'error')     return <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400">!</span>;
    return <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400">AI</span>;
  };

  return (
    <AnimatePresence>
      {activeTab && (
        <motion.div
          key={activeTab}
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: PANEL_W, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="flex-shrink-0 sidebar-glass overflow-hidden flex flex-col"
          style={{ width: PANEL_W }}
        >
          {/* Panel header */}
          <div className="flex items-center px-4 py-3 border-b border-white/[0.06] flex-shrink-0 bg-white/[0.02]">
            <span className="text-xs font-bold text-white/50 uppercase tracking-wider">
              {activeTab === 'templates' && 'Design & Scenes'}
              {activeTab === 'text'      && 'Text & Captions'}
              {activeTab === 'audio'     && 'Audio'}
              {activeTab === 'effects'   && 'Effects'}
              {activeTab === 'library'   && 'Video Library'}
              {activeTab === 'settings'  && 'Settings'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* ── TEXT TAB ── */}
            {activeTab === 'text' && (
              <div className="p-4 space-y-5">

                {/* Scene text editing */}
                {scene ? (
                  <>
                    <div>
                      <SectionLabel>Scene {selectedIndex + 1} — Headline</SectionLabel>
                      <textarea
                        value={scene.headline || ''}
                        onChange={e => updateScene(selectedIndex, { headline: e.target.value })}
                        rows={2}
                        placeholder="Scene headline…"
                        className="w-full bg-white/[0.03] border border-white/[0.07] rounded-xl px-3 py-2.5 text-sm text-white/80 placeholder-white/20 resize-none focus:outline-none focus:border-blue-500/40 transition-all"
                      />
                    </div>
                    <div>
                      <SectionLabel>Subtext</SectionLabel>
                      <textarea
                        value={scene.subtext || ''}
                        onChange={e => updateScene(selectedIndex, { subtext: e.target.value })}
                        rows={2}
                        placeholder="Supporting line of text…"
                        className="w-full bg-white/[0.03] border border-white/[0.07] rounded-xl px-3 py-2.5 text-sm text-white/80 placeholder-white/20 resize-none focus:outline-none focus:border-blue-500/40 transition-all"
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-white/25 text-center py-4">Select a scene to edit text</p>
                )}

                {/* ── Typography ── */}
                {scene && (
                  <div className="space-y-3 border-t border-white/[0.05] pt-4">
                    <SectionLabel>Typography</SectionLabel>

                    {/* Font family */}
                    <div>
                      <p className="text-[9px] text-white/25 mb-1.5">Font Family</p>
                      <div className="grid grid-cols-5 gap-1">
                        {FONT_FAMILIES.map(f => (
                          <button key={f.id} type="button"
                            onClick={() => updateScene(selectedIndex, { font_family: f.id })}
                            className={`py-1.5 rounded-lg border text-[9px] transition-all ${
                              (scene.font_family ?? 'inter') === f.id
                                ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                                : 'border-white/[0.07] text-white/30 hover:border-white/20 hover:text-white/50'
                            }`}
                            style={{ fontFamily: f.style }}
                          >{f.label}</button>
                        ))}
                      </div>
                    </div>

                    {/* Size + Weight */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[9px] text-white/25 mb-1.5">Size</p>
                        <div className="flex gap-1">
                          {FONT_SIZES.map(s => (
                            <button key={s.id} type="button"
                              onClick={() => updateScene(selectedIndex, { font_size: s.id })}
                              className={`flex-1 py-1.5 rounded-lg border text-[9px] font-semibold transition-all ${
                                (scene.font_size ?? 'md') === s.id
                                  ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                                  : 'border-white/[0.07] text-white/30 hover:border-white/20'
                              }`}
                            >{s.label}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[9px] text-white/25 mb-1.5">Weight</p>
                        <div className="flex gap-1">
                          {FONT_WEIGHTS.map(w => (
                            <button key={w.id} type="button"
                              onClick={() => updateScene(selectedIndex, { font_weight: w.id })}
                              className={`flex-1 py-1.5 rounded-lg border text-[9px] transition-all ${
                                (scene.font_weight ?? 'bold') === w.id
                                  ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                                  : 'border-white/[0.07] text-white/30 hover:border-white/20'
                              }`}
                              style={{ fontWeight: w.style }}
                            >{w.label}</button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Text color */}
                    <div>
                      <p className="text-[9px] text-white/25 mb-1.5">Text Color</p>
                      <div className="flex gap-2 flex-wrap">
                        {FONT_COLORS.map(c => (
                          <button key={c.hex} type="button"
                            onClick={() => updateScene(selectedIndex, { font_color: c.hex })}
                            title={c.label}
                            className={`w-5 h-5 rounded-full transition-all ${
                              (scene.font_color ?? '#ffffff') === c.hex
                                ? 'ring-2 ring-white ring-offset-1 ring-offset-[#0a0f1a] scale-110'
                                : 'ring-1 ring-white/10 hover:scale-110'
                            }`}
                            style={{ backgroundColor: c.hex }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Live preview */}
                    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] flex items-center justify-center py-4 px-4 min-h-[60px]">
                      <span
                        className={`text-center leading-tight transition-all ${FONT_SIZES.find(s => s.id === (scene.font_size ?? 'md'))?.className ?? 'text-2xl'}`}
                        style={{
                          fontFamily: FONT_FAMILIES.find(f => f.id === (scene.font_family ?? 'inter'))?.style,
                          fontWeight: FONT_WEIGHTS.find(w => w.id === (scene.font_weight ?? 'bold'))?.style,
                          color: scene.font_color ?? '#ffffff',
                        }}
                      >
                        {scene.headline || 'Your Headline'}
                      </span>
                    </div>
                  </div>
                )}

                {/* ── Captions ── */}
                <div className="border-t border-white/[0.05] pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <SectionLabel>Captions</SectionLabel>
                    {/* Toggle */}
                    <button type="button" onClick={() => setShowCaptions(!showCaptions)}
                      className={`relative rounded-full transition-colors flex-shrink-0 ${showCaptions ? 'bg-blue-500/70' : 'bg-white/10'}`}
                      style={{ width: 34, height: 20 }}
                    >
                      <div className={`absolute top-[3px] w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${showCaptions ? 'translate-x-[16px]' : 'translate-x-[3px]'}`} />
                    </button>
                  </div>

                  {showCaptions && (
                    <>
                      {/* Caption style */}
                      <div>
                        <p className="text-[9px] text-white/25 mb-1.5">Style</p>
                        <div className="grid grid-cols-4 gap-1.5">
                          {([
                            { id: 'pill'      as const, label: 'Pill',      preview: 'bg-black/70 rounded-xl px-2 py-0.5' },
                            { id: 'bar'       as const, label: 'Bar',       preview: 'bg-black/80 w-full py-0.5' },
                            { id: 'outline'   as const, label: 'Outline',   preview: 'border border-white/40 rounded px-2 py-0.5' },
                            { id: 'highlight' as const, label: 'Highlight', preview: 'bg-blue-600/80 rounded px-2 py-0.5' },
                          ]).map(s => (
                            <button key={s.id} type="button"
                              onClick={() => setCaptionStyle(s.id)}
                              className={`rounded-xl border py-2.5 px-1 flex flex-col items-center gap-1.5 transition-all ${
                                captionStyle === s.id
                                  ? 'border-blue-500/40 bg-blue-500/10'
                                  : 'border-white/[0.07] hover:border-white/20'
                              }`}
                            >
                              <div className={`flex items-center justify-center h-4 ${s.preview}`}>
                                <span className="text-[6px] text-white font-semibold">Aa</span>
                              </div>
                              <span className={`text-[8px] font-medium ${captionStyle === s.id ? 'text-blue-400' : 'text-white/30'}`}>{s.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Caption font size */}
                      <div>
                        <p className="text-[9px] text-white/25 mb-1.5">Caption Size</p>
                        <div className="flex gap-1.5">
                          {([
                            { id: 'sm' as const, label: 'S', cls: 'text-xs' },
                            { id: 'md' as const, label: 'M', cls: 'text-sm' },
                            { id: 'lg' as const, label: 'L', cls: 'text-base' },
                          ]).map(s => (
                            <button key={s.id} type="button"
                              onClick={() => setCaptionFontSize(s.id)}
                              className={`flex-1 py-2 rounded-xl border transition-all ${
                                captionFontSize === s.id
                                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
                                  : 'border-white/[0.07] text-white/30 hover:border-white/20'
                              }`}
                            >
                              <span className={`font-semibold ${s.cls}`}>{s.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Live caption preview */}
                      <div className="rounded-xl border border-white/[0.05] bg-[#0a0f1a] flex items-end justify-center overflow-hidden" style={{ height: 60 }}>
                        <div className={`mb-2 ${captionStyle === 'bar' ? 'w-full px-3 py-1.5 bg-black/80' : captionStyle === 'pill' ? 'px-3 py-1 rounded-xl bg-black/70 backdrop-blur-sm' : captionStyle === 'outline' ? 'px-3 py-1 rounded border border-white/40' : 'px-3 py-1 rounded bg-blue-600/80'}`}>
                          <p className={`text-white font-medium text-center leading-snug ${captionFontSize === 'sm' ? 'text-xs' : captionFontSize === 'lg' ? 'text-base' : 'text-sm'}`}>
                            Sample caption text here
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>

              </div>
            )}

            {/* ── TEMPLATES TAB ── */}
            {activeTab === 'templates' && (
              <div>
                {/* Scene pages strip */}
                <div className="p-4 border-b border-white/[0.05]">
                  <SectionLabel>Pages ({scenes.length})</SectionLabel>
                  {isGenerating && (
                    <div className="flex gap-2">
                      {[0,1,2].map(k => (
                        <div key={k} className="animate-pulse rounded-lg bg-white/[0.04] flex-1" style={{ aspectRatio: '16/9' }} />
                      ))}
                    </div>
                  )}
                  {!isGenerating && scenes.length === 0 && (
                    <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-4 text-center">
                      <Film className="h-6 w-6 text-white/10 mx-auto mb-2" />
                      <p className="text-xs text-white/20">Generate a video to see scenes</p>
                    </div>
                  )}
                  {!isGenerating && scenes.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {scenes.map((s, i) => {
                        const grad = s.template ? (TEMPLATE_GRADIENTS[s.template] ?? 'from-slate-900 to-slate-700') : 'from-slate-900 to-slate-700';
                        const isActive = selectedIndex === i;
                        const k = `pg-${s.segment_index ?? i}-${s.template ?? 'ai'}`;
                        return (
                          <div key={k} className="flex-shrink-0 flex flex-col items-center gap-1">
                            <button type="button" onClick={() => onSelectScene(i)}
                              className={`rounded-lg overflow-hidden border-2 transition-all ${
                                isActive ? 'border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'border-white/[0.07] hover:border-white/20'
                              }`} style={{ width: 60 }}
                            >
                              <div className={`w-full bg-gradient-to-br ${grad} flex items-center justify-center`} style={{ aspectRatio: '16/9' }}>
                                {s.render_state === 'rendered' && s.rendered_url
                                  ? <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                  : <span className="text-[7px] font-bold text-white/50">{i + 1}</span>}
                              </div>
                            </button>
                            {renderStateBadge(s)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Per-scene background source selector */}
                {scene && (
                  <div className="p-4 border-b border-white/[0.05]">
                    <SectionLabel>Scene {selectedIndex + 1} — Background</SectionLabel>
                    <p className="text-[9px] text-white/20 mb-2 leading-relaxed">Template overlay always shown. Choose what's behind it.</p>
                    <div className="space-y-1">
                      {BG_OPTIONS.map(m => {
                        const sceneMode = scene.scene_mode ?? videoMode;
                        const isActive = sceneMode === m.id || (m.id === 'none' && (sceneMode === 'template' || !sceneMode));
                        return (
                          <button key={m.id} type="button" onClick={() => updateSceneMode(selectedIndex, m.id)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all text-left ${
                              isActive ? m.bgColor : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[10px]">{m.icon}</span>
                              <span className={`text-xs font-semibold ${isActive ? m.color : 'text-white/50'}`}>{m.label}</span>
                            </div>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isActive ? `${m.bgColor} ${m.color}` : 'bg-white/[0.04] text-white/25'}`}>{m.tag}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Render background button — only for AI backgrounds */}
                    {scene && isAiBackground(scene.scene_mode ?? videoMode) && (
                      <button type="button" onClick={() => onRenderScene(selectedIndex)}
                        disabled={scene.render_state === 'rendering'}
                        className={`mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-semibold transition-all disabled:opacity-50 ${
                          (scene.scene_mode ?? videoMode) === 'dalle'
                            ? 'border-sky-500/25 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20'
                            : 'border-purple-500/25 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'
                        }`}
                      >
                        {scene.render_state === 'rendering'
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating…</>
                          : scene.render_state === 'rendered'
                          ? <><RefreshCw className="h-3.5 w-3.5" />Regenerate Background</>
                          : (scene.scene_mode ?? videoMode) === 'dalle'
                          ? <><Image className="h-3.5 w-3.5" />Generate Image</>
                          : <><Wand2 className="h-3.5 w-3.5" />Generate Video Background</>}
                      </button>
                    )}
                    {scene.render_state === 'error' && (
                      <p className="text-[10px] text-red-400/70 mt-1.5 px-1">{scene.render_error}</p>
                    )}
                  </div>
                )}

                {/* Scene text content editor */}
                {scene && (
                  <div className="p-4 border-b border-white/[0.05] space-y-3">
                    <SectionLabel>Edit Scene {selectedIndex + 1} Text</SectionLabel>
                    <div>
                      <p className="text-[10px] text-white/30 mb-1">Headline</p>
                      <input type="text" value={scene.headline || ''} onChange={e => updateScene(selectedIndex, { headline: e.target.value })} placeholder="Scene headline…" className={inputCls} />
                    </div>
                    <div>
                      <p className="text-[10px] text-white/30 mb-1">Subtext</p>
                      <input type="text" value={scene.subtext || ''} onChange={e => updateScene(selectedIndex, { subtext: e.target.value })} placeholder="Supporting text…" className={inputCls} />
                    </div>
                    {scene && isAiBackground(scene.scene_mode ?? videoMode) && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] text-white/30">Background Prompt</p>
                          <button type="button" onClick={() => onGeneratePrompt(selectedIndex)}
                            disabled={generatingPrompt}
                            className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-lg border border-purple-500/25 bg-purple-500/[0.08] text-purple-400 hover:bg-purple-500/20 transition-all disabled:opacity-50"
                          >
                            {generatingPrompt
                              ? <><Loader2 className="h-2.5 w-2.5 animate-spin" />Writing…</>
                              : <><Sparkles className="h-2.5 w-2.5" />Auto-write</>}
                          </button>
                        </div>
                        <textarea value={scene.video_prompt || ''} onChange={e => updateScene(selectedIndex, { video_prompt: e.target.value })} rows={3}
                          placeholder="Click Auto-write to generate, or describe the background…"
                          className="w-full bg-white/[0.04] border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white/70 font-mono resize-none focus:outline-none focus:border-purple-500/40 transition-all placeholder-white/15" />
                      </div>
                    )}
                  </div>
                )}

                {/* Template grid */}
                <TemplateGrid scene={scene} selectedIndex={selectedIndex} updateScene={updateScene} />
              </div>
            )}

            {/* ── AUDIO TAB ── */}
            {activeTab === 'audio' && (
              <div className="p-4 space-y-5">
                <div>
                  <SectionLabel>Script / Voiceover</SectionLabel>
                  <textarea value={dialogue} onChange={e => setDialogue(e.target.value)} rows={5}
                    placeholder="Script will appear here after generating…"
                    className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2.5 text-xs text-white/70 font-mono leading-relaxed resize-none focus:outline-none focus:border-blue-500/30 transition-all placeholder-white/15" />
                </div>
                <div>
                  <SectionLabel>Voice</SectionLabel>
                  <div className="grid grid-cols-2 gap-1.5">
                    {VOICE_OPTIONS.map(v => {
                      const active = v.id === voiceId;
                      const isPlaying = playing === `v-${v.id}`;
                      return (
                        <button key={v.id || '_auto'} type="button" onClick={() => setVoiceId(v.id)}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            active ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <div className="min-w-0 flex-1">
                              <p className={`text-[10px] font-semibold truncate ${active ? 'text-white' : 'text-white/60'}`}>{v.label}</p>
                              {v.accent && <p className={`text-[9px] ${active ? 'text-blue-400/70' : 'text-white/20'}`}>{v.accent}</p>}
                            </div>
                            {v.preview && (
                              <button type="button" onClick={e => { e.stopPropagation(); toggle(`v-${v.id}`, v.preview); }}
                                className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                                  isPlaying ? 'bg-blue-500 text-white' : 'bg-white/[0.06] text-white/30 hover:bg-blue-500/20'
                                }`}
                              >
                                {isPlaying ? <Pause className="h-2 w-2" /> : <Volume2 className="h-2 w-2" />}
                              </button>
                            )}
                          </div>
                          {active && <div className="mt-1.5 w-1 h-1 rounded-full bg-blue-500" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Voice volume */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <SectionLabel>Voice Volume</SectionLabel>
                    <span className="text-[10px] text-white/35 tabular-nums -mt-1">{Math.round(voiceVolume * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-3 w-3 text-white/20 flex-shrink-0" />
                    <input type="range" min="0" max="1" step="0.05" value={voiceVolume}
                      onChange={e => setVoiceVolume(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 rounded-full appearance-none bg-white/[0.08] accent-blue-500 cursor-pointer"
                    />
                    <Volume2 className="h-4 w-4 text-blue-400/50 flex-shrink-0" />
                  </div>
                </div>

                <div>
                  <SectionLabel>Background Music</SectionLabel>
                  <div className="relative mb-2">
                    <select value={bgmId} onChange={e => { setBgmId(e.target.value as BgmId); stop(); }} className={selectCls}>
                      {BGM_TRACKS.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-white/25 pointer-events-none" />
                  </div>
                  {(() => {
                    const sel = BGM_TRACKS.find(t => t.id === bgmId);
                    return sel?.url ? (
                      <button type="button" onClick={() => toggle(bgmId, sel.url)}
                        className="flex items-center gap-1.5 text-[10px] text-white/30 hover:text-blue-400 transition-colors"
                      >
                        {playing === bgmId ? <><Pause className="h-2.5 w-2.5" />Stop preview</> : <><Play className="h-2.5 w-2.5" />Preview track</>}
                      </button>
                    ) : null;
                  })()}
                  {/* BGM volume */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] text-white/30">BGM Volume</p>
                      <span className="text-[10px] text-white/35 tabular-nums">{Math.round(bgmVolume * 100)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Music2 className="h-3 w-3 text-white/20 flex-shrink-0" />
                      <input type="range" min="0" max="1" step="0.05" value={bgmVolume}
                        onChange={e => setBgmVolume(parseFloat(e.target.value))}
                        className="flex-1 h-1.5 rounded-full appearance-none bg-white/[0.08] accent-blue-500 cursor-pointer"
                      />
                      <Music2 className="h-4 w-4 text-blue-400/50 flex-shrink-0" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-white/15">
                  <Music2 className="h-3 w-3" />
                  <span>Audio applied globally to all scenes</span>
                </div>
              </div>
            )}


            {/* ── SETTINGS TAB ── */}
            {activeTab === 'effects' && (
              <div className="p-4 space-y-5">
                {!scene ? (
                  <p className="text-xs text-white/25 text-center py-8">Generate a video first to edit effects.</p>
                ) : (
                  <>
                    {/* Background Opacity */}
                    <div>
                      <SectionLabel>Background Opacity</SectionLabel>
                      <p className="text-[10px] text-white/30 mb-3 leading-relaxed">Controls how strongly the AI background (image or video) shows through. Lower = more transparent.</p>
                      <div className="flex items-center gap-3">
                        <input type="range" min={0.1} max={1} step={0.05}
                          value={scene.background_opacity ?? 0.85}
                          onChange={e => updateScene(selectedIndex, { background_opacity: parseFloat(e.target.value) })}
                          className="flex-1 accent-blue-500 cursor-pointer"
                        />
                        <span className="text-xs font-mono text-white/60 w-8 text-right">
                          {Math.round((scene.background_opacity ?? 0.85) * 100)}%
                        </span>
                      </div>
                      <button type="button"
                        onClick={() => scenes.forEach((_, i) => updateScene(i, { background_opacity: scene.background_opacity ?? 0.85 }))}
                        className="mt-2 text-[10px] text-blue-400/60 hover:text-blue-400 transition-colors"
                      >Apply to all scenes</button>
                    </div>

                    {/* Particle Effects */}
                    <div>
                      <SectionLabel>Particle Intensity</SectionLabel>
                      <p className="text-[10px] text-white/30 mb-3 leading-relaxed">Glowing particle field overlaid on the scene. Set to 0 to disable completely.</p>
                      <div className="flex items-center gap-3">
                        <input type="range" min={0} max={1} step={0.1}
                          value={scene.particle_intensity ?? 1}
                          onChange={e => updateScene(selectedIndex, { particle_intensity: parseFloat(e.target.value) })}
                          className="flex-1 accent-purple-500 cursor-pointer"
                        />
                        <span className="text-xs font-mono text-white/60 w-8 text-right">
                          {Math.round((scene.particle_intensity ?? 1) * 100)}%
                        </span>
                      </div>
                      <button type="button"
                        onClick={() => scenes.forEach((_, i) => updateScene(i, { particle_intensity: scene.particle_intensity ?? 1 }))}
                        className="mt-2 text-[10px] text-blue-400/60 hover:text-blue-400 transition-colors"
                      >Apply to all scenes</button>
                    </div>

                    {/* Pulse Rings */}
                    <div>
                      <SectionLabel>Pulse Rings</SectionLabel>
                      <p className="text-[10px] text-white/30 mb-3 leading-relaxed">Subtle pulsing rings behind the content. Adds depth to gradient-only scenes.</p>
                      <button type="button"
                        onClick={() => updateScene(selectedIndex, { pulse_rings: !(scene.pulse_rings ?? true) })}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all ${
                          (scene.pulse_rings ?? true)
                            ? 'border-blue-500/40 bg-blue-500/10'
                            : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15'
                        }`}
                      >
                        <span className={`text-xs font-semibold ${(scene.pulse_rings ?? true) ? 'text-blue-400' : 'text-white/40'}`}>
                          {(scene.pulse_rings ?? true) ? 'On' : 'Off'}
                        </span>
                        <div className={`relative rounded-full transition-colors flex-shrink-0 ${(scene.pulse_rings ?? true) ? 'bg-blue-500/70' : 'bg-white/10'}`} style={{ width: 32, height: 18 }}>
                          <div className={`absolute top-[2px] w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${(scene.pulse_rings ?? true) ? 'translate-x-[15px]' : 'translate-x-[2px]'}`} />
                        </div>
                      </button>
                    </div>

                    {/* Template Blend Mode */}
                    <div>
                      <SectionLabel>Template Blend</SectionLabel>
                      <p className="text-[10px] text-white/30 mb-3 leading-relaxed">
                        <b className="text-white/50">Neon Screen</b> — template's dark background drops away, neon elements glow over the video.<br />
                        <b className="text-white/50">Solid</b> — template renders as-is on top of background.
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(['screen', 'normal'] as const).map(mode => {
                          const active = (scene.template_blend ?? (scene.scene_mode && scene.scene_mode !== 'none' && scene.scene_mode !== 'template' ? 'screen' : 'normal')) === mode;
                          return (
                            <button key={mode} type="button"
                              onClick={() => updateScene(selectedIndex, { template_blend: mode })}
                              className={`flex flex-col items-center py-2.5 px-2 rounded-xl border transition-all text-center ${
                                active ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15'
                              }`}
                            >
                              <span className={`text-xs font-bold ${active ? 'text-blue-400' : 'text-white/40'}`}>
                                {mode === 'screen' ? 'Neon Screen' : 'Solid'}
                              </span>
                              <span className="text-[9px] text-white/25 mt-0.5">
                                {mode === 'screen' ? 'Glow blend' : 'Opaque'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Transition Out */}
                    <div>
                      <SectionLabel>Scene Transition</SectionLabel>
                      <p className="text-[10px] text-white/30 mb-3 leading-relaxed">How this scene exits into the next.</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {([
                          { id: 'cross_fade', label: 'Cross Fade',  hint: 'Smooth blend' },
                          { id: 'flash',      label: 'Flash',       hint: 'White flash'  },
                          { id: 'zoom_out',   label: 'Zoom Out',    hint: 'Scale exit'   },
                          { id: 'none',       label: 'Cut',         hint: 'Hard cut'     },
                        ] as const).map(t => {
                          const active = (scene.transition_out ?? 'cross_fade') === t.id;
                          return (
                            <button key={t.id} type="button"
                              onClick={() => updateScene(selectedIndex, { transition_out: t.id })}
                              className={`flex flex-col items-center py-2.5 px-2 rounded-xl border transition-all text-center ${
                                active ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15'
                              }`}
                            >
                              <span className={`text-xs font-bold ${active ? 'text-blue-400' : 'text-white/40'}`}>{t.label}</span>
                              <span className="text-[9px] text-white/25 mt-0.5">{t.hint}</span>
                            </button>
                          );
                        })}
                      </div>
                      <button type="button"
                        onClick={() => scenes.forEach((_, i) => updateScene(i, { transition_out: scene.transition_out ?? 'cross_fade' }))}
                        className="mt-2 text-[10px] text-blue-400/60 hover:text-blue-400 transition-colors"
                      >Apply to all scenes</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="p-4 space-y-5">
                {/* Company */}
                <div>
                  <SectionLabel>Target Company</SectionLabel>
                  <div className="relative" ref={dropRef}>
                    <button type="button" onClick={() => setCDropOpen(o => !o)}
                      className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] hover:border-white/15 hover:bg-white/[0.06] transition-all text-left"
                    >
                      <Building2 className="h-3.5 w-3.5 text-white/30 flex-shrink-0" />
                      <span className={`flex-1 text-xs truncate ${companyName ? 'text-white/80' : 'text-white/25'}`}>
                        {companyName || 'Select company…'}
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 text-white/25 flex-shrink-0 transition-transform ${cDropOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                      {cDropOpen && (
                        <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.12 }}
                          className="absolute z-50 top-full mt-1.5 left-0 right-0 rounded-xl border border-glass-border bg-dark-bg-light/60 backdrop-blur-2xl shadow-glass overflow-hidden"
                        >
                          <div className="p-2 border-b border-white/[0.06] flex items-center gap-2">
                            <Search className="h-3.5 w-3.5 text-white/25 flex-shrink-0" />
                            <input autoFocus value={cSearch} onChange={e => setCSearch(e.target.value)} placeholder="Search companies…"
                              className="flex-1 bg-transparent text-xs text-white/80 focus:outline-none placeholder-white/25" />
                          </div>
                          <button type="button" onClick={() => { setCompanyName(''); setCDropOpen(false); setCSearch(''); }}
                            className="w-full px-3.5 py-2 text-left text-xs text-white/25 hover:bg-white/[0.04] hover:text-white/50 transition-colors"
                          >— None</button>
                          <div className="max-h-44 overflow-y-auto">
                            {filteredCompanies.length === 0
                              ? <p className="px-3.5 py-4 text-xs text-white/20 text-center">No companies found</p>
                              : filteredCompanies.map(c => (
                                <button key={c.name} type="button" onClick={() => { setCompanyName(c.name); setCSearch(''); setCDropOpen(false); }}
                                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left hover:bg-white/[0.05] transition-colors ${companyName === c.name ? 'bg-blue-500/[0.07]' : ''}`}
                                >
                                  {c.logo_url
                                    ? <img src={c.logo_url} alt="" className="w-4 h-4 rounded object-contain bg-white/5 flex-shrink-0" />
                                    : <div className="w-4 h-4 rounded bg-white/[0.06] flex items-center justify-center flex-shrink-0"><Building2 className="h-2.5 w-2.5 text-white/20" /></div>}
                                  <span className="text-xs text-white/70 truncate flex-1">{c.name}</span>
                                  {companyName === c.name && <CheckCircle2 className="h-3 w-3 text-blue-400 flex-shrink-0" />}
                                </button>
                              ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Global Video Mode */}
                <div>
                  <SectionLabel>Default Video Mode</SectionLabel>
                  <div className="space-y-1.5">
                    {MODE_OPTIONS.map(m => {
                      const isActive = videoMode === m.id;
                      return (
                        <button key={m.id} type="button" onClick={() => setVideoMode(m.id as VideoStudioMode)}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all text-left ${
                            isActive ? m.bgColor : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            {isActive ? <div className="w-2 h-2 rounded-full bg-current flex-shrink-0" /> : <div className="w-2 h-2 rounded-full border border-white/20 flex-shrink-0" />}
                            <span className={`text-xs font-semibold ${isActive ? m.color : 'text-white/55'}`}>{m.label}</span>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${isActive ? `${m.bgColor} ${m.color}` : 'bg-white/[0.04] text-white/25'}`}>{m.tag}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Duration */}
                <div>
                  <SectionLabel>Video Length</SectionLabel>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['short', 'medium', 'long'] as const).map(d => (
                      <button key={d} type="button" onClick={() => setTargetDuration(d)}
                        className={`flex flex-col items-center py-2.5 rounded-xl border text-center transition-all ${
                          targetDuration === d ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15'
                        }`}
                      >
                        <span className={`text-xs font-bold ${targetDuration === d ? 'text-blue-400' : 'text-white/50'}`}>{DURATION_INFO[d].label}</span>
                        <span className="text-[9px] text-white/25 mt-0.5">{DURATION_INFO[d].hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sender Mode */}
                <div>
                  <SectionLabel>Sender Mode</SectionLabel>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([{ id: 'personal' as const, Icon: User, label: 'Personal' }, { id: 'company' as const, Icon: Building2, label: 'Company' }]).map(({ id, Icon, label }) => (
                      <button key={id} type="button" onClick={() => setSenderMode(id)}
                        className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border transition-all ${
                          senderMode === id ? 'border-blue-500/40 bg-blue-500/10 text-blue-400' : 'border-white/[0.07] bg-white/[0.02] text-white/40 hover:border-white/15'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="text-xs font-medium">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FULL RESULT VIEW
// ─────────────────────────────────────────────────────────────────────────────
interface FullResultViewProps {
  videoUrl: string; videoTitle: string; socialCaption: string;
  onExit: () => void;
}
const FullResultView = ({ videoUrl, videoTitle, socialCaption, onExit }: FullResultViewProps) => {
  const filename = `${(videoTitle || 'video').replaceAll(/\s+/g, '_')}_video.mp4`;
  const downloadUrl = getProxyDownloadUrl(videoUrl, filename);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="flex-1 bg-dark-bg-light/10 flex overflow-hidden"
    >
      {/* Video player — main area */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="w-full max-w-3xl space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white leading-none">{videoTitle || 'Video Ready'}</p>
                <p className="text-[10px] text-emerald-400/60 mt-0.5">Rendered successfully</p>
              </div>
            </div>
            <button type="button" onClick={onExit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/[0.07] bg-white/[0.03] text-xs text-white/40 hover:text-white/70 hover:bg-white/[0.07] transition-all"
            >
              <RotateCcw className="h-3 w-3" /> Back to editing
            </button>
          </div>
          <div className="relative w-full rounded-2xl overflow-hidden bg-black ring-1 ring-white/[0.08] shadow-[0_40px_100px_rgba(0,0,0,0.7)]"
            style={{ paddingTop: '56.25%' }}
          >
            <video
              controls
              className="absolute inset-0 w-full h-full object-contain bg-black"
              style={{ borderRadius: '1rem' }}
            >
              <source src={videoUrl} type="video/mp4" />
            </video>
          </div>
        </motion.div>
      </div>

      {/* Right sidebar — publish & download */}
      <div className="w-56 flex-shrink-0 sidebar-glass border-l border-white/[0.06] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
          <p className="text-xs font-bold text-white/50 uppercase tracking-wider">Publish & Export</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <a href={downloadUrl} download={filename}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-emerald-500/25 bg-emerald-500/8 text-emerald-400 hover:bg-emerald-500/15 text-xs font-semibold transition-all"
          >
            <div className="flex items-center gap-2.5"><Download className="h-4 w-4 flex-shrink-0" /><span>Download MP4</span></div>
          </a>
          <div className="pt-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">Post to</p>
            <div className="space-y-1.5">
              <PublishActions videoUrl={videoUrl} videoTitle={videoTitle} socialCaption={socialCaption} layout="panel" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SCENE CANVAS PANEL
// ─────────────────────────────────────────────────────────────────────────────
interface SceneCanvasPanelProps {
  scenes: StudioScene[]; selectedIndex: number;
  isGenerating: boolean; generatingStatus: string;
  videoMode: VideoStudioMode;
  updateScene: (i: number, u: Partial<StudioScene>) => void;
  updateSceneMode: (i: number, mode: VideoStudioMode | 'template') => void;
  onRenderScene: (i: number) => void;
  currentSubtitle: string; showCaptions: boolean;
  captionStyle: 'pill' | 'bar' | 'outline' | 'highlight';
  captionFontSize: 'sm' | 'md' | 'lg';
  onOpenConfig: () => void;
}

const SceneCanvasPanel = ({
  scenes, selectedIndex, isGenerating, generatingStatus, videoMode,
  updateScene, updateSceneMode, onRenderScene,
  currentSubtitle, showCaptions, captionStyle, captionFontSize, onOpenConfig,
}: SceneCanvasPanelProps) => {
  const scene = scenes[selectedIndex];
  const sceneMode = (scene?.scene_mode ?? videoMode) as VideoStudioMode;
  const aiBg = isAiBackground(sceneMode);
  const videoBg = isVideoBackground(sceneMode);
  const [editingHeadline, setEditingHeadline] = useState(false);
  const headlineRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editingHeadline) headlineRef.current?.focus(); }, [editingHeadline]);

  if (isGenerating) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-dark-bg-light/10">
      <div className="relative">
        <div className="w-20 h-20 rounded-2xl bg-blue-500/[0.08] border border-blue-500/20 flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
        </div>
        <motion.div className="absolute inset-0 rounded-2xl border-2 border-blue-500/15"
          animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
      </div>
      <div className="text-center space-y-1.5">
        <p className="text-sm font-semibold text-white">{generatingStatus || 'Generating…'}</p>
        <p className="text-xs text-white/30">Writing script · Voiceover · Planning scenes</p>
      </div>
    </div>
  );

  if (!scene) return (
    <div className="flex-1 flex items-center justify-center bg-dark-bg-light/10 relative">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-center space-y-5 max-w-sm"
      >
        <div className="w-20 h-20 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto">
          <Film className="h-9 w-9 text-white/10" />
        </div>

        <div className="space-y-2">
          <p className="text-lg font-semibold text-white/70">Start your next video</p>
          <p className="text-xs text-white/25">Create AI-powered videos in seconds</p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onOpenConfig}
            className="px-4 py-2.5 rounded-xl bg-gradient-teal-blue text-white text-sm font-semibold hover:opacity-90 transition-all"
          >
            ✨ Generate New Video
          </button>

          <button
            type="button"
            className="px-4 py-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] text-white/50 text-sm hover:bg-white/[0.05] transition-all"
          >
            📁 Edit from Library
          </button>
        </div>
      </motion.div>

    </div>
  );

  const grad = scene.template ? (TEMPLATE_GRADIENTS[scene.template] ?? 'from-slate-900 to-slate-700') : 'from-slate-900 to-slate-700';
  const rs = scene.render_state ?? 'idle';
  const hasRenderedBg = rs === 'rendered' && !!scene.rendered_url;

  return (
    <div className="flex-1 bg-dark-bg-light/10 flex flex-col overflow-hidden">

      {/* ── ABOVE VIDEO: Controls bar ── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-dark-bg-light/40 border-b border-white/[0.05]">
        <BackgroundDropdown scene={scene} index={selectedIndex} videoMode={videoMode} onUpdateMode={updateSceneMode} />
        <div className="flex-1" />
        {aiBg && hasRenderedBg && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-300 backdrop-blur-sm">
              {sceneMode === 'dalle' ? '🎨 Image' : '✓ Video BG'}
            </span>
            <button type="button" onClick={() => onRenderScene(selectedIndex)}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50 hover:bg-white/20 backdrop-blur-sm transition-all"
            >
              <RefreshCw className="h-2.5 w-2.5" /> Redo
            </button>
          </div>
        )}
      </div>

      {/* ── VIDEO: fills all remaining space ── */}
      <div className="flex-1 flex items-center justify-center p-2 overflow-hidden min-h-0">
        <AnimatePresence mode="wait">
          <motion.div key={`${selectedIndex}-${rs}`}
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="relative rounded-2xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.07]"
            style={{ aspectRatio: '16/9', width: '100%', maxHeight: '100%' }}
          >
            {/* ── BACKGROUND LAYER ── */}
            {aiBg && videoBg && hasRenderedBg && (
              <video src={scene.rendered_url} autoPlay loop muted playsInline preload="metadata"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ opacity: scene.background_opacity ?? 1 }}
              />
            )}
            {aiBg && !videoBg && hasRenderedBg && (
              <img src={scene.rendered_url} alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ opacity: scene.background_opacity ?? 0.85 }}
              />
            )}
            {aiBg && rs === 'rendering' && (
              <div className="absolute inset-0 bg-dark-bg-light/30">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-dark-bg-light/40 to-violet-900/20 animate-pulse" />
              </div>
            )}
            {(!aiBg || (aiBg && !hasRenderedBg && rs !== 'rendering')) && (
              <div className={`absolute inset-0 bg-gradient-to-br ${grad}`} />
            )}

            {/* ── TEMPLATE OVERLAY ── */}
            {(() => {
              const fontFamilyStyle = FONT_FAMILIES.find(f => f.id === (scene.font_family ?? 'inter'))?.style ?? "'Inter', sans-serif";
              const fontSizeCls     = FONT_SIZES.find(s => s.id === (scene.font_size ?? 'md'))?.className ?? 'text-2xl';
              const fontWeightVal   = FONT_WEIGHTS.find(w => w.id === (scene.font_weight ?? 'bold'))?.style ?? 700;
              return (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-10 gap-3 z-10">
                  {editingHeadline ? (
                    <input ref={headlineRef} type="text" value={scene.headline || ''}
                      onChange={e => updateScene(selectedIndex, { headline: e.target.value })}
                      onBlur={() => setEditingHeadline(false)}
                      onKeyDown={e => { if (e.key === 'Enter') setEditingHeadline(false); }}
                      className={`${fontSizeCls} text-white text-center bg-black/20 border-b-2 border-white/50 outline-none w-full py-1 placeholder-white/30`}
                      style={{ fontFamily: fontFamilyStyle, fontWeight: fontWeightVal }}
                      placeholder="Scene headline…" />
                  ) : (
                    <button type="button" onClick={() => setEditingHeadline(true)} className="group cursor-text w-full">
                      <h2 className={`${fontSizeCls} text-center leading-tight drop-shadow-lg group-hover:opacity-80 transition-opacity`}
                        style={{ fontFamily: fontFamilyStyle, fontWeight: fontWeightVal, color: scene.font_color ?? '#ffffff' }}
                      >
                        {scene.headline || <span className="text-white/25 italic text-xl font-normal" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Click to add headline…</span>}
                      </h2>
                      <div className="mt-2 h-px bg-white/0 group-hover:bg-white/25 transition-all mx-auto w-20" />
                    </button>
                  )}
                  {scene.subtext && (
                    <p className="text-sm text-white/65 text-center leading-relaxed max-w-xs drop-shadow-md"
                      style={{ fontFamily: fontFamilyStyle }}
                    >{scene.subtext}</p>
                  )}
                </div>
              );
            })()}

            {/* ── AI BACKGROUND: rendering overlay ── */}
            {aiBg && rs === 'rendering' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-20 bg-black/30 backdrop-blur-[1px]">
                <div className="relative">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/[0.15] border border-purple-500/30 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 text-purple-400 animate-spin" />
                  </div>
                  <motion.div className="absolute inset-0 rounded-xl border-2 border-purple-500/20"
                    animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
                </div>
                <p className="text-xs font-semibold text-white/70 bg-black/50 px-3 py-1 rounded-full">
                  {sceneMode === 'dalle' ? 'Generating image…' : 'Generating video background…'}
                </p>
              </div>
            )}

            {/* ── CAPTIONS OVERLAY ── */}
            {showCaptions && currentSubtitle && (
              <div className={`absolute z-20 pointer-events-none ${
                captionStyle === 'bar' ? 'bottom-0 left-0 right-0' : 'bottom-4 left-0 right-0 flex justify-center'
              }`}>
                <div className={
                  captionStyle === 'pill'      ? 'bg-black/70 backdrop-blur-sm px-4 py-2 rounded-xl max-w-md text-center' :
                  captionStyle === 'bar'       ? 'w-full bg-black/80 px-6 py-3 text-center' :
                  captionStyle === 'outline'   ? 'border border-white/50 px-4 py-2 rounded-lg max-w-md text-center backdrop-blur-sm' :
                  /* highlight */                'bg-blue-600/85 px-4 py-2 rounded-lg max-w-md text-center backdrop-blur-sm'
                }>
                  <p className={`font-medium text-white leading-relaxed ${
                    captionFontSize === 'sm' ? 'text-xs' : captionFontSize === 'lg' ? 'text-base' : 'text-sm'
                  }`}>{currentSubtitle}</p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── BELOW VIDEO: Info + AI generate button ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-dark-bg-light/40 border-t border-white/[0.05]">
        <span className="text-[9px] font-bold text-white/35">
          {scene.template ?? 'Template'} · Scene {selectedIndex + 1}
        </span>
        {aiBg && (rs === 'idle' || rs === 'error' || !rs) && (
          <div className="flex items-center gap-2">
            {rs === 'error' && <p className="text-[10px] text-red-400/80">{scene.render_error}</p>}
            <button type="button" onClick={() => onRenderScene(selectedIndex)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-bold hover:opacity-90 active:scale-[0.98] transition-all ${
                sceneMode === 'dalle'
                  ? 'bg-gradient-to-r from-sky-600 to-blue-600'
                  : 'bg-gradient-to-r from-purple-600 to-violet-600'
              }`}
            >
              {sceneMode === 'dalle'
                ? <><Image className="h-3 w-3" />{rs === 'error' ? 'Retry Image' : 'Generate Background'}</>
                : <><Wand2 className="h-3 w-3" />{rs === 'error' ? 'Retry' : 'Generate BG Video'}</>}
            </button>
            {sceneMode !== 'dalle' && (
              <p className="text-[9px] text-white/25">{MODEL_INFO[sceneMode]?.tag} · 1–3 min</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Per-scene BACKGROUND dropdown ─────────────────────────────────────────
interface BackgroundDropdownProps {
  scene: StudioScene; index: number; videoMode: VideoStudioMode;
  onUpdateMode: (i: number, mode: VideoStudioMode | 'template') => void;
}
const BackgroundDropdown = ({ scene, index, videoMode, onUpdateMode }: BackgroundDropdownProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const rawMode = scene.scene_mode ?? videoMode;
  const currentMode = (rawMode === 'template' ? 'none' : rawMode) as VideoStudioMode;
  const current = BG_OPTIONS.find(m => m.id === currentMode) ?? BG_OPTIONS[0];

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold backdrop-blur-sm transition-all ${current.bgColor} ${current.color}`}
      >
        <span>{current.icon}</span> BG: {current.label}
        <ChevronDown className={`h-2.5 w-2.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.97 }} transition={{ duration: 0.12 }}
            className="absolute left-0 top-full mt-1 w-44 rounded-xl border border-glass-border bg-dark-bg-light/60 backdrop-blur-2xl shadow-glass z-50 p-1.5 space-y-0.5"
          >
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/25 px-2 py-1">Background source</p>
            {BG_OPTIONS.map(m => (
              <button key={m.id} type="button" onClick={() => { onUpdateMode(index, m.id); setOpen(false); }}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-all ${
                  currentMode === m.id ? `${m.bgColor} ${m.color}` : 'text-white/50 hover:bg-white/[0.05] hover:text-white/80'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px]">{m.icon}</span>
                  <span className="text-[10px] font-semibold">{m.label}</span>
                </div>
                <span className="text-[9px] opacity-50">{m.tag}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// BOTTOM TIMELINE
// ─────────────────────────────────────────────────────────────────────────────
interface BottomTimelineProps {
  scenes: StudioScene[]; selectedIndex: number;
  onSelectScene: (i: number) => void; totalDuration: number;
  playheadTime: number; isPlaying: boolean;
  onPlayPause: () => void; onSeek: (t: number) => void;
}

const BottomTimeline = ({
  scenes, selectedIndex, onSelectScene, totalDuration,
  playheadTime, isPlaying, onPlayPause, onSeek,
}: BottomTimelineProps) => {
  const [zoom, setZoom] = useState(1);
  // FIX: separate refs for ruler and video track — previously both pointed to the same ref,
  // breaking the ruler click handler since the ref was overwritten by the last assignment.
  const rulerRef = useRef<HTMLDivElement>(null);
  const videoTrackRef = useRef<HTMLDivElement>(null);

  const dur = Math.max(totalDuration > 0 ? totalDuration : 20, scenes.length > 0 ? 10 : 20);
  const tickStep = zoom >= 1.5 ? 2 : zoom >= 0.8 ? 5 : 10;
  const ticks: number[] = [];
  for (let t = 0; t <= dur; t += tickStep) ticks.push(t);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // FIX: getSceneDuration is now actually used for timeline click-to-scene navigation
  const getSceneDuration = (i: number): number => {
    const s = scenes[i];
    if (s.end != null && s.start != null) return s.end - s.start;
    return dur / Math.max(scenes.length, 1);
  };

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(frac * dur);
  };

  const handleVideoTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoTrackRef.current) return;
    const rect = videoTrackRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(frac * dur);
  };

  const playheadPct = (playheadTime / dur) * 100;

  return (
    <div className="flex-shrink-0 bg-dark-bg-light/50 backdrop-blur-2xl border-t border-glass-border flex flex-col" style={{ height: 168 }}>

      {/* ROW 1: Controls + Ruler — 28px */}
      <div className="flex-shrink-0 h-7 flex items-center gap-2 px-3 border-b border-white/[0.04]">
        <button type="button" onClick={onPlayPause}
          className="w-5 h-5 rounded-md flex items-center justify-center bg-white/[0.06] text-white/50 hover:bg-white/[0.10] hover:text-white transition-all flex-shrink-0"
        >
          {isPlaying ? <Pause className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
        </button>
        <span className="text-[9px] text-white/35 font-mono tabular-nums flex-shrink-0">
          {formatTime(playheadTime)} / {formatTime(dur)}
        </span>
        {/* Ruler */}
        <div className="relative flex-1 h-full cursor-pointer" ref={rulerRef} onClick={handleRulerClick}>
          {ticks.map(t => (
            <div key={t} className="absolute flex flex-col items-end h-full" style={{ left: `${(t / dur) * 100}%` }}>
              <span className="text-[7px] text-white/18 font-mono tabular-nums">{t}s</span>
              <div className="w-px h-1.5 bg-white/[0.10]" />
            </div>
          ))}
          <div className="absolute top-0 bottom-0 w-[2px] bg-blue-400/70 rounded-full pointer-events-none z-20"
            style={{ left: `${playheadPct}%` }}
          />
        </div>
        {/* Scene counter */}
        <div className="flex items-center gap-1 text-[9px] text-white/25 flex-shrink-0">
          <Film className="h-2.5 w-2.5" />
          <span className="font-mono">{selectedIndex + 1}/{Math.max(scenes.length, 1)}</span>
        </div>
        {/* Zoom */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button type="button" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} className="p-0.5 rounded text-white/20 hover:text-white/50">
            <ZoomOut className="h-2.5 w-2.5" />
          </button>
          <span className="text-[8px] text-white/20 w-7 text-center font-mono">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom(z => Math.min(4, z + 0.25))} className="p-0.5 rounded text-white/20 hover:text-white/50">
            <ZoomIn className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>

      {/* ROW 2: Scene track — 70px */}
      <div className="flex-shrink-0 h-[70px] flex items-stretch border-b border-white/[0.04]">
        {/* Track label */}
        <div className="w-10 flex-shrink-0 flex items-center justify-center border-r border-white/[0.04]">
          <span className="text-[7px] font-semibold text-white/18 uppercase tracking-widest select-none"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>SCENE</span>
        </div>
        {/* Track content */}
        <div className="flex-1 overflow-x-auto px-2 py-1.5 min-w-0">
          <div style={{ minWidth: `${Math.round(zoom * 100)}%`, width: '100%', height: '100%', position: 'relative' }}>
            <div ref={videoTrackRef}
              className="w-full h-full bg-white/[0.02] rounded-md overflow-hidden border border-white/[0.05] relative cursor-pointer flex"
              onClick={handleVideoTrackClick}
            >
              {scenes.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-[8px] text-white/15">Generate a video to populate the timeline</span>
                </div>
              ) : (
                <>
                  {scenes.map((s, i) => {
                    const colorCls = SCENE_TRACK_COLORS[i % SCENE_TRACK_COLORS.length];
                    const grad = s.template ? (TEMPLATE_GRADIENTS[s.template] ?? 'from-slate-900 to-slate-700') : 'from-slate-900 to-slate-700';
                    const isActive = selectedIndex === i;
                    const rs = s.render_state ?? 'idle';
                    const sm = s.scene_mode ?? 'none';
                    const sceneDur = getSceneDuration(i);
                    const startPct = s.start != null ? (s.start / dur) * 100 : (i / scenes.length) * 100;
                    // Last scene always extends to fill the full timeline so scenes ≥ audio length
                    const isLast = i === scenes.length - 1;
                    const wPct = isLast
                      ? Math.max((sceneDur / dur) * 100, 100 - startPct)
                      : (sceneDur / dur) * 100;
                    return (
                      <button key={i} type="button"
                        onClick={e => { e.stopPropagation(); onSelectScene(i); }}
                        style={{ position: 'absolute', left: `${startPct}%`, width: `${Math.max(wPct, 0.5)}%`, top: 0, bottom: 0 }}
                        className={`flex flex-col justify-between p-1 border-r border-black/40 transition-all relative overflow-hidden
                          bg-gradient-to-br ${grad} ${colorCls} bg-opacity-60
                          ${isActive
                            ? 'ring-2 ring-inset ring-white/40 brightness-125 z-10'
                            : 'hover:brightness-110'}`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className={`text-[7px] font-black leading-none px-1 py-0.5 rounded-sm bg-black/30 ${isActive ? 'text-white' : 'text-white/60'}`}>
                            #{i + 1}
                          </span>
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            rs === 'rendered'  ? 'bg-emerald-400' :
                            rs === 'rendering' ? 'bg-amber-400 animate-pulse' :
                            rs === 'error'     ? 'bg-red-400' :
                            isAiBackground(sm) ? 'bg-purple-400/60' : 'bg-white/20'
                          }`} />
                        </div>
                        <div className="w-full overflow-hidden">
                          <p className="text-[7px] font-semibold text-white/80 truncate leading-tight">
                            {s.headline?.slice(0, 18) || s.template || `Scene ${i + 1}`}
                          </p>
                          <p className="text-[6px] text-white/35 font-mono tabular-nums">
                            {sceneDur.toFixed(1)}s
                          </p>
                        </div>
                      </button>
                    );
                  })}
                  <div className="absolute top-0 bottom-0 w-[2px] bg-blue-400 rounded-full pointer-events-none z-20 transition-none"
                    style={{ left: `${playheadPct}%` }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ROW 3: Audio track — 70px (same as scene track) */}
      <div className="flex-shrink-0 h-[70px] flex items-stretch">
        {/* Track label */}
        <div className="w-10 flex-shrink-0 flex items-center justify-center border-r border-white/[0.04]">
          <span className="text-[7px] font-semibold text-white/18 uppercase tracking-widest select-none"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>AUDIO</span>
        </div>
        {/* Track content */}
        <div className="flex-1 px-2 py-1.5 min-w-0">
          <div className="w-full h-full bg-white/[0.02] rounded-md overflow-hidden border border-white/[0.04] relative flex items-center">
            {scenes.length > 0 ? (
              <>
                <div className="absolute inset-0 bg-blue-500/[0.07] flex items-center px-1.5 gap-[1.5px]">
                  {Array.from({ length: 80 }, (_, i) => (
                    <div key={`w-${i}`} className="w-[2px] bg-blue-400/35 rounded-full flex-shrink-0"
                      style={{ height: `${15 + Math.abs(Math.sin(i * 0.6)) * 75}%` }} />
                  ))}
                </div>
                <span className="text-[7px] text-blue-400/30 ml-auto pr-1.5 flex-shrink-0 whitespace-nowrap relative z-10">Voiceover</span>
                <div className="absolute top-0 bottom-0 w-[2px] bg-blue-400/50 rounded-full pointer-events-none z-20 transition-none"
                  style={{ left: `${playheadPct}%` }}
                />
              </>
            ) : (
              <span className="text-[7px] text-white/12 px-2">No audio yet</span>
            )}
          </div>
        </div>
        {/* Legend */}
        <div className="hidden lg:flex items-center gap-2 text-[7px] text-white/18 flex-shrink-0 pr-3">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />Done</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Rendering</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-purple-400/60 inline-block" />AI bg</span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// RENDER PROGRESS MODAL
// ─────────────────────────────────────────────────────────────────────────────
interface RenderModalProps {
  isRendering: boolean; videoUrl: string;
  renderProgress: { percent: number; stage: string; detail: string } | null;
  onCancel: () => void; onClose: () => void;
}

const RenderModal = ({ isRendering, videoUrl, renderProgress, onCancel, onClose }: RenderModalProps) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    onClick={e => { if (e.target === e.currentTarget && !isRendering) onClose(); }}
  >
    <motion.div
      initial={{ scale: 0.93, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.93, opacity: 0, y: 12 }} transition={{ duration: 0.22, ease: 'easeOut' }}
      className="relative w-full max-w-sm glass-card overflow-hidden"
    >
      {!isRendering && videoUrl && (
        <button type="button" onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all z-10"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <div className="p-6 space-y-5">
        {renderProgress?.percent === 100 ? (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="flex flex-col items-center gap-3 py-2"
          >
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            </div>
            <p className="text-base font-bold text-white">Video ready! Opening editor…</p>
          </motion.div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-5 py-2">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-blue-500/[0.08] border border-blue-500/20 flex items-center justify-center">
                  <Loader2 className="h-7 w-7 text-blue-400 animate-spin" />
                </div>
                <motion.div className="absolute inset-0 rounded-full border-2 border-blue-500/15"
                  animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }} transition={{ duration: 2.5, repeat: Infinity }} />
              </div>
              <div className="text-center space-y-1">
                <p className="text-base font-bold text-white">Rendering your video</p>
                <p className="text-xs text-white/30">Keep this tab open.</p>
              </div>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50">{renderProgress?.stage ?? 'Starting…'}</span>
                <span className="text-xs font-bold tabular-nums text-blue-400">{renderProgress?.percent ?? 0}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div className="h-full rounded-full bg-gradient-teal-blue"
                  initial={{ width: '0%' }} animate={{ width: `${renderProgress?.percent ?? 0}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
              </div>
              {renderProgress?.detail && <p className="text-[11px] text-white/25">{renderProgress.detail}</p>}
            </div>
            <div className="text-center">
              <button type="button" onClick={onCancel} className="text-xs text-white/25 hover:text-red-400/70 transition-colors">
                Cancel render
              </button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  </motion.div>
);

// ─────────────────────────────────────────────────────────────────────────────
// LIBRARY PANEL
// ─────────────────────────────────────────────────────────────────────────────
interface LibraryVideo {
  _id: string;
  title: string;
  video_url?: string;
  s3_url?: string;
  status: string;
  created_at?: string;
  social_caption?: string;
  dialogue?: string;
}

interface LibraryPanelProps {
  onLoad: (v: LibraryVideo) => void;
  onReedit: (v: LibraryVideo) => void;
  onClose: () => void;
}

const LibraryPanel = ({ onLoad, onReedit, onClose }: LibraryPanelProps) => {
  const [videos, setVideos] = useState<LibraryVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_BASE_URL}/videos/?limit=50`, { headers });
        if (res.ok) {
          const data = await res.json();
          setVideos(Array.isArray(data) ? data : (data.videos ?? []));
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    void load();
  }, []);

  const filtered = videos.filter(v =>
    !search || v.title?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 z-30 flex flex-col bg-dark-bg/98 backdrop-blur-xl border-l border-white/[0.06]"
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 h-14 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <Video className="h-4 w-4 text-blue-400" />
          <p className="text-sm font-bold text-white">Video Library</p>
          {videos.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/40">{videos.length}</span>
          )}
        </div>
        <button type="button" onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/[0.04]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25" />
          <input
            type="text" placeholder="Search videos…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white/[0.04] border border-white/[0.07] rounded-xl text-xs text-white/70 placeholder-white/20 focus:outline-none focus:border-blue-500/30 transition-all"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-white/30" />
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FolderOpen className="h-8 w-8 text-white/10" />
            <p className="text-xs text-white/25">{search ? 'No matching videos' : 'No videos yet'}</p>
          </div>
        )}
        {!loading && filtered.map(v => {
          const url = v.video_url || v.s3_url || '';
          const date = v.created_at ? new Date(v.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
          const isDone = v.status === 'completed' || !!url;
          return (
            <div key={v._id} className="glass-card p-3 space-y-2 hover:bg-white/[0.04] transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/80 truncate" title={v.title}>{v.title || 'Untitled'}</p>
                  {date && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock className="h-2.5 w-2.5 text-white/20" />
                      <span className="text-[10px] text-white/25">{date}</span>
                    </div>
                  )}
                </div>
                <span className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                  isDone ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
                }`}>
                  {isDone ? 'Done' : v.status}
                </span>
              </div>
              {v.social_caption && (
                <p className="text-[10px] text-white/30 leading-relaxed line-clamp-2">{v.social_caption}</p>
              )}
              {isDone && url && (
                <button
                  type="button"
                  onClick={() => onLoad({ ...v, video_url: url })}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 text-[10px] font-semibold transition-all"
                >
                  <Play className="h-2.5 w-2.5" /> Load &amp; Post
                </button>
              )}
              {v.dialogue && (
                <button
                  type="button"
                  onClick={() => onReedit({ ...v, video_url: url })}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/70 hover:bg-white/[0.07] text-[10px] font-medium transition-all"
                >
                  <RefreshCw className="h-2.5 w-2.5" /> Re-edit
                </button>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: VideoStudio
// ─────────────────────────────────────────────────────────────────────────────
const VS_UI_KEY = 'socialflow_vs_ui';

const loadVsUi = (): { activeTab: SideTab | null } => {
  try {
    const raw = localStorage.getItem(VS_UI_KEY);
    return raw ? JSON.parse(raw) : { activeTab: 'settings' };
  } catch { return { activeTab: 'settings' }; }
};

interface VideoStudioProps {
  isActive?: boolean;
}

const VideoStudio = ({ isActive = true }: VideoStudioProps) => {
  const state = useVideoStudioState();
  const [activeTab, setActiveTabRaw] = useState<SideTab | null>(() => loadVsUi().activeTab);

  const setActiveTab = (next: SideTab | null | ((prev: SideTab | null) => SideTab | null)) => {
    setActiveTabRaw(prev => {
      const value = typeof next === 'function' ? next(prev) : next;
      try { localStorage.setItem(VS_UI_KEY, JSON.stringify({ activeTab: value })); } catch { /* quota */ }
      return value;
    });
  };
  const [configPopupOpen, setConfigPopupOpen] = useState(false);
  const [pendingGeneration, setPendingGeneration] = useState(false);
  const [publishSidebarOpen, setPublishSidebarOpen] = useState(false);

  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceAudioRef  = useRef<HTMLAudioElement | null>(null);

  // Pause audio and clear timers when navigating away
  useEffect(() => {
    if (!isActive) {
      if (voiceAudioRef.current) {
        voiceAudioRef.current.pause();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      state.setIsPlaying(false);
    }
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // FIX: guard against zero duration — treat 0 as invalid and fall back to 20
  const totalDuration = (state.analyzeResult?.voiceover_duration_seconds ?? 0) > 0
    ? state.analyzeResult!.voiceover_duration_seconds
    : 20;

  // Load voiceover audio
  useEffect(() => {
    voiceAudioRef.current?.pause();
    if (state.analyzeResult?.voiceover_url) {
      const a = new Audio(state.analyzeResult.voiceover_url);
      a.volume = state.voiceVolume;
      voiceAudioRef.current = a;
    } else {
      voiceAudioRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.analyzeResult?.voiceover_url]);

  useEffect(() => {
    if (voiceAudioRef.current) voiceAudioRef.current.volume = state.voiceVolume;
  }, [state.voiceVolume]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      voiceAudioRef.current?.pause();
    };
  }, []);

  // Caption sync: prefer word-level caption_segments; for long segments use rolling word window
  const currentSubtitle = useMemo(() => {
    if (!state.showCaptions) return '';
    const segments = (
      state.analyzeResult?.caption_segments?.length
        ? state.analyzeResult.caption_segments
        : state.analyzeResult?.subtitle_segments
    ) ?? [];
    if (!segments.length) return '';

    const t = state.playheadTime;
    const match = segments.find(s => {
      const st = typeof s.start === 'number' ? s.start : null;
      const en = typeof s.end   === 'number' ? s.end   : null;
      if (st === null || en === null || en <= st) return false;
      return t >= st && t < en;
    });
    if (!match) return '';

    const text = ((match.text as string) ?? '').trim();
    if (!text) return '';

    const segStart = match.start as number;
    const segEnd   = match.end   as number;
    const segDur   = Math.max(0.1, segEnd - segStart);
    const words    = text.split(/\s+/);

    // Cap at 8 words so a single long segment never dumps the whole script
    const WORDS_PER_SEC = 2.5;
    const MAX_CAPTION_WORDS = 8;
    const maxWords = Math.min(MAX_CAPTION_WORDS, Math.max(4, Math.round(segDur * WORDS_PER_SEC)));
    if (words.length <= maxWords) return text;

    // Rolling window: slide by half-window across segment duration
    const windowSize = maxWords;
    const stride = Math.max(1, Math.floor(windowSize / 2));
    const numWindows = Math.ceil((words.length - windowSize) / stride) + 1;
    const windowInterval = segDur / numWindows;
    const elapsed = Math.max(0, t - segStart);
    const windowIdx = Math.min(numWindows - 1, Math.floor(elapsed / windowInterval));
    const startWord = Math.min(windowIdx * stride, words.length - windowSize);
    return words.slice(startWord, startWord + windowSize).join(' ');
  }, [
    state.playheadTime,
    state.showCaptions,
    state.analyzeResult?.subtitle_segments,
    state.analyzeResult?.caption_segments,
  ]);

  // Caption shown in editor canvas: placeholder when idle, real text when playing
  const captionToShow = useMemo(() => {
    if (!state.showCaptions || !state.editedScenes.length) return '';
    if (!state.isPlaying) {
      return state.analyzeResult?.subtitle_segments?.length ? 'This is how captions will look' : '';
    }
    return currentSubtitle;
  }, [state.showCaptions, state.editedScenes.length, state.isPlaying, state.analyzeResult?.subtitle_segments?.length, currentSubtitle]);

  // FIX: capture scenes + totalDuration as stable snapshot refs so the interval
  // closure doesn't go stale when scenes are edited mid-playback.
  const scenesRef = useRef(state.editedScenes);
  const totalDurationRef = useRef(totalDuration);
  useEffect(() => { scenesRef.current = state.editedScenes; }, [state.editedScenes]);
  useEffect(() => { totalDurationRef.current = totalDuration; }, [totalDuration]);

  const handlePlayPause = useCallback(() => {
    if (state.isPlaying) {
      voiceAudioRef.current?.pause();
      if (intervalRef.current) clearInterval(intervalRef.current);
      state.setIsPlaying(false);
    } else {
      if (voiceAudioRef.current) {
        voiceAudioRef.current.currentTime = state.playheadTime;
        voiceAudioRef.current.play().catch(() => {});
      }
      state.setIsPlaying(true);
      const startMs = Date.now() - state.playheadTime * 1000;

      intervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - startMs) / 1000;
        const dur = totalDurationRef.current;
        const scenes = scenesRef.current;

        if (elapsed >= dur) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          state.setPlayheadTime(0);
          state.setIsPlaying(false);
          voiceAudioRef.current?.pause();
          if (voiceAudioRef.current) voiceAudioRef.current.currentTime = 0;
          return;
        }
        state.setPlayheadTime(elapsed);
        // Auto-jump to active scene
        let cumulative = 0;
        for (let i = 0; i < scenes.length; i++) {
          const s = scenes[i];
          const d = (s.end != null && s.start != null) ? (s.end - s.start) : dur / scenes.length;
          cumulative += d;
          if (elapsed < cumulative) {
            state.setSelectedSceneIndex(i);
            break;
          }
        }
      }, 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isPlaying, state.playheadTime]);

  const handleSeek = useCallback((t: number) => {
    // FIX: clear interval before updating playhead to prevent stale tick
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    state.setIsPlaying(false);
    voiceAudioRef.current?.pause();
    const clamped = Math.max(0, Math.min(t, totalDurationRef.current));
    state.setPlayheadTime(clamped);
    if (voiceAudioRef.current) voiceAudioRef.current.currentTime = clamped;
    // Jump to correct scene using current snapshot
    const scenes = scenesRef.current;
    const dur = totalDurationRef.current;
    let cumulative = 0;
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      const d = (s.end != null && s.start != null) ? (s.end - s.start) : dur / scenes.length;
      cumulative += d;
      if (clamped < cumulative) { state.setSelectedSceneIndex(i); break; }
    }
  }, [state]);

  const handleTabClick = (tab: SideTab) => {
    setActiveTab(prev => (prev === tab ? null : tab));
    setPublishSidebarOpen(false);
  };

  // Handle generate button click - show config popup first
  const handleGenerateClick = () => {
    setPendingGeneration(true);
    setConfigPopupOpen(true);
  };

  // Handle actual generation after config popup closes
  const handleGenerateWithConfig = () => {
    if (pendingGeneration) {
      state.handleGenerate();
      setPendingGeneration(false);
    }
  };

  // FIX: reset fullVideoUrl when exiting result view so stale video doesn't flash on next render
  const handleExitResult = useCallback(() => {
    state.setShowResult(false);
  }, [state]);

  return (
    <div className="flex flex-col h-full">

      {/* Error strip */}
      <AnimatePresence>
        {state.error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="flex-shrink-0 flex items-center gap-2.5 px-5 py-2 bg-red-500/[0.06] border-b border-red-500/15 overflow-hidden z-10"
          >
            <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
            <span className="text-xs text-red-400/90 flex-1">{state.error.message}</span>
            {state.error.retryable && state.error.onRetry && (
              <button onClick={state.error.onRetry} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors">
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            )}
            <button onClick={() => state.setError(null)} className="text-white/20 hover:text-white/50 transition-colors ml-1">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {state.showResult && state.fullVideoUrl ? (
          <FullResultView
            key="result"
            videoUrl={state.fullVideoUrl}
            videoTitle={state.videoTitle}
            socialCaption={state.socialCaption}
            onExit={handleExitResult}
          />
        ) : (
          <motion.div key="editor" initial={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <div className="flex flex-1 overflow-hidden relative">
              <AnimatePresence>
                {activeTab === 'library' && (
                  <LibraryPanel
                    onLoad={v => {
                      state.loadFromLibrary({ video_url: v.video_url ?? '', title: v.title, social_caption: v.social_caption, dialogue: v.dialogue });
                      setActiveTab(null);
                    }}
                    onReedit={v => {
                      state.loadForEdit({ video_url: v.video_url ?? '', title: v.title, social_caption: v.social_caption, dialogue: v.dialogue });
                      setActiveTab(null);
                    }}
                    onClose={() => setActiveTab(null)}
                  />
                )}
              </AnimatePresence>
              <SceneCanvasPanel
                scenes={state.editedScenes}           selectedIndex={state.selectedSceneIndex}
                isGenerating={state.isGenerating}     generatingStatus={state.generatingStatus}
                videoMode={state.videoMode}           updateScene={state.updateScene}
                updateSceneMode={state.updateSceneMode} onRenderScene={state.handleRenderScene}
                currentSubtitle={captionToShow}       showCaptions={state.showCaptions}
                captionStyle={state.captionStyle}
                captionFontSize={state.captionFontSize}
                onOpenConfig={() => { setPendingGeneration(true); setConfigPopupOpen(true); }}
              />
              <SlidingPanel
                activeTab={activeTab}
                scenes={state.editedScenes}           selectedIndex={state.selectedSceneIndex}
                onSelectScene={state.setSelectedSceneIndex} isGenerating={state.isGenerating}
                videoMode={state.videoMode}           updateScene={state.updateScene}
                updateSceneMode={state.updateSceneMode} onRenderScene={state.handleRenderScene}
                onGeneratePrompt={state.handleGeneratePrompt} generatingPrompt={state.generatingPrompt}
                dialogue={state.dialogue}             setDialogue={state.setDialogue}
                voiceId={state.voiceId}               setVoiceId={state.setVoiceId}
                bgmId={state.bgmId}                   setBgmId={state.setBgmId}
                showCaptions={state.showCaptions}     setShowCaptions={state.setShowCaptions}
                voiceVolume={state.voiceVolume}        setVoiceVolume={state.setVoiceVolume}
                bgmVolume={state.bgmVolume}            setBgmVolume={state.setBgmVolume}
                socialCaption={state.socialCaption}   videoTitle={state.videoTitle}
                companyName={state.companyName}       setCompanyName={state.setCompanyName}
                senderMode={state.senderMode}         setSenderMode={state.setSenderMode}
                targetDuration={state.targetDuration} setTargetDuration={state.setTargetDuration}
                setVideoMode={state.setVideoMode}
                captionStyle={state.captionStyle}     setCaptionStyle={state.setCaptionStyle}
                captionFontSize={state.captionFontSize} setCaptionFontSize={state.setCaptionFontSize}
              />
              {/* Right column: icon tabs + render button + actions */}
              <div className="w-[60px] flex-shrink-0 sidebar-glass flex flex-col">
                <IconStrip activeTab={activeTab} onTabClick={handleTabClick} />
                {/* Render Final Video */}
                <div className="flex-shrink-0 p-2 border-t border-white/[0.06]">
                  <button type="button"
                    onClick={state.handleRender}
                    disabled={state.editedScenes.length === 0 || state.isRendering}
                    className={`w-full flex flex-col items-center justify-center gap-1 py-3 rounded-xl transition-all text-center ${
                      state.editedScenes.length > 0 && !state.isRendering
                        ? 'bg-gradient-teal-blue text-white shadow-glow-teal hover:opacity-90 active:scale-[0.97]'
                        : 'bg-white/[0.03] text-white/20 border border-white/[0.06] cursor-not-allowed'
                    }`}
                  >
                    {state.isRendering
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Wand2 className="h-4 w-4" />}
                    <span className="text-[7px] font-semibold leading-tight tracking-wide">
                      {state.isRendering ? 'Rendering…' : 'Render'}
                    </span>
                  </button>
                </div>
                {/* Download / Publish / New Video */}
                <div className="flex-shrink-0 p-2 pt-1 border-t border-white/[0.06] space-y-1.5">
                  {state.videoUrl ? (
                    <a
                      href={getProxyDownloadUrl(state.videoUrl, `${(state.videoTitle||'video').replaceAll(/\s+/g,'_')}_video.mp4`)}
                      download={`${(state.videoTitle||'video').replaceAll(/\s+/g,'_')}_video.mp4`}
                      className="w-full flex flex-col items-center justify-center gap-1 py-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-400 hover:bg-emerald-500/15 transition-all"
                      title="Download video"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="text-[7px] font-semibold leading-tight">Save</span>
                    </a>
                  ) : (
                    <span className="w-full flex flex-col items-center justify-center gap-1 py-2 rounded-xl border border-white/[0.05] bg-white/[0.02] text-white/15 cursor-not-allowed" title="Render first">
                      <Download className="h-3.5 w-3.5" />
                      <span className="text-[7px] font-semibold leading-tight">Save</span>
                    </span>
                  )}
                  <div className="relative">
                    <button type="button"
                      onClick={() => state.videoUrl && setPublishSidebarOpen(o => !o)}
                      className={`w-full flex flex-col items-center justify-center gap-1 py-2 rounded-xl border transition-all ${
                        state.videoUrl
                          ? 'border-blue-500/25 bg-blue-500/[0.08] text-blue-400 hover:bg-blue-500/15'
                          : 'border-white/[0.05] bg-white/[0.02] text-white/15 cursor-not-allowed'
                      }`}
                      title={state.videoUrl ? 'Publish to social' : 'Render a video first'}
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      <span className="text-[7px] font-semibold leading-tight">Post</span>
                    </button>
                    <AnimatePresence>
                      {publishSidebarOpen && state.videoUrl && (
                        <motion.div
                          initial={{ opacity: 0, x: 8, scale: 0.97 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, x: 8, scale: 0.97 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-full bottom-0 mr-2 w-56 glass-card z-50 p-3 space-y-1.5"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Post to</p>
                            <button type="button" onClick={() => setPublishSidebarOpen(false)} className="text-white/20 hover:text-white/60 transition-colors">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          <PublishActions
                            videoUrl={state.videoUrl}
                            videoTitle={state.videoTitle}
                            socialCaption={state.socialCaption}
                            layout="dropdown"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <button type="button" onClick={state.reset}
                    className="w-full flex flex-col items-center justify-center gap-1 py-2 rounded-xl border border-white/[0.07] bg-white/[0.03] text-white/40 hover:text-white/70 hover:bg-white/[0.07] transition-all"
                    title="New video"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span className="text-[7px] font-semibold leading-tight">New</span>
                  </button>
                </div>
              </div>
            </div>

            <BottomTimeline
              scenes={state.editedScenes}       selectedIndex={state.selectedSceneIndex}
              onSelectScene={state.setSelectedSceneIndex} totalDuration={totalDuration}
              playheadTime={state.playheadTime}  isPlaying={state.isPlaying}
              onPlayPause={handlePlayPause}      onSeek={handleSeek}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {state.showRenderModal && (
          <RenderModal
            isRendering={state.isRendering}   videoUrl={state.videoUrl}
            renderProgress={state.renderProgress}
            onCancel={state.cancelRender}
            onClose={() => state.setShowRenderModal(false)}
          />
        )}
      </AnimatePresence>

      <VideoStudioConfigPopup
        isOpen={configPopupOpen}
        onClose={() => {
          setConfigPopupOpen(false);
          setPendingGeneration(false);
        }}
        onGenerate={pendingGeneration ? handleGenerateWithConfig : undefined}
        prompt={state.prompt}
        setPrompt={state.setPrompt}
        companyName={state.companyName}
        setCompanyName={state.setCompanyName}
        videoMode={state.videoMode}
        setVideoMode={state.setVideoMode}
        targetDuration={state.targetDuration}
        setTargetDuration={state.setTargetDuration}
        senderMode={state.senderMode}
        setSenderMode={state.setSenderMode}
      />
    </div>
  );
};

export default VideoStudio;