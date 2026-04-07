import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Crown, Zap, Shield, Star, Layers, AlertTriangle, Calendar, AlertCircle, X } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../hooks/useSupabase';

const API_URL = import.meta.env.VITE_API_URL ?? 'https://socialflow.network';

interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  billing_cycle: string;
  features: string[];
  limits?: {
    videos_per_month: number;
    platforms: number;
  };
  stripe_url?: string;
  buy_button_id?: string;
  popular?: boolean;
}

export interface SubscriptionModalProps {
  open: boolean;
  onClose: () => void;
}

const SubscriptionModal = ({ open, onClose }: SubscriptionModalProps) => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const fetchAll = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/subscription/plans`);
        setPlans(res.data.plans ?? []);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
      if (!user) return;
      try {
        const res = await axios.get(`${API_URL}/api/subscription/status/${user.sub}`);
        const data = res.data;
        setCurrentPlan((data.plan as string | undefined) ?? 'free');
        setCancelAtPeriodEnd((data.subscription_details?.cancel_at_period_end as boolean | undefined) ?? false);
        setCurrentPeriodEnd(
          (data.subscription?.current_period_end as string | undefined) ??
          (data.period?.end as string | undefined) ??
          null,
        );
      } catch {
        setCurrentPlan('free');
      }
    };
    fetchAll();
  }, [open, user]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleCancelSubscription = async () => {
    if (!user?.sub) return;
    setCancelLoading(true);
    setCancelMessage(null);
    try {
      await axios.post(`${API_URL}/api/subscription/cancel/${user.sub}`);
      setCancelMessage('Your subscription will be cancelled at the end of the billing period.');
      setShowCancelConfirm(false);
      setCancelAtPeriodEnd(true);
    } catch {
      setCancelMessage('Failed to cancel subscription. Please try again.');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleSubscribe = (plan: Plan) => {
    if (plan.id === 'free') return;
    if (plan.stripe_url) globalThis.open(plan.stripe_url, '_blank');
  };

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case 'free': return <Shield className="h-6 w-6 text-white" />;
      case 'professional': return <Crown className="h-6 w-6 text-white" />;
      default: return <Zap className="h-6 w-6 text-white" />;
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto glass-card rounded-3xl shadow-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.2 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-8 pt-8 pb-6 border-b border-glass-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-teal-blue rounded-xl flex items-center justify-center shadow-glow-teal">
                  <Layers className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-dark-text">Choose Your Plan</h2>
                  <p className="text-sm text-dark-text-muted">Unlock AI-powered social media automation</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {currentPlan && (
                  <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                    currentPlan === 'professional'
                      ? 'bg-accent-teal/15 text-accent-teal border border-accent-teal/25'
                      : 'bg-glass-white text-dark-text-muted border border-glass-border'
                  }`}>
                    {currentPlan === 'professional' ? 'Pro ✓' : 'Free Plan'}
                  </span>
                )}
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-xl glass-card flex items-center justify-center text-dark-text-muted hover:text-dark-text transition-colors"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="px-8 py-8 space-y-8">
              {/* Plan Cards */}
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent-teal" />
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-6 items-stretch">
                  {plans.map((plan) => (
                    <div
                      key={plan.id}
                      className={`relative glass-card rounded-2xl p-6 flex flex-col transition-all duration-300 ${
                        plan.popular
                          ? 'ring-2 ring-accent-teal shadow-glow-teal'
                          : 'hover:shadow-glow-teal'
                      }`}
                    >
                      {plan.popular && (
                        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                          <div className="bg-accent-teal text-white px-4 py-1.5 rounded-full text-xs font-semibold shadow-glow-teal flex items-center gap-1.5">
                            <Star className="h-3 w-3" />
                            Most Popular
                          </div>
                        </div>
                      )}

                      {/* Plan Header */}
                      <div className="flex items-center gap-3 mb-5">
                        <div className="w-12 h-12 bg-gradient-teal-blue rounded-xl flex items-center justify-center shadow-glow-teal">
                          {getPlanIcon(plan.id)}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-dark-text">{plan.name}</h3>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-bold text-dark-text">${plan.price}</span>
                            <span className="text-xs text-dark-text-muted">/{plan.billing_cycle}</span>
                          </div>
                        </div>
                      </div>

                      {/* Limits */}
                      {plan.limits && (
                        <div className="mb-4 p-3 bg-dark-bg-lighter rounded-xl">
                          <div className="grid grid-cols-2 gap-3 text-center">
                            <div>
                              <div className="text-xl font-bold text-accent-teal">
                                {plan.limits.videos_per_month === -1 ? '∞' : plan.limits.videos_per_month}
                              </div>
                              <div className="text-xs text-dark-text-dim">videos/month</div>
                            </div>
                            <div>
                              <div className="text-xl font-bold text-accent-blue">
                                {plan.limits.platforms === -1 ? '∞' : plan.limits.platforms}
                              </div>
                              <div className="text-xs text-dark-text-dim">Platforms</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Features */}
                      <ul className="space-y-2.5 mb-6 flex-1">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2.5">
                            <div className="flex-shrink-0 w-4 h-4 rounded-full bg-accent-teal/20 flex items-center justify-center mt-0.5">
                              <Check className="h-2.5 w-2.5 text-accent-teal" />
                            </div>
                            <span className="text-sm text-dark-text-muted">{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <button
                        onClick={() => handleSubscribe(plan)}
                        disabled={currentPlan === plan.id}
                        className={`w-full py-3 px-5 rounded-xl font-semibold text-sm transition-all duration-200 ${
                          plan.popular
                            ? 'btn-gradient shadow-glow-teal'
                            : 'glass-card text-dark-text hover:bg-glass-white'
                        } ${currentPlan === plan.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {currentPlan === plan.id ? 'Current Plan' : plan.id === 'free' ? 'Get Started Free' : 'Upgrade Now'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Cancel Subscription — pro users only */}
              {currentPlan === 'professional' && (
                <div className="glass-card rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-dark-text">Cancel Subscription</p>
                        {currentPeriodEnd && (
                          <p className="text-xs text-dark-text-muted mt-0.5 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {cancelAtPeriodEnd ? 'Access ends ' : 'Currently renews '}
                            {new Date(currentPeriodEnd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                    </div>

                    {cancelAtPeriodEnd ? (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-yellow-500/25 bg-yellow-500/8 text-yellow-400 text-xs font-medium">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        Cancellation scheduled
                      </div>
                    ) : !showCancelConfirm ? (
                      <button
                        onClick={() => setShowCancelConfirm(true)}
                        className="text-sm px-4 py-2 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/10 hover:border-red-500/35 transition-all"
                      >
                        Cancel Plan
                      </button>
                    ) : null}
                  </div>

                  {!cancelAtPeriodEnd && showCancelConfirm && (
                    <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/5 flex-wrap">
                      <p className="text-sm text-dark-text-muted">
                        You'll keep access until the end of your billing period. This cannot be undone.
                      </p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => setShowCancelConfirm(false)}
                          className="text-sm px-3 py-1.5 rounded-lg glass-card text-dark-text-muted hover:bg-glass-white transition-all"
                        >
                          Keep Plan
                        </button>
                        <button
                          onClick={handleCancelSubscription}
                          disabled={cancelLoading}
                          className="text-sm px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-50"
                        >
                          {cancelLoading ? 'Cancelling…' : 'Yes, Cancel'}
                        </button>
                      </div>
                    </div>
                  )}

                  {cancelMessage && (
                    <p className={`text-xs px-1 ${cancelMessage.includes('Failed') ? 'text-red-400' : 'text-emerald-400'}`}>
                      {cancelMessage}
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SubscriptionModal;
