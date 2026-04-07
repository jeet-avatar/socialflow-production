import { useState, useEffect, useCallback } from 'react';
import { notify } from '../services/notificationService';
import * as companyAnalysisService from '../services/companyAnalysisService';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Search, RefreshCw, AlertCircle, Building2, TrendingUp, Shield, Newspaper, Globe, Database, Linkedin, MessageSquare, Radio, MapPin, Users, Calendar, Briefcase, DollarSign, BarChart2, Megaphone, UserCheck, GitMerge, ExternalLink, Tag, Video, FolderOpen, Clock, X } from 'lucide-react';

const GoogleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M21.35 11.1H12.18V13.83H18.69C18.36 17.64 15.19 19.27 12.19 19.27C8.36 19.27 5 16.25 5 12C5 7.9 8.2 4.73 12.2 4.73C15.29 4.73 17.1 6.7 17.1 6.7L19 4.72C19 4.72 16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12C2.03 17.05 6.16 22 12.25 22C17.6 22 21.5 18.33 21.5 12.91C21.5 11.76 21.35 11.1 21.35 11.1Z"/>
  </svg>
);

const TwitterXIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
  </svg>
);

import { getAuthToken } from '../utils/getAuthToken';
import { API_BASE_URL } from '../config/api';

interface RiskAnalysis {
  overallRiskScore: number;
  riskLevel: 'Low' | 'Low-Medium' | 'Medium' | 'Medium-High' | 'High';
  sections: Array<{
    section: string;
    sentiments: Array<{
      field: string;
      sentiment: 'positive' | 'negative' | 'neutral';
      score: number;
      reasoning: string;
    }>;
    overallSentiment: 'positive' | 'negative' | 'neutral';
    overallScore: number;
    summary: string;
  }>;
  keyRiskFactors: string[];
  keyPositiveFactors: string[];
  recommendation: string;
  confidence: number;
}

const NEWS_ORDER = [
  'Mergers & Acquisitions',
  'Funding Rounds',
  'IPO',
  'Leadership Changes',
  'Rapid Hiring',
  'Announcements',
  'Other News',
] as const;

const getCategoryIcon = (category: string) => {
  const icons: Record<string, React.ReactNode> = {
    'Mergers & Acquisitions': <GitMerge className="h-4 w-4" />,
    'Funding Rounds': <DollarSign className="h-4 w-4" />,
    'IPO': <BarChart2 className="h-4 w-4" />,
    'Leadership Changes': <UserCheck className="h-4 w-4" />,
    'Rapid Hiring': <Users className="h-4 w-4" />,
    'Announcements': <Megaphone className="h-4 w-4" />,
    'Other News': <Newspaper className="h-4 w-4" />,
  };
  return icons[category] || <Newspaper className="h-4 w-4" />;
};

const CreditRating = ({ prefillQuery }: { prefillQuery?: string }) => {
  const [searchQuery, setSearchQuery] = useState(prefillQuery || '');
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [creditData, setCreditData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRiskPopupOpen, setIsRiskPopupOpen] = useState(false);
  const [riskAnalysis, setRiskAnalysis] = useState<RiskAnalysis | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const handleOpenVideo = () => setShowVideoModal(true);
  const handleCloseVideo = () => setShowVideoModal(false);
  const [pageTab, setPageTab] = useState<'analyze' | 'myReports'>('analyze');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [savedCompanies, setSavedCompanies] = useState<any[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [companiesError, setCompaniesError] = useState<string | null>(null);

  const fetchSavedCompanies = async () => {
    setCompaniesLoading(true);
    setCompaniesError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_BASE_URL}/companies`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSavedCompanies(data.companies || []);
    } catch (e) {
      setCompaniesError(e instanceof Error ? e.message : 'Failed to load reports');
    } finally {
      setCompaniesLoading(false);
    }
  };

  useEffect(() => {
    if (pageTab === 'myReports') fetchSavedCompanies();
   
  }, [pageTab]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [reportViewData, setReportViewData] = useState<any>(null);
  const [reportViewLoading, setReportViewLoading] = useState(false);
  const [reportViewError, setReportViewError] = useState<string | null>(null);
  const [reportViewOpen, setReportViewOpen] = useState(false);

  const openSavedReport = async (companyName: string) => {
    setReportViewOpen(true);
    setReportViewLoading(true);
    setReportViewError(null);
    setReportViewData(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_BASE_URL}/companies/report?name=${encodeURIComponent(companyName)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to load report (${res.status})`);
      const data = await res.json();
      setReportViewData(data);
    } catch (e) {
      setReportViewError(e instanceof Error ? e.message : 'Failed to load report');
    } finally {
      setReportViewLoading(false);
    }
  };

  const [dataFetchedAt, setDataFetchedAt] = useState<string | null>(null);
  const [visibleNewsCount, setVisibleNewsCount] = useState(0);
  const [suggestions, setSuggestions] = useState<Array<{
    name: string; slug: string; linkedin_url: string; snippet: string; is_link?: boolean;
    profile?: { company_name?: string; industry?: string; headquarters?: string; company_size?: string; founded?: string; about?: string; logo_url?: string; website?: string };
  }>>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const getRelativeTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const fetchSuggestions = async (query: string) => {
    setSuggestionsLoading(true);
    setShowSuggestions(true);
    setSuggestions([]);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${API_BASE_URL}/api/company-analysis/suggestions?query=${encodeURIComponent(query)}`,
        { headers }
      );
      const data = await response.json();
      if (data.suggestions) setSuggestions(data.suggestions);
    } catch {
      // suggestions fetch failed — input remains usable
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    try {
      const token = await getAuthToken();
      if (token) return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    } catch { /* fall through */ }
    return { 'Content-Type': 'application/json' };
  };


  // Sync UI state from the background analysis service
  const syncFromService = useCallback(() => {
    const state = companyAnalysisService.getState();
    if (!state) return;

    setSearchQuery(state.query);

    if (state.status === 'running') {
      setLoading(true);
      setRiskLoading(false);
      setError(null);
      setCreditData(null);
      setRiskAnalysis(null);
    } else if (state.status === 'risk-analysis') {
      setLoading(false);
      setRiskLoading(true);
      setError(null);
      if (state.creditData) {
        setCreditData(state.creditData);
        setDataFetchedAt(new Date().toISOString());
      }
    } else if (state.status === 'done') {
      setLoading(false);
      setRiskLoading(false);
      setError(null);
      if (state.creditData) {
        setCreditData(state.creditData);
        setDataFetchedAt(new Date().toISOString());
      }
      if (state.riskAnalysis) setRiskAnalysis(state.riskAnalysis as RiskAnalysis);
    } else if (state.status === 'error') {
      setLoading(false);
      setRiskLoading(false);
      setError(state.error ?? 'Analysis failed.');
      setCreditData(null);
      setRiskAnalysis(null);
    }
  }, []);

  // On mount: restore any in-progress or completed analysis from the service
  useEffect(() => {
    syncFromService();
    return companyAnalysisService.subscribe(syncFromService);
  }, [syncFromService]);

  const handleSearchWithQuery = useCallback(async (query: string, forceRefresh = false) => {
    if (!query.trim()) return;
    setShowSuggestions(false);
    setSuggestions([]);
    companyAnalysisService.startAnalysis(query.trim(), getAuthToken, forceRefresh);
    notify(
      'Analysis Started',
      `Scanning "${query.trim()}" — we'll notify you when the report is ready.`,
      'info',
    );
  }, []);

  const handleSearch = useCallback(
    () => handleSearchWithQuery(searchQuery),
    [handleSearchWithQuery, searchQuery],
  );

  useEffect(() => {
    if (prefillQuery?.trim()) {
      setSearchQuery(prefillQuery.trim());
      handleSearchWithQuery(prefillQuery.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillQuery]);

  const makeCountUpdater = (target: number) => (v: number) => Math.max(v, target);

  useEffect(() => {
    if (!creditData?.news || Array.isArray(creditData.news)) return;
    setVisibleNewsCount(0);
    const cats = NEWS_ORDER.filter(cat => ((creditData.news as Record<string, unknown[]>)[cat] || []).length > 0);
    cats.forEach((_, i) => {
      setTimeout(() => setVisibleNewsCount(makeCountUpdater(i + 1)), i * 380 + 60);
    });
  }, [creditData]);

  const RISK_STROKE_COLORS: Record<string, string> = {
    'Low': '#34d399', 'Low-Medium': '#fbbf24', 'Medium': '#fb923c',
    'Medium-High': '#f87171', 'High': '#ef4444',
  };
  const getRiskStrokeColor = (level: string) => RISK_STROKE_COLORS[level] ?? '#9ca3af';

  const getSentimentClass = (sentiment: string) => {
    if (sentiment === 'positive') return 'bg-emerald-400/15 text-emerald-400 border border-emerald-400/25';
    if (sentiment === 'negative') return 'bg-red-400/15 text-red-400 border border-red-400/25';
    return 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/25';
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'Low': return { text: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30', bar: 'bg-emerald-400' };
      case 'Low-Medium': return { text: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30', bar: 'bg-yellow-400' };
      case 'Medium': return { text: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/30', bar: 'bg-orange-400' };
      case 'Medium-High': return { text: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/30', bar: 'bg-red-400' };
      case 'High': return { text: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30', bar: 'bg-red-500' };
      default: return { text: 'text-gray-400', bg: 'bg-gray-400/10', border: 'border-gray-400/30', bar: 'bg-gray-400' };
    }
  };

  const getRiskIcon = (level: string) => {
    const c = getRiskStrokeColor(level);
    return (
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50" style={{ backgroundColor: c }}></span>
        <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: c }}></span>
      </span>
    );
  };

  const getPlatformIcon = (platform: string) => {
    const p = (platform || '').toLowerCase();
    if (p.includes('twitter') || p.includes('x.com')) return <TwitterXIcon className="h-4 w-4" />;
    if (p.includes('linkedin')) return <Linkedin className="h-4 w-4" />;
    if (p.includes('facebook')) return <FacebookIcon className="h-4 w-4" />;
    if (p.includes('instagram')) return <InstagramIcon className="h-4 w-4" />;
    if (p.includes('reddit')) return <MessageSquare className="h-4 w-4" />;
    return <Radio className="h-4 w-4" />;
  };

  const renderSocialSignals = (data: Record<string, unknown>[]) => {
    if (!data || data.length === 0) return null;
    return (
      <div className="glass-card p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-10 h-10 bg-gradient-teal-blue rounded-xl flex items-center justify-center shadow-glow-teal flex-shrink-0">
            <Radio className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-dark-text">Social Media Signals</h3>
            <p className="text-xs text-dark-text-muted">{data.length} {data.length === 1 ? 'signal' : 'signals'} found</p>
          </div>
        </div>
        <div className="space-y-3">
          {data.map((row, idx) => (
            <div key={row.url as string || `signal-${idx}`} className="glass-card p-4 hover:bg-glass-white-hover transition-all duration-300">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-gradient-teal-blue rounded-lg flex items-center justify-center flex-shrink-0 text-white shadow-glow-teal">
                  {getPlatformIcon(row.platform as string)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-dark-text capitalize">{row.platform || 'Unknown'}</span>
                    {row.author && <span className="text-xs text-dark-text-muted">· @{row.author}</span>}
                  </div>
                  {row.content && <p className="text-sm text-dark-text-muted leading-relaxed">{row.content as string}</p>}
                </div>
                {row.url && (
                  <a href={row.url as string} target="_blank" rel="noopener noreferrer"
                    className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg bg-accent-blue/10 border border-accent-blue/30 text-accent-blue hover:bg-accent-blue/20 hover:border-accent-blue/50 transition-all">
                    View →
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const getSourceIcon = (type: string, name?: string) => {
    const combined = ((type || '') + ' ' + (name || '')).toLowerCase();
    if (combined.includes('linkedin')) return <Linkedin className="h-4 w-4" />;
    if (combined.includes('instagram')) return <InstagramIcon className="h-4 w-4" />;
    if (combined.includes('twitter') || combined.includes('x.com')) return <TwitterXIcon className="h-4 w-4" />;
    if (combined.includes('facebook')) return <FacebookIcon className="h-4 w-4" />;
    if (combined.includes('news')) return <Newspaper className="h-4 w-4" />;
    if (combined.includes('google') || combined.includes('duck') || combined.includes('search')) return <GoogleIcon className="h-4 w-4" />;
    if (combined.includes('web')) return <Globe className="h-4 w-4" />;
    if (combined.includes('social')) return <Radio className="h-4 w-4" />;
    return <Database className="h-4 w-4" />;
  };

  const renderEndpointLink = (row: Record<string, unknown>) => {
    const ep = row.endpoint;
    if (typeof ep !== 'string' || !ep) return null;
    const rowName = typeof row.name === 'string' ? row.name : '';
    const isSocial = row.type === 'Social Media' || row.type === 'Professional' ||
      ['LinkedIn', 'Instagram', 'Facebook', 'Twitter', 'X'].some(s => rowName.includes(s));
    const label = isSocial
      ? `@${ep.replace(/\/$/, '').split('/').pop()}`
      : ep.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    return (
      <a href={ep.startsWith('http') ? ep : `https://${ep}`}
        target="_blank" rel="noopener noreferrer"
        className="text-[10px] text-accent-blue hover:underline truncate block mt-0.5">
        {label}
      </a>
    );
  };

  const renderDataSources = (data: Record<string, unknown>[]) => {
    if (!data || data.length === 0) return null;
    return (
      <div className="glass-card p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-10 h-10 bg-gradient-teal-blue rounded-xl flex items-center justify-center shadow-glow-teal flex-shrink-0">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-dark-text">Data Sources</h3>
            <p className="text-xs text-dark-text-muted">{data.length} sources used for this analysis</p>
          </div>
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(data.length, 6)}, 1fr)` }}>
          {data.map((row, idx) => (
            <div key={row.name as string || `source-${idx}`} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-glass-white border border-glass-border hover:border-accent-blue/30 hover:bg-accent-blue/5 transition-all text-center">
              <div className="w-10 h-10 bg-gradient-teal-blue rounded-lg flex items-center justify-center text-white shadow-glow-teal flex-shrink-0">
                {getSourceIcon(row.type as string, row.name as string)}
              </div>
              <div className="min-w-0 w-full">
                <div className="text-xs font-medium text-dark-text leading-tight truncate">{row.name || 'Source'}</div>
                {row.type && (
                  <div className="text-[10px] text-dark-text-dim uppercase tracking-wide mt-0.5">{row.type as string}</div>
                )}
                {renderEndpointLink(row)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen">
      <style>{`
        @keyframes newsCardIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="max-w-7xl mx-auto px-0 pt-0">

        {/* ── Terminal Page Header ── */}
        <div className="relative overflow-hidden rounded-2xl mb-5" style={{
          background: 'linear-gradient(135deg, rgba(6,10,20,0.97) 0%, rgba(8,14,28,0.97) 100%)',
          border: '1px solid rgba(45,212,191,0.15)',
          boxShadow: '0 0 60px rgba(45,212,191,0.06), inset 0 1px 0 rgba(255,255,255,0.04)'
        }}>
          {/* Scanline overlay */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 3px)',
            backgroundSize: '100% 4px'
          }} />
          {/* Corner accent */}
          <div className="absolute top-0 left-0 w-16 h-16 pointer-events-none" style={{
            background: 'radial-gradient(ellipse at 0% 0%, rgba(45,212,191,0.2) 0%, transparent 70%)'
          }} />
          <div className="relative px-6 py-5 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              {/* Terminal icon with pulse */}
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{
                  background: 'rgba(45,212,191,0.1)',
                  border: '1px solid rgba(45,212,191,0.3)',
                  boxShadow: '0 0 20px rgba(45,212,191,0.15)'
                }}>
                  <Shield className="w-6 h-6 text-accent-teal" />
                </div>
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full" style={{ background: '#2dd4bf' }}>
                  <span className="absolute inset-0 rounded-full animate-ping" style={{ background: '#2dd4bf', opacity: 0.5 }} />
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-mono text-accent-teal/50 tracking-widest uppercase">sys::intel</span>
                  <span className="w-1 h-1 rounded-full bg-accent-teal/40" />
                  <span className="text-[10px] font-mono text-accent-teal/30 tracking-widest">v2.4.1</span>
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: "'Sora', 'Poppins', sans-serif" }}>
                  CREDIT INTELLIGENCE
                </h2>
                <p className="text-xs text-white/30 mt-0.5 font-mono">AI-powered risk assessment &amp; company analysis terminal</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Sharp tab switcher */}
              <div className="flex items-center border border-white/[0.08] rounded-lg overflow-hidden" style={{ background: 'rgba(0,0,0,0.4)' }}>
                <button
                  onClick={() => setPageTab('analyze')}
                  className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                    pageTab === 'analyze'
                      ? 'text-black'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                  style={pageTab === 'analyze' ? { background: 'linear-gradient(90deg, #2dd4bf, #60a5fa)' } : {}}
                >
                  <Search className="w-3.5 h-3.5" /><span>Analyze</span>
                </button>
                <div className="w-px h-6 bg-white/[0.08]" />
                <button
                  onClick={() => { setPageTab('myReports'); fetchSavedCompanies(); }}
                  className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                    pageTab === 'myReports'
                      ? 'text-black'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                  style={pageTab === 'myReports' ? { background: 'linear-gradient(90deg, #2dd4bf, #60a5fa)' } : {}}
                >
                  <FolderOpen className="w-3.5 h-3.5" /><span>Reports</span>
                  {savedCompanies.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold leading-none" style={{
                      background: pageTab === 'myReports' ? 'rgba(0,0,0,0.3)' : 'rgba(45,212,191,0.2)',
                      color: pageTab === 'myReports' ? '#000' : '#2dd4bf'
                    }}>
                      {savedCompanies.length}
                    </span>
                  )}
                </button>
              </div>
              <button
                onClick={handleOpenVideo}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider text-white/50 border border-white/[0.08] hover:text-white/80 hover:border-white/20 transition-all"
                style={{ background: 'rgba(255,255,255,0.03)' }}
              >
                <BookOpen className="h-3.5 w-3.5" /><span>Guide</span>
              </button>
            </div>
          </div>
        </div>

        {pageTab === 'analyze' && (<>
        {/* ── Hero Search Bar ── */}
        <div className="glass-panel mb-5">
          <div className="flex gap-3 items-stretch">
            <div className="relative flex-1">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-accent-teal/15 border border-accent-teal/25 flex items-center justify-center pointer-events-none">
                <Building2 className="h-4 w-4 text-accent-teal" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Company name, LinkedIn URL, or website..."
                className="input-glass w-full pl-[3.5rem] pr-4 h-[54px] text-base placeholder:text-dark-text-dim/60"
              />
            </div>
            <button
              onClick={loading ? undefined : handleSearch}
              disabled={!loading && !searchQuery.trim()}
              className={`btn-gradient-teal flex items-center gap-2.5 font-bold px-6 h-[54px] whitespace-nowrap min-w-[130px] justify-center rounded-xl text-sm ${loading ? 'pointer-events-none opacity-80' : 'disabled:opacity-40 disabled:cursor-not-allowed'}`}
            >
              {loading ? (
                <>
                  <span className="flex items-center gap-0.5">
                    {[0, 140, 280].map(d => (
                      <span key={d} className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </span>
                  <span>Analyzing…</span>
                </>
              ) : (
                <><Search className="h-4 w-4" /><span>Analyze</span></>
              )}
            </button>
          </div>

          {/* Data freshness row - compact inline */}
          {creditData && dataFetchedAt && (
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-dark-text-dim">
                <Clock className="h-3 w-3" />
                <span>Updated <span className="text-dark-text-muted font-medium">{getRelativeTime(dataFetchedAt)}</span></span>
                {creditData.responseMetadata?.cached && (
                  <span className="px-2 py-0.5 rounded-full bg-accent-teal/10 text-accent-teal text-[10px] font-semibold border border-accent-teal/20">cached</span>
                )}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => fetchSuggestions(searchQuery)}
                  className="flex items-center gap-1 text-xs text-dark-text-muted hover:text-dark-text transition-colors px-2 py-1 rounded-lg hover:bg-glass-white"
                >
                  <AlertCircle className="h-3 w-3" />Wrong company?
                </button>
                <button
                  onClick={() => handleSearchWithQuery(searchQuery, true)}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-glass-white hover:bg-glass-white-hover border border-glass-border text-dark-text-muted hover:text-dark-text transition-all disabled:opacity-40"
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />Refresh
                </button>
              </div>
            </div>
          )}

          {/* Suggestions panel */}
          {showSuggestions && (
            <div className="mt-3 pt-3 border-t border-glass-border/60">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-dark-text-muted uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-accent-blue" />
                  Did you mean one of these?
                </h4>
                <button onClick={() => setShowSuggestions(false)} className="text-dark-text-dim/50 hover:text-dark-text text-xs px-2 py-0.5 rounded hover:bg-glass-white transition-all">✕</button>
              </div>
              {suggestionsLoading ? (
                <div className="flex items-center gap-2 text-dark-text-muted text-xs py-3">
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-accent-blue/30 border-t-accent-blue"></div>
                  Fetching company profiles...
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {suggestions
                    .filter((s) => s.linkedin_url !== creditData?.company?.linkedin_url)
                    .map((s) => (
                      <button
                        key={s.slug}
                        onClick={() => { setSearchQuery(s.linkedin_url); setShowSuggestions(false); handleSearchWithQuery(s.linkedin_url); }}
                        className="text-left px-3 py-2.5 rounded-xl bg-glass-white hover:bg-glass-white-hover border border-glass-border hover:border-accent-teal/30 transition-all group"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center flex-shrink-0">
                            <Building2 className="h-3.5 w-3.5 text-accent-blue/70" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-dark-text group-hover:text-accent-teal transition-colors truncate">{s.name}</div>
                            <div className="text-xs text-dark-text-dim/50 truncate">/{s.slug}</div>
                          </div>
                          <span className="text-xs text-accent-teal opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">→</span>
                        </div>
                      </button>
                    ))}
                </div>
              )}
              <p className="text-xs text-dark-text-dim/40 mt-2.5">
                Can't find your company? Paste the LinkedIn URL or website URL directly.
              </p>
            </div>
          )}
        </div>

        {/* ── Loading ── */}
        {loading && (
          <motion.div
            className="rounded-2xl p-16 text-center mb-5"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ background: 'rgba(6,10,20,0.97)', border: '1px solid rgba(45,212,191,0.12)' }}
          >
            {/* Animated radar ring */}
            <div className="relative w-20 h-20 mx-auto mb-6">
              <svg className="w-20 h-20 -rotate-90 absolute inset-0" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(45,212,191,0.08)" strokeWidth="2" />
                <circle cx="40" cy="40" r="22" fill="none" stroke="rgba(45,212,191,0.05)" strokeWidth="1" />
                <circle cx="40" cy="40" r="32" fill="none" stroke="#2dd4bf" strokeWidth="2"
                  strokeDasharray="50 150" className="animate-spin" style={{ animationDuration: '1.6s' }} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-accent-teal animate-pulse" />
              </div>
            </div>
            <p className="text-white font-bold text-lg font-mono tracking-wide">SCANNING: <span className="text-accent-teal">{searchQuery}</span></p>
            <p className="text-white/30 text-sm mt-2 font-mono">fetching intelligence data · running AI risk model…</p>
            <div className="flex items-center justify-center gap-1.5 mt-4">
              {['company profile', 'news feed', 'risk analysis'].map((step, i) => (
                <span key={step} className="text-[9px] font-mono uppercase tracking-widest px-2 py-1 rounded border border-accent-teal/20 text-accent-teal/40"
                  style={{ animationDelay: `${i * 0.3}s` }}>
                  {step}
                </span>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="glass-card border border-red-500/20 p-5 mb-5" style={{ background: 'rgba(239,68,68,0.06)' }}>
            <div className="flex items-start gap-4">
              <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-400">Analysis Failed</h3>
                <p className="text-sm text-red-300/70 mt-0.5 leading-relaxed">{error}</p>
                <p className="text-xs text-dark-text-muted mt-2">Try pasting the company's LinkedIn URL or website URL directly.</p>
                {!showSuggestions && (
                  <button
                    onClick={() => fetchSuggestions(searchQuery)}
                    className="mt-3 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-glass-white hover:bg-glass-white-hover border border-glass-border text-dark-text-muted hover:text-dark-text transition-all"
                  >
                    <Building2 className="h-3 w-3" />
                    Show similar companies
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {creditData && !loading && (
          <motion.div
            className="credit-report-container space-y-4 mb-5"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >

            {/* Company Profile Card */}
            <div className="glass-panel overflow-hidden">
              {/* Atmospheric header */}
              <div className="relative px-6 pt-6 pb-4 overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.09) 0%, rgba(59,130,246,0.07) 60%, rgba(6,182,212,0.05) 100%)' }}>
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 0% 100%, rgba(16,185,129,0.18) 0%, transparent 50%), radial-gradient(ellipse at 100% 0%, rgba(6,182,212,0.12) 0%, transparent 50%)' }} />
                <div className="relative flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-5 min-w-0 flex-1">
                    {/* Logo with glow ring */}
                    <div className="relative flex-shrink-0">
                      <div className="w-[72px] h-[72px] rounded-2xl border-2 border-white/10 bg-dark-bg-lighter flex items-center justify-center overflow-hidden shadow-glass">
                        {creditData.company?.logo_url ? (
                          <>
                            <img
                              src={creditData.company.logo_url}
                              alt={creditData.company?.company_name ?? 'Company'}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                const t = e.target as HTMLImageElement;
                                t.style.display = 'none';
                                const sib = t.nextElementSibling as HTMLElement;
                                if (sib) sib.style.display = 'flex';
                              }}
                            />
                            <Building2 className="h-8 w-8 text-accent-teal/50 hidden" />
                          </>
                        ) : (
                          <Building2 className="h-8 w-8 text-accent-teal/50" />
                        )}
                      </div>
                      {/* Status dot */}
                      <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-dark-bg border-2 border-dark-bg flex items-center justify-center">
                        <span className="w-2 h-2 rounded-full bg-accent-teal animate-pulse" />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-2xl font-bold text-dark-text leading-tight font-display">
                        {creditData.company?.company_name ?? creditData.company?.queried_name ?? 'Company Analysis'}
                      </h2>
                      {/* Info chips */}
                      <div className="flex items-center flex-wrap gap-2 mt-2.5">
                        {creditData.company?.industry && (
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-dark-text-muted">
                            <Building2 className="h-3 w-3 text-accent-blue/60" />{creditData.company.industry}
                          </span>
                        )}
                        {creditData.company?.headquarters && (
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-dark-text-muted">
                            <MapPin className="h-3 w-3 text-accent-blue/60" />{creditData.company.headquarters}
                          </span>
                        )}
                        {creditData.company?.size && (
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-dark-text-muted">
                            <Users className="h-3 w-3 text-accent-blue/60" />{creditData.company.size}
                          </span>
                        )}
                        {creditData.company?.founded && (
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-dark-text-muted">
                            <Calendar className="h-3 w-3 text-accent-blue/60" />Est. {creditData.company.founded}
                          </span>
                        )}
                        {creditData.company?.type && (
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-dark-text-muted">
                            <Briefcase className="h-3 w-3 text-accent-blue/60" />{creditData.company.type}
                          </span>
                        )}
                        {creditData.company?.website && (
                          <a href={creditData.company.website.startsWith('www.') ? `https://${creditData.company.website}` : creditData.company.website}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-accent-blue/10 border border-accent-blue/25 text-accent-blue hover:bg-accent-blue/15 transition-colors">
                            <Globe className="h-3 w-3" />
                            {creditData.company.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                            <ExternalLink className="h-3 w-3 opacity-60" />
                          </a>
                        )}
                        {creditData.company?.data_source === 'duckduckgo' && (
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-accent-blue/10 border border-accent-blue/20 text-accent-blue">
                            <Search className="h-3 w-3" />Web search
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <button
                      onClick={() => globalThis.dispatchEvent(new CustomEvent('navigateTo', { detail: { page: 'video-studio' } }))}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-glass-white text-dark-text border border-glass-border hover:bg-glass-white-hover transition-all"
                    >
                      <Video className="h-4 w-4 text-accent-teal" />
                      <span>Video Studio</span>
                    </button>
                    {riskLoading && (
                      <div className="flex flex-col items-center gap-1 px-4 py-2">
                        <div className="relative w-14 h-14">
                          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                            <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                            <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(45,212,191,0.3)" strokeWidth="4"
                              strokeDasharray="138 138" strokeDashoffset="69" className="animate-spin" style={{ animationDuration: '2s' }} />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[9px] font-mono text-white/30 uppercase">scan</span>
                          </div>
                        </div>
                        <span className="text-[9px] font-mono text-white/20 uppercase tracking-widest">analyzing</span>
                      </div>
                    )}
                    {!riskLoading && riskAnalysis && (() => {
                      const strokeColor = getRiskStrokeColor(riskAnalysis.riskLevel);
                      const circ = 2 * Math.PI * 22;
                      const rc = getRiskColor(riskAnalysis.riskLevel);
                      return (
                        <button
                          onClick={() => setIsRiskPopupOpen(true)}
                          className="group relative flex flex-col items-center gap-1 px-4 py-3 rounded-xl transition-all hover:scale-105"
                          style={{
                            background: `radial-gradient(circle at center, ${strokeColor}12, transparent 70%)`,
                            border: `1px solid ${strokeColor}30`,
                            boxShadow: `0 0 20px ${strokeColor}10`
                          }}
                        >
                          <div className="relative w-16 h-16">
                            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 56 56">
                              <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                              <motion.circle
                                cx="28" cy="28" r="22" fill="none"
                                stroke={strokeColor} strokeWidth="4"
                                strokeLinecap="round"
                                strokeDasharray={circ}
                                initial={{ strokeDashoffset: circ }}
                                animate={{ strokeDashoffset: circ - (riskAnalysis.overallRiskScore / 100) * circ }}
                                transition={{ duration: 1.4, ease: 'easeOut', delay: 0.2 }}
                              />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                              <span className="text-lg font-black" style={{ color: strokeColor }}>{riskAnalysis.overallRiskScore}</span>
                              <span className="text-[8px] font-mono text-white/30 uppercase">/100</span>
                            </div>
                          </div>
                          <div className="text-center">
                            <span className="text-[9px] font-mono uppercase tracking-widest block" style={{ color: `${strokeColor}90` }}>RISK</span>
                            <span className={`text-[10px] font-bold ${rc.text}`}>{riskAnalysis.riskLevel}</span>
                          </div>
                          <span className="absolute -top-1 -right-1 text-[8px] font-mono text-white/20 opacity-0 group-hover:opacity-100 transition-opacity">tap</span>
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="px-6 pt-3 pb-5 space-y-4">
                {creditData.company?.about && (
                  <div>
                    <h4 className="text-xs font-semibold text-dark-text-muted uppercase tracking-widest mb-2">About</h4>
                    <div className="border-l-2 border-accent-blue/40 pl-4">
                      <p className="text-sm text-dark-text leading-relaxed">
                        {creditData.company.about.length > 380
                          ? creditData.company.about.slice(0, 380).trimEnd() + '…'
                          : creditData.company.about}
                      </p>
                    </div>
                  </div>
                )}

                {(creditData.company?.specialties?.length ?? 0) > 0 && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Tag className="h-4 w-4 text-accent-blue" />
                    </div>
                    <p className="text-sm text-dark-text-muted leading-relaxed pt-1">
                      {creditData.company.specialties.join(' · ')}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Social Signals */}
            {(creditData.social?.length ?? 0) > 0 && renderSocialSignals(creditData.social ?? [])}

            {/* Data Sources */}
            {(creditData.dataSources?.length ?? 0) > 0 && renderDataSources(creditData.dataSources ?? [])}

            {/* News Coverage */}
            {creditData.news && !Array.isArray(creditData.news) && Object.keys(creditData.news).length > 0 && (() => {
              const newsDict = creditData.news as Record<string, Record<string, unknown>[]>;
              const orderedCats = NEWS_ORDER.filter(cat => (newsDict[cat] || []).length > 0);
              const totalArticles = orderedCats.reduce((acc, cat) => acc + (newsDict[cat] || []).length, 0);
              return (
                <div className="glass-card p-5">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-10 h-10 bg-gradient-teal-blue rounded-xl flex items-center justify-center shadow-glow-teal flex-shrink-0">
                      <Newspaper className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-dark-text">Latest News Coverage</h3>
                      <p className="text-xs text-dark-text-muted">
                        {totalArticles} articles · {orderedCats.length} topics
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {orderedCats.slice(0, visibleNewsCount).map((category) => {
                      const articles = newsDict[category] || [];
                      return (
                        <div key={category} className="glass-card overflow-hidden"
                          style={{ animation: 'newsCardIn 0.4s ease forwards' }}>
                          <div className="px-4 py-3 border-b border-glass-border flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-gradient-teal-blue flex items-center justify-center text-white flex-shrink-0 shadow-glow-teal">
                              {getCategoryIcon(category)}
                            </div>
                            <h4 className="text-sm font-semibold text-dark-text">{category}</h4>
                            <span className="ml-auto text-xs text-dark-text-muted">
                              {articles.length} {articles.length === 1 ? 'article' : 'articles'}
                            </span>
                          </div>
                          <div className="divide-y divide-glass-border/50">
                            {articles.map((article: Record<string, unknown>, idx: number) => (
                              <div key={(article["Link"] as string) || (article["News Title"] as string) || `article-${category}-${idx}`} className="px-4 py-3.5 hover:bg-glass-white transition-colors flex items-start gap-3 group">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-dark-text leading-snug">{article["News Title"] as string}</p>
                                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    {article["Source"] && (
                                      <span className="text-sm font-semibold text-accent-blue">{article["Source"] as string}</span>
                                    )}
                                    {article["Published Date"] && (
                                      <span className="text-sm text-dark-text-muted">· {article["Published Date"] as string}</span>
                                    )}
                                  </div>
                                </div>
                                {article["Link"] && (
                                  <a href={article["Link"] as string} target="_blank" rel="noopener noreferrer"
                                    className="flex-shrink-0 text-xs px-2.5 py-1 rounded-lg bg-accent-blue/10 border border-accent-blue/30 text-accent-blue hover:bg-accent-blue/20 hover:border-accent-blue/50 transition-all">
                                    Read →
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {visibleNewsCount < orderedCats.length && (
                      <div className="flex items-center gap-2 px-2 py-2 text-xs text-dark-text-muted">
                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-accent-blue/30 border-t-accent-blue flex-shrink-0" />
                        Loading more sections…
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}

        {/* ── Feature Highlights + Demo Video ── */}
        <div className="glass-panel p-4 mb-5">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-[700px] flex-shrink-0">
              <div className="rounded-xl overflow-hidden border border-glass-border" style={{ height: "420px" }}>
                <iframe
                  className="w-full h-full"
                  src="https://www.youtube.com/embed/TJoBtHKch4A?rel=0&modestbranding=1"
                  title="SocialFlow Demo"
                  style={{ border: 'none' }}
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-center py-2">
              <div className="flex items-center gap-2 mb-5">
                <TrendingUp className="h-4 w-4 text-accent-blue" />
                <h3 className="text-base font-bold text-dark-text">Feature Highlights</h3>
              </div>
              <div className="space-y-4">
                {[
                  { icon: Building2, title: 'Company Profile', desc: 'Industry, size, headquarters, and specialties at a glance.' },
                  { icon: Shield, title: 'AI Risk Scoring', desc: 'Sentiment analysis with confidence scores and risk assessment.' },
                  { icon: Newspaper, title: 'News & Social Signals', desc: 'Latest articles and social mentions across platforms.' },
                  { icon: Database, title: 'Data Intelligence', desc: 'Enriched company data from multiple verified sources.' },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="flex items-start gap-3 group">
                    <div className="w-7 h-7 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-accent-blue/15 transition-colors">
                      <Icon className="h-3.5 w-3.5 text-accent-blue" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-dark-text">{title}</h3>
                      <p className="text-sm text-dark-text-muted leading-relaxed mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Risk Score Popup ── */}
        {isRiskPopupOpen && creditData && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="relative w-full max-w-4xl">
              <button
                onClick={() => setIsRiskPopupOpen(false)}
                className="absolute -top-3 -right-3 z-10 w-8 h-8 bg-dark-bg-lighter border border-glass-border rounded-full flex items-center justify-center text-dark-text-muted hover:text-dark-text hover:border-accent-teal/40 hover:bg-glass-white transition-all shadow-xl"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="glass-panel w-full max-h-[88vh] overflow-y-auto">
                {(() => {
                  if (riskLoading) return (
                    <div className="p-12 text-center">
                      <div className="relative w-12 h-12 mx-auto mb-4">
                        <div className="absolute inset-0 rounded-full border-2 border-accent-blue/20"></div>
                        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent-blue animate-spin"></div>
                      </div>
                      <p className="text-dark-text font-semibold">Analyzing Risk…</p>
                      <p className="text-dark-text-muted text-sm mt-1">This may take a few moments</p>
                    </div>
                  );

                  if (!riskAnalysis) return (
                    <div className="p-12 text-center text-dark-text-dim">
                      <p className="text-4xl mb-4">⚠️</p>
                      <p className="font-semibold text-dark-text">Risk Analysis Unavailable</p>
                      <p className="text-sm mt-1">Please try again later.</p>
                    </div>
                  );

                  const rc = getRiskColor(riskAnalysis.riskLevel);

                  return (
                    <>
                      <div className="px-8 py-6 border-b border-glass-border bg-gradient-teal-blue/10">
                        <div className="flex items-center justify-between flex-wrap gap-4">
                          <div className="flex items-center gap-4">
                            <div className={`w-14 h-14 rounded-2xl ${rc.bg} border ${rc.border} flex items-center justify-center`}>
                              {getRiskIcon(riskAnalysis.riskLevel)}
                            </div>
                            <div>
                              <h2 className="text-2xl font-bold text-dark-text">Risk Score: <span className={rc.text}>{riskAnalysis.overallRiskScore}</span><span className="text-lg text-dark-text-muted">/100</span></h2>
                              <p className={`text-base font-semibold ${rc.text} mt-0.5`}>{riskAnalysis.riskLevel} Risk</p>
                              <p className="text-sm text-dark-text-muted mt-0.5">Confidence: {riskAnalysis.confidence}%</p>
                            </div>
                          </div>
                          <div className="relative w-16 h-16">
                            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                              <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                              <circle cx="32" cy="32" r="26" fill="none"
                                stroke={getRiskStrokeColor(riskAnalysis.riskLevel)}
                                strokeWidth="6"
                                strokeLinecap="round"
                                strokeDasharray={`${(riskAnalysis.overallRiskScore / 100) * 163.4} 163.4`}
                              />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="text-sm font-bold text-dark-text leading-none">{riskAnalysis.overallRiskScore}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="p-6 space-y-6">
                        <div className="glass-card bg-accent-blue/5 border border-accent-blue/15 p-4 rounded-xl">
                          <h3 className="text-xs font-semibold text-accent-blue uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Shield className="h-3.5 w-3.5" />AI Recommendation
                          </h3>
                          <p className="text-sm text-gray-300 leading-relaxed">{riskAnalysis.recommendation}</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {riskAnalysis.keyRiskFactors.length > 0 && (
                            <div className="glass-card bg-red-400/5 border border-red-400/15 p-4 rounded-xl">
                              <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <AlertCircle className="h-3.5 w-3.5" />Key Risk Factors
                              </h4>
                              <ul className="space-y-2">
                                {riskAnalysis.keyRiskFactors.map((factor) => (
                                  <li key={factor} className="text-sm text-red-300 flex items-start gap-2 leading-relaxed">
                                    <span className="text-red-400 mt-0.5 flex-shrink-0">•</span>{factor}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {riskAnalysis.keyPositiveFactors.length > 0 && (
                            <div className="glass-card bg-emerald-400/5 border border-emerald-400/15 p-4 rounded-xl">
                              <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <TrendingUp className="h-3.5 w-3.5" />Positive Factors
                              </h4>
                              <ul className="space-y-2">
                                {riskAnalysis.keyPositiveFactors.map((factor) => (
                                  <li key={factor} className="text-sm text-emerald-300 flex items-start gap-2 leading-relaxed">
                                    <span className="text-emerald-400 mt-0.5 flex-shrink-0">✓</span>{factor}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {riskAnalysis.sections.length > 0 && (
                          <div>
                            <h3 className="text-base font-bold text-dark-text mb-4 flex items-center gap-2">
                              <div className="w-1.5 h-5 rounded-full bg-accent-blue"></div>
                              Detailed Section Analysis
                            </h3>
                            <div className="space-y-4">
                              {riskAnalysis.sections.map((section) => (
                                <div key={section.section} className="glass-card p-5 rounded-xl">
                                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                    <h4 className="text-base font-bold text-dark-text">{section.section}</h4>
                                    <div className="flex items-center gap-2">
                                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getSentimentClass(section.overallSentiment)}`}>
                                        {section.overallSentiment.toUpperCase()}
                                      </span>
                                      <span className="text-sm text-dark-text-muted font-semibold">{section.overallScore}/100</span>
                                    </div>
                                  </div>
                                  <p className="text-sm text-dark-text-muted leading-relaxed mb-4">{section.summary}</p>
                                  {section.sentiments.length > 0 && (
                                    <div className="space-y-2">
                                      {section.sentiments.map((sentiment) => (
                                        <div key={`${section.section}-${sentiment.field}`} className="bg-glass-white rounded-xl p-4 border border-glass-border/50">
                                          <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-semibold text-dark-text">{sentiment.field}</span>
                                            <div className="flex items-center gap-2">
                                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${getSentimentClass(sentiment.sentiment)}`}>
                                                {sentiment.sentiment}
                                              </span>
                                              <span className="text-xs font-semibold text-dark-text-muted">{sentiment.score}/100</span>
                                            </div>
                                          </div>
                                          <p className="text-sm text-dark-text-muted leading-relaxed">{sentiment.reasoning}</p>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
        </>)}

        {/* ── My Reports ── */}
        {pageTab === 'myReports' && (
          <div className="space-y-4">
            {companiesLoading ? (
              <div className="glass-panel p-16 text-center">
                <div className="relative w-14 h-14 mx-auto mb-5">
                  <div className="absolute inset-0 rounded-full border-2 border-accent-blue/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent-blue animate-spin" />
                </div>
                <p className="text-dark-text font-semibold">Loading your reports…</p>
              </div>
            ) : companiesError ? (
              <div className="glass-panel p-16 text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-500/10 border border-red-400/20 flex items-center justify-center">
                  <AlertCircle className="h-7 w-7 text-red-400/60" />
                </div>
                <p className="text-dark-text font-semibold text-lg">Failed to load reports</p>
                <p className="text-dark-text-muted text-sm mt-1.5">{companiesError}</p>
                <button onClick={fetchSavedCompanies} className="mt-4 px-5 py-2 rounded-xl bg-gradient-teal-blue text-white text-sm font-medium border border-white/10 hover:border-white/25 transition-all">
                  Try again
                </button>
              </div>
            ) : savedCompanies.length === 0 ? (
              <div className="glass-panel p-16 text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <FolderOpen className="h-7 w-7 text-white/30" />
                </div>
                <p className="text-dark-text font-semibold text-lg">No reports yet</p>
                <p className="text-dark-text-muted text-sm mt-1.5">Analyze a company to see it here.</p>
                <button
                  onClick={() => setPageTab('analyze')}
                  className="mt-4 px-5 py-2 rounded-xl bg-gradient-teal-blue text-white text-sm font-medium border border-white/10 hover:border-white/25 transition-all"
                >
                  Run new analysis
                </button>
              </div>
            ) : (
              <div className="glass-panel">
                {/* ── Toolbar ── */}
                <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-gradient-teal-blue rounded-xl flex items-center justify-center shadow-glow-teal">
                      <Building2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-dark-text">Saved company reports</h3>
                      <p className="text-xs text-dark-text-muted">
                        {savedCompanies.length} {savedCompanies.length === 1 ? 'company' : 'companies'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={fetchSavedCompanies}
                    disabled={companiesLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-glass-border bg-glass-white hover:bg-glass-white-hover text-dark-text-muted hover:text-dark-text transition-all disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${companiesLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                {/* ── Card Grid ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {savedCompanies.map((company, _idx) => {
                    const name     = company.name || 'Unknown';
                    const logoUrl  = company.logo_url;
                    const initials = name.split(' ').filter(Boolean).map((w: string) => w[0]?.toUpperCase()).slice(0, 2).join('');
                    const hasScore = company.risk_score != null;
                    const score    = company.risk_score ?? 0;
                    const level    = company.risk_level || '';

                    const CIRC = 2 * Math.PI * 17;
                    const ringStroke: Record<string, string> = {
                      'Low': '#10b981', 'Low-Medium': '#34d399',
                      'Medium': '#f59e0b', 'Medium-High': '#f97316', 'High': '#ef4444',
                    };
                    const accentBar: Record<string, string> = {
                      'Low': 'bg-emerald-500', 'Low-Medium': 'bg-teal-400',
                      'Medium': 'bg-amber-400', 'Medium-High': 'bg-orange-400', 'High': 'bg-red-500',
                    };
                    const badgeCls: Record<string, string> = {
                      'Low':         'bg-emerald-400/15 text-emerald-300 border-emerald-400/20',
                      'Low-Medium':  'bg-teal-400/15    text-teal-300    border-teal-400/20',
                      'Medium':      'bg-amber-400/15   text-amber-300   border-amber-400/20',
                      'Medium-High': 'bg-orange-400/15  text-orange-300  border-orange-400/20',
                      'High':        'bg-red-500/15     text-red-300     border-red-500/20',
                    };
                    const stroke  = ringStroke[level] ?? '#4B5563';
                    const accent  = accentBar[level]  ?? 'bg-white/10';
                    const badge   = badgeCls[level]   ?? 'bg-white/5 text-white/30 border-white/10';

                    return (
                      <motion.div
                        key={company._id || name}
                        className="relative flex flex-col rounded-2xl border border-white/[0.07] overflow-hidden hover:border-white/[0.13] transition-all duration-200"
                        style={{ background: 'rgba(20,21,26,0.92)' }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, delay: _idx * 0.06, ease: 'easeOut' }}
                        whileHover={{ y: -2, boxShadow: `0 8px 30px ${stroke}15` }}
                      >
                        {/* Risk-level accent bar */}
                        <div className={`h-[2px] w-full ${accent}`} />

                        <div className="p-4 flex-1 flex flex-col gap-3">
                          {/* ── Row 1: Logo · Name · Score ring ── */}
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl border border-white/[0.09] bg-white/[0.05] flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {logoUrl
                                ? <img src={logoUrl} alt={name} className="w-full h-full object-contain" />
                                : <span className="text-sm font-bold text-white/70">{initials}</span>}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white/90 truncate">{name}</p>
                              {company.industry && (
                                <p className="text-xs text-white/35 truncate mt-0.5">{company.industry}</p>
                              )}
                            </div>

                            {/* Score ring */}
                            <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                              <div className="relative w-10 h-10">
                                <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                                  <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                                  <circle cx="20" cy="20" r="17" fill="none" stroke={stroke} strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeDasharray={hasScore ? `${(score / 100) * CIRC} ${CIRC}` : `0 ${CIRC}`} />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span className="text-[11px] font-black" style={{ color: stroke }}>{hasScore ? score : '—'}</span>
                                </div>
                              </div>
                              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${badge}`}>
                                {hasScore ? level : 'No score'}
                              </span>
                            </div>
                          </div>

                          {/* ── Row 2: Signal pills + timestamp ── */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {company.news_signals > 0 && (
                              <span className="flex items-center gap-1 text-[10px] text-white/30 bg-white/[0.04] border border-white/[0.06] rounded-full px-2 py-0.5">
                                <Newspaper className="w-2.5 h-2.5" />{company.news_signals} news
                              </span>
                            )}
                            {company.social_signals > 0 && (
                              <span className="flex items-center gap-1 text-[10px] text-white/30 bg-white/[0.04] border border-white/[0.06] rounded-full px-2 py-0.5">
                                <Radio className="w-2.5 h-2.5" />{company.social_signals} social
                              </span>
                            )}
                            {(company.linkedin_url || company.website) && (
                              <a
                                href={company.linkedin_url || (company.website.startsWith('http') ? company.website : `https://${company.website}`)}
                                target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-[10px] text-white/25 hover:text-accent-blue transition-colors"
                              >
                                {company.linkedin_url ? <Linkedin className="w-2.5 h-2.5" /> : <Globe className="w-2.5 h-2.5" />}
                              </a>
                            )}
                            {company.last_updated && (
                              <span className="flex items-center gap-1 text-[10px] text-white/20 ml-auto">
                                <Clock className="w-2.5 h-2.5" />{getRelativeTime(company.last_updated)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* ── Actions ── */}
                        <div className="px-3 pb-3 flex items-center gap-2">
                          <button
                            onClick={() => openSavedReport(name)}
                            className="flex-1 h-8 flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold bg-gradient-teal-blue text-white hover:opacity-90 transition-all"
                          >
                            <Search className="w-3.5 h-3.5" />View Report
                          </button>
                          <button
                            onClick={() => globalThis.dispatchEvent(new CustomEvent('navigateTo', { detail: { page: 'video-studio' } }))}
                            className="flex-1 h-8 flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold bg-white/[0.07] border border-white/[0.09] text-white/60 hover:bg-accent-teal/15 hover:text-accent-teal hover:border-accent-teal/25 transition-all"
                          >
                            <Video className="w-3.5 h-3.5" />Video Studio
                          </button>
                          <button
                            onClick={() => { setSearchQuery(company.linkedin_url || name); setPageTab('analyze'); setTimeout(() => { document.querySelector<HTMLButtonElement>('.btn-gradient-teal')?.click(); }, 100); }}
                            title="Re-analyze"
                            className="w-8 h-8 flex items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.04] text-white/30 hover:text-accent-blue hover:bg-accent-blue/10 hover:border-accent-blue/25 transition-all"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Saved Report Modal ── */}
      {reportViewOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl overflow-hidden border border-white/[0.08]"
            style={{ background: 'rgba(22,23,28,0.97)' }}>
            {/* Sticky header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] flex-shrink-0">
              <span className="text-xs font-semibold text-white/30 uppercase tracking-widest">Company Report</span>
              <button onClick={() => setReportViewOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition-colors">
                <X className="w-4 h-4 text-white/50" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 min-h-0">
              {reportViewLoading && (
                <div className="flex items-center justify-center py-20">
                  <div className="animate-spin w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full" />
                </div>
              )}

              {reportViewError && (
                <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                  <AlertCircle className="w-10 h-10 text-red-400/60 mb-3" />
                  <p className="text-white/50 text-sm">{reportViewError}</p>
                </div>
              )}

              {!reportViewLoading && !reportViewError && reportViewData && (() => {
                const c = reportViewData.company || {};
                const newsData: Record<string, { 'News Title'?: string; Source?: string; 'Published Date'?: string; Link?: string }[]> = reportViewData.news || {};
                const socialPosts: { platform?: string; content?: string; author?: string; url?: string }[] = reportViewData.social || [];
                const dataSources: { type?: string; name?: string; endpoint?: string }[] = reportViewData.dataSources || [];
                const riskScore: number | null = reportViewData.risk_score ?? null;
                const riskLevel: string = reportViewData.risk_level || '';
                const riskConf: number | null = reportViewData.risk_confidence ?? null;
                const savedAnalysis: RiskAnalysis | null = reportViewData.risk_analysis ?? null;

                const RISK_STROKE: Record<string, string> = {
                  'Low': '#10b981', 'Low-Medium': '#34d399', 'Medium': '#f59e0b',
                  'Medium-High': '#f97316', 'High': '#ef4444',
                };
                const RISK_BADGE: Record<string, string> = {
                  'Low': 'bg-emerald-400/15 text-emerald-300 border-emerald-400/20',
                  'Low-Medium': 'bg-teal-400/15 text-teal-300 border-teal-400/20',
                  'Medium': 'bg-amber-400/15 text-amber-300 border-amber-400/20',
                  'Medium-High': 'bg-orange-400/15 text-orange-300 border-orange-400/20',
                  'High': 'bg-red-500/15 text-red-300 border-red-500/20',
                };
                const rStroke = RISK_STROKE[riskLevel] ?? '#4B5563';
                const rBadge  = RISK_BADGE[riskLevel]  ?? 'bg-white/5 text-white/30 border-white/10';
                const RCIRC = 2 * Math.PI * 22;

                const PLATFORM_ICON: Record<string, string> = {
                  LinkedIn: '#0A66C2', Twitter: '#1DA1F2', Instagram: '#E1306C',
                  Facebook: '#1877F2', YouTube: '#FF0000',
                };

                return (
                  <div className="p-6 space-y-6">
                    {/* ── Hero header ── */}
                    <div className="flex items-start gap-4 pb-5 border-b border-white/[0.06]">
                      <div className="w-16 h-16 rounded-2xl border border-white/[0.09] bg-white/[0.04] flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {c.logo_url
                          ? <img src={c.logo_url} alt={c.company_name} className="w-full h-full object-contain p-1" />
                          : <Building2 className="w-8 h-8 text-white/20" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xl font-bold text-white leading-tight">{c.company_name || c.queried_name || 'Company Report'}</h4>
                        {c.headline && <p className="text-sm text-white/40 mt-1 line-clamp-2">{c.headline}</p>}
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          {c.followers_count && (
                            <span className="flex items-center gap-1 text-xs text-white/30">
                              <Users className="w-3 h-3" />{Number(c.followers_count).toLocaleString()} followers
                            </span>
                          )}
                          {c.website && (
                            <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-accent-blue hover:text-accent-teal transition-colors">
                              <Globe className="w-3 h-3" />{c.website.replace(/^https?:\/\//, '')}
                            </a>
                          )}
                          {c.linkedin_url && (
                            <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-white/30 hover:text-[#0A66C2] transition-colors">
                              <Linkedin className="w-3 h-3" />LinkedIn
                            </a>
                          )}
                        </div>
                      </div>
                      {riskScore != null && (
                        <div className="flex flex-col items-center gap-1.5 flex-shrink-0 p-3 rounded-2xl border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <div className="relative w-14 h-14">
                            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 52 52">
                              <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                              <circle cx="26" cy="26" r="22" fill="none" stroke={rStroke} strokeWidth="4"
                                strokeLinecap="round" strokeDasharray={`${(riskScore / 100) * RCIRC} ${RCIRC}`} />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                              <span className="text-sm font-black" style={{ color: rStroke }}>{riskScore}</span>
                              <span className="text-[8px] text-white/20">risk</span>
                            </div>
                          </div>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${rBadge}`}>{riskLevel || 'N/A'}</span>
                          {riskConf != null && <span className="text-[9px] text-white/20">{riskConf}% conf.</span>}
                        </div>
                      )}
                    </div>

                    {/* ── About ── */}
                    {(c.about || c.description) && (
                      <div className="rounded-2xl border border-white/[0.06] p-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
                        <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-2">About</p>
                        <p className="text-sm text-white/60 leading-relaxed">{c.about || c.description}</p>
                      </div>
                    )}

                    {/* ── Facts ── */}
                    {(c.industry || c.company_size || c.size || c.headquarters || c.type || c.founded) && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[
                          { icon: Briefcase,  label: 'Industry',  value: c.industry },
                          { icon: Users,      label: 'Size',      value: c.company_size || c.size },
                          { icon: MapPin,     label: 'HQ',        value: c.headquarters },
                          { icon: Building2,  label: 'Type',      value: c.type },
                          { icon: Calendar,   label: 'Founded',   value: c.founded },
                        ].filter(f => f.value).map(({ icon: Icon, label, value }) => (
                          <div key={label} className="rounded-xl border border-white/[0.06] p-3 flex items-start gap-2.5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                            <Icon className="w-3.5 h-3.5 text-white/20 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{label}</p>
                              <p className="text-xs text-white/65 mt-0.5 truncate">{value}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── Specialties ── */}
                    {c.specialties && c.specialties.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-2.5">Specialties</p>
                        <div className="flex flex-wrap gap-1.5">
                          {c.specialties.map((s: string) => (
                            <span key={s} className="px-2.5 py-1 rounded-full border border-white/[0.07] bg-white/[0.03] text-white/40 text-xs">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Key People ── */}
                    {c.employees_preview && c.employees_preview.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-2.5">Key People</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {c.employees_preview.slice(0, 6).map((emp: { name?: string; title?: string; profile_image?: string } | string, idx: number) => (
                            <div key={typeof emp === 'string' ? emp : (emp.name ?? idx)} className="flex items-center gap-3 p-3 rounded-xl border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.02)' }}>
                              {typeof emp === 'string' ? (
                                <>
                                  <div className="w-8 h-8 rounded-full bg-gradient-teal-blue flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-bold text-white">{emp[0]?.toUpperCase()}</span>
                                  </div>
                                  <p className="text-sm text-white/70">{emp}</p>
                                </>
                              ) : (
                                <>
                                  {emp.profile_image
                                    ? <img src={emp.profile_image} alt={emp.name} className="w-8 h-8 rounded-full border border-white/10 flex-shrink-0" />
                                    : (
                                      <div className="w-8 h-8 rounded-full bg-gradient-teal-blue flex items-center justify-center flex-shrink-0">
                                        <span className="text-xs font-bold text-white">{emp.name?.[0]?.toUpperCase() ?? '?'}</span>
                                      </div>
                                    )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-white/75 truncate">{emp.name}</p>
                                    <p className="text-xs text-white/30 truncate">{emp.title}</p>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Recent Updates ── */}
                    {c.recent_updates && c.recent_updates.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-2.5">Recent Updates</p>
                        <div className="space-y-2">
                          {c.recent_updates.slice(0, 4).map((u: { text: string }, i: number) => (
                            <div key={i} className="flex gap-3 p-3 rounded-xl border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.02)' }}>
                              <div className="w-1 rounded-full bg-accent-blue/40 flex-shrink-0 self-stretch" />
                              <p className="text-sm text-white/55 leading-relaxed">{u.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── News ── */}
                    {Object.keys(newsData).length > 0 && (() => {
                      const NEWS_COLORS: Record<string, string> = {
                        'Product Launches': '#3b82f6',
                        'Signals': '#10b981',
                        'News': '#8b5cf6',
                        'Competitor Activity': '#f59e0b',
                        'Rapid Hiring': '#06b6d4',
                        'Layoffs / Regulations': '#ef4444',
                        'Event Attendance': '#f97316',
                        'Mergers & Acquisitions': '#a855f7',
                        'Funding Rounds': '#22c55e',
                        'IPO': '#eab308',
                        'Leadership Changes': '#ec4899',
                        'Announcements': '#3b82f6',
                        'Other News': '#6b7280',
                      };
                      // Dynamically use all keys that have articles
                      const populated = Object.keys(newsData).filter(key => (newsData[key] || []).length > 0);
                      if (!populated.length) return null;
                      return (
                        <div className="space-y-4">
                          <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest">Intelligence</p>
                          {populated.map((key) => {
                            const label = key;
                            const items = newsData[key]!;
                            const accent = NEWS_COLORS[key] ?? '#6366f1';
                            return (
                              <div key={key}>
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accent }} />
                                  <p className="text-xs font-semibold text-white/40">{key}</p>
                                  <span className="text-[10px] text-white/20">({items.length})</span>
                                </div>
                                <div className="space-y-2 pl-4">
                                  {items.map(item => (
                                    <div key={item['News Title'] ?? item.Link}
                                      className="p-3 rounded-xl border border-white/[0.05] hover:border-white/[0.10] transition-colors"
                                      style={{ background: 'rgba(255,255,255,0.015)', borderLeft: `2px solid ${accent}30` }}>
                                      <p className="text-sm font-semibold text-white/75 leading-snug mb-1">{item['News Title']}</p>
                                      <p className="text-[11px] text-white/25">
                                        {item.Source}{item['Published Date'] ? ` · ${new Date(item['Published Date']).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                                      </p>
                                      {item.Link && (
                                        <a href={item.Link} target="_blank" rel="noopener noreferrer"
                                          className="text-[11px] font-medium mt-1.5 inline-flex items-center gap-1 transition-colors"
                                          style={{ color: accent }}>
                                          Read more <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* ── Social Signals ── */}
                    {socialPosts.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-2.5">
                          Social Signals <span className="text-white/15 font-normal">· {socialPosts.length} posts</span>
                        </p>
                        <div className="space-y-2">
                          {socialPosts.slice(0, 5).map((post, i) => {
                            const platformColor = PLATFORM_ICON[post.platform ?? ''] ?? '#6B7280';
                            return (
                              <div key={i} className="p-3 rounded-xl border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border" style={{ color: platformColor, borderColor: `${platformColor}30`, background: `${platformColor}10` }}>
                                    {post.platform}
                                  </span>
                                  {post.author && <span className="text-[10px] text-white/25 truncate">@{post.author}</span>}
                                </div>
                                {post.content && <p className="text-sm text-white/55 leading-relaxed line-clamp-3">{post.content}</p>}
                                {post.url && (
                                  <a href={post.url} target="_blank" rel="noopener noreferrer"
                                    className="text-[11px] font-medium mt-1.5 inline-flex items-center gap-1 text-accent-blue hover:text-accent-teal transition-colors">
                                    View post <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── AI Risk Analysis ── */}
                    {savedAnalysis && (
                      <div className="rounded-2xl border border-white/[0.07] overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05]">
                          <Shield className="w-4 h-4 text-accent-blue flex-shrink-0" />
                          <p className="text-xs font-bold text-white/50 uppercase tracking-widest">AI Risk Analysis</p>
                          {savedAnalysis.confidence != null && (
                            <span className="ml-auto text-[10px] text-white/20">{savedAnalysis.confidence}% confidence</span>
                          )}
                        </div>
                        <div className="p-4 space-y-4">
                          {savedAnalysis.recommendation && (
                            <div className="p-3 rounded-xl border border-accent-blue/15 bg-accent-blue/5">
                              <p className="text-[10px] font-bold text-accent-blue/60 uppercase tracking-wider mb-1.5">Recommendation</p>
                              <p className="text-sm text-white/65 leading-relaxed">{savedAnalysis.recommendation}</p>
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {savedAnalysis.keyPositiveFactors && savedAnalysis.keyPositiveFactors.length > 0 && (
                              <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3">
                                <p className="text-[10px] font-bold text-emerald-400/60 uppercase tracking-wider mb-2">Positive Factors</p>
                                <ul className="space-y-1">
                                  {savedAnalysis.keyPositiveFactors.map((f, i) => (
                                    <li key={i} className="flex items-start gap-1.5 text-xs text-white/55">
                                      <span className="text-emerald-400/60 mt-0.5 flex-shrink-0">✓</span>{f}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {savedAnalysis.keyRiskFactors && savedAnalysis.keyRiskFactors.length > 0 && (
                              <div className="rounded-xl border border-red-500/15 bg-red-500/5 p-3">
                                <p className="text-[10px] font-bold text-red-400/60 uppercase tracking-wider mb-2">Risk Factors</p>
                                <ul className="space-y-1">
                                  {savedAnalysis.keyRiskFactors.map((f, i) => (
                                    <li key={i} className="flex items-start gap-1.5 text-xs text-white/55">
                                      <span className="text-red-400/60 mt-0.5 flex-shrink-0">!</span>{f}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                          {savedAnalysis.sections && savedAnalysis.sections.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-white/20 uppercase tracking-wider">Section Breakdown</p>
                              {savedAnalysis.sections.map((section, i) => {
                                const sentimentColor = section.overallSentiment === 'positive' ? '#10b981' : section.overallSentiment === 'negative' ? '#ef4444' : '#f59e0b';
                                return (
                                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl border border-white/[0.05]" style={{ background: 'rgba(255,255,255,0.015)' }}>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold text-white/55 truncate">{section.section}</p>
                                      {section.summary && <p className="text-[11px] text-white/30 mt-0.5 line-clamp-1">{section.summary}</p>}
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <span className="text-xs font-bold" style={{ color: sentimentColor }}>{section.overallScore}</span>
                                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: sentimentColor }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Data Sources ── */}
                    {dataSources.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-2.5">Data Sources</p>
                        <div className="flex flex-wrap gap-2">
                          {dataSources.map((src, i) => (
                            <a key={i} href={src.endpoint} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all group">
                              <Database className="w-3 h-3 text-white/20 group-hover:text-accent-blue transition-colors" />
                              <span className="text-xs text-white/40 group-hover:text-white/70 transition-colors">{src.name}</span>
                              {src.type && <span className="text-[9px] text-white/15">· {src.type}</span>}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Video Modal ── */}
      {showVideoModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Close video modal" className="absolute inset-0" onClick={handleCloseVideo} />
          <div className="relative w-full max-w-5xl aspect-video bg-dark-bg-lighter rounded-2xl overflow-hidden shadow-2xl border border-glass-border">
            <button
              onClick={handleCloseVideo}
              className="absolute top-3 right-3 z-10 w-9 h-9 bg-dark-bg/80 hover:bg-dark-bg rounded-full flex items-center justify-center text-dark-text-muted hover:text-dark-text transition-all hover:scale-105 border border-glass-border"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <iframe
              className="w-full h-full"
              src="https://www.youtube.com/embed/vlsBP50Qc6k?autoplay=0&rel=0"
              title="Guide Me – Company Analysis"
              style={{ border: 'none' }}
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditRating;