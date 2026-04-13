import { useState, useEffect } from 'react';
import { Sparkles, Copy, Check, ExternalLink, ChevronRight, Film, Monitor, Palette,
         Zap, Swords, LayoutGrid, ShoppingBag, Star, RotateCcw, Music,
         Smartphone, Trophy, Shirt, UtensilsCrossed, Home, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import { getAuthHeaders } from '../utils/getAuthToken';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Style {
  id: string;
  name: string;
  emoji: string;
  description: string;
  tags: string[];
}

const PLATFORM_OPTIONS = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'shorts', label: 'YouTube Shorts' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'reels', label: 'Instagram Reels' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'linkedin', label: 'LinkedIn' },
];

// Map style id → lucide icon (fallback to Film)
const STYLE_ICONS: Record<string, React.ElementType> = {
  'cinematic':        Film,
  '3d-cgi':           Monitor,
  'cartoon':          Palette,
  'comic-to-video':   Zap,
  'fight-scenes':     Swords,
  'motion-design-ad': LayoutGrid,
  'ecommerce-ad':     ShoppingBag,
  'anime-action':     Star,
  'product-360':      RotateCcw,
  'music-video':      Music,
  'social-hook':      Smartphone,
  'brand-story':      Trophy,
  'fashion-lookbook': Shirt,
  'food-beverage':    UtensilsCrossed,
  'real-estate':      Home,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SeedanceStudio() {
  const [styles, setStyles] = useState<Style[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [concept, setConcept] = useState('');
  const [platform, setPlatform] = useState('youtube');
  const [duration, setDuration] = useState(10);
  const [channelName, setChannelName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [generatedStyle, setGeneratedStyle] = useState<{ name: string; emoji: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingStyles, setLoadingStyles] = useState(true);

  // Fetch style catalogue on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/seedance/styles`)
      .then(r => r.json())
      .then(data => setStyles(data.styles ?? []))
      .catch(() => setError('Failed to load styles — is the backend running?'))
      .finally(() => setLoadingStyles(false));
  }, []);

  const canGenerate = selectedStyle && concept.trim().length >= 10 && !generating;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    setError(null);
    setGeneratedPrompt(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/seedance/generate-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          style_id: selectedStyle,
          concept: concept.trim(),
          platform,
          duration_seconds: duration,
          channel_name: channelName.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? `Error ${res.status}`);
      }

      const data = await res.json();
      setGeneratedPrompt(data.prompt);
      setGeneratedStyle({ name: data.style_name, emoji: data.style_emoji });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generation failed — please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedPrompt) return;
    await navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleReset = () => {
    setGeneratedPrompt(null);
    setGeneratedStyle(null);
    setError(null);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-dark-bg px-6 py-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Seedance Studio</h1>
          <span className="text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded-full font-medium">
            Powered by Higgsfield
          </span>
        </div>
        <p className="text-dark-text-muted text-sm">
          Generate professional AI video prompts for{' '}
          <a
            href="https://higgsfield.ai/create/video?model=seedance_2_0"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 hover:text-violet-300 inline-flex items-center gap-0.5"
          >
            Higgsfield Seedance 2.0 <ExternalLink className="w-3 h-3" />
          </a>
        </p>
      </div>

      {/* Result view */}
      {generatedPrompt && generatedStyle ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{generatedStyle.emoji}</span>
              <span className="text-white font-semibold">{generatedStyle.name} Prompt</span>
              <span className="text-xs text-dark-text-muted">ready to paste into Higgsfield</span>
            </div>
            <button
              onClick={handleReset}
              className="text-sm text-dark-text-muted hover:text-white transition-colors flex items-center gap-1"
            >
              <ChevronRight className="w-4 h-4 rotate-180" /> New prompt
            </button>
          </div>

          <div className="relative rounded-xl border border-glass-border bg-glass-white/5 p-5">
            <pre className="text-sm text-gray-200 whitespace-pre-wrap font-mono leading-relaxed overflow-auto max-h-[60vh]">
              {generatedPrompt}
            </pre>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={handleCopy}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 ${
                copied
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-violet-600 hover:bg-violet-500 text-white'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy prompt'}
            </button>

            <a
              href="https://higgsfield.ai/create/video?model=seedance_2_0"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm bg-glass-white/10 hover:bg-glass-white/20 text-white border border-glass-border transition-all duration-200"
            >
              Open Higgsfield <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          <p className="text-xs text-dark-text-muted">
            Tip: Paste the prompt into Higgsfield, optionally attach reference images/videos, then generate your video.
          </p>
        </div>
      ) : (
        /* Builder view */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Style picker */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-sm font-semibold text-dark-text-muted uppercase tracking-wider">
              1. Choose a video style
            </h2>

            {loadingStyles ? (
              <div className="flex items-center gap-2 text-dark-text-muted text-sm py-8">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading styles…
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {styles.map(style => {
                  const Icon = STYLE_ICONS[style.id] ?? Film;
                  const active = selectedStyle === style.id;
                  return (
                    <button
                      key={style.id}
                      onClick={() => setSelectedStyle(active ? null : style.id)}
                      className={`
                        p-4 rounded-xl border text-left transition-all duration-200 group
                        ${active
                          ? 'border-violet-500 bg-violet-500/15 shadow-[0_0_20px_rgba(139,92,246,0.25)]'
                          : 'border-glass-border bg-glass-white/5 hover:border-violet-500/50 hover:bg-violet-500/8'
                        }
                      `}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-lg">{style.emoji}</span>
                        <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-violet-400' : 'text-dark-text-muted group-hover:text-violet-400'} transition-colors`} />
                      </div>
                      <p className={`text-sm font-semibold ${active ? 'text-white' : 'text-gray-300'}`}>
                        {style.name}
                      </p>
                      <p className="text-xs text-dark-text-muted mt-0.5 leading-snug line-clamp-2">
                        {style.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Options + generate */}
          <div className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-dark-text-muted uppercase tracking-wider mb-3">
                2. Describe your concept
              </h2>
              <textarea
                value={concept}
                onChange={e => setConcept(e.target.value)}
                placeholder="Describe what you want the video to show, communicate, or make people feel. Include your product, topic, mood, or story..."
                rows={5}
                className="w-full bg-glass-white/5 border border-glass-border rounded-xl px-4 py-3 text-sm text-white placeholder-dark-text-muted resize-none focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/30 transition-all"
              />
              <p className="text-xs text-dark-text-muted mt-1">{concept.length}/2000 chars (min 10)</p>
            </div>

            <div>
              <label className="text-sm font-semibold text-dark-text-muted uppercase tracking-wider block mb-2">
                Platform
              </label>
              <select
                value={platform}
                onChange={e => setPlatform(e.target.value)}
                className="w-full bg-glass-white/5 border border-glass-border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/60 transition-all appearance-none"
              >
                {PLATFORM_OPTIONS.map(p => (
                  <option key={p.id} value={p.id} className="bg-dark-bg">
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold text-dark-text-muted uppercase tracking-wider block mb-2">
                Duration — {duration}s
              </label>
              <input
                type="range"
                min={4}
                max={15}
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
              <div className="flex justify-between text-xs text-dark-text-muted mt-1">
                <span>4s</span><span>15s</span>
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-dark-text-muted uppercase tracking-wider block mb-2">
                Channel / Brand name <span className="font-normal text-xs normal-case">(optional)</span>
              </label>
              <input
                type="text"
                value={channelName}
                onChange={e => setChannelName(e.target.value)}
                placeholder="e.g. TechFlow AI, The Minimalist Cook"
                maxLength={100}
                className="w-full bg-glass-white/5 border border-glass-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-dark-text-muted focus:outline-none focus:border-violet-500/60 transition-all"
              />
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={`
                w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-sm transition-all duration-200
                ${canGenerate
                  ? 'bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white shadow-lg hover:shadow-violet-500/25'
                  : 'bg-glass-white/10 text-dark-text-muted cursor-not-allowed'
                }
              `}
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating prompt…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Seedance Prompt
                </>
              )}
            </button>

            {!selectedStyle && (
              <p className="text-xs text-dark-text-muted text-center">
                Select a style above to get started
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
