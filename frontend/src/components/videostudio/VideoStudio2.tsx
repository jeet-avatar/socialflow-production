/**
 * VideoStudio2 — clean rewrite of VideoStudio.tsx
 *
 * Layout:  [Toolbar] / [Scene List | Canvas | Editor Panel]
 *
 * Key fixes over VideoStudio.tsx:
 *  - All scenes visible in left list (not just selectedIndex)
 *  - Pre-rendered background URLs stored correctly and sent to backend
 *  - Backend will no longer regenerate pre-rendered backgrounds (backend fix in content_routes.py)
 *  - Caption preview shows placeholder when not playing (fixed rolling window)
 *  - "No Template" option
 *  - Background opacity slider
 *  - Font color picker with auto-contrast
 *  - Apply template / style to all scenes
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film, Wand2, Sparkles, Loader2,
  Mic, Music2, Play, Pause, Volume2, Type,
  AlertCircle, RefreshCw, X, Download, Copy, CheckCircle2,
  ChevronDown, Send, Mail,
  Linkedin, Facebook, Youtube, Instagram, RotateCcw,
  Image, Layers, Settings, Palette, ChevronLeft, ChevronRight,
  Zap, EyeOff,
} from 'lucide-react';
import { useVideoStudioState } from './useVideoStudioState';
import ScenePreviewPlayer from './ScenePreviewPlayer';
import type { StudioScene, VideoStudioMode } from './videoStudioTypes';
import { ALL_TEMPLATES, BG_OPTIONS, DURATION_INFO, MODEL_INFO } from './videoStudioTypes';
import { VideoStudioConfigPopup } from './VideoStudioConfigPopup';
import { VOICE_OPTIONS, BGM_TRACKS, type VoiceId, type BgmId } from '../campaign/campaignConstants';
import {
  getProxyDownloadUrl,
  postToFacebook, postToLinkedIn, postToInstagram, postToYouTube,
  sendVideoEmail, pollRenderProgress,
} from '../campaign/campaignApi';
import { getAuthHeaders } from '../../utils/getAuthToken';
import { API_BASE_URL } from '../../config/api';

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

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

const NO_TEMPLATE = '__none__';

const FONT_FAMILIES = [
  { id: 'inter'   as const, label: 'Inter',   style: "'Inter', sans-serif" },
  { id: 'poppins' as const, label: 'Poppins', style: "'Poppins', sans-serif" },
  { id: 'serif'   as const, label: 'Serif',   style: "Georgia, 'Times New Roman', serif" },
  { id: 'mono'    as const, label: 'Mono',    style: "'Courier New', Courier, monospace" },
  { id: 'display' as const, label: 'Impact',  style: "Impact, 'Arial Narrow', sans-serif" },
];

const FONT_SIZES = [
  { id: 'sm' as const, label: 'S',  cls: 'text-xl',   px: 20 },
  { id: 'md' as const, label: 'M',  cls: 'text-3xl',  px: 28 },
  { id: 'lg' as const, label: 'L',  cls: 'text-4xl',  px: 36 },
  { id: 'xl' as const, label: 'XL', cls: 'text-5xl',  px: 48 },
];

const FONT_WEIGHTS = [
  { id: 'semibold' as const, label: 'Regular', w: 600 },
  { id: 'bold'     as const, label: 'Bold',    w: 700 },
  { id: 'black'    as const, label: 'Black',   w: 900 },
];

const FONT_COLORS = [
  { hex: '#ffffff', label: 'White'  },
  { hex: '#facc15', label: 'Yellow' },
  { hex: '#22d3ee', label: 'Cyan'   },
  { hex: '#4ade80', label: 'Green'  },
  { hex: '#f87171', label: 'Red'    },
  { hex: '#fb923c', label: 'Orange' },
  { hex: '#e879f9', label: 'Pink'   },
  { hex: '#94a3b8', label: 'Silver' },
];

const ACCENT_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#6366f1',
];

const isAiBg = (m: string | undefined) =>
  !!m && m !== 'none' && m !== 'template';

// ─── AUDIO PREVIEW HOOK ───────────────────────────────────────────────────

function useAudioPreview() {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const toggle = (id: string, url: string) => {
    if (!url) return;
    if (playing === id) { ref.current?.pause(); ref.current = null; setPlaying(null); return; }
    if (ref.current) { ref.current.pause(); ref.current.src = ''; ref.current = null; }
    const a = new Audio(url); a.volume = 0.35;
    a.play().catch(() => {});
    a.onended = () => { ref.current = null; setPlaying(null); };
    ref.current = a; setPlaying(id);
  };
  const stop = () => { ref.current?.pause(); if (ref.current) { ref.current.src = ''; ref.current = null; } setPlaying(null); };
  useEffect(() => () => stop(), []);
  return { playing, toggle, stop };
}

// ─── SCENE LIST PANEL ────────────────────────────────────────────────────────

interface SceneListProps {
  scenes: StudioScene[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  isGenerating: boolean;
  videoMode: VideoStudioMode;
}

const SceneList = ({ scenes, selectedIndex, onSelect, isGenerating, videoMode }: SceneListProps) => {
  const badgeColor = (s: StudioScene) => {
    const rs = s.render_state ?? 'idle';
    const mode = s.scene_mode ?? videoMode;
    if (rs === 'rendered')  return 'bg-emerald-500/20 text-emerald-400';
    if (rs === 'rendering') return 'bg-amber-500/20 text-amber-400';
    if (rs === 'error')     return 'bg-red-500/20 text-red-400';
    if (isAiBg(mode))       return 'bg-purple-500/20 text-purple-400';
    return 'bg-blue-500/20 text-blue-400';
  };

  const badgeLabel = (s: StudioScene) => {
    const rs = s.render_state ?? 'idle';
    if (rs === 'rendered')  return '✓';
    if (rs === 'rendering') return '⟳';
    if (rs === 'error')     return '!';
    if (isAiBg(s.scene_mode ?? videoMode)) return 'AI';
    return 'TPL';
  };

  return (
    <div className="w-[160px] flex-shrink-0 flex flex-col sidebar-glass border-r border-glass-border">
      <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Scenes</span>
        <span className="text-[10px] text-white/25">{scenes.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1.5">
        {isGenerating && [0, 1, 2].map(k => (
          <div key={k} className="animate-pulse rounded-xl bg-white/[0.04]" style={{ aspectRatio: '16/9' }} />
        ))}
        {!isGenerating && scenes.length === 0 && (
          <div className="py-6 text-center">
            <Film className="h-6 w-6 text-white/10 mx-auto mb-1.5" />
            <p className="text-[9px] text-white/20 leading-snug">Generate a video to see scenes</p>
          </div>
        )}
        {!isGenerating && scenes.map((s, i) => {
          const grad = s.template ? (TEMPLATE_GRADIENTS[s.template] ?? 'from-slate-900 to-slate-700') : 'from-slate-900 to-slate-700';
          const active = selectedIndex === i;
          return (
            <button key={i} type="button" onClick={() => onSelect(i)}
              className={`w-full rounded-xl overflow-hidden border-2 transition-all group ${
                active ? 'border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.3)]' : 'border-white/[0.07] hover:border-white/25'
              }`}
            >
              <div className={`w-full bg-gradient-to-br ${grad} relative`} style={{ aspectRatio: '16/9' }}>
                {s.rendered_url && (
                  s.scene_mode === 'dalle' || (!s.scene_mode && s.background_image_url)
                    ? <img src={s.rendered_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    : <video src={s.rendered_url} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[8px] font-bold text-white/60 bg-black/40 px-1.5 py-0.5 rounded">{i + 1}</span>
                </div>
              </div>
              <div className={`px-2 py-1 flex items-center justify-between ${active ? 'bg-blue-500/10' : 'bg-white/[0.02]'}`}>
                <span className={`text-[8px] font-semibold truncate ${active ? 'text-blue-300' : 'text-white/40'}`}>
                  {s.headline ? s.headline.slice(0, 12) : `Scene ${i + 1}`}
                </span>
                <span className={`text-[7px] px-1 py-0.5 rounded font-bold flex-shrink-0 ml-1 ${badgeColor(s)}`}>
                  {badgeLabel(s)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── SCENE CANVAS ────────────────────────────────────────────────────────────

interface SceneCanvasProps {
  scene: StudioScene | undefined;
  isGenerating: boolean;
  generatingStatus: string;
  captionText: string;
  showCaptions: boolean;
  captionStyle: 'pill' | 'bar' | 'outline' | 'highlight';
  captionFontSize: 'sm' | 'md' | 'lg';
  videoMode: VideoStudioMode;
  selectedIndex: number;
  totalScenes: number;
  onPrev: () => void;
  onNext: () => void;
  onOpenConfig: () => void;
  updateScene: (i: number, u: Partial<StudioScene>) => void;
  onRenderScene: (i: number) => void;
}

const SceneCanvas = ({
  scene, isGenerating, generatingStatus, captionText, showCaptions,
  captionStyle, captionFontSize, videoMode, selectedIndex, totalScenes,
  onPrev, onNext, onOpenConfig, updateScene, onRenderScene,
}: SceneCanvasProps) => {
  const [editingHeadline, setEditingHeadline] = useState(false);
  const headlineRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editingHeadline) headlineRef.current?.focus(); }, [editingHeadline]);

  if (isGenerating) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 bg-dark-bg-light/10">
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/[0.08] border border-blue-500/20 flex items-center justify-center">
          <Loader2 className="h-7 w-7 text-blue-400 animate-spin" />
        </div>
        <motion.div className="absolute inset-0 rounded-2xl border-2 border-blue-500/15"
          animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-white">{generatingStatus || 'Generating…'}</p>
        <p className="text-xs text-white/30 mt-1">Script · Voiceover · Scenes</p>
      </div>
    </div>
  );

  if (!scene) return (
    <div className="flex-1 flex items-center justify-center bg-dark-bg-light/10">
      <div className="text-center space-y-4 max-w-xs">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto">
          <Film className="h-8 w-8 text-white/10" />
        </div>
        <div>
          <p className="text-base font-semibold text-white/60">Start your video</p>
          <p className="text-xs text-white/25 mt-1">AI-powered in seconds</p>
        </div>
        <button type="button" onClick={onOpenConfig}
          className="px-5 py-2.5 rounded-xl bg-gradient-teal-blue text-white text-sm font-semibold hover:opacity-90 transition-all"
        >
          ✨ Generate New Video
        </button>
      </div>
    </div>
  );

  const grad = scene.template && scene.template !== NO_TEMPLATE
    ? (TEMPLATE_GRADIENTS[scene.template] ?? 'from-slate-900 to-slate-700')
    : 'from-[#050510] to-[#0a0a1a]';
  const sceneMode = (scene.scene_mode ?? videoMode) as VideoStudioMode;
  const rs = scene.render_state ?? 'idle';
  const hasBg = rs === 'rendered' && !!scene.rendered_url;
  const opacity = scene.background_opacity ?? 0.85;

  const fontFamilyStyle = FONT_FAMILIES.find(f => f.id === (scene.font_family ?? 'inter'))?.style ?? "'Inter', sans-serif";
  const fontSizeCls = FONT_SIZES.find(s => s.id === (scene.font_size ?? 'md'))?.cls ?? 'text-3xl';
  const fontWeightVal = FONT_WEIGHTS.find(w => w.id === (scene.font_weight ?? 'bold'))?.w ?? 700;
  const fontColor = scene.font_color ?? '#ffffff';

  return (
    <div className="flex-1 bg-dark-bg-light/10 flex flex-col items-center justify-center p-6 overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div key={`${selectedIndex}-${rs}`}
          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }} className="w-full max-w-2xl"
        >
          {/* Navigation */}
          {totalScenes > 1 && (
            <div className="flex items-center justify-between mb-3">
              <button type="button" onClick={onPrev} disabled={selectedIndex === 0}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/[0.07] text-white/30 hover:text-white/70 disabled:opacity-20 text-xs transition-all"
              >
                <ChevronLeft className="h-3 w-3" /> Prev
              </button>
              <span className="text-xs text-white/30">Scene {selectedIndex + 1} of {totalScenes}</span>
              <button type="button" onClick={onNext} disabled={selectedIndex === totalScenes - 1}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/[0.07] text-white/30 hover:text-white/70 disabled:opacity-20 text-xs transition-all"
              >
                Next <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* 16:9 canvas */}
          <div className="relative rounded-2xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.7)] ring-1 ring-white/[0.07]"
            style={{ aspectRatio: '16/9' }}
          >
            {/* Live Remotion preview — shows the actual animated template + background */}
            <div className="absolute inset-0">
              <ScenePreviewPlayer
                template={scene.template && scene.template !== NO_TEMPLATE ? scene.template : 'CinematicReveal'}
                headline={editingHeadline ? '' : (scene.headline || '')}
                subtext={scene.subtext || ''}
                accentColor={scene.accent_color || '#4f9eff'}
                icon={scene.icon}
                backgroundImageUrl={hasBg && sceneMode === 'dalle' ? scene.rendered_url : undefined}
                backgroundVideoUrl={hasBg && sceneMode !== 'dalle' && !scene.background_image_url ? scene.rendered_url : undefined}
                backgroundOpacity={opacity}
                templateOpacity={scene.template === NO_TEMPLATE ? 0 : (scene.template_opacity ?? 1)}
              />
            </div>

            {/* Rendering spinner */}
            {rs === 'rendering' && (
              <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/40 backdrop-blur-[1px]">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 text-purple-400 animate-spin" />
                  <p className="text-xs text-white/70 bg-black/50 px-3 py-1 rounded-full">
                    {sceneMode === 'dalle' ? 'Generating image…' : 'Generating video…'}
                  </p>
                </div>
              </div>
            )}

            {/* Headline edit — input shown while editing, invisible click-target otherwise */}
            {editingHeadline ? (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-10 bg-black/20">
                <input ref={headlineRef} type="text" value={scene.headline || ''}
                  onChange={e => updateScene(selectedIndex, { headline: e.target.value })}
                  onBlur={() => setEditingHeadline(false)}
                  onKeyDown={e => { if (e.key === 'Enter') setEditingHeadline(false); }}
                  className="text-2xl text-center bg-black/40 border-b-2 border-white/60 outline-none w-full py-2 text-white font-bold backdrop-blur-sm rounded-t"
                  placeholder="Scene headline…"
                />
                <p className="text-[9px] text-white/30 mt-2">Press Enter or click away to finish</p>
              </div>
            ) : (
              <div
                className="absolute inset-x-0 z-10 cursor-text"
                style={{ top: '25%', bottom: '25%' }}
                onClick={() => setEditingHeadline(true)}
                title="Click to edit headline"
              />
            )}

            {/* Caption overlay */}
            {showCaptions && captionText && (
              <div className={`absolute z-30 pointer-events-none ${
                captionStyle === 'bar' ? 'bottom-0 left-0 right-0' : 'bottom-8 left-0 right-0 flex justify-center'
              }`}>
                <div className={
                  captionStyle === 'pill'      ? 'bg-black/70 backdrop-blur-sm px-4 py-2 rounded-xl max-w-md text-center' :
                  captionStyle === 'bar'       ? 'w-full bg-black/80 px-6 py-2.5 text-center' :
                  captionStyle === 'outline'   ? 'border border-white/50 px-4 py-2 rounded-lg max-w-md text-center backdrop-blur-sm' :
                  'bg-blue-600/85 px-4 py-2 rounded-lg max-w-md text-center'
                }>
                  <p className={`font-medium text-white leading-snug ${
                    captionFontSize === 'sm' ? 'text-xs' : captionFontSize === 'lg' ? 'text-base' : 'text-sm'
                  }`}>{captionText}</p>
                </div>
              </div>
            )}

            {/* AI background CTA — only when not yet rendered */}
            {isAiBg(sceneMode) && (rs === 'idle' || rs === 'error') && (
              <div className="absolute bottom-0 left-0 right-0 z-30 p-3 bg-gradient-to-t from-black/80 to-transparent flex flex-col items-center gap-1.5">
                {rs === 'error' && (
                  <p className="text-[10px] text-red-400/80">{scene.render_error}</p>
                )}
                <button type="button" onClick={() => onRenderScene(selectedIndex)}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-white text-xs font-bold hover:opacity-90 transition-all ${
                    sceneMode === 'dalle' ? 'bg-sky-600' : 'bg-purple-600'
                  }`}
                >
                  {sceneMode === 'dalle'
                    ? <><Image className="h-3 w-3" />{rs === 'error' ? 'Retry Image' : 'Generate Background'}</>
                    : <><Wand2 className="h-3 w-3" />{rs === 'error' ? 'Retry Clip' : 'Generate Video BG'}</>}
                </button>
              </div>
            )}

            {/* Rendered badge */}
            {hasBg && (
              <div className="absolute top-2 right-2 z-30 flex items-center gap-1.5">
                <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-300 backdrop-blur-sm">
                  {sceneMode === 'dalle' ? '🎨 Image' : '▶ Video'}
                </span>
                <button type="button" onClick={() => onRenderScene(selectedIndex)}
                  className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/50 hover:bg-white/20 backdrop-blur-sm"
                >
                  <RefreshCw className="h-2.5 w-2.5 inline" /> Redo
                </button>
              </div>
            )}

            {/* Scene / template label */}
            <div className="absolute bottom-0 left-0 right-0 h-7 bg-gradient-to-t from-black/50 to-transparent z-10 flex items-end px-3 pb-1.5">
              <span className="text-[8px] font-bold text-white/30">
                {scene.template && scene.template !== NO_TEMPLATE ? scene.template : 'No Template'} · Scene {selectedIndex + 1}
              </span>
            </div>
          </div>

        </motion.div>
      </AnimatePresence>
    </div>
  );
};

// ─── TIMELINE ────────────────────────────────────────────────────────────────

const TIMELINE_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

interface TimelineProps {
  scenes: StudioScene[];
  totalDuration: number;
  playheadTime: number;
  isPlaying: boolean;
  selectedIndex: number;
  onSeek: (t: number) => void;
  onSelectScene: (i: number) => void;
  onPlayPause: () => void;
}

const Timeline = ({ scenes, totalDuration, playheadTime, selectedIndex, isPlaying, onSeek, onSelectScene, onPlayPause }: TimelineProps) => {
  const barRef = useRef<HTMLDivElement>(null);

  if (!scenes.length || !totalDuration) return null;

  const progress = totalDuration > 0 ? Math.min(1, playheadTime / totalDuration) : 0;

  const handleBarClick = (e: React.MouseEvent) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(((e.clientX - rect.left) / rect.width) * totalDuration, totalDuration)));
  };

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="flex-shrink-0 px-5 py-2.5 bg-dark-bg-light/40 border-t border-white/[0.05]">
      <div className="flex items-center gap-3">
        {/* Play/Pause */}
        <button type="button" onClick={onPlayPause}
          className="flex-shrink-0 w-7 h-7 rounded-full bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center transition-all"
        >
          {isPlaying
            ? <Pause className="h-3 w-3 text-white/70" />
            : <Play className="h-3 w-3 text-white/70 ml-0.5" />}
        </button>

        {/* Time label */}
        <span className="text-[9px] text-white/30 tabular-nums flex-shrink-0 w-16">
          {fmtTime(playheadTime)} / {fmtTime(totalDuration)}
        </span>

        {/* Timeline bar */}
        <div ref={barRef} onClick={handleBarClick}
          className="flex-1 relative h-7 rounded-lg overflow-hidden cursor-pointer bg-black/50 border border-white/[0.07]"
        >
          {/* Scene blocks */}
          {scenes.map((s, i) => {
            const start = typeof s.start === 'number' ? s.start : (i / scenes.length) * totalDuration;
            const end   = typeof s.end   === 'number' ? s.end   : ((i + 1) / scenes.length) * totalDuration;
            const left  = (start / totalDuration) * 100;
            const width = Math.max(0.5, ((end - start) / totalDuration) * 100);
            const color = TIMELINE_COLORS[i % TIMELINE_COLORS.length];
            const active = selectedIndex === i;
            return (
              <div key={i}
                onClick={e => { e.stopPropagation(); onSelectScene(i); }}
                className="absolute top-0 bottom-0 border-r border-black/50 flex items-center justify-center cursor-pointer transition-opacity hover:opacity-90"
                style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color + (active ? '55' : '22') }}
              >
                {width > 4 && (
                  <span className="text-[7px] font-bold text-white/60 leading-none pointer-events-none">{i + 1}</span>
                )}
                {active && <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/60" />}
              </div>
            );
          })}

          {/* Progress fill */}
          <div className="absolute top-0 left-0 bottom-0 bg-white/[0.06] pointer-events-none"
            style={{ width: `${progress * 100}%` }} />

          {/* Playhead line */}
          <div className="absolute top-0 bottom-0 w-px bg-white z-10 pointer-events-none shadow-[0_0_6px_rgba(255,255,255,0.8)]"
            style={{ left: `${progress * 100}%` }} />
        </div>
      </div>
    </div>
  );
};

// ─── SCENE STRIP (horizontal thumbnails below canvas) ───────────────────────

interface SceneStripProps {
  scenes: StudioScene[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  isGenerating: boolean;
  videoMode: VideoStudioMode;
}

const SceneStrip = ({ scenes, selectedIndex, onSelect, isGenerating, videoMode }: SceneStripProps) => {
  const badgeColor = (s: StudioScene) => {
    const rs = s.render_state ?? 'idle';
    if (rs === 'rendered')  return 'bg-emerald-500/20 text-emerald-400';
    if (rs === 'rendering') return 'bg-amber-500/20 text-amber-400';
    if (rs === 'error')     return 'bg-red-500/20 text-red-400';
    if (isAiBg(s.scene_mode ?? videoMode)) return 'bg-purple-500/20 text-purple-400';
    return 'bg-blue-500/20 text-blue-400';
  };
  const badgeLabel = (s: StudioScene) => {
    const rs = s.render_state ?? 'idle';
    if (rs === 'rendered')  return '✓';
    if (rs === 'rendering') return '⟳';
    if (rs === 'error')     return '!';
    if (isAiBg(s.scene_mode ?? videoMode)) return 'AI';
    return 'TPL';
  };
  if (isGenerating) return (
    <div className="flex gap-2">
      {[0, 1, 2].map(k => (
        <div key={k} className="flex-shrink-0 w-28 animate-pulse rounded-xl bg-white/[0.04]" style={{ aspectRatio: '16/9' }} />
      ))}
    </div>
  );
  if (!scenes.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {scenes.map((s, i) => {
        const grad = s.template ? (TEMPLATE_GRADIENTS[s.template] ?? 'from-slate-900 to-slate-700') : 'from-slate-900 to-slate-700';
        const active = selectedIndex === i;
        return (
          <button key={i} type="button" onClick={() => onSelect(i)}
            className={`flex-shrink-0 w-28 rounded-xl overflow-hidden border-2 transition-all ${
              active ? 'border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.3)]' : 'border-white/[0.07] hover:border-white/25'
            }`}
          >
            <div className={`w-full bg-gradient-to-br ${grad} relative`} style={{ aspectRatio: '16/9' }}>
              {s.rendered_url && (
                (s.scene_mode === 'dalle' || (!s.scene_mode && s.background_image_url))
                  ? <img src={s.rendered_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  : <video src={s.rendered_url} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[9px] font-bold text-white/60 bg-black/40 px-1.5 py-0.5 rounded">{i + 1}</span>
              </div>
            </div>
            <div className={`px-2 py-1 flex items-center justify-between ${active ? 'bg-blue-500/10' : 'bg-white/[0.02]'}`}>
              <span className={`text-[8px] font-semibold truncate ${active ? 'text-blue-300' : 'text-white/40'}`}>
                {s.headline ? s.headline.slice(0, 10) : `Scene ${i + 1}`}
              </span>
              <span className={`text-[7px] px-1 py-0.5 rounded font-bold flex-shrink-0 ml-1 ${badgeColor(s)}`}>
                {badgeLabel(s)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};

// ─── EDITOR PANEL ─────────────────────────────────────────────────────────────

type EditorTab = 'design' | 'text' | 'audio' | 'settings';

interface EditorPanelProps {
  scene: StudioScene | undefined;
  selectedIndex: number;
  totalScenes: number;
  videoMode: VideoStudioMode;
  setVideoMode: (m: VideoStudioMode) => void;
  updateScene: (i: number, u: Partial<StudioScene>) => void;
  applyToAll: (u: Partial<StudioScene>) => void;
  onRenderScene: (i: number) => void;
  onGeneratePrompt: (i: number) => void;
  generatingPrompt: boolean;
  dialogue: string; setDialogue: (v: string) => void;
  voiceId: VoiceId; setVoiceId: (v: VoiceId) => void;
  bgmId: BgmId; setBgmId: (b: BgmId) => void;
  voiceVolume: number; setVoiceVolume: (v: number) => void;
  bgmVolume: number; setBgmVolume: (v: number) => void;
  showCaptions: boolean; setShowCaptions: (v: boolean) => void;
  captionStyle: 'pill' | 'bar' | 'outline' | 'highlight';
  setCaptionStyle: (v: 'pill' | 'bar' | 'outline' | 'highlight') => void;
  captionFontSize: 'sm' | 'md' | 'lg';
  setCaptionFontSize: (v: 'sm' | 'md' | 'lg') => void;
  targetDuration: 'short' | 'medium' | 'long'; setTargetDuration: (v: 'short' | 'medium' | 'long') => void;
  senderMode: 'personal' | 'company'; setSenderMode: (v: 'personal' | 'company') => void;
  hasScenes: boolean;
  isRendering: boolean;
  isGenerating: boolean;
  onRender: () => void;
  videoUrl: string;
  videoTitle: string;
  socialCaption: string;
  downloadUrl: string;
  filename: string;
  onReset: () => void;
}

const EditorPanel = ({
  scene, selectedIndex, totalScenes, videoMode, setVideoMode,
  updateScene, applyToAll, onRenderScene, onGeneratePrompt, generatingPrompt,
  dialogue, setDialogue,
  voiceId, setVoiceId, bgmId, setBgmId, voiceVolume, setVoiceVolume,
  bgmVolume, setBgmVolume, showCaptions, setShowCaptions,
  captionStyle, setCaptionStyle, captionFontSize, setCaptionFontSize,
  targetDuration, setTargetDuration, senderMode, setSenderMode,
  hasScenes, isRendering, isGenerating, onRender,
  videoUrl, videoTitle, socialCaption, downloadUrl, filename, onReset,
}: EditorPanelProps) => {
  const [tab, setTab] = useState<EditorTab>('design');
  const { playing, toggle, stop } = useAudioPreview();

  const lbl = 'text-[9px] font-bold uppercase tracking-widest text-white/30 mb-1.5 block';
  const input = 'w-full bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-blue-500/30 transition-all placeholder-white/15';

  const tabs: { id: EditorTab; icon: typeof Layers; label: string }[] = [
    { id: 'design',   icon: Layers,    label: 'Design'   },
    { id: 'text',     icon: Type,      label: 'Text'     },
    { id: 'audio',    icon: Mic,       label: 'Audio'    },
    { id: 'settings', icon: Settings,  label: 'Settings' },
  ];

  return (
    <div className="w-[280px] flex-shrink-0 sidebar-glass border-l border-glass-border flex flex-col">
      {/* Tab strip */}
      <div className="flex border-b border-white/[0.06] flex-shrink-0">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[8px] font-bold uppercase tracking-wider transition-all ${
              tab === id
                ? 'text-blue-400 border-b-2 border-blue-500'
                : 'text-white/25 hover:text-white/50 border-b-2 border-transparent'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── DESIGN TAB ── */}
        {tab === 'design' && (
          <div className="p-4 space-y-5">

            {/* Template picker */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={lbl} style={{ marginBottom: 0 }}>Animation Template</label>
                {scene && totalScenes > 1 && (
                  <button type="button"
                    onClick={() => scene.template !== undefined && applyToAll({ template: scene.template })}
                    className="text-[8px] text-blue-400/70 hover:text-blue-400 transition-colors"
                  >Apply to all</button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                {/* No template option */}
                <button type="button"
                  onClick={() => scene && updateScene(selectedIndex, { template: NO_TEMPLATE })}
                  className={`rounded-xl border-2 transition-all overflow-hidden ${
                    scene?.template === NO_TEMPLATE || !scene?.template
                      ? 'border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.25)]'
                      : 'border-white/[0.07] hover:border-white/25'
                  }`}
                >
                  <div className="bg-[#050510] flex flex-col items-center justify-center gap-0.5 py-3 px-2" style={{ aspectRatio: '16/9' }}>
                    <EyeOff className="h-3 w-3 text-white/30" />
                    <span className="text-[7px] text-white/40">No Animation</span>
                  </div>
                  <div className={`py-1 px-1.5 ${scene?.template === NO_TEMPLATE || !scene?.template ? 'bg-blue-500/10' : 'bg-white/[0.02]'}`}>
                    <span className={`text-[8px] ${scene?.template === NO_TEMPLATE || !scene?.template ? 'text-blue-400' : 'text-white/30'}`}>Clean Text</span>
                  </div>
                </button>
                {ALL_TEMPLATES.map(t => {
                  const grad = TEMPLATE_GRADIENTS[t] ?? 'from-slate-900 to-slate-700';
                  const active = scene?.template === t;
                  return (
                    <button key={t} type="button"
                      onClick={() => scene && updateScene(selectedIndex, { template: t })}
                      className={`rounded-xl border-2 transition-all overflow-hidden ${
                        active ? 'border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.25)]' : 'border-white/[0.07] hover:border-white/25'
                      }`}
                    >
                      <div className={`w-full bg-gradient-to-br ${grad} flex items-center justify-center`} style={{ aspectRatio: '16/9' }}>
                        <span className="text-[7px] font-bold text-white/50">{t.replace(/([A-Z])/g, ' $1').trim()}</span>
                      </div>
                      <div className={`py-1 px-1.5 ${active ? 'bg-blue-500/10' : 'bg-white/[0.02]'}`}>
                        <span className={`text-[8px] ${active ? 'text-blue-400' : 'text-white/30'}`}>{t.replace(/([A-Z])/g, ' $1').trim()}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Background source */}
            {scene && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={lbl} style={{ marginBottom: 0 }}>Background</label>
                  {totalScenes > 1 && (
                    <button type="button"
                      onClick={() => scene.scene_mode && applyToAll({ scene_mode: scene.scene_mode })}
                      className="text-[8px] text-blue-400/70 hover:text-blue-400 transition-colors"
                    >Apply to all</button>
                  )}
                </div>
                <div className="space-y-1">
                  {BG_OPTIONS.map(m => {
                    const sceneMode = scene.scene_mode ?? videoMode;
                    const active = sceneMode === m.id || (m.id === 'none' && (sceneMode === 'template' || !sceneMode));
                    return (
                      <button key={m.id} type="button"
                        onClick={() => { updateScene(selectedIndex, { scene_mode: m.id, render_state: 'idle', rendered_url: undefined, background_image_url: undefined, background_video_url: undefined }); }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-left transition-all ${
                          active ? m.bgColor : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px]">{m.icon}</span>
                          <span className={`text-xs font-semibold ${active ? m.color : 'text-white/50'}`}>{m.label}</span>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${active ? `${m.bgColor} ${m.color}` : 'bg-white/[0.04] text-white/25'}`}>{m.tag}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Generate background button */}
                {isAiBg(scene.scene_mode ?? videoMode) && (
                  <button type="button" onClick={() => onRenderScene(selectedIndex)}
                    disabled={scene.render_state === 'rendering'}
                    className={`mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl border text-xs font-semibold transition-all disabled:opacity-50 ${
                      (scene.scene_mode ?? videoMode) === 'dalle'
                        ? 'border-sky-500/25 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20'
                        : 'border-purple-500/25 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'
                    }`}
                  >
                    {scene.render_state === 'rendering'
                      ? <><Loader2 className="h-3 w-3 animate-spin" />Generating…</>
                      : scene.render_state === 'rendered'
                      ? <><RefreshCw className="h-3 w-3" />Regenerate</>
                      : (scene.scene_mode ?? videoMode) === 'dalle'
                      ? <><Image className="h-3 w-3" />Generate Image</>
                      : <><Wand2 className="h-3 w-3" />Generate Video BG</>}
                  </button>
                )}

                {/* Background prompt for AI */}
                {isAiBg(scene.scene_mode ?? videoMode) && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[9px] text-white/30">Prompt</p>
                      <button type="button" onClick={() => onGeneratePrompt(selectedIndex)} disabled={generatingPrompt}
                        className="text-[8px] px-1.5 py-0.5 rounded border border-purple-500/25 bg-purple-500/[0.08] text-purple-400 hover:bg-purple-500/15 disabled:opacity-50 transition-all flex items-center gap-0.5"
                      >
                        {generatingPrompt ? <Loader2 className="h-2 w-2 animate-spin" /> : <Sparkles className="h-2 w-2" />}
                        Auto
                      </button>
                    </div>
                    <textarea value={scene.video_prompt || ''} onChange={e => updateScene(selectedIndex, { video_prompt: e.target.value })} rows={3}
                      placeholder="Describe the background scene…"
                      className="w-full bg-white/[0.04] border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white/70 font-mono resize-none focus:outline-none focus:border-purple-500/40 transition-all placeholder-white/15" />
                  </div>
                )}

                {/* Background opacity */}
                {(isAiBg(scene.scene_mode ?? videoMode) || scene.rendered_url) && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[9px] text-white/30">Background Opacity</p>
                      <span className="text-[9px] text-white/40 tabular-nums">{Math.round((scene.background_opacity ?? 0.85) * 100)}%</span>
                    </div>
                    <input type="range" min="0.1" max="1" step="0.05"
                      value={scene.background_opacity ?? 0.85}
                      onChange={e => updateScene(selectedIndex, { background_opacity: parseFloat(e.target.value) })}
                      className="w-full h-1.5 rounded-full appearance-none bg-white/[0.08] accent-blue-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[8px] text-white/20 mt-1">
                      <span>Subtle</span><span>Full</span>
                    </div>
                  </div>
                )}

                {/* Template overlay opacity */}
                {scene && scene.template !== NO_TEMPLATE && !!scene.template && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[9px] text-white/30">Effects Opacity</p>
                      <span className="text-[9px] text-white/40 tabular-nums">{Math.round((scene.template_opacity ?? 1) * 100)}%</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.05"
                      value={scene.template_opacity ?? 1}
                      onChange={e => updateScene(selectedIndex, { template_opacity: parseFloat(e.target.value) })}
                      className="w-full h-1.5 rounded-full appearance-none bg-white/[0.08] accent-blue-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[8px] text-white/20 mt-1">
                      <span>Off</span><span>Full</span>
                    </div>
                  </div>
                )}

                {/* Accent color */}
                <div className="mt-3">
                  <p className="text-[9px] text-white/30 mb-1.5">Accent Color</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {ACCENT_COLORS.map(c => (
                      <button key={c} type="button"
                        onClick={() => updateScene(selectedIndex, { accent_color: c })}
                        title={c}
                        className={`w-5 h-5 rounded-full transition-all ${
                          scene.accent_color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-[#0a0f1a] scale-110' : 'ring-1 ring-white/10 hover:scale-110'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TEXT TAB ── */}
        {tab === 'text' && (
          <div className="p-4 space-y-4">
            {scene ? (
              <>
                <div>
                  <label className={lbl}>Headline</label>
                  <textarea value={scene.headline || ''} onChange={e => updateScene(selectedIndex, { headline: e.target.value })}
                    rows={2} placeholder="Scene headline…"
                    className="w-full bg-white/[0.03] border border-white/[0.07] rounded-xl px-3 py-2.5 text-sm text-white/80 placeholder-white/20 resize-none focus:outline-none focus:border-blue-500/40 transition-all"
                  />
                </div>
                <div>
                  <label className={lbl}>Subtext</label>
                  <textarea value={scene.subtext || ''} onChange={e => updateScene(selectedIndex, { subtext: e.target.value })}
                    rows={2} placeholder="Supporting line…"
                    className="w-full bg-white/[0.03] border border-white/[0.07] rounded-xl px-3 py-2.5 text-sm text-white/80 placeholder-white/20 resize-none focus:outline-none focus:border-blue-500/40 transition-all"
                  />
                </div>

                {/* Typography */}
                <div className="border-t border-white/[0.05] pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Typography</p>
                    {totalScenes > 1 && (
                      <button type="button"
                        onClick={() => applyToAll({
                          font_family: scene.font_family,
                          font_size: scene.font_size,
                          font_weight: scene.font_weight,
                          font_color: scene.font_color,
                        })}
                        className="text-[8px] text-blue-400/70 hover:text-blue-400 transition-colors"
                      >Apply to all</button>
                    )}
                  </div>

                  {/* Font family */}
                  <div>
                    <p className="text-[9px] text-white/25 mb-1.5">Font</p>
                    <div className="grid grid-cols-5 gap-1">
                      {FONT_FAMILIES.map(f => (
                        <button key={f.id} type="button"
                          onClick={() => updateScene(selectedIndex, { font_family: f.id })}
                          className={`py-1.5 rounded-lg border text-[8px] transition-all ${
                            (scene.font_family ?? 'inter') === f.id
                              ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                              : 'border-white/[0.07] text-white/30 hover:border-white/20'
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
                            className={`flex-1 py-1.5 rounded-lg border text-[8px] font-semibold transition-all ${
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
                            className={`flex-1 py-1.5 rounded-lg border text-[8px] transition-all ${
                              (scene.font_weight ?? 'bold') === w.id
                                ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                                : 'border-white/[0.07] text-white/30 hover:border-white/20'
                            }`}
                            style={{ fontWeight: w.w }}
                          >{w.label}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Font color */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[9px] text-white/25">Text Color</p>
                      <button type="button"
                        onClick={() => updateScene(selectedIndex, { font_color: '#ffffff' })}
                        className="text-[8px] text-white/30 hover:text-white/60 transition-colors flex items-center gap-0.5"
                      >
                        <Zap className="h-2 w-2" /> Auto
                      </button>
                    </div>
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
                  <div className="rounded-xl border border-white/[0.05] bg-black/40 flex items-center justify-center py-4 px-4 min-h-[56px]">
                    <span
                      className={`text-center leading-tight ${FONT_SIZES.find(s => s.id === (scene.font_size ?? 'md'))?.cls ?? 'text-2xl'}`}
                      style={{
                        fontFamily: FONT_FAMILIES.find(f => f.id === (scene.font_family ?? 'inter'))?.style,
                        fontWeight: FONT_WEIGHTS.find(w => w.id === (scene.font_weight ?? 'bold'))?.w,
                        color: scene.font_color ?? '#ffffff',
                      }}
                    >{scene.headline || 'Preview'}</span>
                  </div>
                </div>

                {/* Captions */}
                <div className="border-t border-white/[0.05] pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Captions</p>
                    <button type="button" onClick={() => setShowCaptions(!showCaptions)}
                      className={`relative rounded-full transition-colors flex-shrink-0 ${showCaptions ? 'bg-blue-500/70' : 'bg-white/10'}`}
                      style={{ width: 30, height: 17 }}
                    >
                      <div className={`absolute top-[2px] w-3 h-3 rounded-full bg-white shadow transition-transform ${showCaptions ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
                    </button>
                  </div>
                  {showCaptions && (
                    <>
                      <div>
                        <p className="text-[9px] text-white/25 mb-1.5">Style</p>
                        <div className="grid grid-cols-4 gap-1">
                          {(['pill', 'bar', 'outline', 'highlight'] as const).map(s => (
                            <button key={s} type="button" onClick={() => setCaptionStyle(s)}
                              className={`py-2 rounded-xl border text-[8px] transition-all ${
                                captionStyle === s ? 'border-blue-500/40 bg-blue-500/10 text-blue-400' : 'border-white/[0.07] text-white/30 hover:border-white/20'
                              }`}
                            >{s.charAt(0).toUpperCase() + s.slice(1)}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[9px] text-white/25 mb-1.5">Size</p>
                        <div className="flex gap-1">
                          {(['sm', 'md', 'lg'] as const).map(s => (
                            <button key={s} type="button" onClick={() => setCaptionFontSize(s)}
                              className={`flex-1 py-1.5 rounded-xl border text-[8px] font-semibold transition-all ${
                                captionFontSize === s ? 'border-blue-500/40 bg-blue-500/10 text-blue-400' : 'border-white/[0.07] text-white/30 hover:border-white/20'
                              }`}
                            >{s.toUpperCase()}</button>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/[0.05] bg-black/40 flex items-end justify-center overflow-hidden" style={{ height: 52 }}>
                        <div className={`mb-2 ${captionStyle === 'bar' ? 'w-full px-3 py-1 bg-black/80' : captionStyle === 'pill' ? 'px-3 py-1 rounded-xl bg-black/70' : captionStyle === 'outline' ? 'px-3 py-1 rounded border border-white/40' : 'px-3 py-1 rounded bg-blue-600/80'}`}>
                          <p className={`text-white text-center ${captionFontSize === 'sm' ? 'text-xs' : captionFontSize === 'lg' ? 'text-sm' : 'text-xs'}`}>Sample caption text</p>
                        </div>
                      </div>
                      <p className="text-[9px] text-white/20 leading-relaxed">
                        Captions are Whisper-synced to audio during render. The preview above shows style only.
                      </p>
                    </>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-white/25 text-center py-6">Generate a video to edit text</p>
            )}
          </div>
        )}

        {/* ── AUDIO TAB ── */}
        {tab === 'audio' && (
          <div className="p-4 space-y-5">
            <div>
              <label className={lbl}>Script</label>
              <textarea value={dialogue} onChange={e => setDialogue(e.target.value)} rows={5}
                placeholder="Script will appear here after generating…"
                className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2.5 text-xs text-white/70 font-mono leading-relaxed resize-none focus:outline-none focus:border-blue-500/30 transition-all placeholder-white/15" />
            </div>

            <div>
              <label className={lbl}>Voice</label>
              <div className="grid grid-cols-2 gap-1.5">
                {VOICE_OPTIONS.map(v => {
                  const active = v.id === voiceId;
                  const isP = playing === `v-${v.id}`;
                  return (
                    <button key={v.id || '_auto'} type="button" onClick={() => setVoiceId(v.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${active ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/[0.07] hover:border-white/15'}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="min-w-0 flex-1">
                          <p className={`text-[10px] font-semibold truncate ${active ? 'text-white' : 'text-white/60'}`}>{v.label}</p>
                          {v.accent && <p className={`text-[8px] ${active ? 'text-blue-400/70' : 'text-white/20'}`}>{v.accent}</p>}
                        </div>
                        {v.preview && (
                          <button type="button" onClick={e => { e.stopPropagation(); toggle(`v-${v.id}`, v.preview); }}
                            className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${isP ? 'bg-blue-500 text-white' : 'bg-white/[0.06] text-white/30 hover:bg-blue-500/20'}`}
                          >
                            {isP ? <Pause className="h-2 w-2" /> : <Volume2 className="h-2 w-2" />}
                          </button>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={lbl} style={{ marginBottom: 0 }}>Voice Volume</label>
                <span className="text-[9px] text-white/35">{Math.round(voiceVolume * 100)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <Volume2 className="h-3 w-3 text-white/20 flex-shrink-0" />
                <input type="range" min="0" max="1" step="0.05" value={voiceVolume}
                  onChange={e => setVoiceVolume(parseFloat(e.target.value))}
                  className="flex-1 h-1.5 rounded-full appearance-none bg-white/[0.08] accent-blue-500 cursor-pointer" />
                <Volume2 className="h-4 w-4 text-blue-400/50 flex-shrink-0" />
              </div>
            </div>

            <div>
              <label className={lbl}>Background Music</label>
              <div className="relative mb-2">
                <select value={bgmId} onChange={e => { setBgmId(e.target.value as BgmId); stop(); }}
                  className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-blue-500/30 transition-all appearance-none cursor-pointer"
                >
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
                    {playing === bgmId ? <><Pause className="h-2.5 w-2.5" />Stop</> : <><Play className="h-2.5 w-2.5" />Preview</>}
                  </button>
                ) : null;
              })()}
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[9px] text-white/30">BGM Volume</p>
                  <span className="text-[9px] text-white/35">{Math.round(bgmVolume * 100)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <Music2 className="h-3 w-3 text-white/20 flex-shrink-0" />
                  <input type="range" min="0" max="1" step="0.05" value={bgmVolume}
                    onChange={e => { const v = parseFloat(e.target.value); if (typeof v === 'number') window.dispatchEvent(new CustomEvent('vs2-bgm-vol', { detail: v })); }}
                    className="flex-1 h-1.5 rounded-full appearance-none bg-white/[0.08] accent-blue-500 cursor-pointer"
                  />
                  <Music2 className="h-4 w-4 text-blue-400/50 flex-shrink-0" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === 'settings' && (
          <div className="p-4 space-y-4">
            <div>
              <label className={lbl}>Video Length</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['short', 'medium', 'long'] as const).map(d => (
                  <button key={d} type="button" onClick={() => setTargetDuration(d)}
                    className={`flex flex-col items-center py-2.5 rounded-xl border transition-all ${
                      targetDuration === d ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/[0.07] hover:border-white/15'
                    }`}
                  >
                    <span className={`text-xs font-bold ${targetDuration === d ? 'text-blue-400' : 'text-white/50'}`}>{DURATION_INFO[d].label}</span>
                    <span className="text-[8px] text-white/25 mt-0.5">{DURATION_INFO[d].hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={lbl}>Sender Mode</label>
              <div className="grid grid-cols-2 gap-1.5">
                {([{ id: 'personal' as const, label: 'Personal' }, { id: 'company' as const, label: 'Company' }]).map(({ id, label }) => (
                  <button key={id} type="button" onClick={() => setSenderMode(id)}
                    className={`py-2.5 rounded-xl border text-xs font-medium transition-all ${
                      senderMode === id ? 'border-blue-500/40 bg-blue-500/10 text-blue-400' : 'border-white/[0.07] text-white/40 hover:border-white/15'
                    }`}
                  >{label}</button>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ── Footer: Render + Result actions ── */}
      <div className="flex-shrink-0 border-t border-white/[0.06] p-3 space-y-2">
        {/* Render button */}
        <button type="button" onClick={onRender}
          disabled={!hasScenes || isRendering || isGenerating}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-teal-blue text-white text-sm font-bold hover:opacity-90 transition-all disabled:opacity-30 shadow-glow-teal"
        >
          {isRendering
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Rendering…</span></>
            : <><Wand2 className="h-3.5 w-3.5" /><span>Render Final Video</span></>}
        </button>

        {/* Result actions — shown once video is ready */}
        {videoUrl && (
          <div className="space-y-1.5">
            <div className="flex gap-1.5">
              <a href={downloadUrl} download={filename} target="_blank" rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold transition-all"
              >
                <Download className="h-3 w-3" /><span>Download</span>
              </a>
              <button type="button" onClick={onReset}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/40 hover:text-white/70 hover:bg-white/[0.07] text-xs transition-all"
                title="New Video"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/25 mb-1.5">Publish to</p>
              <div className="space-y-1">
                <PublishActions videoUrl={videoUrl} videoTitle={videoTitle} socialCaption={socialCaption} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── PUBLISH ACTIONS ─────────────────────────────────────────────────────────

type PostStatus = 'idle' | 'loading' | 'success' | 'error';

const PublishActions = ({ videoUrl, videoTitle, socialCaption }: { videoUrl: string; videoTitle: string; socialCaption: string }) => {
  const [status, setStatus] = useState<Record<string, PostStatus>>({});
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  const post = async (id: string, fn: () => Promise<unknown>) => {
    setStatus(s => ({ ...s, [id]: 'loading' }));
    try { await fn(); setStatus(s => ({ ...s, [id]: 'success' })); }
    catch { setStatus(s => ({ ...s, [id]: 'error' })); }
  };

  const handleEmail = async () => {
    if (!emailTo) return;
    setEmailSending(true);
    try { await sendVideoEmail({ video_url: videoUrl, recipient_email: emailTo, company_name: videoTitle || 'Video', subject: `Your video: ${videoTitle}` }); setEmailOpen(false); setEmailTo(''); }
    catch { /* ignore */ }
    setEmailSending(false);
  };

  const platforms = [
    { id: 'linkedin',  label: 'LinkedIn',  Icon: Linkedin,  fn: () => postToLinkedIn(videoUrl, socialCaption, videoTitle) },
    { id: 'facebook',  label: 'Facebook',  Icon: Facebook,  fn: () => postToFacebook(videoUrl, socialCaption) },
    { id: 'instagram', label: 'Instagram', Icon: Instagram, fn: () => postToInstagram(videoUrl, socialCaption, 'reel') },
    { id: 'youtube',   label: 'YouTube',   Icon: Youtube,   fn: () => postToYouTube(videoUrl, videoTitle, socialCaption) },
  ] as const;

  return (
    <>
      {platforms.map(({ id, label, Icon, fn }) => {
        const st = status[id] ?? 'idle';
        return (
          <button key={id} type="button" onClick={() => post(id, fn)} disabled={st === 'loading' || st === 'success'}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
              st === 'success' ? 'border-emerald-500/25 bg-emerald-500/8 text-emerald-400' :
              st === 'error'   ? 'border-red-500/25 bg-red-500/8 text-red-400' :
              'border-white/[0.07] bg-white/[0.02] text-white/60 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2"><Icon className="h-3.5 w-3.5" /><span>{label}</span></div>
            {st === 'loading' && <Loader2 className="h-3 w-3 animate-spin" />}
            {st === 'success' && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
            {st === 'error'   && <span className="text-[9px] text-red-400">Failed</span>}
          </button>
        );
      })}
      <button type="button" onClick={() => navigator.clipboard.writeText(videoUrl).catch(() => {})}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] text-white/50 hover:bg-white/[0.06] text-xs font-semibold transition-all"
      >
        <Copy className="h-3.5 w-3.5" /><span>Copy Link</span>
      </button>
      <button type="button" onClick={() => setEmailOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] text-white/55 hover:bg-white/[0.06] text-xs transition-all"
      >
        <Mail className="h-3.5 w-3.5" /><span>Email</span>
      </button>
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
              <div className="flex gap-2">
                <button type="button" onClick={() => setEmailOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/[0.07] text-white/40 text-xs"
                >Cancel</button>
                <button type="button" onClick={handleEmail} disabled={emailSending || !emailTo}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-teal-blue text-white text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
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

// ─── RENDER MODAL ─────────────────────────────────────────────────────────────

const RenderModal = ({ isRendering, videoUrl, renderProgress, onCancel, onClose }: {
  isRendering: boolean; videoUrl: string;
  renderProgress: { percent: number; stage: string; detail: string } | null;
  onCancel: () => void; onClose: () => void;
}) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    onClick={e => { if (e.target === e.currentTarget && !isRendering) onClose(); }}
  >
    <motion.div initial={{ scale: 0.93, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93, y: 12 }}
      transition={{ duration: 0.2 }}
      className="relative w-full max-w-sm glass-card overflow-hidden"
    >
      {!isRendering && videoUrl && (
        <button type="button" onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-xl text-white/30 hover:text-white/60 hover:bg-white/[0.06] z-10">
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
            <p className="text-base font-bold text-white">Video ready!</p>
          </motion.div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="relative">
                <div className="w-14 h-14 rounded-full bg-blue-500/[0.08] border border-blue-500/20 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
                </div>
                <motion.div className="absolute inset-0 rounded-full border-2 border-blue-500/15"
                  animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }} transition={{ duration: 2.5, repeat: Infinity }} />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-white">Rendering your video</p>
                <p className="text-xs text-white/30 mt-0.5">Keep this tab open</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-white/50">{renderProgress?.stage ?? 'Starting…'}</span>
                <span className="text-xs font-bold text-blue-400 tabular-nums">{renderProgress?.percent ?? 0}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div className="h-full rounded-full bg-gradient-teal-blue"
                  initial={{ width: '0%' }} animate={{ width: `${renderProgress?.percent ?? 0}%` }} transition={{ duration: 0.5 }} />
              </div>
              {renderProgress?.detail && <p className="text-[10px] text-white/25">{renderProgress.detail}</p>}
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

// ─── RESULT VIEW ──────────────────────────────────────────────────────────────

const ResultView = ({ videoUrl, videoTitle, socialCaption, onExit }: {
  videoUrl: string; videoTitle: string; socialCaption: string; onExit: () => void;
}) => {
  const filename = `${(videoTitle || 'video').replaceAll(/\s+/g, '_')}_video.mp4`;
  const downloadUrl = getProxyDownloadUrl(videoUrl, filename);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex overflow-hidden bg-dark-bg-light/10">
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
                <p className="text-sm font-bold text-white">{videoTitle || 'Video Ready'}</p>
                <p className="text-[10px] text-emerald-400/60 mt-0.5">Rendered successfully</p>
              </div>
            </div>
            <button type="button" onClick={onExit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/[0.07] text-xs text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all"
            >
              <RotateCcw className="h-3 w-3" /> Back to editor
            </button>
          </div>
          <div className="relative w-full rounded-2xl overflow-hidden bg-black ring-1 ring-white/[0.08] shadow-[0_40px_100px_rgba(0,0,0,0.7)]"
            style={{ paddingTop: '56.25%' }}
          >
            <video key={videoUrl} controls autoPlay preload="auto" src={videoUrl}
              className="absolute inset-0 w-full h-full object-contain"
            >
              <track kind="captions" />
            </video>
          </div>
          {socialCaption && (
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
              <p className="text-xs text-white/50 leading-relaxed">{socialCaption}</p>
            </div>
          )}
        </motion.div>
      </div>

      <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 }}
        className="w-60 flex-shrink-0 bg-dark-bg-light/50 backdrop-blur-2xl border-l border-glass-border flex flex-col p-5 gap-4 overflow-y-auto"
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3">Export</p>
          <a href={downloadUrl} download={filename} target="_blank" rel="noreferrer"
            className="flex items-center gap-2.5 w-full px-4 py-3 rounded-xl border border-emerald-500/25 bg-emerald-500/8 text-emerald-400 hover:bg-emerald-500/15 text-xs font-semibold transition-all"
          >
            <Download className="h-4 w-4" /><span>Download MP4</span>
          </a>
        </div>
        <div className="h-px bg-white/[0.05]" />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3">Publish</p>
          <div className="space-y-2">
            <PublishActions videoUrl={videoUrl} videoTitle={videoTitle} socialCaption={socialCaption} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── MAIN VideoStudio2 ────────────────────────────────────────────────────────

const VideoStudio2 = () => {
  const state = useVideoStudioState();
  const [configOpen, setConfigOpen] = useState(false);
  const [pendingGen, setPendingGen] = useState(false);

  const voiceRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Caption rolling window capped at 8 words
  const currentSubtitle = useMemo(() => {
    if (!state.showCaptions) return '';
    const segs = (
      state.analyzeResult?.caption_segments?.length
        ? state.analyzeResult.caption_segments
        : state.analyzeResult?.subtitle_segments
    ) ?? [];
    if (!segs.length) return '';
    const t = state.playheadTime;
    const match = segs.find(s => {
      const st = typeof s.start === 'number' ? s.start : null;
      const en = typeof s.end === 'number' ? s.end : null;
      if (st === null || en === null || en <= st) return false;
      return t >= st && t < en;
    });
    if (!match) return '';
    const text = ((match.text as string) ?? '').trim();
    if (!text) return '';
    const segDur = Math.max(0.1, (match.end as number) - (match.start as number));
    const words = text.split(/\s+/);
    const maxW = Math.min(8, Math.max(4, Math.round(segDur * 2.5)));
    if (words.length <= maxW) return text;
    const stride = Math.max(1, Math.floor(maxW / 2));
    const numWin = Math.ceil((words.length - maxW) / stride) + 1;
    const winInterval = segDur / numWin;
    const elapsed = Math.max(0, t - (match.start as number));
    const winIdx = Math.min(numWin - 1, Math.floor(elapsed / winInterval));
    const startW = Math.min(winIdx * stride, words.length - maxW);
    return words.slice(startW, startW + maxW).join(' ');
  }, [state.playheadTime, state.showCaptions, state.analyzeResult?.caption_segments, state.analyzeResult?.subtitle_segments]);

  // Show placeholder when not playing
  const captionToShow = useMemo(() => {
    if (!state.showCaptions || !state.editedScenes.length) return '';
    if (!state.isPlaying) {
      return state.analyzeResult?.caption_segments?.length || state.analyzeResult?.subtitle_segments?.length
        ? 'This is how captions will look'
        : '';
    }
    return currentSubtitle;
  }, [state.showCaptions, state.editedScenes.length, state.isPlaying, state.analyzeResult, currentSubtitle]);

  // Voice audio for preview playback
  useEffect(() => {
    voiceRef.current?.pause();
    if (state.analyzeResult?.voiceover_url) {
      const a = new Audio(state.analyzeResult.voiceover_url);
      a.volume = state.voiceVolume;
      voiceRef.current = a;
    } else {
      voiceRef.current = null;
    }
  }, [state.analyzeResult?.voiceover_url]); // eslint-disable-line

  useEffect(() => {
    if (voiceRef.current) voiceRef.current.volume = state.voiceVolume;
  }, [state.voiceVolume]);

  useEffect(() => () => { intervalRef.current && clearInterval(intervalRef.current); voiceRef.current?.pause(); }, []);

  const totalDuration = (state.analyzeResult?.voiceover_duration_seconds ?? 0) > 0
    ? state.analyzeResult!.voiceover_duration_seconds : 20;

  const scenesRef = useRef(state.editedScenes);
  const durRef = useRef(totalDuration);
  useEffect(() => { scenesRef.current = state.editedScenes; }, [state.editedScenes]);
  useEffect(() => { durRef.current = totalDuration; }, [totalDuration]);

  const handlePlayPause = useCallback(() => {
    if (state.isPlaying) {
      voiceRef.current?.pause();
      if (intervalRef.current) clearInterval(intervalRef.current);
      state.setIsPlaying(false);
    } else {
      if (voiceRef.current) { voiceRef.current.currentTime = state.playheadTime; voiceRef.current.play().catch(() => {}); }
      state.setIsPlaying(true);
      const startMs = Date.now() - state.playheadTime * 1000;
      intervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - startMs) / 1000;
        const dur = durRef.current;
        if (elapsed >= dur) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          state.setPlayheadTime(0); state.setIsPlaying(false);
          voiceRef.current?.pause();
          if (voiceRef.current) voiceRef.current.currentTime = 0;
          return;
        }
        state.setPlayheadTime(elapsed);
        const scenes = scenesRef.current;
        let cum = 0;
        for (let i = 0; i < scenes.length; i++) {
          const s = scenes[i];
          cum += (s.end != null && s.start != null) ? (s.end - s.start) : dur / scenes.length;
          if (elapsed < cum) { state.setSelectedSceneIndex(i); break; }
        }
      }, 100);
    }
  }, [state.isPlaying, state.playheadTime]); // eslint-disable-line

  // Apply a partial update to ALL scenes
  const applyToAll = useCallback((updates: Partial<StudioScene>) => {
    state.editedScenes.forEach((_, i) => state.updateScene(i, updates));
  }, [state.editedScenes, state.updateScene]);

  const handleGenerateWithConfig = () => { if (pendingGen) { state.handleGenerate(); setPendingGen(false); } };
  const handleExitResult = useCallback(() => state.setShowResult(false), [state]);

  const hasScenes = state.editedScenes.length > 0;
  const filename = `${(state.videoTitle || 'video').replaceAll(/\s+/g, '_')}_video.mp4`;
  const downloadUrl = state.videoUrl ? getProxyDownloadUrl(state.videoUrl, filename) : '';

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 73px)' }}>

      {/* Error strip */}
      <AnimatePresence>
        {state.error && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="flex-shrink-0 flex items-center gap-2.5 px-5 py-2 bg-red-500/[0.06] border-b border-red-500/15"
          >
            <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
            <span className="text-xs text-red-400/90 flex-1">{state.error.message}</span>
            {state.error.retryable && state.error.onRetry && (
              <button onClick={state.error.onRetry} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300">
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            )}
            <button onClick={() => state.setError(null)} className="text-white/20 hover:text-white/50 ml-1">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BODY ── */}
      <AnimatePresence mode="wait">
        {state.showResult && state.fullVideoUrl ? (
          <ResultView key="result"
            videoUrl={state.fullVideoUrl} videoTitle={state.videoTitle}
            socialCaption={state.socialCaption} onExit={handleExitResult}
          />
        ) : (
          <motion.div key="editor" initial={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-1 overflow-hidden"
          >
            {/* Center col: Canvas + Prompt bar + Scene strip */}
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* Canvas */}
              <SceneCanvas
                scene={state.editedScenes[state.selectedSceneIndex]}
                isGenerating={state.isGenerating}
                generatingStatus={state.generatingStatus}
                captionText={captionToShow}
                showCaptions={state.showCaptions}
                captionStyle={state.captionStyle}
                captionFontSize={state.captionFontSize}
                videoMode={state.videoMode}
                selectedIndex={state.selectedSceneIndex}
                totalScenes={state.editedScenes.length}
                onPrev={() => state.setSelectedSceneIndex(Math.max(0, state.selectedSceneIndex - 1))}
                onNext={() => state.setSelectedSceneIndex(Math.min(state.editedScenes.length - 1, state.selectedSceneIndex + 1))}
                onOpenConfig={() => { setPendingGen(true); setConfigOpen(true); }}
                updateScene={state.updateScene}
                onRenderScene={state.handleRenderScene}
              />

              {/* Timeline */}
              <Timeline
                scenes={state.editedScenes}
                totalDuration={totalDuration}
                playheadTime={state.playheadTime}
                isPlaying={state.isPlaying}
                selectedIndex={state.selectedSceneIndex}
                onSeek={t => { state.setPlayheadTime(t); if (voiceRef.current) voiceRef.current.currentTime = t; }}
                onSelectScene={state.setSelectedSceneIndex}
                onPlayPause={handlePlayPause}
              />

              {/* Scene strip (below canvas) */}
              {(hasScenes || state.isGenerating) && (
                <div className="flex-shrink-0 px-5 pt-2.5 pb-3 bg-dark-bg-light/30 backdrop-blur-xl border-t border-white/[0.05]">
                  {hasScenes && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Scenes</span>
                      <span className="text-[10px] text-white/20">{state.editedScenes.length}</span>
                    </div>
                  )}
                  <SceneStrip
                    scenes={state.editedScenes}
                    selectedIndex={state.selectedSceneIndex}
                    onSelect={state.setSelectedSceneIndex}
                    isGenerating={state.isGenerating}
                    videoMode={state.videoMode}
                  />
                </div>
              )}
            </div>

            {/* Right: Editor Panel */}
            <EditorPanel
              scene={state.editedScenes[state.selectedSceneIndex]}
              selectedIndex={state.selectedSceneIndex}
              totalScenes={state.editedScenes.length}
              videoMode={state.videoMode}
              setVideoMode={state.setVideoMode}
              updateScene={state.updateScene}
              applyToAll={applyToAll}
              onRenderScene={state.handleRenderScene}
              onGeneratePrompt={state.handleGeneratePrompt}
              generatingPrompt={state.generatingPrompt}
              hasScenes={hasScenes}
              isRendering={state.isRendering}
              isGenerating={state.isGenerating}
              onRender={state.handleRender}
              videoUrl={state.videoUrl}
              videoTitle={state.videoTitle}
              socialCaption={state.socialCaption}
              downloadUrl={downloadUrl}
              filename={filename}
              onReset={state.reset}
              dialogue={state.dialogue}
              setDialogue={state.setDialogue}
              voiceId={state.voiceId}
              setVoiceId={state.setVoiceId}
              bgmId={state.bgmId}
              setBgmId={state.setBgmId}
              voiceVolume={state.voiceVolume}
              setVoiceVolume={state.setVoiceVolume}
              bgmVolume={state.bgmVolume}
              setBgmVolume={state.setBgmVolume}
              showCaptions={state.showCaptions}
              setShowCaptions={state.setShowCaptions}
              captionStyle={state.captionStyle}
              setCaptionStyle={state.setCaptionStyle}
              captionFontSize={state.captionFontSize}
              setCaptionFontSize={state.setCaptionFontSize}
              targetDuration={state.targetDuration}
              setTargetDuration={state.setTargetDuration}
              senderMode={state.senderMode}
              setSenderMode={state.setSenderMode}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Render modal */}
      <AnimatePresence>
        {state.showRenderModal && (
          <RenderModal
            isRendering={state.isRendering}
            videoUrl={state.videoUrl}
            renderProgress={state.renderProgress}
            onCancel={state.cancelRender}
            onClose={() => state.setShowRenderModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Config popup */}
      <VideoStudioConfigPopup
        isOpen={configOpen}
        onClose={() => { setConfigOpen(false); setPendingGen(false); }}
        onGenerate={pendingGen ? handleGenerateWithConfig : undefined}
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

export default VideoStudio2;
