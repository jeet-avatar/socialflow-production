/**
 * NudgeCard — collapsible onboarding tour widget
 * Anchored bottom-right, never blocks content.
 * Collapses to a slim pill; expands on click.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ArrowRight, ArrowLeft, Sparkles, User, UserCheck,
  Building2, Video, Send, PartyPopper, CheckCircle2, ChevronUp, ChevronDown,
} from 'lucide-react';

const SESSION_KEY  = 'sf_nudge_done';
const MINIMISE_KEY = 'sf_nudge_min';

interface NudgeStep {
  key: string;
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  label: string;
  title: string;
  description: string;
  tab: string | null;
  accent: string;
  glow: string;
  bg: string;
}

const STEPS: NudgeStep[] = [
  {
    key: 'welcome',
    icon: Sparkles,
    label: 'Welcome',
    title: 'Welcome to SocialFlow',
    description: "Get set up in 5 steps — leads, company analysis, AI videos, and publishing across all your platforms.",
    tab: null,
    accent: '#2dd4bf', glow: 'rgba(45,212,191,0.3)',  bg: 'rgba(45,212,191,0.12)',
  },
  {
    key: 'profile',
    icon: User,
    label: '1 of 5 · Profile',
    title: 'Set up your profile',
    description: 'Add your name, company, and bio. These power your AI video scripts and outreach summaries.',
    tab: 'profile',
    accent: '#a78bfa', glow: 'rgba(167,139,250,0.3)', bg: 'rgba(167,139,250,0.12)',
  },
  {
    key: 'leads',
    icon: UserCheck,
    label: '2 of 5 · Leads',
    title: 'Find your first leads',
    description: 'Search by company, industry, or tech stack. Every lead gets an AI score so you know who to target first.',
    tab: 'leads',
    accent: '#2dd4bf', glow: 'rgba(45,212,191,0.3)',  bg: 'rgba(45,212,191,0.12)',
  },
  {
    key: 'company',
    icon: Building2,
    label: '3 of 5 · Analysis',
    title: 'Analyse a company',
    description: 'Check risk score, latest news signals, and company intelligence before you reach out.',
    tab: 'company-analysis',
    accent: '#60a5fa', glow: 'rgba(96,165,250,0.3)',  bg: 'rgba(96,165,250,0.12)',
  },
  {
    key: 'video',
    icon: Video,
    label: '4 of 5 · Video',
    title: 'Create an AI video',
    description: 'Pick a template, write your script, choose a voice. Renders in under 2 minutes — no editing needed.',
    tab: 'video-studio',
    accent: '#22d3ee', glow: 'rgba(34,211,238,0.3)',  bg: 'rgba(34,211,238,0.12)',
  },
  {
    key: 'publish',
    icon: Send,
    label: '5 of 5 · Publish',
    title: 'Publish your video',
    description: 'Connect LinkedIn, Facebook, Instagram, or YouTube. Publish to all platforms in one click.',
    tab: 'profile',
    accent: '#fb923c', glow: 'rgba(251,146,60,0.3)',  bg: 'rgba(251,146,60,0.12)',
  },
  {
    key: 'done',
    icon: PartyPopper,
    label: 'All done!',
    title: "You're ready to go",
    description: "Find leads, research companies, create a video, and publish — all from one place. Happy creating!",
    tab: 'dashboard',
    accent: '#facc15', glow: 'rgba(250,204,21,0.3)',  bg: 'rgba(250,204,21,0.12)',
  },
];

interface NudgeCardProps {
  onNavigate: (tab: string) => void;
}

const NudgeCard = ({ onNavigate }: NudgeCardProps) => {
  const [visible,    setVisible]    = useState(false);
  const [minimised,  setMinimised]  = useState(false);
  const [step,       setStep]       = useState(0);
  const [direction,  setDirection]  = useState<1 | -1>(1);

  useEffect(() => {
    if (!sessionStorage.getItem(SESSION_KEY)) {
      // restore minimise state across tab navigations
      if (sessionStorage.getItem(MINIMISE_KEY)) setMinimised(true);
      const timer = setTimeout(() => setVisible(true), 700);
      return () => clearTimeout(timer);
    }
  }, []);

  const goToStep = (index: number, dir: 1 | -1 = 1) => {
    setDirection(dir);
    setStep(index);
    const dest = STEPS[index].tab;
    if (dest) onNavigate(dest);
  };

  const handleNext = () => {
    if (step === STEPS.length - 1) {
      setVisible(false);
      sessionStorage.setItem(SESSION_KEY, '1');
      sessionStorage.removeItem(MINIMISE_KEY);
      const dest = STEPS[step].tab;
      if (dest) onNavigate(dest);
    } else {
      goToStep(step + 1, 1);
    }
  };

  const handleBack   = () => { if (step > 0) goToStep(step - 1, -1); };
  const handleDismiss = () => {
    setVisible(false);
    sessionStorage.setItem(SESSION_KEY, '1');
    sessionStorage.removeItem(MINIMISE_KEY);
  };
  const toggleMinimise = () => {
    const next = !minimised;
    setMinimised(next);
    if (next) sessionStorage.setItem(MINIMISE_KEY, '1');
    else      sessionStorage.removeItem(MINIMISE_KEY);
  };

  if (!visible) return null;

  const cur    = STEPS[step];
  const Icon   = cur.icon;
  const isFirst = step === 0;
  const isLast  = step === STEPS.length - 1;
  const isDone  = cur.key === 'done';

  const middleCount = STEPS.length - 2;
  const progressPct = step === 0 ? 0 : step === STEPS.length - 1 ? 100 : ((step - 1) / middleCount) * 100;

  const slideV = {
    enter: (d: number) => ({ x: d * 20, opacity: 0, filter: 'blur(3px)' }),
    center: { x: 0, opacity: 1, filter: 'blur(0px)', transition: { duration: 0.26, ease: [0.25, 0.46, 0.45, 0.94] } },
    exit:  (d: number) => ({ x: d * -20, opacity: 0, filter: 'blur(3px)', transition: { duration: 0.18 } }),
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0,  scale: 1 }}
      exit={{    opacity: 0, y: 16, scale: 0.96 }}
      transition={{ duration: 0.38, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: minimised ? 'auto' : '300px',
        zIndex: 60,
        borderRadius: minimised ? '50px' : '16px',
        overflow: 'hidden',
        background: 'linear-gradient(155deg, rgba(9,14,32,0.96) 0%, rgba(13,20,44,0.96) 100%)',
        backdropFilter: 'blur(28px)',
        border: `1px solid ${cur.accent}28`,
        boxShadow: `0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04), 0 0 30px ${cur.glow}`,
        transition: 'width 0.35s cubic-bezier(0.25,0.46,0.45,0.94), border-radius 0.35s, border-color 0.4s, box-shadow 0.4s',
      }}
    >
      {/* ── MINIMISED PILL ── */}
      {minimised ? (
        <motion.button
          onClick={toggleMinimise}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 14px 9px 10px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            width: '100%',
          }}
        >
          {/* pulsing dot */}
          <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.span
              animate={{ scale: [1, 1.7, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                width: '20px', height: '20px',
                borderRadius: '50%',
                background: cur.accent,
                opacity: 0.3,
              }}
            />
            <span style={{
              width: '8px', height: '8px',
              borderRadius: '50%',
              background: cur.accent,
              boxShadow: `0 0 8px ${cur.accent}`,
              display: 'block',
            }} />
          </span>

          <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap' }}>
            {isDone ? 'Tour complete' : isFirst ? 'Start tour' : `Tour · ${step}/${STEPS.length - 2}`}
          </span>

          <ChevronUp style={{ width: '13px', height: '13px', color: cur.accent, marginLeft: '2px' }} />
        </motion.button>
      ) : (
        /* ── EXPANDED CARD ── */
        <div>
          {/* Progress bar */}
          <div style={{ height: '2px', background: 'rgba(255,255,255,0.05)' }}>
            <motion.div
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{
                height: '100%',
                background: `linear-gradient(90deg, ${cur.accent}70, ${cur.accent})`,
                boxShadow: `0 0 6px ${cur.accent}`,
              }}
            />
          </div>

          {/* Ambient glow */}
          <motion.div
            animate={{ background: `radial-gradient(ellipse 220px 70px at 60% 0%, ${cur.glow} 0%, transparent 70%)` }}
            transition={{ duration: 0.5 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '100px', pointerEvents: 'none', zIndex: 0 }}
          />

          <div style={{ position: 'relative', zIndex: 1, padding: '14px 14px 13px' }}>

            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                {/* Icon */}
                <motion.div
                  key={cur.key}
                  initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
                  animate={{ scale: 1,   rotate: 0,   opacity: 1 }}
                  transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
                  style={{
                    width: '32px', height: '32px',
                    borderRadius: '9px',
                    background: cur.bg,
                    border: `1px solid ${cur.accent}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon style={{ width: '15px', height: '15px', color: cur.accent }} />
                </motion.div>

                {/* Label */}
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.span
                    key={`label-${step}`}
                    custom={direction}
                    variants={slideV}
                    initial="enter" animate="center" exit="exit"
                    style={{
                      fontSize: '9.5px', fontWeight: 700,
                      letterSpacing: '0.09em', textTransform: 'uppercase',
                      color: cur.accent,
                    }}
                  >
                    {cur.label}
                  </motion.span>
                </AnimatePresence>
              </div>

              {/* Minimise + close */}
              <div style={{ display: 'flex', gap: '3px' }}>
                <TinyBtn onClick={toggleMinimise} title="Minimise">
                  <ChevronDown style={{ width: '12px', height: '12px' }} />
                </TinyBtn>
                <TinyBtn onClick={handleDismiss} title="Dismiss tour">
                  <X style={{ width: '12px', height: '12px' }} />
                </TinyBtn>
              </div>
            </div>

            {/* Animated content */}
            <div style={{ minHeight: '72px', overflow: 'hidden' }}>
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={`content-${step}`}
                  custom={direction}
                  variants={slideV}
                  initial="enter" animate="center" exit="exit"
                >
                  <p style={{
                    fontSize: '13px', fontWeight: 700,
                    color: '#f1f5f9', marginBottom: '5px',
                    lineHeight: 1.35, letterSpacing: '-0.01em',
                  }}>
                    {cur.title}
                  </p>
                  <p style={{
                    fontSize: '11.5px', color: 'rgba(255,255,255,0.45)',
                    lineHeight: 1.55, margin: 0,
                  }}>
                    {cur.description}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Step dots */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', margin: '12px 0 10px' }}>
              {STEPS.map((s, i) => (
                <button
                  key={s.key}
                  onClick={() => goToStep(i, i > step ? 1 : -1)}
                  title={s.label}
                  style={{
                    height: '3px',
                    width: i === step ? '18px' : '6px',
                    borderRadius: '99px',
                    border: 'none', padding: 0,
                    cursor: 'pointer',
                    background: i === step
                      ? cur.accent
                      : i < step
                      ? `${cur.accent}45`
                      : 'rgba(255,255,255,0.1)',
                    transition: 'width 0.3s cubic-bezier(0.25,0.46,0.45,0.94), background 0.3s',
                  }}
                />
              ))}
              <span style={{
                marginLeft: 'auto', fontSize: '9.5px',
                color: 'rgba(255,255,255,0.18)', fontVariantNumeric: 'tabular-nums',
              }}>
                {isFirst ? '' : isDone ? '✓' : `${step}/${STEPS.length - 2}`}
              </span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <motion.button
                onClick={handleBack}
                disabled={isFirst}
                whileHover={!isFirst ? { x: -2 } : {}}
                whileTap={!isFirst ? { scale: 0.94 } : {}}
                style={{
                  display: 'flex', alignItems: 'center', gap: '3px',
                  padding: '6px 9px', borderRadius: '8px',
                  background: 'transparent', border: 'none',
                  fontSize: '11px', fontWeight: 500,
                  color: 'rgba(255,255,255,0.28)',
                  cursor: isFirst ? 'default' : 'pointer',
                  opacity: isFirst ? 0 : 1,
                  pointerEvents: isFirst ? 'none' : 'auto',
                  transition: 'color 0.18s',
                }}
                onMouseEnter={e => !isFirst && ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.6)')}
                onMouseLeave={e => !isFirst && ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.28)')}
              >
                <ArrowLeft style={{ width: '12px', height: '12px' }} />
                Back
              </motion.button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                {!isLast && (
                  <button
                    onClick={handleDismiss}
                    style={{
                      padding: '6px 9px', borderRadius: '8px',
                      background: 'transparent', border: 'none',
                      fontSize: '11px', color: 'rgba(255,255,255,0.2)',
                      cursor: 'pointer', transition: 'color 0.18s',
                    }}
                    onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.45)')}
                    onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.2)')}
                  >
                    Skip
                  </button>
                )}

                <motion.button
                  onClick={handleNext}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.94 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '7px 14px', borderRadius: '9px',
                    background: `linear-gradient(135deg, ${cur.accent}bb, ${cur.accent})`,
                    boxShadow: `0 3px 14px ${cur.glow}`,
                    border: 'none',
                    fontSize: '11.5px', fontWeight: 700,
                    color: 'rgba(0,0,0,0.85)',
                    cursor: 'pointer',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {isDone ? (
                    <><CheckCircle2 style={{ width: '12px', height: '12px' }} /> Done</>
                  ) : isFirst ? (
                    <>Start <ArrowRight style={{ width: '12px', height: '12px' }} /></>
                  ) : (
                    <>Next <ArrowRight style={{ width: '12px', height: '12px' }} /></>
                  )}
                </motion.button>
              </div>
            </div>

          </div>
        </div>
      )}
    </motion.div>
  );
};

/* ── tiny icon button helper ── */
const TinyBtn = ({
  onClick, title, children,
}: { onClick: () => void; title: string; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      padding: '5px', borderRadius: '6px',
      background: 'transparent', border: 'none',
      color: 'rgba(255,255,255,0.2)', cursor: 'pointer',
      display: 'flex', alignItems: 'center',
      transition: 'color 0.18s, background 0.18s',
    }}
    onMouseEnter={e => {
      const b = e.currentTarget as HTMLButtonElement;
      b.style.color = 'rgba(255,255,255,0.55)';
      b.style.background = 'rgba(255,255,255,0.07)';
    }}
    onMouseLeave={e => {
      const b = e.currentTarget as HTMLButtonElement;
      b.style.color = 'rgba(255,255,255,0.2)';
      b.style.background = 'transparent';
    }}
  >
    {children}
  </button>
);

export default NudgeCard;
