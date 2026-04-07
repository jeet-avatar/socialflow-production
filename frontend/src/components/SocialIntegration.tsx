import { useState, useEffect } from 'react';
import { notify } from '../services/notificationService';
import {
  Save, Eye, EyeOff, ExternalLink, CheckCircle, AlertCircle,
  Linkedin,
  Shield, Key, Globe, Info,
  Users2, Mail, BookOpen,
  ChevronDown, ChevronUp, LibraryBig, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

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

import { integrationsService } from '../services/integrationsService';

interface PlatformConfig {
  platform: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  fields: {
    name: string;
    label: string;
    type: string;
    placeholder: string;
    required: boolean;
    description?: string;
    helpUrl?: string;
  }[];
  connected: boolean;
  status?: 'connected' | 'error' | 'pending';
  lastSync?: string;
}

interface SocialIntegrationProps {
  selectedPlatform?: string | null;
  onPlatformChange?: (platform: string | null) => void;
}

// Extract YouTube video ID and return embed URL
const getYouTubeEmbedUrl = (url: string): string => {
  const regExp = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
  const match = regExp.exec(url);
  if (match?.[1]) {
    return `https://www.youtube.com/embed/${match[1]}?autoplay=1&rel=0`;
  }
  return '';
};

// Per-platform neon glow colors (for connected state box-shadow)
const PLATFORM_GLOW: Record<string, string> = {
  facebook:  '0 0 0 1px rgba(59,130,246,0.5), 0 0 20px rgba(59,130,246,0.25), 0 0 40px rgba(59,130,246,0.1)',
  instagram: '0 0 0 1px rgba(236,72,153,0.5), 0 0 20px rgba(236,72,153,0.25), 0 0 40px rgba(168,85,247,0.1)',
  youtube:   '0 0 0 1px rgba(239,68,68,0.5),  0 0 20px rgba(239,68,68,0.25),  0 0 40px rgba(239,68,68,0.1)',
  linkedin:  '0 0 0 1px rgba(96,165,250,0.5),  0 0 20px rgba(96,165,250,0.25),  0 0 40px rgba(96,165,250,0.1)',
  gmail:     '0 0 0 1px rgba(239,68,68,0.5),  0 0 20px rgba(239,68,68,0.25),  0 0 40px rgba(239,68,68,0.1)',
};

// Platform accent colors for CSS
const PLATFORM_ACCENT: Record<string, string> = {
  facebook:  '#3b82f6',
  instagram: '#ec4899',
  youtube:   '#ef4444',
  linkedin:  '#60a5fa',
  gmail:     '#ef4444',
};

const SocialIntegration = ({ selectedPlatform, onPlatformChange }: SocialIntegrationProps) => {
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({});
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  // Notifications now go to the global bell icon via notify()
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [currentVideoPlatform, setCurrentVideoPlatform] = useState<string | null>(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [subscriptionLimitInfo, setSubscriptionLimitInfo] = useState<{
    message: string;
    current_usage: number;
    limit: number;
    plan: string;
  } | null>(null);
  const [connectedPlatforms, setConnectedPlatforms] = useState<Record<string, boolean>>({
    facebook: false, youtube: false, linkedin: false,
    instagram: false, gmail: false
  });
  const [savedPlatforms, setSavedPlatforms] = useState<Record<string, boolean>>({
    facebook: false, youtube: false, linkedin: false,
    instagram: false, gmail: false
  });
  const [testResults, setTestResults] = useState<Record<string, boolean>>({
    facebook: false, youtube: false, linkedin: false,
    instagram: false, gmail: false
  });
  const [youtubeAuthorized, setYoutubeAuthorized] = useState<boolean>(false);

  // Initialize from localStorage on mount and keep in sync across tabs
  useEffect(() => {
    setYoutubeAuthorized(localStorage.getItem('youtube_authorized') === 'true');
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'youtube_authorized') {
        setYoutubeAuthorized(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);
  const [expandedInstructions, setExpandedInstructions] = useState<Record<string, boolean>>({});
  const [detectedInfo, setDetectedInfo] = useState<Record<string, Record<string, string>>>({});
  const [allPages, setAllPages] = useState<{ id: string; name: string }[]>([]);

  // Which platform's guide video is currently expanded inline (null = none)
  const [expandedGuideVideo, setExpandedGuideVideo] = useState<string | null>(null);
  // Fields that were just auto-filled by a successful test (highlighted briefly)
  const [autofilledFields, setAutofilledFields] = useState<Record<string, string[]>>({});

  // Guide video URLs per platform
  const guideLinks: Record<string, string> = {
    linkedin:  'https://youtu.be/NCEvgY-9P60?si=R5e74wbVWKELPIWT',
    gmail:     'https://youtu.be/O_iGJJ6Q--Y?si=y_TE2B5gmmwZKP6u',
    youtube:   'https://youtu.be/arlCElaMcpE?si=3sFjd1WK3V4S6W-8',
    facebook:  'https://youtu.be/AErIk5TTeLs?si=rEmbCjevcOs4BIrb',
    instagram: 'https://youtu.be/l1gk8SWJ_r8?si=4plWRKo9r3T7loqE'
  };

  useEffect(() => {
    const params = new URLSearchParams(globalThis.location.search);
    const youtubeAuth = params.get('youtube_auth');
    const errorMessage = params.get('message');
    if (youtubeAuth === 'success') {
      setConnectedPlatforms(prev => ({ ...prev, youtube: true }));
      setSavedPlatforms(prev => ({ ...prev, youtube: true }));
      setYoutubeAuthorized(true);
      localStorage.setItem('youtube_authorized', 'true');
      globalThis.history.replaceState({}, '', '/integrations');
      globalThis.dispatchEvent(new CustomEvent('app-notification', {
        detail: { title: 'YouTube Authorized', message: 'YouTube connected successfully! You can now post videos.', type: 'success' }
      }));
    } else if (youtubeAuth === 'error') {
      globalThis.history.replaceState({}, '', '/integrations');
      globalThis.dispatchEvent(new CustomEvent('app-notification', {
        detail: { title: 'YouTube Authorization Failed', message: errorMessage || 'Authorization failed. Please try again.', type: 'error' }
      }));
    }
  }, []);

  const platforms: PlatformConfig[] = [
    {
      platform: 'facebook', name: 'Facebook', icon: FacebookIcon, color: 'text-blue-600',
      connected: false, status: 'pending',
      fields: [
        { name: 'accessToken', label: 'Access Token', type: 'password', placeholder: 'EAAG...', required: true,
          description: 'Facebook Page Access Token with pages_manage_posts permission',
          helpUrl: 'https://developers.facebook.com/tools/explorer/' },
        { name: 'pageId', label: 'Page ID', type: 'text', placeholder: 'Auto-detected on test', required: false,
          description: 'Auto-detected when you test the connection. Or paste manually.' }
      ]
    },
    {
      platform: 'instagram', name: 'Instagram', icon: InstagramIcon, color: 'text-pink-500',
      connected: false, status: 'pending',
      fields: [
        { name: 'accessToken', label: 'Facebook User Access Token', type: 'password', placeholder: 'EAAxxxxxxxx...', required: true,
          description: 'Facebook User Access Token (not Instagram token) with pages_show_list, instagram_basic, and instagram_content_publish permissions. Generate at Facebook Graph API Explorer.',
          helpUrl: 'https://developers.facebook.com/tools/explorer/' },
        { name: 'instagramAccountId', label: 'Instagram Business Account ID', type: 'text', placeholder: 'Auto-detected on test', required: false,
          description: 'Auto-detected when you test the connection. Your Instagram must be a Business/Creator account linked to a Facebook Page.' }
      ]
    },
    {
      platform: 'youtube', name: 'YouTube', icon: YouTubeIcon, color: 'text-red-500', connected: true,
      fields: [
        { name: 'clientId', label: 'Client ID', type: 'text', placeholder: '1234567890-abcdefghijklmnop.apps.googleusercontent.com', required: true,
          description: 'OAuth 2.0 Client ID from Google Cloud Console', helpUrl: 'https://console.cloud.google.com/apis/credentials' },
        { name: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'GOCSPX-abcdefghijklmnop', required: true,
          description: 'OAuth 2.0 Client Secret from Google Cloud Console.' },
        { name: 'refreshToken', label: 'Refresh Token', type: 'password', placeholder: '1//0g...', required: false,
          description: 'Get this from Google OAuth Playground: go to oauth.googleapis.com/token, select YouTube Data API v3, authorize, copy the refresh token.' }
      ]
    },
    {
      platform: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: 'text-blue-700',
      connected: true, status: 'connected', lastSync: '5 minutes ago',
      fields: [
        { name: 'accessToken', label: 'Access Token', type: 'password', placeholder: 'AQVlKBTG8Zr5w...', required: true,
          description: 'LinkedIn OAuth 2.0 access token with w_member_social permission',
          helpUrl: 'https://www.linkedin.com/developers/' },
        { name: 'personUrn', label: 'Person URN', type: 'text', placeholder: 'Auto-detected on test', required: false,
          description: 'Auto-detected when you test the connection.' }
      ]
    },
    {
      platform: 'gmail', name: 'Gmail', icon: Mail, color: 'text-red-500', connected: false,
      fields: [
        { name: 'email', label: 'Your Gmail Address', type: 'email', placeholder: 'your.email@gmail.com', required: true,
          description: 'Your Gmail address for sending emails' },
        { name: 'appPassword', label: 'App Password', type: 'password', placeholder: 'xxxx xxxx xxxx xxxx', required: true,
          description: 'Gmail App Password (not your regular password). Generate at: https://myaccount.google.com/apppasswords',
          helpUrl: 'https://support.google.com/accounts/answer/185833' }
      ]
    }
  ];

  const allPlatforms = platforms;

  useEffect(() => {
    const loadIntegrations = async () => {
      try {
        const integrations = await integrationsService.getIntegrations();
        const connected: Record<string, boolean> = {};
        const saved: Record<string, boolean> = {};
        integrations.forEach(integration => {
          connected[integration.platform] = integration.is_connected;
          saved[integration.platform] = true;
        });
        setConnectedPlatforms(connected);
        setSavedPlatforms(saved);
      } catch {
        // integration load failed — UI shows defaults
      }
    };
    loadIntegrations();
  }, []);

  useEffect(() => {
    if (selectedPlatform) {
      const element = document.getElementById(`platform-${selectedPlatform}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => { onPlatformChange?.(null); }, 1000);
      }
    }
  }, [selectedPlatform, onPlatformChange]);

  const togglePasswordVisibility = (platformField: string) => {
    setShowPasswords(prev => ({ ...prev, [platformField]: !prev[platformField] }));
  };

  const handleInputChange = (platform: string, field: string, value: string) => {
    setFormData(prev => ({ ...prev, [platform]: { ...prev[platform], [field]: value } }));
  };

  const handleSavePlatform = async (platform: string) => {
    try {
      if (!testResults[platform]) {
        notify('Test First', 'Please test the connection before saving to verify your credentials.', 'warning');
        return;
      }
      const result = await integrationsService.saveIntegration({ platform, credentials: formData[platform] || {}, is_connected: true });
      if (result.error === 'limit_exceeded') {
        setSubscriptionLimitInfo({ message: result.message, current_usage: result.current_usage, limit: result.limit, plan: result.plan });
        setShowSubscriptionModal(true);
        return;
      }
      setSavedPlatforms(prev => ({ ...prev, [platform]: true }));
      setConnectedPlatforms(prev => ({ ...prev, [platform]: true }));
      notify(`${platform} Connected`, `${platform} configuration saved successfully!`, 'success');
      globalThis.dispatchEvent(new CustomEvent('integrations:updated'));
    } catch {
      notify('Save Failed', 'Failed to save configuration. Please try again.', 'error');
    }
  };

  const testConnection = async (platform: string) => {
    setTestingConnection(platform);
    try {
      const platformConfig = allPlatforms.find(p => p.platform === platform);
      if (!platformConfig) throw new Error('Platform not found');
      const platformData = formData[platform] || {};
      const requiredFields = platformConfig.fields.filter(field => field.required);
      const missingFields = requiredFields.filter(field => !platformData[field.name]);
      if (missingFields.length > 0) throw new Error(`Missing required fields: ${missingFields.map(f => f.label).join(', ')}`);
      const result = await integrationsService.testConnection(platform, platformData);
      if (result.success || result.is_connected || result.valid) {
        setTestResults(prev => ({ ...prev, [platform]: true }));
        // Auto-fill detected credential fields; merge account_info for display only
        if (result.detected) {
          const filledKeys = Object.keys(result.detected);
          setDetectedInfo(prev => ({ ...prev, [platform]: { ...result.detected, ...(result.account_info as object) } }));
          setFormData(prev => ({
            ...prev,
            [platform]: { ...prev[platform], ...result.detected },
          }));
          setAutofilledFields(prev => ({ ...prev, [platform]: filledKeys }));
          setTimeout(() => setAutofilledFields(prev => { const n = { ...prev }; delete n[platform]; return n; }), 3000);
        }
        // Facebook: store all pages for picker if multiple
        if (platform === 'facebook' && result.all_pages?.length > 1) {
          setAllPages(result.all_pages);
        } else {
          setAllPages([]);
        }
        notify(`${platformConfig.name} Test Passed`, result.message || `${platformConfig.name} connection test successful!`, 'success');
      } else {
        throw new Error(result.message || 'Connection test failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const platformConfig = allPlatforms.find(p => p.platform === platform);
      setTestResults(prev => ({ ...prev, [platform]: false }));
      notify(`${platformConfig?.name || platform} Test Failed`, errorMessage, 'error');
    } finally {
      setTestingConnection(null);
    }
  };

  const getStatusBadge = (platform: string) => {
    if (connectedPlatforms[platform]) {
      return (
        <div className="flex items-center space-x-1 text-green-600">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm">Connected</span>
        </div>
      );
    }
    if (testResults[platform] === false) {
      return (
        <button onClick={() => testConnection(platform)} className="px-3 py-1 text-sm bg-accent-teal/10 text-accent-teal rounded-lg">
          Connect Now
        </button>
      );
    }
    return <span className="text-sm text-gray-500">Not configured</span>;
  };

  const handleResetPlatform = async (platform: string) => {
    try {
      await integrationsService.deleteIntegration(platform);
      setSavedPlatforms(prev => ({ ...prev, [platform]: false }));
      setConnectedPlatforms(prev => ({ ...prev, [platform]: false }));
      setTestResults(prev => ({ ...prev, [platform]: false }));
      setFormData(prev => ({ ...prev, [platform]: {} }));
      notify(`${platform} Disconnected`, `${platform} integration has been reset.`, 'info');
      globalThis.dispatchEvent(new CustomEvent('integrations:updated'));
    } catch {
      notify('Reset Failed', 'Failed to reset integration. Please try again.', 'error');
    }
  };

  // Toggle inline collapsible YouTube video — no new tab
  const handleGuideMe = (platform: string) => {
    setExpandedGuideVideo(prev => (prev === platform ? null : platform));
  };

  const handleCloseVideoModal = () => {
    setShowVideoModal(false);
    setCurrentVideoPlatform(null);
  };

  const handleYouTubeAuthorize = async () => {
    try {
      const response = await integrationsService.initiateYouTubeOAuth();
      if (response.success && response.authorization_url) {
        globalThis.open(response.authorization_url as string, '_blank');
        notify('YouTube Auth Started', 'Authorization opened in a new tab. Complete it there and return here.', 'info');
      } else {
        notify('YouTube Error', 'Invalid response from server.', 'error');
      }
    } catch (error: unknown) {
      const errorMessage = (error as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail || (error as Error)?.message || 'Failed to initiate YouTube authorization.';
      notify('YouTube Auth Failed', errorMessage, 'error');
    }
  };

  const platformBgColors: Record<string, string> = {
    gmail: 'bg-red-500', facebook: 'bg-blue-600',
    instagram: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500',
    youtube: 'bg-red-600', linkedin: 'bg-blue-700',
  };


  const getTestBtnContent = (platformKey: string) => {
    if (testingConnection === platformKey) {
      return <><div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-gray-800 flex-shrink-0" /><span>Testing…</span></>;
    }
    if (testResults[platformKey]) {
      return <><Save className="h-5 w-5" /><span>Save Connection</span></>;
    }
    return <><Globe className="h-5 w-5" /><span>Test Connection</span></>;
  };

  const handleFacebookPageSelect = (page: { id: string; name: string }) => {
    setFormData(prev => ({ ...prev, facebook: { ...prev['facebook'], pageId: page.id } }));
    setDetectedInfo(prev => ({ ...prev, facebook: { ...prev['facebook'], pageName: page.name, pageId: page.id } }));
  };

  return (
    <div className="space-y-8" style={{ fontFamily: "'Sora', 'Poppins', sans-serif" }}>

      {/* ── SUBSCRIPTION UPGRADE MODAL ── */}
      <AnimatePresence>
        {showSubscriptionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="relative glass-panel max-w-2xl w-full mx-4 p-8"
              style={{ border: '1px solid rgba(251,191,36,0.3)', boxShadow: '0 0 40px rgba(251,191,36,0.1)' }}
            >
              <button onClick={() => setShowSubscriptionModal(false)} className="absolute top-4 right-4 text-dark-text-dim hover:text-dark-text transition-colors">
                <X className="h-6 w-6" />
              </button>
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-gradient-orange-pink rounded-full shadow-glow-orange">
                  <AlertCircle className="h-12 w-12 text-white" />
                </div>
              </div>
              <h3 className="text-3xl font-bold text-dark-text text-center mb-4 tracking-tight">Upgrade to Connect More Platforms</h3>
              <div className="text-center mb-6">
                <p className="text-lg text-dark-text-muted mb-4">{subscriptionLimitInfo?.message}</p>
                <div className="inline-flex items-center space-x-4 px-6 py-3 glass-card rounded-xl">
                  <div className="text-center">
                    <p className="text-sm text-dark-text-dim font-mono uppercase tracking-widest">Current Usage</p>
                    <p className="text-2xl font-bold text-accent-orange">{subscriptionLimitInfo?.current_usage}/{subscriptionLimitInfo?.limit}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-dark-text-dim font-mono uppercase tracking-widest">Current Plan</p>
                    <p className="text-2xl font-bold text-accent-blue capitalize">{subscriptionLimitInfo?.plan}</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="glass-card p-4 border border-gray-500/30">
                  <h4 className="font-bold text-dark-text mb-3 text-center font-mono uppercase tracking-wider text-sm">Free Plan</h4>
                  <ul className="space-y-2 text-sm text-dark-text-muted">
                    {['1 Platform Connection','5 Videos/Month','Basic Features'].map(f => (
                      <li key={f} className="flex items-center space-x-2"><CheckCircle className="h-4 w-4 text-gray-400" /><span>{f}</span></li>
                    ))}
                  </ul>
                </div>
                <div className="glass-card p-4 border-2 border-accent-teal shadow-glow-teal">
                  <h4 className="font-bold text-accent-teal mb-3 text-center font-mono uppercase tracking-wider text-sm">Professional Plan</h4>
                  <ul className="space-y-2 text-sm text-dark-text">
                    {['Unlimited Platforms','Unlimited Videos','Advanced Features','Priority Support'].map(f => (
                      <li key={f} className="flex items-center space-x-2"><CheckCircle className="h-4 w-4 text-accent-teal" /><span className="font-medium">{f}</span></li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <button onClick={() => setShowSubscriptionModal(false)} className="flex-1 px-6 py-3 glass-card rounded-none hover:bg-glass-white-hover transition-colors font-mono uppercase tracking-widest text-sm text-dark-text border border-white/10">Maybe Later</button>
                <button onClick={() => { setShowSubscriptionModal(false); globalThis.dispatchEvent(new CustomEvent('navigateToSubscription')); }} className="flex-1 btn-gradient-orange flex items-center justify-center space-x-2 font-mono uppercase tracking-widest text-sm">
                  <span>Upgrade to Professional</span><ExternalLink className="h-4 w-4" />
                </button>
              </div>
              <p className="text-center text-sm text-dark-text-dim mt-4 font-mono">Only $49/month · Cancel anytime</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── LEGACY VIDEO TUTORIAL MODAL ── */}
      <AnimatePresence>
        {showVideoModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="relative glass-panel max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-dark-text font-mono uppercase tracking-widest">
                  {currentVideoPlatform ? `${currentVideoPlatform.toUpperCase()} // Integration Tutorial` : '// Integration Tutorial'}
                </h3>
                <button onClick={handleCloseVideoModal} className="text-dark-text-dim hover:text-dark-text transition-colors">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="aspect-video bg-dark-bg-light rounded-none overflow-hidden">
                <video controls autoPlay className="w-full h-full object-contain" src="/insta-part1.mp4">
                  <track kind="captions" srcLang="en" label="English" default />
                  Your browser does not support the video tag.
                </video>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════
          PAGE HEADER — INTEGRATION HUB
      ══════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-none mb-8 px-8 py-10"
        style={{
          background: 'linear-gradient(135deg, rgba(10,12,20,0.98) 0%, rgba(15,20,35,0.98) 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderLeft: '4px solid rgba(96,165,250,0.7)',
        }}
      >
        {/* PCB trace decorations */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-10">
          <svg className="absolute bottom-0 right-0 w-80 h-40" viewBox="0 0 320 160" fill="none">
            <path d="M320 160 L240 160 L240 120 L200 120 L200 80 L280 80 L280 40 L320 40" stroke="#60a5fa" strokeWidth="1.5" fill="none" />
            <path d="M320 140 L260 140 L260 100 L180 100 L180 60 L320 60" stroke="#60a5fa" strokeWidth="1" fill="none" />
            <circle cx="240" cy="120" r="3" fill="#60a5fa" />
            <circle cx="200" cy="80" r="3" fill="#60a5fa" />
            <circle cx="280" cy="40" r="3" fill="#60a5fa" />
          </svg>
          <svg className="absolute top-0 left-0 w-64 h-32" viewBox="0 0 256 128" fill="none">
            <path d="M0 0 L60 0 L60 40 L100 40 L100 80 L0 80" stroke="#818cf8" strokeWidth="1.5" fill="none" />
            <circle cx="60" cy="40" r="3" fill="#818cf8" />
            <circle cx="100" cy="80" r="3" fill="#818cf8" />
          </svg>
        </div>

        <div className="relative z-10 flex items-start justify-between gap-8 flex-wrap">
          <div>
            {/* System label */}
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.9)]" />
              <span className="text-xs font-mono tracking-[0.25em] text-green-400 uppercase">SYS::ACTIVE</span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white leading-none mb-2" style={{ letterSpacing: '-0.02em' }}>
              INTEGRATION
              <span className="ml-3 text-4xl font-black" style={{ color: '#60a5fa' }}>HUB</span>
            </h1>
            <p className="text-sm text-slate-400 font-mono mt-3 max-w-xl leading-relaxed">
              // Connect social media ports · Automate content pipelines · Publish across all nodes
            </p>
          </div>

          {/* Security certification chips */}
          <div className="flex flex-wrap gap-3 items-start">
            <div className="flex items-center gap-2 px-4 py-2 rounded-none font-mono text-xs tracking-widest uppercase"
              style={{
                background: 'rgba(20,255,160,0.06)',
                border: '1px solid rgba(20,255,160,0.25)',
                boxShadow: '0 0 12px rgba(20,255,160,0.08)',
                color: '#4ade80',
              }}
            >
              <Shield className="h-3.5 w-3.5" />
              <span>AES-256 Encrypted</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-none font-mono text-xs tracking-widest uppercase"
              style={{
                background: 'rgba(96,165,250,0.06)',
                border: '1px solid rgba(96,165,250,0.25)',
                boxShadow: '0 0 12px rgba(96,165,250,0.08)',
                color: '#60a5fa',
              }}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              <span>SOC 2 Certified</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          PLATFORM PORTS GRID
      ══════════════════════════════════════ */}
      <div
        className="p-6 mb-8"
        style={{
          background: 'rgba(8,10,18,0.95)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Section label */}
        <div className="flex items-center gap-4 mb-8 pb-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="p-2.5 rounded-none bg-gradient-teal-blue shadow-glow-teal">
            <Users2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-black text-white tracking-widest uppercase font-mono">Platform Connections</h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">// {platforms.filter(p => connectedPlatforms[p.platform]).length} of {platforms.length} ports active</p>
          </div>
        </div>

        {/* Platform cards */}
        <div className="space-y-6">
          {platforms.map((platform, index) => {
            const isConnected = connectedPlatforms[platform.platform];
            const isSaved = savedPlatforms[platform.platform];
            const accentColor = PLATFORM_ACCENT[platform.platform] || '#60a5fa';

            return (
              <motion.div
                key={platform.platform}
                id={`platform-${platform.platform}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1, duration: 0.4, ease: 'easeOut' }}
                style={isConnected ? { boxShadow: PLATFORM_GLOW[platform.platform] } : { boxShadow: '0 0 0 1px rgba(255,255,255,0.06)' }}
                className={`glass-card overflow-hidden transition-all duration-500 ${
                  selectedPlatform === platform.platform ? 'border-accent-teal shadow-glow-teal' : ''
                }`}
              >
                {/* ── PORT HEADER ── */}
                <div
                  className="px-6 py-5"
                  style={{
                    background: isConnected
                      ? `linear-gradient(135deg, rgba(${accentColor.slice(1).match(/.{2}/g)?.map(h => parseInt(h,16)).join(',')},0.12) 0%, rgba(8,10,18,0.98) 100%)`
                      : 'rgba(12,14,22,0.98)',
                    borderBottom: `1px solid ${isConnected ? accentColor + '33' : 'rgba(255,255,255,0.05)'}`,
                  }}
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    {/* Left: icon + name + LED status */}
                    <div className="flex items-center gap-5">
                      {/* Platform icon in hardware port ring */}
                      <div
                        className="relative flex items-center justify-center rounded-none shrink-0"
                        style={{
                          width: '64px',
                          height: '64px',
                          background: isConnected
                            ? `radial-gradient(circle, ${accentColor}22 0%, transparent 70%)`
                            : 'rgba(255,255,255,0.04)',
                          border: `1.5px solid ${isConnected ? accentColor + '55' : 'rgba(255,255,255,0.1)'}`,
                          boxShadow: isConnected ? `inset 0 0 20px ${accentColor}18, 0 0 16px ${accentColor}20` : 'none',
                        }}
                      >
                        <div className={`p-3 ${platformBgColors[platform.platform] || 'bg-gray-700'}`}
                          style={{ clipPath: 'none' }}
                        >
                          <platform.icon className="h-6 w-6 text-white" />
                        </div>
                        {/* Corner notch – PCB style */}
                        <span className="absolute top-0 right-0 w-2 h-2"
                          style={{ borderTop: `2px solid ${accentColor}`, borderRight: `2px solid ${accentColor}` }} />
                        <span className="absolute bottom-0 left-0 w-2 h-2"
                          style={{ borderBottom: `2px solid ${accentColor}`, borderLeft: `2px solid ${accentColor}` }} />
                      </div>

                      <div>
                        <h3
                          className="text-xl font-black tracking-tight text-white"
                          style={{ letterSpacing: '-0.01em', fontFamily: "'Sora', sans-serif" }}
                        >
                          {platform.name.toUpperCase()}
                        </h3>
                        {/* LED status indicator */}
                        <div className="flex items-center gap-2 mt-1.5">
                          {isConnected ? (
                            <>
                              <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.9)]" />
                              <span className="text-xs font-mono text-green-400 tracking-widest uppercase">LIVE</span>
                              {platform.lastSync && (
                                <span className="text-xs font-mono text-slate-500 ml-2">· sync {platform.lastSync}</span>
                              )}
                            </>
                          ) : testResults[platform.platform] ? (
                            <>
                              <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.9)]" />
                              <span className="text-xs font-mono text-yellow-400 tracking-widest uppercase">TESTED · READY TO SAVE</span>
                            </>
                          ) : (
                            <>
                              <span className="inline-block w-2 h-2 rounded-full bg-slate-600" />
                              <span className="text-xs font-mono text-slate-500 tracking-widest uppercase">OFFLINE</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: action buttons */}
                    <div className="flex items-center gap-3 flex-wrap">
                      {isSaved ? (
                        <>
                          {platform.platform === 'youtube' && (
                            <button
                              onClick={handleYouTubeAuthorize}
                              className="flex items-center gap-2 px-5 py-2.5 font-mono text-xs tracking-widest uppercase transition-all"
                              style={{
                                background: youtubeAuthorized ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                                border: `1px solid ${youtubeAuthorized ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                                color: youtubeAuthorized ? '#4ade80' : '#f87171',
                              }}
                            >
                              <Key className="h-3.5 w-3.5" />
                              <span>{youtubeAuthorized ? 'AUTHORIZED' : 'AUTHORIZE'}</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleResetPlatform(platform.platform)}
                            className="flex items-center gap-2 px-5 py-2.5 font-mono text-xs tracking-widest uppercase transition-all"
                            style={{
                              background: 'rgba(148,163,184,0.08)',
                              border: '1px solid rgba(148,163,184,0.25)',
                              color: '#94a3b8',
                            }}
                          >
                            <span>RESET</span>
                          </button>
                        </>
                      ) : (
                        <>
                          {/* Guide Me button */}
                          {['linkedin', 'gmail', 'youtube', 'facebook', 'instagram'].includes(platform.platform) && (
                            <button
                              onClick={() => handleGuideMe(platform.platform)}
                              className="flex items-center gap-2 px-5 py-2.5 font-mono text-xs tracking-widest uppercase transition-all"
                              style={{
                                background: expandedGuideVideo === platform.platform
                                  ? 'rgba(148,163,184,0.12)'
                                  : `rgba(${accentColor.slice(1).match(/.{2}/g)?.map(h => parseInt(h,16)).join(',')},0.1)`,
                                border: `1px solid ${expandedGuideVideo === platform.platform ? 'rgba(148,163,184,0.3)' : accentColor + '44'}`,
                                color: expandedGuideVideo === platform.platform ? '#94a3b8' : accentColor,
                              }}
                            >
                              {expandedGuideVideo === platform.platform ? (
                                <><ChevronUp className="h-3.5 w-3.5" /><span>Hide Guide</span></>
                              ) : (
                                <><BookOpen className="h-3.5 w-3.5" /><span>Setup Guide</span></>
                              )}
                            </button>
                          )}

                          {/* Test / Save button */}
                          <button
                            onClick={() => testResults[platform.platform]
                              ? handleSavePlatform(platform.platform)
                              : testConnection(platform.platform)
                            }
                            disabled={testingConnection === platform.platform}
                            className="flex items-center gap-2 px-5 py-2.5 font-mono text-xs tracking-widest uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            style={testResults[platform.platform] ? {
                              background: `rgba(${accentColor.slice(1).match(/.{2}/g)?.map(h => parseInt(h,16)).join(',')},0.18)`,
                              border: `1px solid ${accentColor}66`,
                              color: accentColor,
                              boxShadow: `0 0 12px ${accentColor}22`,
                            } : {
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.2)',
                              color: '#e2e8f0',
                            }}
                          >
                            {testingConnection === platform.platform ? (
                              <><div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-slate-400 border-t-white" /><span>TESTING…</span></>
                            ) : testResults[platform.platform] ? (
                              <><Save className="h-3.5 w-3.5" /><span>SAVE CONNECTION</span></>
                            ) : (
                              <><Globe className="h-3.5 w-3.5" /><span>TEST CONNECTION</span></>
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── COLLAPSIBLE INLINE GUIDE VIDEO ── */}
                <AnimatePresence>
                  {expandedGuideVideo === platform.platform && guideLinks[platform.platform] && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: 'easeInOut' }}
                      className="overflow-hidden"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(5,7,14,0.98)' }}
                    >
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <span className="px-3 py-1 font-mono text-xs tracking-widest uppercase"
                              style={{
                                background: `rgba(${accentColor.slice(1).match(/.{2}/g)?.map(h => parseInt(h,16)).join(',')},0.12)`,
                                border: `1px solid ${accentColor}44`,
                                color: accentColor,
                              }}
                            >STEP-BY-STEP</span>
                            <div>
                              <p className="text-sm font-bold text-white font-mono">{platform.name.toUpperCase()} // Setup Guide</p>
                              <p className="text-xs text-slate-500 font-mono">Follow along to configure your integration</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setExpandedGuideVideo(null)}
                            className="p-2 text-slate-500 hover:text-slate-300 transition-colors"
                            aria-label="Close guide video"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {/* 16:9 responsive iframe */}
                        <div className="relative w-full overflow-hidden bg-black shadow-2xl" style={{ paddingTop: '56.25%', border: `1px solid ${accentColor}33` }}>
                          <iframe
                            className="absolute inset-0 w-full h-full"
                            src={getYouTubeEmbedUrl(guideLinks[platform.platform])}
                            title={`${platform.name} Setup Guide`}
                            style={{ border: 'none' }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── CONFIGURATION FORM / SAVED STATE ── */}
                {isSaved ? (
                  <div className="px-6 py-6 flex items-center gap-3"
                    style={{ background: 'rgba(8,10,18,0.98)' }}
                  >
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)] animate-pulse" />
                    <span className="font-mono text-sm text-green-400 tracking-widest uppercase">Configuration Saved · Port Active</span>
                    <span className="text-xs font-mono text-slate-600 ml-4">— click RESET to modify</span>
                  </div>
                ) : (
                  <div className="p-6" style={{ background: 'rgba(8,10,18,0.98)' }}>

                    {/* Form fields grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {platform.fields.map((field) => (
                        <div key={field.name} className="space-y-2">
                          {/* Field label */}
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor={`${platform.platform}-${field.name}`}
                              className="block text-xs font-mono tracking-widest uppercase text-slate-400"
                            >
                              {field.label}
                              {field.required && <span className="ml-1" style={{ color: accentColor }}>*</span>}
                            </label>
                            {field.helpUrl && (
                              <a href={field.helpUrl} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-400 transition-colors">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                          {/* Terminal-style input */}
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 font-mono text-sm select-none pointer-events-none">&gt;</span>
                            <input
                              id={`${platform.platform}-${field.name}`}
                              type={field.type === 'password' && !showPasswords[`${platform.platform}_${field.name}`] ? 'password' : 'text'}
                              value={formData[platform.platform]?.[field.name] ?? ''}
                              onChange={(e) => handleInputChange(platform.platform, field.name, e.target.value)}
                              placeholder={field.placeholder}
                              className={`input-glass w-full pl-8 pr-12 font-mono text-sm tracking-wide transition-all duration-500 rounded-none ${
                                autofilledFields[platform.platform]?.includes(field.name)
                                  ? 'border-accent-teal/60 shadow-[0_0_0_2px_rgba(45,212,191,0.2)]'
                                  : ''
                              }`}
                              style={{
                                background: 'rgba(5,7,14,0.95)',
                                border: `1px solid ${autofilledFields[platform.platform]?.includes(field.name) ? '#2dd4bf55' : 'rgba(255,255,255,0.08)'}`,
                                caretColor: accentColor,
                              }}
                              required={field.required}
                            />
                            {field.type === 'password' && (
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility(`${platform.platform}_${field.name}`)}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors"
                              >
                                {showPasswords[`${platform.platform}_${field.name}`] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            )}
                          </div>
                          {field.description && (
                            <p className="text-xs text-slate-600 font-mono leading-relaxed">{field.description}</p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Multiple Facebook pages picker */}
                    {platform.platform === 'facebook' && allPages.length > 1 && testResults['facebook'] && (
                      <div className="mt-5 p-4 rounded-none border space-y-2"
                        style={{ borderColor: accentColor + '33', background: accentColor.replace('#','rgba(') + ',0.05)' }}
                      >
                        <p className="text-xs font-mono font-semibold tracking-widest uppercase" style={{ color: accentColor }}>
                          // Multiple pages found — select one:
                        </p>
                        <div className="space-y-1.5">
                          {allPages.map(page => (
                            <label
                              key={page.id}
                              className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-all font-mono text-sm ${
                                formData['facebook']?.pageId === page.id ? 'bg-accent-teal/15 border border-accent-teal/40' : 'bg-glass-white hover:bg-glass-white-hover border border-transparent'
                              }`}
                            >
                              <input
                                type="radio"
                                name="facebook-page"
                                value={page.id}
                                checked={formData['facebook']?.pageId === page.id}
                                onChange={() => handleFacebookPageSelect(page)}
                                className="accent-accent-teal"
                              />
                              <span className="text-slate-200 font-medium">{page.name}</span>
                              <span className="text-xs text-slate-500">{page.id}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Detected account info preview */}
                    {testResults[platform.platform] && detectedInfo[platform.platform] && (
                      <div className="mt-5 p-4 rounded-none border space-y-3"
                        style={{ borderColor: '#2dd4bf55', background: 'rgba(45,212,191,0.05)' }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.9)]" />
                          <p className="text-xs font-mono font-semibold text-green-400 tracking-widest uppercase">
                            Connection verified — credentials detected
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {detectedInfo[platform.platform].pageName && (
                            <div className="flex items-center gap-2 px-3 py-2 font-mono text-xs"
                              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                            >
                              <span className="text-slate-500 uppercase tracking-widest">Page</span>
                              <span className="text-slate-200 font-medium">{detectedInfo[platform.platform].pageName}</span>
                              <span className="text-slate-600">{detectedInfo[platform.platform].pageId}</span>
                            </div>
                          )}
                          {detectedInfo[platform.platform].username && (
                            <div className="flex items-center gap-2 px-3 py-2 font-mono text-xs"
                              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                            >
                              <span className="text-slate-500 uppercase tracking-widest">Account</span>
                              <span className="text-slate-200 font-medium">@{detectedInfo[platform.platform].username}</span>
                              {detectedInfo[platform.platform].followers && (
                                <span className="text-slate-600">· {Number(detectedInfo[platform.platform].followers).toLocaleString()} followers</span>
                              )}
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-green-400/70 font-mono flex items-center gap-1.5">
                          <Save className="h-3 w-3" />
                          Click <strong className="text-green-400">SAVE CONNECTION</strong> above to complete setup
                        </p>
                      </div>
                    )}

                    {/* ── STEP-BY-STEP SETUP GUIDE PANEL ── */}
                    <div className="mt-6"
                      style={{
                        background: 'rgba(5,7,14,0.98)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderLeft: `3px solid ${accentColor}`,
                      }}
                    >
                      <div className="flex items-center justify-between px-5 py-4">
                        <div className="flex items-center gap-4">
                          <div className="p-2 rounded-none"
                            style={{ background: `rgba(${accentColor.slice(1).match(/.{2}/g)?.map(h => parseInt(h,16)).join(',')},0.15)`, border: `1px solid ${accentColor}44` }}
                          >
                            <LibraryBig className="h-5 w-5" style={{ color: accentColor }} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-white font-mono uppercase tracking-widest">{platform.name} // Setup Guide</p>
                            <p className="text-xs font-mono mt-0.5" style={{ color: accentColor + 'aa' }}>
                              {platform.platform === 'facebook'  && '// Generate Access Token + Page ID'}
                              {platform.platform === 'instagram' && '// Generate Token + Instagram Business ID'}
                              {platform.platform === 'youtube'   && '// Generate OAuth Client ID & Secret'}
                              {platform.platform === 'linkedin'  && '// Generate Access Token + Person URN'}
                              {platform.platform === 'gmail'     && '// Generate Gmail App Password'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="flex items-center gap-2 px-4 py-2 font-mono text-xs tracking-widest uppercase transition-all"
                          onClick={() => setExpandedInstructions(prev => ({ ...prev, [platform.platform]: !prev[platform.platform] }))}
                          style={{
                            background: `rgba(${accentColor.slice(1).match(/.{2}/g)?.map(h => parseInt(h,16)).join(',')},0.1)`,
                            border: `1px solid ${accentColor}44`,
                            color: accentColor,
                          }}
                        >
                          <span>{expandedInstructions[platform.platform] ? 'Hide Steps' : 'View Steps'}</span>
                          {expandedInstructions[platform.platform] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      </div>

                      <AnimatePresence>
                        {expandedInstructions[platform.platform] && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                            className="overflow-hidden"
                          >
                            <div
                              className="px-5 pb-5 pt-2 font-mono text-xs text-slate-400 space-y-2 leading-relaxed"
                              style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                            >
                              {platform.platform === 'facebook' && (
                                <>
                                  <p className="text-slate-500">// Make sure you have a Facebook Page connected to your Facebook account before starting.</p>
                                  <p><span style={{ color: accentColor }}>01.</span> Go to <a href="https://developers.facebook.com/" className="underline text-slate-300 hover:text-white" target="_blank" rel="noopener noreferrer">developers.facebook.com</a> and create a new app</p>
                                  <p className="ml-5 text-slate-500">Select: Content Management → Manage everything on your Page</p>
                                  <p><span style={{ color: accentColor }}>02.</span> From the app dashboard, add the required permissions and open Graph API Explorer</p>
                                  <p className="font-bold text-slate-200"><span style={{ color: accentColor }}>03.</span> Generate an access token, select your Facebook Page, then extend it to get a long-lived token</p>
                                  <p><span style={{ color: accentColor }}>04.</span> Debug the token, copy the Page ID shown under <strong className="text-slate-300">pages_show_list</strong>, and use the Page access token to post</p>
                                  <p><span style={{ color: accentColor }}>05.</span> Publish posts or videos using the Page ID + Page access token</p>
                                  <p><span style={{ color: accentColor }}>06.</span> Verify and connect</p>
                                  <div className="mt-3 p-3 rounded-none"
                                    style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)' }}
                                  >
                                    <p className="font-semibold text-yellow-400 uppercase tracking-widest text-xs">⚠ Important Notice</p>
                                    <p className="mt-1 text-slate-400">After testing, make sure to publish the Meta app (Live mode).</p>
                                    <p>If the app remains in Development mode, only you can see the posts — others will not.</p>
                                  </div>
                                </>
                              )}
                              {platform.platform === 'instagram' && (
                                <>
                                  <p className="text-slate-500">// Make sure your Instagram account is connected to your Facebook account before starting.</p>
                                  <p><span style={{ color: accentColor }}>01.</span> Go to <a href="https://developers.facebook.com/" className="underline text-slate-300 hover:text-white" target="_blank" rel="noopener noreferrer">developers.facebook.com</a> and create a new app</p>
                                  <p className="ml-5 text-slate-500">Select: Content Management → Manage messaging & content on Instagram</p>
                                  <p><span style={{ color: accentColor }}>02.</span> From the app dashboard, add the required permissions and open Graph API Explorer</p>
                                  <p><span style={{ color: accentColor }}>03.</span> Generate an access token, select your Instagram account, then extend it to get a long-lived token</p>
                                  <p><span style={{ color: accentColor }}>04.</span> Debug the token, copy the Instagram ID shown under <strong className="text-slate-300">instagram_basic</strong>, and use the access token to post</p>
                                  <p><span style={{ color: accentColor }}>05.</span> Publish posts or videos using the Instagram ID + access token</p>
                                  <p><span style={{ color: accentColor }}>06.</span> Verify and connect</p>
                                </>
                              )}
                              {platform.platform === 'youtube' && (
                                <>
                                  <p className="text-slate-500">// Make sure you have created a YouTube channel before starting.</p>
                                  <p><span style={{ color: accentColor }}>01.</span> Open <a href="https://console.cloud.google.com/" className="underline text-slate-300 hover:text-white" target="_blank" rel="noopener noreferrer">console.cloud.google.com</a> and create a new project</p>
                                  <p><span style={{ color: accentColor }}>02.</span> Enable <strong className="text-slate-300">YouTube Data API v3</strong> → APIs & Services → Enabled APIs & Services</p>
                                  <p><span style={{ color: accentColor }}>03.</span> Open <strong className="text-slate-300">OAuth Consent Screen</strong>, create the app, then add your Google email under <strong className="text-slate-300">Test Users</strong></p>
                                  <p><span style={{ color: accentColor }}>04.</span> Create <strong className="text-slate-300">OAuth Client ID & Secret</strong>. Use this Authorized Redirect URL:</p>
                                  <p className="ml-5 text-slate-300 font-mono text-xs bg-black/40 px-3 py-2 mt-1 border border-white/10">https://socialflow.network/api/integrations/youtube/oauth/callback</p>
                                  <p><span style={{ color: accentColor }}>05.</span> Copy the Client ID and Secret into the application, then verify and connect</p>
                                  <p><span style={{ color: accentColor }}>06.</span> Click <strong className="text-slate-300">Authorize YouTube</strong>, select your Google account, and complete authorization</p>
                                </>
                              )}
                              {platform.platform === 'linkedin' && (
                                <>
                                  <p><span style={{ color: accentColor }}>01.</span> Open LinkedIn Developer Portal → <a href="https://www.linkedin.com/developers/" className="underline text-slate-300 hover:text-white" target="_blank" rel="noopener noreferrer">LinkedIn Developers</a></p>
                                  <p><span style={{ color: accentColor }}>02.</span> Create a New App</p>
                                  <p><span style={{ color: accentColor }}>03.</span> Enable Required Products: <strong className="text-slate-300">Share on LinkedIn</strong> & <strong className="text-slate-300">Sign in with LinkedIn using OpenID Connect</strong></p>
                                  <p><span style={{ color: accentColor }}>04.</span> Generate OAuth 2.0 Access Token and copy it</p>
                                  <p><span style={{ color: accentColor }}>05.</span> Fetch Person URN — open this URL with your token appended:</p>
                                  <p className="ml-5 text-slate-300 font-mono text-xs bg-black/40 px-3 py-2 mt-1 border border-white/10">https://api.linkedin.com/v2/userinfo?oauth2_access_token=</p>
                                  <p><span style={{ color: accentColor }}>06.</span> Format as <code className="text-slate-300">urn:li:person:XXXXXXXXXXXX</code> and paste into the field</p>
                                  <p><span style={{ color: accentColor }}>07.</span> Verify & Connect — done!</p>
                                </>
                              )}
                              {platform.platform === 'gmail' && (
                                <>
                                  <p><span style={{ color: accentColor }}>01.</span> Open your Google Account page (make sure 2-Step Verification is enabled)</p>
                                  <p><span style={{ color: accentColor }}>02.</span> Search "App Passwords" in the Google Account search bar</p>
                                  <p><span style={{ color: accentColor }}>03.</span> Create a new app password, give it a name, and click <strong className="text-slate-300">Create</strong></p>
                                  <p><span style={{ color: accentColor }}>04.</span> Copy the generated password and paste it along with your Gmail address below</p>
                                </>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════
          SECURITY NOTICE
      ══════════════════════════════════════ */}
      <div
        className="p-6 mb-8"
        style={{
          background: 'rgba(8,10,18,0.95)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderLeft: '3px solid rgba(74,222,128,0.5)',
        }}
      >
        <div className="flex items-start gap-4">
          <div className="p-2.5 mt-0.5 shrink-0"
            style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)' }}
          >
            <Shield className="h-5 w-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white font-mono uppercase tracking-widest mb-2">// Security Notice</h3>
            <p className="text-xs text-slate-500 font-mono mb-3 leading-relaxed">
              Your API credentials are encrypted using AES-256 encryption and stored securely. We never store or log your actual social media passwords.
            </p>
            <ul className="text-xs text-slate-600 font-mono space-y-1.5">
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-500/50 shrink-0" />Credentials encrypted at rest and in transit</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-500/50 shrink-0" />Access is logged and monitored for security</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-500/50 shrink-0" />You can revoke access at any time</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-500/50 shrink-0" />We follow industry security best practices</li>
            </ul>
          </div>
        </div>
      </div>

    </div>
  );
};

export default SocialIntegration;
