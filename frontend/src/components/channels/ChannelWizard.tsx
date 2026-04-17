import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Loader2, Play } from 'lucide-react';
import { getAuthHeaders } from '../../utils/getAuthToken';
import { API_BASE_URL } from '../../config/api';

const PLATFORMS = ['youtube', 'instagram', 'tiktok'] as const;
type Platform = typeof PLATFORMS[number];
const FREQUENCIES = ['daily', '3x_week', 'weekly'] as const;
const FREQ_LABEL: Record<string, string> = { daily: 'Daily', '3x_week': '3× / week', weekly: 'Weekly' };
const PLATFORM_EMOJI: Record<string, string> = { youtube: '📺', instagram: '📸', tiktok: '🎵' };

interface TrendingTopic { title: string; url: string; source: string; published_at: string; }
interface Voice { voice_id: string; name: string; description: string; preview_url: string; }

interface ChannelWizardProps {
  onCreated: (channelId: string) => void;
  onCancel: () => void;
}

export default function ChannelWizard({ onCreated, onCancel }: ChannelWizardProps) {
  const [step, setStep] = useState(1);

  // Step 1
  const [name, setName] = useState('');
  const [niche, setNiche] = useState('');
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);

  // Step 2
  const [platform, setPlatform] = useState<Platform>('youtube');
  const [frequency, setFrequency] = useState('weekly');

  // Step 3
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [playingVoiceId, setPlayingVoiceId] = useState('');

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  // Fetch trending topics on mount (Step 1 chips)
  useEffect(() => {
    fetch(`${API_BASE_URL}/channels/trending-suggestions`)
      .then(r => r.json())
      .then(d => setTrendingTopics(d.topics || []))
      .catch(() => {});
  }, []);

  // Fetch voices when user reaches Step 3
  useEffect(() => {
    if (step !== 3) return;
    getAuthHeaders().then(headers =>
      fetch(`${API_BASE_URL}/content/voice-previews`, { headers })
        .then(r => r.json())
        .then(d => {
          const list: Voice[] = d.voices || [];
          setVoices(list);
          if (list.length > 0) setSelectedVoiceId(prev => prev || list[0].voice_id);
        })
        .catch(() => {})
    );
  }, [step]);

  const playPreview = (voice: Voice) => {
    audioRef.current?.pause();
    const audio = new Audio(voice.preview_url);
    audioRef.current = audio;
    setPlayingVoiceId(voice.voice_id);
    audio.play().catch(() => setPlayingVoiceId(''));
    audio.onended = () => {
      if (audioRef.current === audio) audioRef.current = null;
      setPlayingVoiceId('');
    };
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Channel name is required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const json = (method: string, url: string, body: object) =>
        fetch(url, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

      // 1. Create channel
      const channelRes = await json('POST', `${API_BASE_URL}/channels/`, {
        name: name.trim(), platform, niche: niche.trim() || undefined, posting_frequency: frequency,
      });
      if (!channelRes.ok) throw new Error('Failed to create channel');
      const channel = await channelRes.json();

      // 2. Save voice to model_config
      if (selectedVoiceId) {
        await json('POST', `${API_BASE_URL}/model-config/`, {
          channel_id: channel.id, voice_provider: 'elevenlabs', voice_id: selectedVoiceId,
        }).catch(e => console.error('model-config save failed:', e)); // non-fatal
      }

      // 3. Mark setup complete
      await json('PUT', `${API_BASE_URL}/channels/${channel.id}`, { setup_complete: true })
        .catch(e => console.error('setup_complete update failed:', e)); // non-fatal

      onCreated(channel.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create channel');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500/50 placeholder:text-white/30';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2 }}
        className="bg-[#0d1117] border border-white/[0.08] rounded-2xl p-6 w-full max-w-lg"
      >
        {/* Progress bar */}
        <div className="flex gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className={`flex-1 h-1 rounded-full transition-all duration-300 ${s <= step ? 'bg-teal-500' : 'bg-white/10'}`} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Step 1 of 3</p>
              <h3 className="text-lg font-semibold text-white mb-1">Name your channel</h3>
              <p className="text-sm text-white/40 mb-5">What is this channel going to be about?</p>
              <div className="space-y-4">
                <input className={inputClass} placeholder="e.g. Mindful Money" value={name} onChange={e => setName(e.target.value)} />
                <input className={inputClass} placeholder="Niche / topic (e.g. Personal Finance for Millennials)" value={niche} onChange={e => setNiche(e.target.value)} />
                {trendingTopics.length > 0 && (
                  <div>
                    <p className="text-xs text-amber-400/80 flex items-center gap-1.5 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                      Trending right now — click to use as niche
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {trendingTopics.slice(0, 5).map((t, i) => (
                        <button key={i} onClick={() => setNiche(t.title)}
                          className="px-3 py-1 rounded-full text-xs border border-amber-400/20 bg-amber-400/5 text-amber-300/80 hover:border-amber-400/40 transition-all">
                          {t.title.length > 40 ? t.title.slice(0, 40) + '…' : t.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Step 2 of 3</p>
              <h3 className="text-lg font-semibold text-white mb-1">Platform & frequency</h3>
              <p className="text-sm text-white/40 mb-5">Where will this channel post, and how often?</p>
              <div className="space-y-3 mb-5">
                {PLATFORMS.map(p => (
                  <button key={p} onClick={() => setPlatform(p)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${platform === p ? 'border-teal-500/60 bg-teal-500/10' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]'}`}>
                    <span className="text-xl">{PLATFORM_EMOJI[p]}</span>
                    <span className={`text-sm font-medium capitalize ${platform === p ? 'text-white' : 'text-white/50'}`}>{p}</span>
                    {platform === p && <span className="ml-auto w-4 h-4 rounded-full bg-teal-500 flex items-center justify-center text-[10px]">✓</span>}
                  </button>
                ))}
              </div>
              <p className="text-xs text-white/40 mb-2">Posting frequency</p>
              <div className="flex gap-2">
                {FREQUENCIES.map(f => (
                  <button key={f} onClick={() => setFrequency(f)}
                    className={`flex-1 py-2 rounded-lg text-xs border transition-all ${frequency === f ? 'border-teal-500/60 bg-teal-500/10 text-white' : 'border-white/[0.07] text-white/40 hover:border-white/[0.14]'}`}>
                    {FREQ_LABEL[f]}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Step 3 of 3</p>
              <h3 className="text-lg font-semibold text-white mb-1">Pick your voice</h3>
              <p className="text-sm text-white/40 mb-5">This voice narrates every video on this channel.</p>
              {voices.length === 0 ? (
                <div className="flex items-center gap-2 text-white/40 text-sm py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading voices…
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {voices.map(v => (
                    <div
                      key={v.voice_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedVoiceId(v.voice_id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedVoiceId(v.voice_id); } }}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${selectedVoiceId === v.voice_id ? 'border-teal-500/60 bg-teal-500/10' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]'}`}
                    >
                      <span className="text-lg shrink-0">🎙️</span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${selectedVoiceId === v.voice_id ? 'text-white' : 'text-white/60'}`}>{v.name}</div>
                        <div className="text-xs text-white/30 truncate">{v.description}</div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); playPreview(v); }}
                        className="shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-all">
                        <Play className={`h-3 w-3 ${playingVoiceId === v.voice_id ? 'text-teal-400' : ''}`} />
                        {playingVoiceId === v.voice_id ? 'Playing' : 'Play'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex gap-3 mt-6">
          <button onClick={step === 1 ? onCancel : () => setStep(s => s - 1)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/[0.07] text-sm text-white/50 hover:text-white/80 hover:border-white/[0.14] transition-all">
            {step === 1 ? 'Cancel' : <><ChevronLeft className="h-4 w-4" /> Back</>}
          </button>
          <button
            disabled={(step === 1 && !name.trim()) || (step === 3 && submitting)}
            onClick={() => { if (step < 3) setStep(s => s + 1); else handleSubmit(); }}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-400 py-2.5 text-sm font-medium text-black hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed">
            {step === 3 && submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : step === 3 ? 'Create Channel' : 'Continue →'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
