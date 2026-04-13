import { useState, useEffect } from 'react';
import { notify } from '../services/notificationService';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useSupabase';
import { getAuthToken } from '../utils/getAuthToken';
import {
  User, Building, Save, CheckCircle,
  RefreshCw, Sparkles, X, Crown, Calendar,
  Target, Users, Camera, AlertCircle, CreditCard, Workflow,
} from 'lucide-react';
import axios from 'axios';
import SocialIntegration from './SocialIntegration';
import { API_BASE_URL } from '../config/api';

const API_URL = API_BASE_URL;

interface SubscriptionState {
  plan: string;
  price: number;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
}

const LinkedInIcon = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

interface LinkedInImportProps {
  show: boolean;
  url: string;
  onUrlChange: (v: string) => void;
  onToggle: () => void;
  fetching: boolean;
  onFetch: () => void;
}

const LinkedInImport = ({ show, url, onUrlChange, onToggle, fetching, onFetch }: LinkedInImportProps) => {
  if (show) {
    return (
      <div className="flex items-center space-x-2">
        <div className="flex items-center glass-card overflow-hidden">
          <div className="flex items-center space-x-1.5 px-3 py-2 bg-[#0a66c2]/15 border-r border-glass-border flex-shrink-0">
            <LinkedInIcon className="w-3.5 h-3.5 text-[#0a66c2]" />
            <span className="text-xs text-[#60a5fa] font-medium">linkedin.com/</span>
          </div>
          <input
            type="text"
            value={url}
            onChange={e => onUrlChange(e.target.value)}
            placeholder="company/yourco"
            className="bg-transparent text-sm text-dark-text placeholder-dark-text-muted px-3 py-2 outline-none w-40"
            onKeyDown={e => e.key === 'Enter' && onFetch()}
          />
        </div>
        <button
          onClick={() => onFetch()}
          disabled={fetching || !url.trim()}
          className="btn-gradient-orange text-xs flex items-center space-x-1.5 disabled:opacity-50 py-2 px-3"
        >
          {fetching ? <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" /> : <RefreshCw className="w-3 h-3" />}
          <span>{fetching ? 'Fetching...' : 'Import'}</span>
        </button>
        <button onClick={onToggle} className="btn-glass p-2">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={onToggle}
      className="inline-flex items-center space-x-2 px-3 py-2 rounded-lg border border-[#0a66c2]/40 bg-[#0a66c2]/10 hover:bg-[#0a66c2]/20 transition-all text-xs font-semibold text-[#60a5fa]"
    >
      <LinkedInIcon />
      <span>Import from LinkedIn</span>
    </button>
  );
};

interface UserProfileProps {
  selectedPlatform?: string | null;
  onPlatformChange?: (p: string | null) => void;
}

const UserProfile = ({ selectedPlatform, onPlatformChange }: UserProfileProps) => { // NOSONAR
  const { user, profile } = useAuth();

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [formData, setFormData] = useState({
    full_name: profile?.full_name ?? '',
    company_name: profile?.company_name ?? '',
    timezone: profile?.timezone ?? 'UTC',
    avatar_url: '',
  });
  const [showAvatarInput, setShowAvatarInput] = useState(false);
  const [formInitialized, setFormInitialized] = useState(false);
  const [initialFormData, setInitialFormData] = useState<Record<string, unknown> | null>(null);
  const [initialIdentity, setInitialIdentity] = useState<Record<string, unknown> | null>(null);

  const [identity, setIdentity] = useState({
    personal_bio: '',
    job_title: '',
    skills: '',
    value_proposition: '',
    company_description: '',
    company_industry: '',
    company_size: '',
    company_tagline: '',
    company_headquarters: '',
    company_website: '',
    company_logo_url: '',
    target_audience: '',
  });

  const [linkedinCompanyUrl, setLinkedinCompanyUrl] = useState('');
  const [linkedinFetching, setLinkedinFetching] = useState<'company' | null>(null);
  const [showLinkedinCompanyInput, setShowLinkedinCompanyInput] = useState(false);

  const [subscriptionData, setSubscriptionData] = useState<SubscriptionState | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);

  const [summary, setSummary] = useState<{
    professional_identity: string;
    company_positioning: string;
    outreach_angles: string[];
    ideal_customer_profile: string;
  } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    if (!user || formInitialized) return;
    (async () => {
      let mongoUser: Record<string, unknown> = {};
      try {
        const token = await getAuthToken();
        const res = await fetch(`${API_URL}/auth/user-profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          mongoUser = data.user || {};
        } else {
          // profile fetch failed — form initialises from Auth0 profile below
        }
      } catch { /* profile load failed — form initialises from defaults below */ }

      // Always initialize — even on fetch failure — so save button becomes active
      const initial = {
        full_name: (mongoUser.full_name as string | undefined) ?? profile?.full_name ?? '',
        company_name: (mongoUser.company_name as string | undefined) ?? '',
        timezone: (mongoUser.timezone as string | undefined) ?? 'UTC',
        avatar_url: (mongoUser.avatar_url as string | undefined) ?? profile?.avatar_url ?? '',
      };
      setFormData(initial);
      setInitialFormData(initial);

      const merged = { ...identity, ...(mongoUser.sender_identity as object) };
      setIdentity(merged);
      setInitialIdentity(merged);

      if (mongoUser.ai_summary) setSummary(mongoUser.ai_summary as Parameters<typeof setSummary>[0]);

      setFormInitialized(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, formInitialized]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await getAuthToken();
        const { data } = await axios.get(`${API_URL}/api/subscription/status/${user.sub}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setSubscriptionData({
          plan: (data.plan as string | undefined) ?? 'free',
          price: (data.subscription_details?.price as number | undefined) ?? 0,
          cancel_at_period_end: (data.subscription_details?.cancel_at_period_end as boolean | undefined) ?? false,
          current_period_end: (data.subscription?.current_period_end as string | undefined) ?? (data.period?.end as string | undefined) ?? null,
        });
      } catch {
        // intentional
      }
    })();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/auth/user-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...formData, sender_identity: identity }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }
      setInitialFormData({ ...formData });
      setInitialIdentity({ ...identity });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      notify('Profile Saved', 'Your profile has been updated successfully.', 'success');
    } catch (err: unknown) {
      notify('Save Failed', err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateSummary = async () => {
    setSummaryLoading(true);
    setSummary(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/auth/profile-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          profile: {
            full_name: formData.full_name,
            company_name: formData.company_name,
            ...identity,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSummary(data.summary);
        // Persist to MongoDB so it repopulates on next load
        await fetch(`${API_URL}/auth/user-profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ai_summary: data.summary }),
        });
      }
    } catch {
      // silent fail — user still sees the button
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!user) return;
    setCancelLoading(true);
    setCancelMessage(null);
    try {
      const token = await getAuthToken();
      await axios.post(`${API_URL}/api/subscription/cancel/${user.sub}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCancelMessage('Your subscription will be cancelled at the end of the billing period.');
      setShowCancelConfirm(false);
      setSubscriptionData((prev) => prev ? { ...prev, cancel_at_period_end: true } : prev);
    } catch {
      setCancelMessage('Failed to cancel subscription. Please try again.');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleLinkedInFetch = async () => {
    if (!linkedinCompanyUrl.trim()) return;

    let fullUrl = linkedinCompanyUrl.startsWith('http')
      ? linkedinCompanyUrl
      : `https://www.linkedin.com/${linkedinCompanyUrl}`;

    if (fullUrl.includes('linkedin.com/company/')) {
      const slug = fullUrl.split('linkedin.com/company/')[1].split('/')[0].split('?')[0];
      fullUrl = `https://www.linkedin.com/company/${slug}/`;
    }

    setLinkedinFetching('company');
    try {
      const res = await fetch(`${API_URL}/api/company-report?link=${encodeURIComponent(fullUrl)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.company_name && !data.company_name.toLowerCase().includes('login')) {
          setFormData(p => ({ ...p, company_name: data.company_name }));
        }
        setIdentity(p => ({
          ...p,
          company_description: data.about || p.company_description,
          company_industry: data.industry || p.company_industry,
          company_size: (data.company_size || data.size || '').replaceAll('-', '–') || p.company_size,
          company_tagline: data.headline || p.company_tagline,
          company_headquarters: data.headquarters || p.company_headquarters,
          company_website: data.website || p.company_website,
          company_logo_url: data.logo_url || p.company_logo_url,
        }));
        setShowLinkedinCompanyInput(false);
        setLinkedinCompanyUrl('');
      } else {
        notify('LinkedIn Import Failed', 'Could not fetch LinkedIn data. Ensure the profile URL is public.', 'error');
      }
    } catch {
      notify('LinkedIn Import Failed', 'Failed to fetch LinkedIn data. Please fill in manually.', 'error');
    } finally {
      setLinkedinFetching(null);
    }
  };


  if (!user || !profile) {
    return (
      <div className="glass-panel">
        <div className="animate-pulse space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-glass-white" />
            <div className="flex-1 space-y-2.5">
              <div className="h-5 bg-glass-white rounded-lg w-1/3" />
              <div className="h-3.5 bg-glass-white rounded w-1/2" />
              <div className="h-3 bg-glass-white rounded w-1/4" />
            </div>
          </div>
          <div className="h-px bg-glass-white rounded" />
          <div className="grid grid-cols-2 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-10 bg-glass-white rounded-lg" />)}
          </div>
        </div>
      </div>
    );
  }

  const initials = (profile.full_name || user.email || '?')
    .split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

  const isPaidPlan = subscriptionData?.plan !== 'free';
  const isDirty =
    (!!initialFormData && JSON.stringify(formData) !== JSON.stringify(initialFormData)) ||
    (!!initialIdentity && JSON.stringify(identity) !== JSON.stringify(initialIdentity));

  const fieldLabel = (htmlFor: string, text: string) => (
    <label htmlFor={htmlFor} className="block text-[10px] font-bold uppercase tracking-widest text-dark-text-muted/70 mb-1.5">{text}</label>
  );

  return (
    <motion.div
      className="space-y-6 pb-24"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >

      {/* ── HERO HEADER CARD ── */}
      <div className="glass-panel">
        <div className="flex items-center gap-6 flex-wrap">

          {/* Avatar */}
          <div className="flex-shrink-0 space-y-2">
            <div className="relative group w-20 h-20">
              <div className="w-20 h-20 bg-gradient-teal-blue rounded-2xl flex items-center justify-center shadow-glow-teal overflow-hidden">
                {formData.avatar_url
                  ? <img src={formData.avatar_url} alt="Avatar" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  : <span className="text-white font-bold text-2xl tracking-tight">{initials}</span>
                }
              </div>
              <button
                type="button"
                onClick={() => setShowAvatarInput(p => !p)}
                className="absolute inset-0 rounded-2xl bg-black/55 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer select-none"
              >
                <Camera className="w-5 h-5 text-white" />
                <span className="text-white text-[10px] font-semibold mt-0.5">Change</span>
              </button>
            </div>
            {showAvatarInput && (
              <motion.div
                className="flex items-center gap-1.5"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
              >
                <input
                  type="text"
                  value={formData.avatar_url}
                  onChange={e => setFormData(p => ({ ...p, avatar_url: e.target.value }))}
                  placeholder="Paste image URL…"
                  className="input-glass text-xs py-1.5 px-2 w-48"
                  autoFocus
                />
                <button onClick={() => setShowAvatarInput(false)} className="btn-glass p-1.5">
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            )}
          </div>

          {/* Identity — center */}
          <div className="flex-1 min-w-0">
            <p className="text-[22px] font-bold text-dark-text leading-tight truncate">
              {formData.full_name || user.email}
            </p>
            <p className="text-[14px] text-dark-text-muted truncate mt-0.5">{user.email}</p>
            {identity.job_title && (
              <p className="text-[12px] font-semibold text-accent-teal mt-1 truncate">{identity.job_title}</p>
            )}
          </div>

          {/* Right: Plan badge + upgrade/renews */}
          <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
            {/* Plan badge */}
            <div className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-semibold ${
              isPaidPlan
                ? 'bg-gradient-teal-blue/15 border-accent-teal/30 text-accent-teal shadow-glow-teal/20'
                : 'bg-glass-white border-glass-border text-dark-text-muted'
            }`}>
              <Crown className="w-4 h-4 flex-shrink-0" />
              <span className="capitalize">{subscriptionData?.plan ?? 'Free'}</span>
            </div>

            {/* Renews/ends date — paid */}
            {isPaidPlan && subscriptionData?.current_period_end && (
              <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border bg-glass-white border-glass-border text-sm text-dark-text-muted">
                <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                <span>
                  {subscriptionData.cancel_at_period_end ? 'Ends ' : 'Renews '}
                  {new Date(subscriptionData.current_period_end).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
            )}

            {/* Upgrade button — free plan */}
            {!isPaidPlan && (
              <button
                onClick={() => globalThis.dispatchEvent(new CustomEvent('navigateToSubscription'))}
                className="text-xs px-4 py-2.5 rounded-xl btn-gradient shadow-glow-teal font-semibold"
              >
                Upgrade to Pro
              </button>
            )}
          </div>

        </div>
      </div>

      {/* ── AI CALLOUT ── */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-accent-blue/20 bg-accent-blue/5">
        <Sparkles className="w-4 h-4 text-accent-blue flex-shrink-0" />
        <p className="text-xs text-dark-text-muted leading-relaxed">
          These fields power your AI outreach — the more detail you provide, the better your messages.
        </p>
      </div>

      {/* ── TWO-COLUMN FORM GRID ── */}
      <div className="glass-panel">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── LEFT: About You ── */}
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-orange-pink rounded-lg flex items-center justify-center shadow-glow-orange flex-shrink-0">
                <User className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-dark-text">About You</p>
                <p className="text-xs text-dark-text-muted">Your personal professional identity</p>
              </div>
            </div>

            <div>
              {fieldLabel('up-full_name', 'Full Name')}
              <input
                id="up-full_name"
                type="text"
                value={formData.full_name}
                onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                className="input-glass w-full"
                placeholder="Enter your full name"
              />
            </div>

            <div>
              {fieldLabel('up-job_title', 'Job Title')}
              <input
                id="up-job_title"
                type="text"
                value={identity.job_title}
                onChange={e => setIdentity(p => ({ ...p, job_title: e.target.value }))}
                className="input-glass w-full"
                placeholder="e.g. Head of Growth, Founder, VP Sales"
              />
            </div>

            <div>
              {fieldLabel('up-personal_bio', 'Professional Bio')}
              <textarea
                id="up-personal_bio"
                rows={4}
                value={identity.personal_bio}
                onChange={e => setIdentity(p => ({ ...p, personal_bio: e.target.value }))}
                placeholder="I'm a B2B growth consultant with 8 years helping SaaS companies scale from $1M to $10M ARR..."
                className="input-glass w-full resize-none text-sm leading-relaxed"
              />
            </div>

            <div>
              {fieldLabel('up-skills', 'Skills & Expertise')}
              <textarea
                id="up-skills"
                rows={3}
                value={identity.skills}
                onChange={e => setIdentity(p => ({ ...p, skills: e.target.value }))}
                placeholder="Lead generation, Cold outreach, LinkedIn Sales Navigator..."
                className="input-glass w-full resize-none text-sm"
              />
            </div>

            <div>
              {fieldLabel('up-value_proposition', 'Value Proposition')}
              <textarea
                id="up-value_proposition"
                rows={3}
                value={identity.value_proposition}
                onChange={e => setIdentity(p => ({ ...p, value_proposition: e.target.value }))}
                placeholder="I help B2B founders book 10–15 qualified discovery calls per month..."
                className="input-glass w-full resize-none text-sm"
              />
            </div>
          </div>

          {/* ── RIGHT: Your Company ── */}
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-teal-blue rounded-lg flex items-center justify-center shadow-glow-teal flex-shrink-0">
                  <Building className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-dark-text">Your Company</p>
                  <p className="text-xs text-dark-text-muted">Context the AI uses to frame your offer</p>
                </div>
              </div>
              <LinkedInImport
                show={showLinkedinCompanyInput}
                url={linkedinCompanyUrl}
                onUrlChange={setLinkedinCompanyUrl}
                onToggle={() => { setShowLinkedinCompanyInput(p => !p); setLinkedinCompanyUrl(''); }}
                fetching={linkedinFetching === 'company'}
                onFetch={handleLinkedInFetch}
              />
            </div>

            {/* Company logo + description side by side */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                {fieldLabel('up-company_logo_url', 'Logo')}
                <div className="w-20 h-20 bg-gradient-teal-blue rounded-xl flex items-center justify-center shadow-glow-teal overflow-hidden">
                  {identity.company_logo_url
                    ? <img src={identity.company_logo_url} alt="logo" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    : <Building className="w-8 h-8 text-white opacity-70" />
                  }
                </div>
              </div>
              <div className="flex-1 min-w-0">
                {fieldLabel('up-company_description', 'Company Description')}
                <textarea
                  id="up-company_description"
                  rows={4}
                  value={identity.company_description}
                  onChange={e => setIdentity(p => ({ ...p, company_description: e.target.value }))}
                  placeholder="SocialFlow is an AI-powered lead generation platform that helps B2B sales teams identify high-intent prospects..."
                  className="input-glass w-full h-[88px] resize-none text-sm leading-relaxed"
                />
              </div>
            </div>

            <div>
              {fieldLabel('up-company_name', 'Company Name')}
              <input
                id="up-company_name"
                type="text"
                value={formData.company_name}
                onChange={e => setFormData({ ...formData, company_name: e.target.value })}
                className="input-glass w-full"
                placeholder="Enter your company name"
              />
            </div>

            <div>
              {fieldLabel('up-company_industry', 'Industry / Niche')}
              <input
                id="up-company_industry"
                type="text"
                value={identity.company_industry}
                onChange={e => setIdentity(p => ({ ...p, company_industry: e.target.value }))}
                placeholder="e.g. B2B SaaS, Marketing Technology..."
                className="input-glass w-full text-sm"
              />
            </div>

            <div>
              {fieldLabel('up-company_size', 'Company Size')}
              <select
                id="up-company_size"
                value={identity.company_size}
                onChange={e => setIdentity(p => ({ ...p, company_size: e.target.value }))}
                className="input-glass w-full text-sm"
              >
                <option value="">Select size...</option>
                {['Solo / Freelancer', '2–10 employees', '11–50 employees', '51–200 employees', '201–500 employees', '500+ employees']
                  .map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              {fieldLabel('up-company_tagline', 'Company Tagline')}
              <input
                id="up-company_tagline"
                type="text"
                value={identity.company_tagline}
                onChange={e => setIdentity(p => ({ ...p, company_tagline: e.target.value }))}
                placeholder="e.g. AI-powered growth for B2B teams"
                className="input-glass w-full text-sm"
              />
            </div>

            <div>
              {fieldLabel('up-company_headquarters', 'Headquarters')}
              <input
                id="up-company_headquarters"
                type="text"
                value={identity.company_headquarters}
                onChange={e => setIdentity(p => ({ ...p, company_headquarters: e.target.value }))}
                placeholder="e.g. San Francisco, CA"
                className="input-glass w-full text-sm"
              />
            </div>

            <div>
              {fieldLabel('up-company_website', 'Company Website')}
              <input
                id="up-company_website"
                type="text"
                value={identity.company_website}
                onChange={e => setIdentity(p => ({ ...p, company_website: e.target.value }))}
                placeholder="e.g. https://socialflow.network"
                className="input-glass w-full text-sm"
              />
            </div>

            <div>
              {fieldLabel('up-target_audience', 'Ideal Target Audience')}
              <textarea
                id="up-target_audience"
                rows={3}
                value={identity.target_audience}
                onChange={e => setIdentity(p => ({ ...p, target_audience: e.target.value }))}
                placeholder="Founders and VP of Sales at B2B SaaS companies with 10–100 employees..."
                className="input-glass w-full resize-none text-sm"
              />
            </div>
          </div>

        </div>
      </div>

      {/* ── AI PROFILE SUMMARY ── */}
      <div className="glass-panel space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-teal-blue rounded-lg flex items-center justify-center shadow-glow-teal">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-dark-text">AI Profile Summary</p>
              <p className="text-xs text-dark-text-muted">Instant insights on your positioning, outreach angles and ideal customer</p>
            </div>
          </div>
          <button
            onClick={handleGenerateSummary}
            disabled={summaryLoading}
            className="flex items-center space-x-2 btn-gradient disabled:opacity-50"
          >
            {summaryLoading
              ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
              : <Sparkles className="w-3.5 h-3.5" />}
            <span>
              {summaryLoading && 'Generating…'}
              {!summaryLoading && summary && 'Regenerate'}
              {!summaryLoading && !summary && 'Generate Summary'}
            </span>
          </button>
        </div>

        {!summary && !summaryLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-glass-white flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-dark-text-muted" />
            </div>
            <p className="text-sm text-dark-text-muted max-w-sm leading-relaxed">
              Fill in your profile above and hit{' '}
              <span className="text-dark-text font-medium">Generate Summary</span> — the AI will analyse your identity and produce a personalised positioning brief.
            </p>
          </div>
        )}

        {summaryLoading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-teal" />
            <p className="text-sm text-dark-text-muted">Analysing your profile…</p>
          </div>
        )}

        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card p-5 space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-gradient-orange-pink rounded-lg flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-white" />
                </div>
                <p className="text-[10px] font-bold text-dark-text uppercase tracking-widest">Professional Identity</p>
              </div>
              <p className="text-sm text-dark-text-muted leading-relaxed">{summary.professional_identity}</p>
            </div>

            <div className="glass-card p-5 space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-gradient-teal-blue rounded-lg flex items-center justify-center">
                  <Building className="w-3.5 h-3.5 text-white" />
                </div>
                <p className="text-[10px] font-bold text-dark-text uppercase tracking-widest">Company Positioning</p>
              </div>
              <p className="text-sm text-dark-text-muted leading-relaxed">{summary.company_positioning}</p>
            </div>

            <div className="glass-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-gradient-teal-blue rounded-lg flex items-center justify-center">
                  <Target className="w-3.5 h-3.5 text-white" />
                </div>
                <p className="text-[10px] font-bold text-dark-text uppercase tracking-widest">Outreach Angles</p>
              </div>
              <ul className="space-y-2">
                {summary.outreach_angles.map((angle) => (
                  <li key={angle} className="flex items-start gap-2 text-sm text-dark-text-muted">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent-teal flex-shrink-0" />
                    {angle}
                  </li>
                ))}
              </ul>
            </div>

            <div className="glass-card p-5 space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-gradient-orange-pink rounded-lg flex items-center justify-center">
                  <Users className="w-3.5 h-3.5 text-white" />
                </div>
                <p className="text-[10px] font-bold text-dark-text uppercase tracking-widest">Ideal Customer Profile</p>
              </div>
              <p className="text-sm text-dark-text-muted leading-relaxed">{summary.ideal_customer_profile}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── SUBSCRIPTION & BILLING ── */}
      <div className="glass-panel space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-teal-blue rounded-lg flex items-center justify-center shadow-glow-teal">
            <CreditCard className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-dark-text">Subscription & Billing</p>
            <p className="text-xs text-dark-text-muted">Manage your current plan</p>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 glass-card rounded-xl flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isPaidPlan ? 'bg-gradient-teal-blue shadow-glow-teal' : 'bg-glass-white border border-glass-border'}`}>
              <Crown className={`w-5 h-5 ${isPaidPlan ? 'text-white' : 'text-dark-text-muted'}`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-dark-text capitalize">{subscriptionData?.plan ?? 'Free'} Plan</p>
              {isPaidPlan && subscriptionData?.current_period_end && (
                <p className="text-xs text-dark-text-muted mt-0.5 flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  {subscriptionData.cancel_at_period_end ? 'Access ends ' : 'Renews '}
                  {new Date(subscriptionData.current_period_end).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>

          {!isPaidPlan && (
            <button
              onClick={() => globalThis.dispatchEvent(new CustomEvent('navigateToSubscription'))}
              className="text-xs px-4 py-2 rounded-xl btn-gradient shadow-glow-teal font-semibold"
            >
              Upgrade to Pro
            </button>
          )}

          {isPaidPlan && !subscriptionData?.cancel_at_period_end && (
            <div className="flex flex-col items-end gap-2">
              {cancelMessage && (
                <p className={`text-xs ${cancelMessage.includes('Failed') ? 'text-red-400' : 'text-emerald-400'}`}>
                  {cancelMessage}
                </p>
              )}
              {showCancelConfirm ? (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-red-500/25 bg-red-500/8">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-dark-text">Cancel your subscription?</p>
                    <p className="text-xs text-dark-text-muted mt-0.5">You'll keep access until the billing period ends.</p>
                  </div>
                  <div className="flex items-center gap-2 ml-1">
                    <button
                      onClick={() => setShowCancelConfirm(false)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-glass-white hover:bg-glass-white-hover border border-glass-border text-dark-text-muted transition-all"
                    >
                      Keep Plan
                    </button>
                    <button
                      onClick={handleCancelSubscription}
                      disabled={cancelLoading}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 transition-all disabled:opacity-50"
                    >
                      {cancelLoading ? 'Cancelling…' : 'Yes, Cancel'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="text-xs px-4 py-2 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/10 hover:border-red-500/35 transition-all"
                >
                  Cancel Subscription
                </button>
              )}
            </div>
          )}

          {subscriptionData?.cancel_at_period_end && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-yellow-500/25 bg-yellow-500/8 text-yellow-400 text-sm font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Cancellation scheduled
            </div>
          )}
        </div>

        {cancelMessage && !showCancelConfirm && (
          <p className={`text-xs px-1 ${cancelMessage.includes('Failed') ? 'text-red-400' : 'text-emerald-400'}`}>
            {cancelMessage}
          </p>
        )}
      </div>

      {/* ── CONNECTED PLATFORMS ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Workflow className="h-5 w-5 text-accent-teal" />
          <h2 className="text-lg font-bold text-dark-text">Connected Platforms</h2>
        </div>
        <SocialIntegration
          selectedPlatform={selectedPlatform ?? null}
          onPlatformChange={onPlatformChange ?? (() => {})}
        />
      </div>

      {/* ── STICKY SAVE BAR ── */}
      <AnimatePresence>
        {isDirty && (
          <motion.div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <div className="flex items-center gap-4 px-5 py-3 rounded-full border border-glass-border bg-[rgba(10,14,26,0.88)] backdrop-blur-xl shadow-2xl">
              <span className="text-sm text-dark-text-muted whitespace-nowrap">Unsaved changes</span>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`flex items-center gap-2 text-sm font-semibold px-4 py-1.5 rounded-full transition-all disabled:opacity-50 ${
                  saved ? 'btn-glass text-accent-teal' : 'btn-gradient shadow-glow-teal'
                }`}
              >
                {saving && <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />}
                {!saving && saved && <CheckCircle className="w-3.5 h-3.5" />}
                {!saving && !saved && <Save className="w-3.5 h-3.5" />}
                <span>
                  {saving && 'Saving...'}
                  {!saving && saved && 'Saved!'}
                  {!saving && !saved && 'Save Changes'}
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
};

export default UserProfile;
