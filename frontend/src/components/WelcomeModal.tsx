/**
 * WelcomeModal — shown once per session after login.
 * Introduces the user and offers to start the onboarding tour
 * (same one triggered by the "Guide Me" button in the sidebar).
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight, X, BookOpen, Rocket } from 'lucide-react';

const SESSION_KEY = 'sf_welcomed_modal';

interface WelcomeModalProps {
  userName?: string;
}

const WelcomeModal = ({ userName }: WelcomeModalProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 900);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setVisible(false);
  };

  const startTour = () => {
    dismiss();
    // Small delay so the modal exit animation finishes cleanly
    setTimeout(() => {
      globalThis.dispatchEvent(new CustomEvent('openOnboardingTour'));
    }, 300);
  };

  const firstName = userName?.split(' ')[0] || 'there';

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            key="welcome-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={dismiss}
            className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            key="welcome-modal"
            initial={{ opacity: 0, scale: 0.88, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300, delay: 0.05 }}
            className="fixed inset-0 z-[81] flex items-center justify-center pointer-events-none"
          >
            <div
              className="pointer-events-auto relative w-full max-w-md mx-4 rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(155deg, rgba(9,14,32,0.98) 0%, rgba(13,20,44,0.98) 100%)',
                border: '1px solid rgba(45,212,191,0.2)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04), 0 0 60px rgba(45,212,191,0.08)',
              }}
            >
              {/* Ambient glow */}
              <div
                className="absolute top-0 left-0 right-0 h-40 pointer-events-none"
                style={{
                  background: 'radial-gradient(ellipse 400px 120px at 50% 0%, rgba(45,212,191,0.12) 0%, transparent 70%)',
                }}
              />

              {/* Top stripe */}
              <div
                className="h-0.5 w-full"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(45,212,191,0.6), transparent)' }}
              />

              <div className="relative p-7">
                {/* Close */}
                <button
                  onClick={dismiss}
                  className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center text-white/20 hover:text-white/60 hover:bg-white/8 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Icon badge */}
                <motion.div
                  initial={{ scale: 0.5, rotate: -20, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={{ type: 'spring', damping: 14, stiffness: 200, delay: 0.15 }}
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                  style={{
                    background: 'linear-gradient(135deg, rgba(45,212,191,0.2), rgba(96,165,250,0.15))',
                    border: '1px solid rgba(45,212,191,0.25)',
                    boxShadow: '0 0 30px rgba(45,212,191,0.15)',
                  }}
                >
                  <Sparkles className="w-7 h-7 text-accent-teal" />
                </motion.div>

                {/* Heading */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <h2 className="text-xl font-bold text-white leading-tight mb-1">
                    Welcome to SocialFlow{firstName !== 'there' ? `, ${firstName}` : ''}! 🎉
                  </h2>
                  <p className="text-sm text-white/45 leading-relaxed mt-2 mb-6">
                    You're all set. Find leads, analyse companies, create AI videos, and publish across all your platforms — from one place.
                  </p>
                </motion.div>

                {/* Tour CTA card */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.28 }}
                  className="rounded-xl p-4 mb-4 cursor-pointer group"
                  style={{
                    background: 'rgba(45,212,191,0.07)',
                    border: '1px solid rgba(45,212,191,0.18)',
                  }}
                  onClick={startTour}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(45,212,191,0.15)', border: '1px solid rgba(45,212,191,0.2)' }}
                    >
                      <BookOpen className="w-4 h-4 text-accent-teal" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white leading-tight">Take a quick tour</p>
                      <p className="text-xs text-white/40 mt-0.5">5 steps · ~2 min · same as "Guide Me" in sidebar</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-accent-teal/60 group-hover:text-accent-teal group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </div>
                </motion.div>

                {/* Buttons */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.34 }}
                  className="flex items-center gap-3"
                >
                  <button
                    onClick={startTour}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                    style={{
                      background: 'linear-gradient(135deg, #0f766e, #1d4ed8)',
                      color: 'white',
                      boxShadow: '0 4px 16px rgba(45,212,191,0.2)',
                    }}
                  >
                    <Rocket className="w-4 h-4" />
                    Start Tour
                  </button>
                  <button
                    onClick={dismiss}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium text-white/35 hover:text-white/60 hover:bg-white/6 transition-all border border-white/8"
                  >
                    Explore myself
                  </button>
                </motion.div>

                <p className="text-[11px] text-white/18 text-center mt-4">
                  You can always reopen this tour via the <span className="text-accent-teal/50">Guide Me</span> button in the sidebar.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default WelcomeModal;
