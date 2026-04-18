import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { Play, Pause, Sparkles, Wand2, Rocket, Video } from 'lucide-react';
import { VOICE_OPTIONS } from '../campaign/campaignConstants';

const FEATURED_VOICES = [
  VOICE_OPTIONS.find((v) => v.label === 'Adam')!,
  VOICE_OPTIONS.find((v) => v.label === 'Sarah')!,
];

const SAMPLE_CLIPS = [
  { title: 'Cinematic Reveal', accent: '#06b6d4', src: '/sample-videos/cinematic.mp4', poster: '' },
  { title: 'Neon Pulse',       accent: '#a855f7', src: '/sample-videos/neon.mp4',      poster: '' },
  { title: 'Word Burst',       accent: '#10b981', src: '/sample-videos/burst.mp4',     poster: '' },
];

const HOW_STEPS = [
  { icon: Wand2,   label: 'Pick your niche',   desc: 'Finance, fitness, AI news — we handle the rest',   accent: '#06b6d4' },
  { icon: Sparkles, label: 'Choose a voice',    desc: 'Studio-grade AI voiceover, cartoon or avatar',      accent: '#a855f7' },
  { icon: Rocket,   label: 'Auto-post daily',   desc: 'Your channel grows while you sleep',                accent: '#ec4899' },
];

function FloatingParticles() {
  const particles = Array.from({ length: 18 });
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((_, i) => {
        const size = 2 + Math.random() * 4;
        const left = Math.random() * 100;
        const delay = Math.random() * 8;
        const duration = 10 + Math.random() * 12;
        return (
          <motion.span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${left}%`,
              bottom: '-10px',
              width: size,
              height: size,
              background: ['#06b6d4', '#a855f7', '#ec4899', '#10b981'][i % 4],
              boxShadow: '0 0 12px currentColor',
              opacity: 0.6,
            }}
            animate={{ y: [-20, -600], opacity: [0, 0.8, 0] }}
            transition={{ duration, delay, repeat: Infinity, ease: 'linear' }}
          />
        );
      })}
    </div>
  );
}

function Waveform({ playing, accent }: { playing: boolean; accent: string }) {
  const bars = Array.from({ length: 18 });
  return (
    <div className="flex items-center gap-[3px] h-6">
      {bars.map((_, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full"
          style={{ background: accent }}
          animate={playing ? { height: [4, 18 + Math.random() * 6, 4] } : { height: 4 }}
          transition={{ duration: 0.6 + Math.random() * 0.3, repeat: playing ? Infinity : 0, delay: i * 0.04 }}
        />
      ))}
    </div>
  );
}

function VoiceCard({ voice }: { voice: typeof FEATURED_VOICES[number] }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const accent = voice.gender === 'female' ? '#ec4899' : '#06b6d4';

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnd = () => setPlaying(false);
    audio.addEventListener('ended', onEnd);
    return () => audio.removeEventListener('ended', onEnd);
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="relative rounded-2xl border border-white/[0.08] p-6 overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)' }}
    >
      <div className="absolute inset-0 pointer-events-none opacity-30" style={{
        background: `radial-gradient(circle at 80% 20%, ${accent}33 0%, transparent 50%)`,
      }} />
      <div className="relative flex items-center gap-5">
        <button
          onClick={toggle}
          className="w-14 h-14 rounded-full flex items-center justify-center transition-transform hover:scale-105"
          style={{ background: accent, boxShadow: `0 0 24px ${accent}66` }}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white ml-0.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-display font-bold text-lg text-dark-text">{voice.label}</span>
            <span className="text-xs text-dark-text-muted">{voice.accent}</span>
          </div>
          <div className="text-sm text-dark-text-muted mb-2">{voice.description}</div>
          <Waveform playing={playing} accent={accent} />
        </div>
      </div>
      <audio ref={audioRef} src={voice.preview} preload="none" />
    </motion.div>
  );
}

function SampleCard({ clip, index }: { clip: typeof SAMPLE_CLIPS[number]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ delay: index * 0.1, duration: 0.6 }}
      whileHover={{ scale: 1.02 }}
      className="relative rounded-2xl border border-white/[0.08] overflow-hidden aspect-[9/16] bg-black group"
    >
      <video
        src={clip.src}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 45%)`,
      }} />
      <div className="absolute inset-x-0 top-3 flex items-center gap-2 px-4 pointer-events-none">
        <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-pulse" />
        <span className="text-[10px] tracking-[0.18em] font-bold text-white/80 uppercase">Sample</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pointer-events-none">
        <div className="font-display font-extrabold text-white text-lg leading-tight"
          style={{ letterSpacing: '-0.02em', textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}
        >
          {clip.title}
        </div>
      </div>
      <div
        className="absolute inset-x-3 bottom-3 h-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: clip.accent, boxShadow: `0 0 12px ${clip.accent}` }}
      />
    </motion.div>
  );
}

export default function FacelessChannelHome() {
  const heroRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const stepsInView = useInView(stepsRef, { once: true, margin: '-80px' });

  const openWizard = () => {
    globalThis.dispatchEvent(new CustomEvent('openChannelWizard'));
  };

  return (
    <div className="space-y-16 pb-12">

      {/* ═══ HERO ═══ */}
      <section ref={heroRef} className="relative overflow-hidden rounded-3xl border border-white/[0.08] px-8 py-16 md:px-14 md:py-24"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(135deg, rgba(6,182,212,0.18) 0%, transparent 45%), radial-gradient(ellipse at 85% 30%, rgba(168,85,247,0.22) 0%, transparent 55%), radial-gradient(ellipse at 15% 80%, rgba(236,72,153,0.14) 0%, transparent 50%)',
        }} />
        <div className="absolute inset-0 pointer-events-none" style={{
          opacity: 0.05,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }} />
        <FloatingParticles />

        <div className="relative max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-2 mb-6"
          >
            <span className="w-2 h-2 rounded-full" style={{ background: '#06b6d4', boxShadow: '0 0 12px #06b6d4' }} />
            <span className="text-[11px] font-bold tracking-[0.16em] uppercase text-cyan-300">
              Faceless Channel Studio
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-display font-extrabold text-dark-text leading-[0.95] mb-6"
            style={{ fontSize: 'clamp(2.5rem, 6vw, 4.75rem)', letterSpacing: '-0.04em' }}
          >
            Your channel,{' '}
            <motion.span
              animate={{
                backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
              }}
              transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
              style={{
                background: 'linear-gradient(90deg,#06b6d4,#a855f7,#ec4899,#06b6d4)',
                backgroundSize: '300% 100%',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                display: 'inline-block',
              }}
            >
              on autopilot.
            </motion.span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-lg md:text-xl text-dark-text-muted leading-relaxed mb-8 max-w-2xl"
          >
            Pick a niche. Pick a voice. We render cinematic shorts, cartoons and avatar videos — then post them daily while you sleep.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="flex flex-wrap items-center gap-3"
          >
            <button
              onClick={openWizard}
              className="btn-gradient"
              style={{ padding: '0.95rem 1.75rem', fontSize: '0.95rem', borderRadius: '999px', gap: '0.5rem' }}
            >
              <Sparkles className="w-4 h-4" />
              Create your first channel
            </button>
            <a href="#how" className="text-sm text-dark-text-muted hover:text-dark-text transition-colors px-4 py-3">
              See how it works ↓
            </a>
          </motion.div>
        </div>
      </section>

      {/* ═══ HOW EASY — 3 STEPS ═══ */}
      <section id="how" ref={stepsRef}>
        <div className="mb-8">
          <div className="text-[11px] font-bold tracking-[0.16em] uppercase text-cyan-300 mb-2">How it works</div>
          <h2 className="font-display font-extrabold text-dark-text" style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)', letterSpacing: '-0.03em' }}>
            Three clicks to a live channel.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {HOW_STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, y: 24 }}
                animate={stepsInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: i * 0.12, duration: 0.6 }}
                className="relative rounded-2xl border border-white/[0.08] p-6 overflow-hidden group"
                style={{ background: 'rgba(255,255,255,0.03)' }}
              >
                <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" style={{
                  background: `radial-gradient(circle at 50% 0%, ${step.accent}22 0%, transparent 60%)`,
                }} />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{
                      background: `${step.accent}1f`,
                      border: `1px solid ${step.accent}40`,
                    }}>
                      <Icon className="w-5 h-5" style={{ color: step.accent }} />
                    </div>
                    <span className="text-xs font-bold tracking-[0.14em] uppercase" style={{ color: step.accent }}>
                      Step {i + 1}
                    </span>
                  </div>
                  <div className="font-display font-bold text-dark-text text-xl mb-1.5">{step.label}</div>
                  <div className="text-sm text-dark-text-muted leading-relaxed">{step.desc}</div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ═══ VOICE GALLERY ═══ */}
      <section>
        <div className="mb-8">
          <div className="text-[11px] font-bold tracking-[0.16em] uppercase text-cyan-300 mb-2">Studio-grade voices</div>
          <h2 className="font-display font-extrabold text-dark-text" style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)', letterSpacing: '-0.03em' }}>
            Hear a sample.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FEATURED_VOICES.map((v) => (
            <VoiceCard key={v.id} voice={v} />
          ))}
        </div>
      </section>

      {/* ═══ OUTPUT SAMPLES ═══ */}
      <section>
        <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="text-[11px] font-bold tracking-[0.16em] uppercase text-cyan-300 mb-2">
              <Video className="inline w-3 h-3 mr-1" />What you'll render
            </div>
            <h2 className="font-display font-extrabold text-dark-text" style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)', letterSpacing: '-0.03em' }}>
              Cinematic, every time.
            </h2>
          </div>
          <button onClick={openWizard} className="btn-gradient" style={{ padding: '0.75rem 1.25rem', fontSize: '0.875rem', borderRadius: '999px' }}>
            Start rendering →
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {SAMPLE_CLIPS.map((clip, i) => (
            <SampleCard key={clip.title} clip={clip} index={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
