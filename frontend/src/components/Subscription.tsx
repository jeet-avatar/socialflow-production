import { useState, useEffect } from 'react';
import { Check, Crown, Zap, Shield, Lock, RotateCcw, Headphones, Star, Layers, AlertTriangle, Calendar, AlertCircle } from 'lucide-react';
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

const Subscription = () => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans();
    if (user) {
      fetchCurrentPlan();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchPlans = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/subscription/plans`);
      setPlans(response.data.plans);
    } catch {
      // plans fetch failed — UI stays on loading=false with empty list
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentPlan = async () => {
    if (!user) return;
    try {
      const response = await axios.get(`${API_URL}/api/subscription/status/${user.sub}`);
      const data = response.data;
      setCurrentPlan((data.plan as string | undefined) ?? 'free');
      setCancelAtPeriodEnd((data.subscription_details?.cancel_at_period_end as boolean | undefined) ?? false);
      setCurrentPeriodEnd((data.subscription?.current_period_end as string | undefined) ?? (data.period?.end as string | undefined) ?? null);
    } catch {
      setCurrentPlan('free');
    }
  };

  const handleCancelSubscription = async () => {
    if (!user?.sub) return;
    setCancelLoading(true);
    setCancelMessage(null);
    try {
      await axios.post(`${API_URL}/api/subscription/cancel/${user.sub}`);
      setCancelMessage('Your subscription will be cancelled at the end of the billing period.');
      setShowCancelConfirm(false);
      setCancelAtPeriodEnd(true);
      fetchCurrentPlan();
    } catch {
      setCancelMessage('Failed to cancel subscription. Please try again.');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleSubscribe = (plan: Plan) => {
    if (plan.id === 'free') {
      // Handle free plan
      setCurrentPlan('free');
      return;
    }

    // Redirect to Stripe checkout
    if (plan.stripe_url) {
      globalThis.open(plan.stripe_url, '_blank');
    }
  };

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case 'free':
        return <Shield className="h-8 w-8 text-white" />;
      case 'professional':
        return <Crown className="h-8 w-8 text-white" />;
      default:
        return <Zap className="h-8 w-8 text-white" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-teal"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg py-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto text-center mb-16">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-teal-blue rounded-2xl mb-6 shadow-glow-teal">
          <Layers className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-5xl font-bold text-dark-text mb-4">
          Choose Your Plan
        </h1>
        <p className="text-xl text-dark-text-muted max-w-3xl mx-auto">
          Unlock the full power of AI-driven social media automation
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-8 mb-16 items-stretch">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`relative glass-card rounded-3xl p-8 h-full min-h-[720px] flex flex-col transition-all duration-300 ${
              plan.popular
                ? 'ring-2 ring-accent-teal shadow-glow-teal scale-105'
                : 'hover:shadow-glow-teal'
            }`}
          >
            {/* Popular Badge */}
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <div className="bg-accent-teal text-white px-6 py-2 rounded-full text-sm font-semibold shadow-glow-teal flex items-center space-x-2">
                  <Star className="h-4 w-4" />
                  <span>Most Popular</span>
                </div>
              </div>
            )}

            {/* Plan Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-teal-blue rounded-2xl mb-4 shadow-glow-teal">
                {getPlanIcon(plan.id)}
              </div>
              <h3 className="text-3xl font-bold text-dark-text mb-2">{plan.name}</h3>
              <div className="flex items-baseline justify-center space-x-2">
                <span className="text-5xl font-bold text-dark-text">
                  ${plan.price}
                </span>
                <span className="text-dark-text-muted">/{plan.billing_cycle}</span>
              </div>
            </div>

            {/* Features */}
            <ul className="space-y-4 mb-8">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start space-x-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-accent-teal/20 flex items-center justify-center mt-0.5">
                    <Check className="h-3 w-3 text-accent-teal" />
                  </div>
                  <span className="text-dark-text-muted flex-1">{feature}</span>
                </li>
              ))}
            </ul>

            {/* Limits */}
            {plan.limits && (
              <div className="mb-8 p-4 bg-dark-bg-lighter rounded-xl">
                <div className="grid grid-cols-2 gap-6 text-center">
                  <div>
                    <div className="text-2xl font-bold text-accent-teal">
                      {plan.limits.videos_per_month === -1 ? '∞' : plan.limits.videos_per_month}
                    </div>
                    <div className="text-xs text-dark-text-dim">videos/month</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-accent-blue">
                      {plan.limits.platforms === -1 ? '∞' : plan.limits.platforms}
                    </div>
                    <div className="text-xs text-dark-text-dim">Platforms</div>
                  </div>
                </div>
              </div>
            )}

            {/* CTA Button */}
            <button
              onClick={() => handleSubscribe(plan)}
              className={`w-full py-4 px-6 rounded-xl font-semibold transition-all duration-200 ${
                plan.popular
                  ? 'btn-gradient shadow-glow-teal'
                  : 'glass-card text-dark-text hover:bg-glass-white'
              } ${currentPlan === plan.id ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={currentPlan === plan.id}
            >
              {(() => {
                if (currentPlan === plan.id) return 'Current Plan';
                if (plan.id === 'free') return 'Get Started Free';
                return 'Upgrade Now';
              })()}
            </button>
          </div>
        ))}
      </div>

      {/* Cancel Subscription — only shown for paid plan users */}
      {currentPlan === 'professional' && (
        <div className="max-w-2xl mx-auto mb-16">
          <div className="glass-card rounded-2xl p-6 space-y-4">
            {/* Header row */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
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

              {cancelAtPeriodEnd && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-yellow-500/25 bg-yellow-500/8 text-yellow-400 text-sm font-medium">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  Cancellation scheduled
                </div>
              )}
              {!cancelAtPeriodEnd && !showCancelConfirm && (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="text-sm px-4 py-2 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/10 hover:border-red-500/35 transition-all"
                >
                  Cancel Plan
                </button>
              )}
            </div>

            {/* Confirm dialog */}
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

            {/* Status message */}
            {cancelMessage && (
              <p className={`text-xs px-1 ${cancelMessage.includes('Failed') ? 'text-red-400' : 'text-emerald-400'}`}>
                {cancelMessage}
              </p>
            )}
          </div>
        </div>
      )}

      {/* FAQ Section */}
      <div className="max-w-4xl mx-auto mt-16">
        <h2 className="text-3xl font-bold text-dark-text text-center mb-8">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {[
            {
              q: 'Can I cancel anytime?',
              a: 'Yes! You can cancel your subscription at any time. Your access will continue until the end of your billing period.'
            },
            {
              q: 'What payment methods do you accept?',
              a: 'We accept all major credit cards, debit cards, and digital wallets through Stripe.'
            },
            {
              q: 'Is there a free trial?',
              a: 'Yes! Start with our Free plan and upgrade when you\'re ready to unlock more features.'
            },
            {
              q: 'Can I change plans later?',
              a: 'Absolutely! You can upgrade or downgrade your plan at any time from your account settings.'
            }
          ].map((faq) => (
            <div key={faq.q} className="glass-card rounded-xl p-6">
              <h3 className="text-lg font-semibold text-dark-text mb-2">{faq.q}</h3>
              <p className="text-dark-text-muted">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Trust Badges */}
      <div className="max-w-4xl mx-auto mt-16 text-center">
        <div className="flex items-center justify-center space-x-8 text-dark-text-dim">
          <div className="flex items-center space-x-2">
            <Lock className="h-5 w-5" />
            <span>Secure Payment</span>
          </div>
          <div className="flex items-center space-x-2">
            <RotateCcw className="h-5 w-5" />
            <span>Money-back Guarantee</span>
          </div>
          <div className="flex items-center space-x-2">
            <Headphones className="h-5 w-5" />
            <span>24/7 Support</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Subscription;
