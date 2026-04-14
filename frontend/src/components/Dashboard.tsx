import { useState, useEffect, useRef } from 'react';
import * as leadsSearchService from '../services/leadsSearchService';
import * as companyAnalysisService from '../services/companyAnalysisService';
import { API_BASE_URL } from '../config/api';

// ── Count-up animation hook ───────────────────────────────────────────────────
const useCountUp = (target: number, duration = 900, active = true) => {
  const [count, setCount] = useState(0);
  const frameRef = useRef<number>();
  useEffect(() => {
    if (!active) { setCount(0); return; }
    if (target === 0) { setCount(0); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setCount(Math.round(eased * target));
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [target, duration, active]);
  return count;
};
import {
  Home, Cable,
  Linkedin, Wallet,
  Sparkles, UserCheck, User, Building2, LogOut, ChevronDown, Mail,
  ChevronLeft, ChevronRight, Video, Crown, Bell,
  BookOpen,
  Workflow
} from 'lucide-react';

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
  </svg>
);
import OnboardingTour from './OnboardingTour';
import WelcomeModal from './WelcomeModal';
import ChatBot from './ChatBot';
import VideoStudio from './videostudio/VideoStudio';
import SeedanceStudio from './SeedanceStudio';
import CreditRating from './CreditRating';
import Leads from './Leads';
import UserProfile from './UserProfile';
import SubscriptionModal from './SubscriptionModal';
import Footer from './Footer';
import PrivacyPolicy from './PrivacyPolicy';
import CookiePolicy from './CookiePolicy';
import SecurityPolicy from './SecurityPolicy';
import { getAuthToken } from '../utils/getAuthToken';
import { useAuth } from '../hooks/useSupabase';
import { integrationsService } from '../services/integrationsService';
import { API_BASE_URL } from '../config/api';
import ChannelDashboard from './channels/ChannelDashboard';
import PipelineBuilder from './channels/PipelineBuilder';
import { AnimatePresence } from 'framer-motion';

interface DashboardProps {
  onLogout: () => void;
}

interface DashboardCompany {
  name: string;
  industry?: string;
  last_updated?: string;
  logo_url?: string;
}

interface DashboardVideo {
  _id?: string;
  title?: string;
  company_name?: string;
  created_at?: string;
  createdAt?: string;
  company_logo?: string | null;
}

interface DashboardLead {
  _id?: string;
  name?: string;
  company?: string;
  industry?: string;
  job_title?: string;
  custom_fields?: Record<string, unknown>;
  created_at?: string;
  createdAt?: string;
}

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
);

const YouTubeIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const ICON_CONTAINER_CLASS = 'w-12 h-12 bg-gradient-teal-blue rounded-xl flex items-center justify-center shadow-glow-teal';

const getInitials = (name: string) =>
  name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) ?? '??';

const relativeDate = (dateStr: string) => {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
};

const Dashboard = ({ onLogout }: DashboardProps) => { // NOSONAR
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [platformConnections, setPlatformConnections] = useState<Record<string, boolean>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [policyPage, setPolicyPage] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const [mongoProfile, setMongoProfile] = useState<{
    full_name?: string;
    avatar_url?: string;
    company_name?: string;
    job_title?: string;
  } | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  const [analysisQuery, setAnalysisQuery] = useState('');
  const [activityTab, setActivityTab] = useState<'all' | 'companies' | 'videos' | 'leads'>('all');

  const [dashboardStats, setDashboardStats] = useState({ leads: 0, companies: 0, videos: 0 });
  const [recentCompanies, setRecentCompanies] = useState<DashboardCompany[]>([]);
  const [recentVideos, setRecentVideos] = useState<DashboardVideo[]>([]);
  const [allSavedLeads, setAllSavedLeads] = useState<DashboardLead[]>([]);
  const [companyLogoMap, setCompanyLogoMap] = useState<Record<string, string>>({});
  const [statsLoading, setStatsLoading] = useState(true);

  // Count-up values for stat cards (only animate when not loading)
  const leadsCount    = useCountUp(dashboardStats.leads,     900, !statsLoading);
  const companiesCount = useCountUp(dashboardStats.companies, 900, !statsLoading);
  const videosCount   = useCountUp(dashboardStats.videos,    900, !statsLoading);

  const [showVideoModal, setShowVideoModal] = useState(false);
  const handleOpenVideo = () => setShowVideoModal(true);
  const handleCloseVideo = () => setShowVideoModal(false);

  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  // ── Channel pipeline overlay state ────────────────────────────────────────
  const [activePipelineChannel, setActivePipelineChannel] = useState<string | null>(null);
  const [showPipelineOverlay, setShowPipelineOverlay] = useState(false);

  // ── Background search indicator (leads + company analysis) ────────────────
  const isLeadsRunning = () => leadsSearchService.getState()?.status === 'running';
  const isCompanyRunning = () => {
    const s = companyAnalysisService.getState()?.status;
    return s === 'running' || s === 'risk-analysis';
  };
  const [bgSearchRunning, setBgSearchRunning] = useState(
    () => isLeadsRunning() || isCompanyRunning(),
  );
  useEffect(() => {
    const update = () => setBgSearchRunning(isLeadsRunning() || isCompanyRunning());
    update();
    const unsubLeads = leadsSearchService.subscribe(update);
    const unsubCompany = companyAnalysisService.subscribe(update);
    return () => { unsubLeads(); unsubCompany(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── In-app notifications ───────────────────────────────────────────────────
  interface AppNotification {
    id: string;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
    timestamp: number;
    read: boolean;
  }
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNavigate = (page: string) => {
    if (page === 'privacy-policy' || page === 'cookie-policy' || page === 'security-policy') {
      setPolicyPage(page);
      globalThis.scrollTo(0, 0);
    }
  };

  useEffect(() => {
    const loadPlatformConnections = async () => {
      try {
        const integrations = await integrationsService.getIntegrations();
        const connections: Record<string, boolean> = {};
        integrations.forEach(integration => {
          connections[integration.platform] = integration.is_connected;
        });
        setPlatformConnections(connections);
      } catch {
        // platform connections load failed — dashboard shows defaults
      }
    };
    if (user) loadPlatformConnections();

    // Re-fetch when SocialIntegration saves/resets a platform
    const handleIntegrationsUpdate = () => { if (user) loadPlatformConnections(); };
    window.addEventListener('integrations:updated', handleIntegrationsUpdate);
    return () => window.removeEventListener('integrations:updated', handleIntegrationsUpdate);
  }, [user]);

  useEffect(() => {
    const fetchPlan = async () => {
      if (!user?.sub) return;
      try {
        const token = await getAuthToken();
        const response = await fetch(`${API_BASE_URL}/api/subscription/status/${user.sub}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        setCurrentPlan(data.plan ?? 'free');
      } catch {
        setCurrentPlan('free');
      }
    };
    fetchPlan();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const loadMongoProfile = async () => {
      try {
        const token = await getAuthToken();
        const r = await fetch(`${API_BASE_URL}/auth/user-profile`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return;
        const data = await r.json();
        if (data?.user)
          setMongoProfile({
            full_name: data.user.full_name,
            avatar_url: data.user.avatar_url,
            company_name: data.user.company_name,
            job_title: data.user.sender_identity?.job_title,
          });
      } catch { /* profile load failed silently */ }
    };
    loadMongoProfile();
  }, [user]);


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initialise AudioContext on first user click so it's unlocked for later async sounds
  useEffect(() => {
    const unlock = () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      } else if (audioCtxRef.current.state === 'suspended') {
        void audioCtxRef.current.resume();
      }
    };
    document.addEventListener('click', unlock, { once: false });
    return () => document.removeEventListener('click', unlock);
  }, []);

  // Listen for app-wide notification events dispatched by VideoStudio or other features
  useEffect(() => {
    const playChime = (type: AppNotification['type']) => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const play = () => {
        try {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          const freqMap: Record<string, number> = { success: 880, error: 220, warning: 440, info: 520 };
          osc.frequency.value = freqMap[type] ?? 520;
          osc.type = type === 'error' ? 'sawtooth' : 'sine';
          gain.gain.setValueAtTime(0.18, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.6);
        } catch { /* silent */ }
      };
      if (ctx.state === 'suspended') {
        void ctx.resume().then(play);
      } else {
        play();
      }
    };

    const handler = (e: Event) => {
      const { title, message, type } = (e as CustomEvent<{ title: string; message: string; type: AppNotification['type'] }>).detail;
      playChime(type ?? 'info');
      setNotifications(prev => [
        { id: `${Date.now()}-${Math.random()}`, title, message, type: type ?? 'info', timestamp: Date.now(), read: false },
        ...prev.slice(0, 49),
      ]);
    };
    globalThis.addEventListener('app-notification', handler);
    return () => globalThis.removeEventListener('app-notification', handler);
  }, []);

  useEffect(() => {
    const handleNavigateToSubscription = () => setShowSubscriptionModal(true);
    const handleNavigateTo = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.page) return;
      if (detail.companyName) setAnalysisQuery(detail.companyName);
      const page = detail.page === 'my-videos' ? 'video-studio' : detail.page;
      setActiveTab(page);
    };
    globalThis.addEventListener('navigateToSubscription', handleNavigateToSubscription);
    globalThis.addEventListener('navigateTo', handleNavigateTo);
    return () => {
      globalThis.removeEventListener('navigateToSubscription', handleNavigateToSubscription);
      globalThis.removeEventListener('navigateTo', handleNavigateTo);
    };
  }, []);

  useEffect(() => {
    if (globalThis.location.pathname !== '/') globalThis.history.replaceState({}, '', '/');
    globalThis.scrollTo({ top: 0, behavior: 'smooth' });
    // Tab transition animation
    const el = mainRef.current;
    if (!el) return;
    el.classList.remove('tab-enter');
    void el.offsetWidth; // force reflow
    el.classList.add('tab-enter');
    const timer = setTimeout(() => el.classList.remove('tab-enter'), 500);
    return () => clearTimeout(timer);
  }, [activeTab]);

  useEffect(() => {
    if (!user) return;
    const fetchDashboardStats = async () => {
      setStatsLoading(true);
      const token = await getAuthToken();
      const h = { Authorization: `Bearer ${token}` };
      const [leadsR, companiesR, videosR] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/leads/`, { headers: h }).then(r => r.json()),
        fetch(`${API_BASE_URL}/companies`, { headers: h }).then(r => r.json()),
        fetch(`${API_BASE_URL}/videos/?limit=50`, { headers: h }).then(r => r.json()),
      ]);

      const leads      = leadsR.status     === 'fulfilled' ? leadsR.value     : null;
      const companies  = companiesR.status === 'fulfilled' ? companiesR.value : null;
      const videosList = videosR.status    === 'fulfilled' ? videosR.value    : null;

      let leadList: Record<string, unknown>[] = [];
      if (Array.isArray(leads)) leadList = leads;
      else if (Array.isArray(leads?.leads)) leadList = leads.leads;

      const companyList: Record<string, unknown>[] = Array.isArray(companies?.companies) ? companies.companies : [];

      let videoList: Record<string, unknown>[] = [];
      if (Array.isArray(videosList)) videoList = videosList;
      else if (Array.isArray(videosList?.videos)) videoList = videosList.videos;

      setDashboardStats({
        leads:     leadList.length,
        companies: companyList.length,
        videos:    videoList.length,
      });

      setRecentCompanies(
        [...companyList]
          .sort((a, b) => new Date((b.last_updated as string) || 0).getTime() - new Date((a.last_updated as string) || 0).getTime())
          .slice(0, 3) as unknown as DashboardCompany[]
      );
      const logoMap: Record<string, string> = {};
      companyList.forEach(c => {
        if (typeof c.name === 'string' && typeof c.logo_url === 'string' && c.name && c.logo_url)
          logoMap[c.name.toLowerCase()] = c.logo_url;
      });
      setCompanyLogoMap(logoMap);
      setRecentVideos(
        videoList.slice(0, 3).map(v => ({
          ...v,
          company_logo: typeof v.company_name === 'string'
            ? (logoMap[v.company_name.toLowerCase()] ?? null)
            : null,
        })) as unknown as DashboardVideo[]
      );
      setAllSavedLeads(leadList as unknown as DashboardLead[]);
      setStatsLoading(false);
    };
    fetchDashboardStats();
  }, [user]);

  useEffect(() => {
    if (activeTab !== 'company-analysis') setAnalysisQuery('');
  }, [activeTab]);

  const socialPlatforms = [
    { name: 'Gmail',     icon: Mail,     bgColor: 'bg-red-500',                                                       platform: 'gmail'     },
    { name: 'Facebook',  icon: FacebookIcon,  bgColor: 'bg-blue-600',                                                   platform: 'facebook'  },
    { name: 'Instagram', icon: InstagramIcon, bgColor: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500', platform: 'instagram' },
    { name: 'YouTube',   icon: YouTubeIcon,   bgColor: 'bg-red-600',                                                   platform: 'youtube'   },
    { name: 'LinkedIn',  icon: Linkedin,  bgColor: 'bg-blue-700',                                                      platform: 'linkedin'  },
  ];

  if (policyPage === 'privacy-policy')  return <PrivacyPolicy   onBack={() => setPolicyPage(null)} />;
  if (policyPage === 'cookie-policy')   return <CookiePolicy    onBack={() => setPolicyPage(null)} />;
  if (policyPage === 'security-policy') return <SecurityPolicy  onBack={() => setPolicyPage(null)} />;

  // ─────────────────────────────────────────────────────────────
  // DASHBOARD CONTENT
  // ─────────────────────────────────────────────────────────────
  const renderDashboardContent = () => {
    const firstName = (mongoProfile?.full_name ?? profile?.full_name ?? user?.name ?? '').split(' ')[0];
    const hour = new Date().getHours();
    const greeting = (() => {
      if (hour < 12) return 'Good morning';
      if (hour < 17) return 'Good afternoon';
      return 'Good evening';
    })();

    return (
      <div className="space-y-6">

        {/* ══════════════════════════════════════════════════════
            CINEMATIC WELCOME BANNER
        ══════════════════════════════════════════════════════ */}
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] p-7 md:p-9"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          {/* Gradient mesh */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'linear-gradient(135deg, rgba(29,78,216,0.22) 0%, transparent 48%), radial-gradient(ellipse at 90% 50%, rgba(6,182,212,0.14) 0%, transparent 58%)',
          }} />
          {/* Subtle dot grid */}
          <div className="absolute inset-0 pointer-events-none" style={{
            opacity: 0.04,
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }} />

          <div className="relative flex flex-wrap items-center justify-between gap-8">
            {/* ── Left: identity ── */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: '#34d399', boxShadow: '0 0 0 3px rgba(52,211,153,0.18), 0 0 10px rgba(52,211,153,0.45)' }} />
                <span className="text-[11px] font-bold tracking-[0.14em] uppercase" style={{ color: '#34d399' }}>
                  Workspace Active
                </span>
              </div>
              <h2 className="font-display font-extrabold text-dark-text leading-none mb-3"
                style={{ fontSize: 'clamp(2rem, 3.5vw, 2.8rem)', letterSpacing: '-0.035em' }}>
                {greeting}{firstName ? `, ${firstName}` : ''}.
              </h2>
              <p className="text-sm text-dark-text-muted mb-5 max-w-md leading-relaxed">
                Here's everything you've built — leads found, companies analysed, videos created.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {mongoProfile?.company_name && (
                  <span className="text-xs px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] text-dark-text-muted">
                    {mongoProfile.company_name}
                  </span>
                )}
                {mongoProfile?.job_title && (
                  <span className="text-xs px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] text-dark-text-muted">
                    {mongoProfile.job_title}
                  </span>
                )}
                <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${
                  currentPlan === 'free'
                    ? 'bg-white/[0.06] border border-white/[0.1] text-dark-text-muted'
                    : 'bg-gradient-teal-blue text-white'
                }`}>
                  {currentPlan === 'free' ? 'Free Plan' : '✦ Professional'}
                </span>
                <button
                  onClick={() => globalThis.dispatchEvent(new CustomEvent('openOnboardingTour'))}
                  className="btn-gradient"
                  style={{ padding: '0.375rem 1rem', fontSize: '0.75rem', borderRadius: '999px', gap: '0.375rem' }}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Guide Me
                </button>
              </div>
            </div>

            {/* ── Right: 3 big stat numbers ── */}
            <div className="flex items-stretch gap-0 shrink-0 rounded-2xl overflow-hidden border border-white/[0.07]"
              style={{ background: 'rgba(255,255,255,0.03)' }}>
              {[
                { label: 'Leads',     count: leadsCount,     color: '#10b981', tab: 'leads' },
                { label: 'Companies', count: companiesCount, color: '#3b82f6', tab: 'company-analysis' },
                { label: 'Videos',    count: videosCount,    color: '#06b6d4', tab: 'video-studio' },
              ].map((s, i) => (
                <button
                  key={s.label}
                  onClick={() => setActiveTab(s.tab)}
                  className="flex flex-col items-center justify-center px-8 py-5 group transition-all hover:bg-white/[0.05]"
                  style={{ borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}
                >
                  {statsLoading ? (
                    <div className="h-10 w-12 bg-glass-white animate-pulse rounded mb-1.5" />
                  ) : (
                    <span className="font-display font-extrabold text-dark-text transition-colors group-hover:text-[var(--c)]"
                      style={{ fontSize: '2.25rem', letterSpacing: '-0.05em', '--c': s.color } as React.CSSProperties}>
                      {s.count}
                    </span>
                  )}
                  <span className="text-[11px] font-semibold tracking-wide mt-0.5" style={{ color: s.color }}>
                    {s.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            ACTION RAIL — the 3 primary things you do
        ══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: UserCheck, label: 'Generate Leads',   desc: 'Discover & score prospects',    tab: 'leads',            accent: '#10b981', bg: 'rgba(16,185,129,0.12)',  glow: 'rgba(16,185,129,0.2)'  },
            { icon: Building2, label: 'Analyse Company',  desc: 'AI risk & business intel',       tab: 'company-analysis', accent: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  glow: 'rgba(59,130,246,0.2)'  },
            { icon: Video,     label: 'Video Studio',     desc: 'Create AI-powered video content',tab: 'video-studio',     accent: '#06b6d4', bg: 'rgba(6,182,212,0.12)',   glow: 'rgba(6,182,212,0.2)'   },
          ].map(({ icon: Icon, label, desc, tab, accent, bg, glow }) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="glass-card p-5 text-left group flex items-center gap-4"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:scale-110"
                style={{ background: bg, boxShadow: `0 4px 20px ${glow}` }}>
                <Icon className="h-5 w-5" style={{ color: accent }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold text-dark-text text-sm leading-tight" style={{ letterSpacing: '-0.02em' }}>{label}</p>
                <p className="text-xs text-dark-text-muted mt-0.5">{desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-dark-text-dim flex-shrink-0 -translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-200" />
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════
            TWO-COLUMN: ACTIVITY FEED + PLATFORM STATUS
        ══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* ── Activity Feed (3/5) ── */}
          <div className="lg:col-span-3">
            <div className="glass-panel" style={{ padding: '1.25rem 1.5rem' }}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-display font-bold text-dark-text" style={{ fontSize: '0.9375rem', letterSpacing: '-0.025em' }}>
                  Recent Activity
                </h3>
                {/* Tab filter */}
                <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  {(['all', 'companies', 'videos', 'leads'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setActivityTab(t)}
                      className="text-[11px] font-semibold px-3 py-1.5 rounded-md capitalize transition-all"
                      style={activityTab === t ? {
                        background: 'rgba(59,130,246,0.18)',
                        color: '#93c5fd',
                        boxShadow: '0 0 0 1px rgba(59,130,246,0.28)',
                      } : { color: 'var(--text-dim)' }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {statsLoading && (
                <div className="space-y-2.5">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="h-[52px] bg-glass-white animate-pulse rounded-xl" />
                  ))}
                </div>
              )}

              {!statsLoading && (() => {
                type FeedItem = {
                  type: 'company' | 'video' | 'lead';
                  key: string; name: string; sub: string; time: string; ts: number;
                  logo: string | null; color: string; tab: string;
                };
                const items: FeedItem[] = [];

                if (activityTab === 'all' || activityTab === 'companies') {
                  recentCompanies.forEach(c => items.push({
                    type: 'company', key: `c-${c.name}`,
                    name: c.name ?? '—', sub: c.industry ?? 'Unknown industry',
                    time: relativeDate(c.last_updated ?? ''),
                    ts: new Date(c.last_updated ?? 0).getTime() || 0,
                    logo: c.logo_url ?? null, color: '#3b82f6', tab: 'company-analysis',
                  }));
                }
                if (activityTab === 'all' || activityTab === 'videos') {
                  recentVideos.forEach(v => items.push({
                    type: 'video', key: `v-${v._id ?? v.title}`,
                    name: v.title ?? 'Untitled', sub: v.company_name ?? 'Video',
                    time: relativeDate(v.created_at ?? v.createdAt ?? ''),
                    ts: new Date(v.created_at ?? v.createdAt ?? 0).getTime() || 0,
                    logo: v.company_logo ?? null, color: '#06b6d4', tab: 'video-studio',
                  }));
                }
                if (activityTab === 'all' || activityTab === 'leads') {
                  [...allSavedLeads]
                    .sort((a, b) =>
                      new Date(String(b.created_at ?? b.createdAt ?? 0)).getTime() -
                      new Date(String(a.created_at ?? a.createdAt ?? 0)).getTime()
                    )
                    .slice(0, 3)
                    .forEach(l => items.push({
                      type: 'lead', key: `l-${String(l._id ?? l.name)}`,
                      name: (l.name ?? l.company ?? '—') as string,
                      sub: (l.job_title ?? l.industry ?? 'Lead') as string,
                      time: relativeDate((l.created_at ?? l.createdAt ?? '') as string),
                      ts: new Date(String(l.created_at ?? l.createdAt ?? 0)).getTime() || 0,
                      logo: null, color: '#10b981', tab: 'leads',
                    }));
                }

                if (items.length === 0) {
                  return (
                    <div className="py-14 text-center">
                      <p className="text-xs text-dark-text-dim">Nothing here yet.</p>
                      <button
                        onClick={() => setActiveTab(activityTab === 'companies' ? 'company-analysis' : activityTab === 'videos' ? 'video-studio' : 'leads')}
                        className="mt-3 text-xs text-accent-blue hover:underline"
                      >
                        Get started →
                      </button>
                    </div>
                  );
                }

                const typeLabel: Record<string, string> = { company: 'Company', video: 'Video', lead: 'Lead' };

                return (
                  <div className="space-y-1.5">
                    {items.sort((a, b) => b.ts - a.ts).slice(0, 6).map(item => (
                      <button
                        key={item.key}
                        onClick={() => {
                          if (item.type === 'company') {
                            setAnalysisQuery(item.name);
                            setActiveTab('company-analysis');
                          } else {
                            setActiveTab(item.tab);
                          }
                        }}
                        className="w-full flex items-center gap-3.5 p-2.5 rounded-xl hover:bg-white/[0.045] transition-all text-left group"
                      >
                        {item.logo ? (
                          <img src={item.logo} alt="" className="w-9 h-9 rounded-lg object-contain bg-white flex-shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                            style={{ background: `${item.color}18`, border: `1px solid ${item.color}2e`, color: item.color }}>
                            {getInitials(item.name)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-dark-text truncate">{item.name}</p>
                          <p className="text-xs text-dark-text-dim truncate mt-0.5">{item.sub}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: `${item.color}15`, color: item.color, border: `1px solid ${item.color}25` }}>
                            {typeLabel[item.type]}
                          </span>
                          {item.time && (
                            <span className="text-[11px] text-dark-text-dim hidden sm:block">{item.time}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ── Platform Status (2/5) ── */}
          <div className="lg:col-span-2">
            <div className="glass-panel h-full" style={{ padding: '1.25rem 1.5rem' }}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-display font-bold text-dark-text" style={{ fontSize: '0.9375rem', letterSpacing: '-0.025em' }}>
                  Platforms
                </h3>
                <span className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
                  {Object.values(platformConnections).filter(Boolean).length} / {socialPlatforms.length} live
                </span>
              </div>
              <div className="space-y-2">
                {socialPlatforms.map((platform) => {
                  const isConnected = platformConnections[platform.platform] || false;
                  const PlatformIcon = platform.icon;
                  return (
                    <div
                      key={platform.platform}
                      className="flex items-center gap-3 p-3 rounded-xl transition-all"
                      style={{
                        border: `1px solid ${isConnected ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.06)'}`,
                        background: isConnected ? 'rgba(52,211,153,0.04)' : 'rgba(255,255,255,0.02)',
                      }}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${platform.bgColor}`}>
                        <PlatformIcon className="h-4 w-4 text-white" />
                      </div>
                      <span className="text-sm font-semibold text-dark-text flex-1">{platform.name}</span>
                      {isConnected ? (
                        <span className="text-[11px] font-bold flex items-center gap-1" style={{ color: '#34d399' }}>
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Live
                        </span>
                      ) : (
                        <button
                          onClick={() => { setSelectedPlatform(platform.platform); globalThis.scrollTo({ top: 0, behavior: 'smooth' }); setActiveTab('profile'); }}
                          className="text-[11px] font-semibold px-3 py-1 rounded-lg transition-all"
                          style={{ color: '#60a5fa', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => setActiveTab('profile')}
                className="w-full mt-4 py-2.5 rounded-xl text-xs font-semibold transition-all hover:bg-white/[0.06]"
                style={{ color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                Manage all integrations →
              </button>
            </div>
          </div>

        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────
  // MAIN RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-dark">

      <OnboardingTour onNavigate={setActiveTab} />
      <WelcomeModal userName={mongoProfile?.full_name || (user as any)?.firstName || (user as any)?.name || ''} />
      <ChatBot />

      {/* ── Sidebar ── */}
      <div className={`fixed inset-y-0 left-0 z-50 sidebar-glass transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <div className="flex flex-col h-full">

          {/* Logo */}
          <div className={`flex items-center p-6 border-b border-glass-border ${sidebarCollapsed ? 'flex-col space-y-3' : 'justify-between'}`}>
            {sidebarCollapsed ? (
              <>
                <img src="/icon-nobg.png" alt="SocialFlow Logo" className="w-12 h-12 object-cover flex-shrink-0" style={{ objectPosition: 'center', aspectRatio: '1/1' }} />
                <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-1.5 hover:bg-glass-white rounded-lg transition-all text-dark-text-muted hover:text-dark-text">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center space-x-1 flex-1">
                  <img src="/icon-nobg.png" alt="SocialFlow Logo" className="w-12 h-12 object-cover flex-shrink-0" style={{ objectPosition: 'center', aspectRatio: '1/1' }} />
                  <span className="text-2xl font-display font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-teal-400 bg-clip-text text-transparent">SocialFlow</span>
                </div>
                <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-0 ml-2 hover:bg-glass-white rounded-lg transition-all text-dark-text-muted hover:text-dark-text flex-shrink-0">
                  <ChevronLeft className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          {/* Nav */}
          <nav className="flex-1 p-4 overflow-y-auto">
            <div className="space-y-1">
              {[
                { id: 'dashboard',        icon: Home,      label: 'Dashboard'         },
                { id: 'leads',            icon: UserCheck, label: 'Leads'             },
                { id: 'company-analysis', icon: Building2, label: 'Company Analysis'  },
                { id: 'video-studio',     icon: Video,      label: 'Video Studio'      },
                { id: 'seedance-studio',  icon: Sparkles,   label: 'Seedance Studio'   },
                { id: 'channels',         icon: Workflow,   label: 'Channels'          },
                { id: 'profile',          icon: User,       label: 'Profile'           },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  title={sidebarCollapsed ? item.label : ''}
                  className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-start'} ${activeTab === item.id ? 'nav-item-active' : 'nav-item'}`}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {!sidebarCollapsed && <span className="text-sm font-medium ml-3">{item.label}</span>}
                </button>
              ))}
            </div>
          </nav>

          {/* Plan Badge */}
          <div className="px-4 pb-2">
            <button
              onClick={() => setShowSubscriptionModal(true)}
              title={sidebarCollapsed ? (currentPlan === 'professional' ? 'Pro Plan' : 'Free Plan — Upgrade') : ''}
              className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center px-3' : 'gap-2 px-3'} py-2.5 rounded-xl transition-all duration-200 text-xs font-semibold border ${
                currentPlan === 'professional'
                  ? 'bg-accent-teal/10 border-accent-teal/25 text-accent-teal hover:bg-accent-teal/15'
                  : 'bg-glass-white border-glass-border text-dark-text-muted hover:bg-glass-white-hover hover:text-dark-text'
              }`}
            >
              <Wallet className="h-4 w-4 flex-shrink-0" />
              {!sidebarCollapsed && (
                <span>{currentPlan === 'professional' ? 'Pro Plan ✓' : 'Free Plan · Upgrade'}</span>
              )}
            </button>
          </div>

          {/* Sign Out */}
          <div className="p-4 border-t border-glass-border">
            <button
              onClick={() => { onLogout(); }}
              title={sidebarCollapsed ? 'Sign Out' : ''}
              className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center px-3' : 'space-x-3 px-4'} py-3 rounded-xl transition-all duration-200 font-medium text-sm bg-glass-white hover:bg-glass-white-hover text-dark-text-muted hover:text-dark-text border border-glass-border`}
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              {!sidebarCollapsed && <span>Sign Out</span>}
            </button>
          </div>

        </div>
      </div>

      {/* ── Main Content ── */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-20' : 'ml-64'}`}>

        {/* Header — hidden for Video Studio (it has its own toolbar) */}
        <header className="bg-dark-bg-light/60 backdrop-blur-2xl shadow-glass border-b border-glass-border px-8 py-4 sticky top-0 z-40">
          <div className="flex items-center justify-between w-full">
            <button
              onClick={() => setShowSubscriptionModal(true)}
              className="flex items-center space-x-2 h-10 px-3 text-sm font-semibold rounded-lg bg-dark-bg-lighter text-accent-teal border border-white/10 hover:border-white/20 hover:bg-dark-bg transition-all"
            >
              <span className="hidden sm:inline opacity-80">
                {currentPlan === 'professional' ? 'Professional' : 'Upgrade to Pro'}
              </span>
              <Crown className="h-4 w-4 text-accent-teal flex-shrink-0" />
            </button>

            <div className="flex items-center space-x-4">
              {/* Notification bell */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => {
                    setShowNotifPanel(v => !v);
                    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                  }}
                  className="relative p-2.5 text-dark-text-muted hover:text-dark-text bg-glass-white hover:bg-glass-white-hover rounded-lg transition-all duration-150"
                >
                  <Bell className={`h-5 w-5 ${bgSearchRunning ? 'text-accent-teal' : ''}`} />
                  {bgSearchRunning && (
                    <span className="absolute -top-1 -left-1 w-3 h-3 rounded-full bg-amber-400 animate-ping" />
                  )}
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-accent-teal text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-glow-teal">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {showNotifPanel && (
                  <div className="absolute right-0 mt-2 w-80 bg-dark-bg-light/95 backdrop-blur-xl border border-glass-border rounded-xl shadow-2xl z-[100] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
                      <p className="text-sm font-semibold text-dark-text">Notifications</p>
                      {notifications.length > 0 && (
                        <button
                          onClick={() => setNotifications([])}
                          className="text-[11px] text-dark-text-muted hover:text-dark-text transition-colors"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {bgSearchRunning && (
                        <div className="px-4 py-3 border-b border-glass-border flex items-center gap-2.5 bg-amber-500/5">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-amber-300">
                              {isCompanyRunning() ? 'Company Analysis Running…' : 'Lead Scan Running…'}
                            </p>
                            <p className="text-[11px] text-dark-text-muted mt-0.5">We'll notify you when results are ready.</p>
                          </div>
                        </div>
                      )}
                      {notifications.length === 0 && !bgSearchRunning ? (
                        <div className="px-4 py-8 text-center text-dark-text-dim text-sm">
                          No notifications yet
                        </div>
                      ) : (
                        notifications.map(n => (
                          <div key={n.id} className={`px-4 py-3 border-b border-glass-border/50 last:border-0 ${n.read ? 'opacity-60' : ''}`}>
                            <div className="flex items-start gap-2.5">
                              <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                                { success: 'bg-green-400', error: 'bg-red-400', warning: 'bg-amber-400', info: 'bg-accent-teal' }[n.type]
                              }`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-dark-text">{n.title}</p>
                                <p className="text-[11px] text-dark-text-muted mt-0.5 leading-snug">{n.message}</p>
                                <p className="text-[10px] text-dark-text-dim mt-1">
                                  {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-2.5 py-2 px-3 bg-glass-white hover:bg-glass-white-hover rounded-lg transition-all duration-150 border border-glass-border"
                >
                  <div className="w-9 h-9 bg-gradient-teal-blue rounded-lg flex items-center justify-center overflow-hidden">
                    {(mongoProfile?.avatar_url || profile?.avatar_url) ? (
                      <img src={mongoProfile?.avatar_url ?? profile?.avatar_url ?? ''} alt="Profile" className="w-full h-full rounded-xl object-cover" />
                    ) : (
                      <User className="h-5 w-5 text-white" />
                    )}
                  </div>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-dark-text">
                      {mongoProfile?.full_name ?? profile?.full_name ?? user?.email?.split('@')[0] ?? 'User'}
                    </p>
                    <p className="text-xs text-dark-text-dim">{user?.email}</p>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-dark-text-muted transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-dark-bg-light/95 backdrop-blur-xl border border-glass-border rounded-xl py-2 shadow-2xl z-[100]">
                    <div className="px-4 py-3 border-b border-glass-border">
                      <p className="text-sm font-semibold text-dark-text">
                        {mongoProfile?.full_name ?? profile?.full_name ?? 'User'}
                      </p>
                      <p className="text-xs text-dark-text-muted">{user?.email}</p>
                    </div>
                    <button
                      onClick={() => { setActiveTab('profile'); setShowUserMenu(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-dark-text-muted hover:bg-dark-bg-lighter hover:text-dark-text flex items-center space-x-2 transition-all"
                    >
                      <User className="h-4 w-4" /><span>Profile Settings</span>
                    </button>
                    <div className="border-t border-glass-border mt-2 pt-2">
                      <button
                        onClick={() => { setShowUserMenu(false); onLogout(); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-dark-bg-lighter hover:text-red-500 flex items-center space-x-2 transition-all"
                      >
                        <LogOut className="h-4 w-4" /><span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Video Studio — full viewport below header */}
        {/* Video Studio — always mounted to preserve state */}
        <div style={{ display: activeTab === 'video-studio' ? 'block' : 'none' }} className="h-[calc(100vh-73px)] overflow-hidden">
          <VideoStudio isActive={activeTab === 'video-studio'} />
        </div>

        {/* Seedance Studio — full viewport, always mounted to preserve state */}
        <div style={{ display: activeTab === 'seedance-studio' ? 'block' : 'none' }} className="h-[calc(100vh-73px)] overflow-y-auto">
          <SeedanceStudio />
        </div>

        {/* Page Content — all other tabs */}
        {activeTab !== 'video-studio' && activeTab !== 'seedance-studio' && (
          <main ref={mainRef} className="px-8 py-6 min-h-screen max-w-[1600px] mx-auto">
            <div style={{ display: activeTab === 'dashboard'        ? 'block' : 'none' }}>{renderDashboardContent()}</div>
            <div style={{ display: activeTab === 'company-analysis' ? 'block' : 'none' }}><CreditRating prefillQuery={analysisQuery} /></div>
            <div style={{ display: activeTab === 'leads'            ? 'block' : 'none' }}>
              <Leads
                setActivePage={setActiveTab}
                setAnalysisQuery={setAnalysisQuery}
                initialSavedLeads={allSavedLeads}
                onLeadsUpdate={(leads) => {
                  setAllSavedLeads(leads);
                  setDashboardStats(s => ({ ...s, leads: leads.length }));
                }}
              />
            </div>
            <div style={{ display: activeTab === 'profile' ? 'block' : 'none' }}>
              <UserProfile selectedPlatform={selectedPlatform} onPlatformChange={setSelectedPlatform} />
            </div>
            <div style={{ display: activeTab === 'channels' ? 'block' : 'none' }}>
              <ChannelDashboard
                onOpenPipeline={(channelId) => {
                  setActivePipelineChannel(channelId);
                  setShowPipelineOverlay(true);
                }}
              />
            </div>
          </main>
        )}

        {activeTab !== 'video-studio' && activeTab !== 'seedance-studio' && <Footer onNavigate={handleNavigate} />}

        <AnimatePresence>
          {showPipelineOverlay && activePipelineChannel && (
            <div className="fixed inset-0 bg-dark-bg z-50 overflow-y-auto">
              <PipelineBuilder
                channelId={activePipelineChannel}
                onClose={() => {
                  setShowPipelineOverlay(false);
                  setActivePipelineChannel(null);
                  setActiveTab('channels');
                }}
              />
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Guide Me Video Modal ── */}
      {showVideoModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close video"
            className="absolute inset-0 w-full h-full cursor-default"
            onClick={handleCloseVideo}
          />
          <div className="relative w-full max-w-5xl aspect-video bg-dark-bg-lighter rounded-2xl overflow-hidden shadow-2xl z-10">
            <button
              onClick={handleCloseVideo}
              className="absolute top-4 right-4 z-10 w-10 h-10 bg-dark-bg/80 hover:bg-dark-bg rounded-full flex items-center justify-center text-dark-text-muted hover:text-dark-text transition-all duration-200 hover:scale-110 hover:shadow-lg"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <iframe
              className="w-full h-full"
              src="https://www.youtube.com/embed/vlsBP50Qc6k?autoplay=0&rel=0"
              title="Guide Me – Lead Generation"
              style={{ border: 'none' }}
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {/* ── Subscription Modal ── */}
      <SubscriptionModal open={showSubscriptionModal} onClose={() => setShowSubscriptionModal(false)} />

    </div>
  );
};

export default Dashboard;