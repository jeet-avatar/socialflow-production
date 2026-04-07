import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../config/api';
import { getAuthToken } from '../utils/getAuthToken';
import * as leadsSearchService from '../services/leadsSearchService';
import { notify } from '../services/notificationService';
import {
  Search,
  User,
  RefreshCw,
  HighlighterIcon,
  Eye,
  Building,
  MapPin,
  XCircle,
  ChevronDown,
  ChevronUp,
  X,
  ShoppingCart,
  Trash2,
  Save,
  BookOpen,
  Layers,
  Cpu,
  Briefcase,
  Calendar,
  SquarePenIcon,
  LucideSquarePen,
  Layers3,
  Layers2Icon,
  Plus,
  Users,
  SlidersHorizontal,
  BarChart2,
  Clock,
  Target,
  FactoryIcon,
  ExternalLink,
  TrendingUp,
  FileText,
  Linkedin,
  ArrowUpRight,
  Megaphone,
} from 'lucide-react';

interface LeadData {
  id: string;
  LeadName: string;
  jobTitle: string;
  LinkedinLink: string;
  BioSnippet?: string;
  profilepicImage?: string;
  company: string;
  location?: string;
  industry?: string;
  leadScore?: number;
  website?: string;
  headquarters?: string;
}

interface LeadCategory {
  title: string;
  count: number;
  leads: LeadData[];
  color: string;
}

interface LeadGroup {
  name: string;
  leadIds: string[];
}

const INDUSTRY_TYPES = [
  { category: 'Technology & IT', options: ['Information Technology & Services','Software Development','Internet / Web Services','Artificial Intelligence / Machine Learning','Cybersecurity','Cloud Computing']},
  { category: 'Finance & Professional Services', options: ['Financial Services','Banking','Investment Management','Accounting','Legal Services','Consulting']},
  { category: 'Industrial & Manufacturing', options: ['Manufacturing','Automotive','Aerospace & Defense','Energy / Oil & Gas','Chemicals','Construction']},
  { category: 'Consumer & Retail', options: ['Retail','Consumer Goods','E-Commerce','Food & Beverages','Fashion & Apparel','Luxury Goods']},
  { category: 'Healthcare & Life Sciences', options: ['Healthcare','Pharmaceuticals','Biotechnology','Medical Devices','Wellness & Fitness']},
  { category: 'Media & Communications', options: ['Marketing & Advertising','Media Production','Telecommunications','Publishing','Entertainment / Gaming']},
  { category: 'Education & Nonprofit', options: ['Education Management','E-Learning','Research','Nonprofit Organization Management','Government Administration']}
];

const TECH_STACK_OPTIONS = [
  'Netsuite','Workday','Salesforce','SAP','Oracle','React','Angular','Vue.js','Node.js','Python','Java','C#','.NET',
  'PHP','Ruby','Go','Rust','JavaScript','TypeScript','HTML/CSS','MongoDB','PostgreSQL','MySQL','Redis','AWS','Azure',
  'Google Cloud','Docker','Kubernetes','Jenkins','Git','GraphQL','REST APIs','Machine Learning','AI/ML','Data Science',
  'Blockchain','IoT','Mobile Development','iOS','Android','React Native','Flutter','DevOps','CI/CD','Microservices',
  'Serverless','Elasticsearch'
];

/** Only allow http/https URLs — blocks javascript: and other schemes */
const safeHref = (url?: string): string | undefined => {
  if (!url) return undefined;
  try {
    const { protocol } = new URL(url.startsWith('http') ? url : `https://${url}`);
    return protocol === 'http:' || protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
};

// Thresholds mirror the backend: Hot ≥65, Warm ≥35, Cold <35
const getScoreColor = (score: number) => {
  if (score >= 65) return 'text-accent-teal';
  if (score >= 35) return 'text-accent-orange';
  return 'text-dark-text-muted';
};

// Score ring SVG component
const ScoreRing = ({ score }: { score: number }) => {
  const ringColor = score >= 65 ? '#14b8a6' : score >= 35 ? '#f59e0b' : '#64748b';
  const badge = score >= 65
    ? { label: 'HOT',  cls: 'text-teal-400 border-teal-400/40 bg-teal-400/10' }
    : score >= 35
    ? { label: 'WARM', cls: 'text-amber-400 border-amber-400/40 bg-amber-400/10' }
    : { label: 'COLD', cls: 'text-slate-400 border-slate-500/40 bg-slate-500/10' };
  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
          <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3"/>
          <circle
            cx="18" cy="18" r="14"
            fill="none"
            stroke={ringColor}
            strokeWidth="3"
            strokeDasharray={`${(score || 0) * 0.879} 87.9`}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${ringColor}80)`, transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-black text-white leading-none">{score || 0}</span>
        </div>
      </div>
      <span className={`text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded border uppercase ${badge.cls}`}>{badge.label}</span>
    </div>
  );
};

// Priority config helper

const Leads = ({
  setActivePage,
  setAnalysisQuery,
  initialSavedLeads,
  onLeadsUpdate,
}: {
  setActivePage?: (page: string) => void;
  setAnalysisQuery?: (query: string) => void;
  initialSavedLeads?: any[];
  onLeadsUpdate?: (leads: any[]) => void;
}) => {

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const copy = new Set(prev);
      if (copy.has(id)) {
        copy.delete(id);
        setCartIds(prevCart => { const c = new Set(prevCart); c.delete(id); return c; });
      } else {
        copy.add(id);
        setCartIds(prevCart => { const c = new Set(prevCart); c.add(id); return c; });
      }
      return copy;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());
  const clearCart = () => setCartIds(new Set());
  const removeFromCart = (id: string) => {
    setCartIds(prev => { const c = new Set(prev); c.delete(id); return c; });
    setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  const openGroupModal = () => { setGroupModalOpen(true); setGroupNameInput(""); setSelectedExistingGroup(""); };

  const addSelectionToGroup = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    let targetName = selectedExistingGroup.trim();
    if (!targetName) targetName = groupNameInput.trim();
    if (!targetName) return;
    setGroups(prev => {
      const idx = prev.findIndex(g => g.name.toLowerCase() === targetName.toLowerCase());
      if (idx >= 0) {
        const existing = new Set(prev[idx].leadIds);
        ids.forEach(i => existing.add(i));
        const updated = [...prev];
        updated[idx] = { ...prev[idx], leadIds: Array.from(existing) };
        return updated;
      } else {
        return [...prev, { name: targetName, leadIds: ids }];
      }
    });
    setGroupModalOpen(false);
    clearSelection();
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [leadsData, setLeadsData] = useState<LeadCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [totalLeads, setTotalLeads] = useState(0);
  const [searchMode, setSearchMode] = useState<'individual' | 'company'>('company');
  const [location, setLocation] = useState('');
  const [industryType, setIndustryType] = useState('');
  const [techStack, setTechStack] = useState<string[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportData, setReportData] = useState<any | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<LeadGroup[]>([]);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState("");
  const [selectedExistingGroup, setSelectedExistingGroup] = useState<string>("");
  const [cartIds, setCartIds] = useState<Set<string>>(new Set());
  const [cartVisible, setCartVisible] = useState(false);
  const [savingCart, setSavingCart] = useState(false);
  const [currentSearchQuery, setCurrentSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'search' | 'myLeads'>('search');
  const [myLeads, setMyLeads] = useState<any[]>([]);
  const [loadingMyLeads, setLoadingMyLeads] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  // Sync from Dashboard when it finishes fetching
  useEffect(() => {
    if (initialSavedLeads && initialSavedLeads.length > 0) {
      setMyLeads(initialSavedLeads);
    }
  }, [initialSavedLeads]);
  const sortedLeads = [...myLeads].sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0));
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);

  const handleDeleteLead = async (leadId: string) => {
    if (!confirm('Delete this lead? This cannot be undone.')) return;
    setDeletingLeadId(leadId);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/leads/${leadId}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) setMyLeads(prev => prev.filter((l: any) => l._id !== leadId));
    } catch { /* ignore */ }
    setDeletingLeadId(null);
  };

  const [showVideoModal, setShowVideoModal] = useState(false);
  const handleOpenVideo = () => setShowVideoModal(true);
  const handleCloseVideo = () => setShowVideoModal(false);

  const openDetailedReport = async (linkedinLink: string) => {
    setReportOpen(true); setReportLoading(true); setReportError(null); setReportData(null);
    try {
      const url = `${API_BASE_URL}/api/company-report?link=${encodeURIComponent(linkedinLink)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch report (${res.status})`);
      setReportData(await res.json());
    } catch (e: any) {
      setReportError(e.message || 'Failed to load report');
    } finally {
      setReportLoading(false);
    }
  };

  const addToCart = (leadId: string) => {
    setCartIds(prev => new Set([...prev, leadId]));
    setSelectedIds(prev => new Set([...prev, leadId]));
  };

  const getLeadsInCart = () => {
    const cartLeads: LeadData[] = [];
    leadsData.forEach(category => { category.leads.forEach(lead => { if (cartIds.has(lead.id)) cartLeads.push(lead); }); });
    return cartLeads;
  };

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    try {
      const token = await getAuthToken();
      if (token) return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    } catch { /* fall through */ }
    return { 'Content-Type': 'application/json' };
  }, []);

  const fetchMyLeads = useCallback(async () => {
    setLoadingMyLeads(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/leads/`, { method: 'GET', headers });
      if (response.status === 401) {
        notify('Session Expired', 'Your session has expired. Please refresh and log in again.', 'error');
        return;
      }
      if (!response.ok) throw new Error(`Failed to fetch leads: ${response.status}`);
      const result = await response.json();
      const leads = result.leads || (Array.isArray(result) ? result : result.data || []);
      setMyLeads(leads);
      onLeadsUpdate?.(leads);
    } catch (error: any) {
      notify('Failed to Load Leads', error.message ?? 'Could not load saved leads.', 'error');
    } finally {
      setLoadingMyLeads(false);
    }
  }, [getAuthHeaders, onLeadsUpdate]);

  const migrateExistingLeads = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/leads/`, { method: 'GET', headers });
      if (!response.ok) throw new Error(`Failed to fetch leads: ${response.status}`);
      const result = await response.json();
      const leads = result.leads || (Array.isArray(result) ? result : result.data || []);
      const leadsToMigrate = leads.filter(lead => !lead.custom_fields?.lead_type);
      if (leadsToMigrate.length === 0) { notify('Already Categorized', 'All leads are already categorized!', 'info'); return; }
      let successCount = 0;
      for (const lead of leadsToMigrate) {
        try {
          const updatedLead = { ...lead, custom_fields: { ...lead.custom_fields, lead_type: 'company' } };
          const updateResponse = await fetch(`${API_BASE_URL}/leads/${lead._id}`, { method: 'PUT', headers, body: JSON.stringify(updatedLead) });
          if (updateResponse.ok) successCount++;
        } catch (error) { console.error(`Error migrating lead ${lead.name}:`, error); }
      }
      notify('Migration Complete', `Updated ${successCount} leads to 'Company' type.`, 'success');
      await fetchMyLeads();
    } catch (error: any) { notify('Migration Failed', error.message ?? 'Could not migrate leads.', 'error'); }
  };

  const fetchDetailedReportData = async (linkedinLink: string) => {
    try {
      const url = `${API_BASE_URL}/api/company-report?link=${encodeURIComponent(linkedinLink)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch report (${res.status})`);
      return await res.json();
    } catch { return null; }
  };

  const saveCartToDatabase = async () => {
    if (cartIds.size === 0) { notify('Empty Cart', 'No leads selected to save.', 'warning'); return; }
    setSavingCart(true);
    try {
      try { await fetch(`${API_BASE_URL}/leads/`, { method: 'GET' }); }
      catch { throw new Error(`Cannot connect to backend server. Make sure it's running on ${API_BASE_URL}`); }

      const headers = await getAuthHeaders();
      const cartLeads = getLeadsInCart();
      const leadsWithReports = await Promise.all(cartLeads.map(async (lead) => {
        const detailedReport = await fetchDetailedReportData(lead.LinkedinLink);
        return {
          name: lead.LeadName,
          email: lead.email || `${lead.LeadName.replace(/\s+/g, '.').toLowerCase()}@${lead.company.replace(/\s+/g, '').toLowerCase()}.com`,
          job_title: lead.jobTitle, company: lead.company, linkedin_url: lead.LinkedinLink,
          location: lead.location || '', industry: lead.industry || '', lead_score: lead.leadScore || 0,
          status: 'new', source: 'search_scraper', notes: lead.BioSnippet || '',
          FactoryIcons: ['scraped', 'cart_saved', 'with_detailed_report'],
          custom_fields: {
            lead_type: searchMode,
            search_context: { query: currentSearchQuery, mode: searchMode, location, industry: industryType, tech_stack: techStack, saved_at: new Date().toISOString(), original_search_id: lead.id },
            lead_card_data: { lead_name: lead.LeadName, job_title: lead.jobTitle, company: lead.company, linkedin_link: lead.LinkedinLink, bio_snippet: lead.BioSnippet, profile_image: lead.profilepicImage, location: lead.location, industry: lead.industry, lead_score: lead.leadScore, website: lead.website, headquarters: lead.headquarters },
            detailed_report: detailedReport ? { report_data: detailedReport, fetched_at: new Date().toISOString(), report_available: true } : { report_data: null, fetched_at: new Date().toISOString(), report_available: false, error: 'Could not fetch detailed report' }
          }
        };
      }));

      let result;
      try {
        const response = await fetch(`${API_BASE_URL}/leads/bulk`, { method: 'POST', headers, body: JSON.stringify({ leads: leadsWithReports }) });
        if (response.status === 401) { setError('Authentication required. Please login again.'); return; }
        if (response.ok) result = await response.json();
        else throw new Error(`Bulk endpoint failed: ${response.status}`);
      } catch {
        const savedLeads = [];
        for (const lead of leadsWithReports) {
          try {
            const individualResponse = await fetch(`${API_BASE_URL}/leads/`, { method: 'POST', headers, body: JSON.stringify(lead) });
            if (individualResponse.status === 401) { notify('Session Expired', 'Your session has expired. Please refresh and log in again.', 'error'); return; }
            if (individualResponse.ok) savedLeads.push(await individualResponse.json());
          } catch (individualError) { console.error(`Error saving ${lead.name}:`, individualError); }
        }
        result = { saved_leads: savedLeads, total: savedLeads.length };
      }

      clearCart(); setCartVisible(false); setError(null);
      await fetchMyLeads();
      notify('Leads Saved', `${leadsWithReports.length} leads saved to your database. Check the "My Leads" tab.`, 'success');
    } catch (error: any) {
      notify('Save Failed', `Failed to save leads: ${error.message}`, 'error');
    } finally { setSavingCart(false); }
  };

  // Sync UI state from the background search service
  const syncFromService = useCallback(() => {
    const state = leadsSearchService.getState();
    if (!state) return;
    setCurrentSearchQuery(state.params.query);
    setSearchQuery(state.params.query);
    setSearchMode(state.params.mode);
    setLocation(state.params.location);
    setIndustryType(state.params.industry);
    if (state.status === 'running') {
      setLoading(true);
      setError(null);
    } else if (state.status === 'done' && state.results) {
      setLoading(false);
      setLeadsData(state.results.categories as LeadCategory[]);
      setTotalLeads(state.results.total);
    } else if (state.status === 'error') {
      setLoading(false);
      // Errors are already dispatched as bell notifications; clear inline state
      setError(null);
    }
  }, []);

  // On mount: restore any in-progress or completed search from the service
  useEffect(() => {
    syncFromService();
    const unsub = leadsSearchService.subscribe(syncFromService);
    return unsub;
  }, [syncFromService]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    leadsSearchService.startSearch(
      {
        query: searchQuery,
        mode: searchMode,
        location,
        industry: industryType,
        techStack: techStack.join(','),
      },
      getAuthToken,
    );
    // UI updates come via the service subscription above
    notify(
      'Lead Scan Started',
      `Scanning for "${searchQuery}" — we'll notify you when results are ready.`,
      'info',
    );
  }, [searchQuery, searchMode, location, industryType, techStack]);

  const handleRefresh = useCallback(async () => {
    if (!currentSearchQuery.trim()) return;
    leadsSearchService.startSearch(
      {
        query: currentSearchQuery,
        mode: searchMode,
        location,
        industry: industryType,
        techStack: techStack.join(','),
      },
      getAuthToken,
    );
    notify('Refreshing Leads', 'Re-scanning for the latest results…', 'info');
  }, [currentSearchQuery, searchMode, location, industryType, techStack]);

  const renderLeadCard = (lead: LeadData, index: number = 0) => {
    const score = lead.leadScore || 0;
    const borderColor = score >= 65 ? 'border-teal-500/40 shadow-[0_0_16px_rgba(20,184,166,0.12)]' : score >= 35 ? 'border-amber-500/40 shadow-[0_0_16px_rgba(245,158,11,0.12)]' : 'border-slate-600/30 shadow-[0_0_8px_rgba(148,163,184,0.06)]';

    if (searchMode === 'individual') {
      return (
        <motion.div
          key={lead.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          className={`relative rounded-xl border bg-[#0a0f1a]/80 backdrop-blur-sm p-4 flex items-center gap-4 hover:bg-[#0d1421]/90 transition-all duration-300 ${borderColor}`}
        >
          <ScoreRing score={score} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="text-base font-bold text-white truncate" title={lead.LeadName || 'N/A'}>{lead.LeadName || 'N/A'}</h3>
            </div>
            <p className="text-xs text-slate-400 truncate mb-2">{lead.jobTitle || 'N/A'} · <span className="text-slate-500">{lead.company || 'N/A'}</span></p>
            {lead.location && (
              <div className="flex items-center gap-1 text-xs text-slate-500 mb-3">
                <MapPin className="w-3 h-3" /><span>{lead.location}</span>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              {lead.LinkedinLink && (
                <a href={safeHref(lead.LinkedinLink)} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#0A66C2]/40 bg-[#0A66C2]/10 hover:bg-[#0A66C2]/20 transition-colors text-xs font-medium text-[#4d9de0]">
                  <Linkedin className="w-3.5 h-3.5" /><ArrowUpRight className="w-3 h-3 opacity-70" />
                </a>
              )}
              <button
                onClick={() => cartIds.has(lead.id) ? removeFromCart(lead.id) : addToCart(lead.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-all ${cartIds.has(lead.id) ? 'bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25' : 'bg-teal-500/10 text-teal-400 border-teal-500/30 hover:bg-teal-500/20'}`}
              >
                {cartIds.has(lead.id) ? <><Trash2 className="w-3 h-3" /><span>Remove</span></> : <><ShoppingCart className="w-3 h-3" /><span>Select</span></>}
              </button>
            </div>
          </div>
        </motion.div>
      );
    }

    // Company mode card
    return (
      <motion.div
        key={lead.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        className={`relative rounded-xl border bg-[#0a0f1a]/80 backdrop-blur-sm hover:bg-[#0d1421]/90 transition-all duration-300 overflow-hidden ${borderColor}`}
      >
        {/* Top accent line */}
        <div className={`h-px w-full ${score >= 65 ? 'bg-gradient-to-r from-transparent via-teal-500/60 to-transparent' : score >= 35 ? 'bg-gradient-to-r from-transparent via-amber-500/60 to-transparent' : 'bg-gradient-to-r from-transparent via-slate-600/40 to-transparent'}`} />
        <div className="p-5 flex items-start gap-5">
          {/* Left: Score Ring */}
          <ScoreRing score={score} />

          {/* Right: Lead Details */}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-black text-white truncate mb-0.5" title={lead.LeadName}>{lead.LeadName}</h3>
            <p className="text-xs text-slate-400 mb-2">
              {lead.jobTitle && <span className="text-slate-300">{lead.jobTitle}</span>}
              {lead.jobTitle && lead.company && <span className="text-slate-600"> · </span>}
              {lead.company && <span className="text-slate-500">{lead.company}</span>}
            </p>
            <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500 mb-3">
              {lead.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-600" />{lead.location}</span>}
              {lead.industry && <span className="flex items-center gap-1"><FactoryIcon className="w-3 h-3 text-slate-600" />{lead.industry}</span>}
            </div>
            {/* Divider */}
            <div className="h-px bg-white/5 mb-3" />
            {/* Actions row */}
            <div className="flex items-center gap-2 flex-wrap">
              {lead.LinkedinLink && (
                <a href={safeHref(lead.LinkedinLink)} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#0A66C2]/40 bg-[#0A66C2]/10 hover:bg-[#0A66C2]/20 transition-colors text-xs font-medium text-[#4d9de0]">
                  <Linkedin className="w-3.5 h-3.5" /><ArrowUpRight className="w-3 h-3 opacity-70" />
                </a>
              )}
              {lead.website && (
                <a href={safeHref(lead.website)} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-xs font-medium text-slate-400">
                  <ExternalLink className="w-3 h-3" /><span>Website</span>
                </a>
              )}
              <button
                onClick={() => openDetailedReport(lead.LinkedinLink)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors text-xs font-semibold text-indigo-400"
              >
                <FileText className="w-3 h-3" /><span>Report</span>
              </button>
              <button
                onClick={() => globalThis.dispatchEvent(new CustomEvent('navigateTo', { detail: { page: 'campaign', companyName: lead.LeadName } }))}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 transition-colors text-xs font-semibold text-purple-400"
              >
                <Megaphone className="w-3 h-3" /><span>Campaign</span>
              </button>
              <button
                onClick={() => cartIds.has(lead.id) ? removeFromCart(lead.id) : addToCart(lead.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-all ml-auto ${cartIds.has(lead.id) ? 'bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25' : 'bg-teal-500/10 text-teal-400 border-teal-500/30 hover:bg-teal-500/20'}`}
              >
                {cartIds.has(lead.id) ? <><Trash2 className="w-3 h-3" /><span>Remove</span></> : <><ShoppingCart className="w-3 h-3" /><span>Select</span></>}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-6 font-mono">

      {/* ── HERO HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800/80"
        style={{ background: 'linear-gradient(135deg, #050a14 0%, #080e1c 50%, #060c18 100%)' }}>
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(20,184,166,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(20,184,166,0.8) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        {/* Radial glow */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 15% 50%, rgba(20,184,166,0.06) 0%, transparent 55%), radial-gradient(ellipse at 85% 20%, rgba(59,130,246,0.05) 0%, transparent 55%)' }} />
        <div className="relative px-6 py-5 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="relative w-12 h-12 flex-shrink-0">
              <div className="absolute inset-0 rounded-xl bg-teal-500/20 animate-ping opacity-30" />
              <div className="relative w-12 h-12 rounded-xl border border-teal-500/40 bg-teal-500/10 flex items-center justify-center">
                <Target className="w-6 h-6 text-teal-400" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-[0.12em] text-white uppercase" style={{ fontFamily: 'monospace' }}>
                LEAD INTELLIGENCE
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                <p className="text-xs text-slate-500 tracking-widest uppercase">AI-powered prospect discovery engine</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Pill tab switcher with sliding indicator */}
            <div className="relative flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-slate-800">
              <button
                onClick={() => setActiveTab('search')}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold tracking-widest uppercase transition-all duration-300 ${
                  activeTab === 'search'
                    ? 'bg-teal-500/20 text-teal-400 border border-teal-500/40 shadow-[0_0_12px_rgba(20,184,166,0.2)]'
                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                }`}
              >
                <Search className="w-3.5 h-3.5" /><span>Discover</span>
              </button>
              <button
                onClick={() => { setActiveTab('myLeads'); fetchMyLeads(); }}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold tracking-widest uppercase transition-all duration-300 ${
                  activeTab === 'myLeads'
                    ? 'bg-teal-500/20 text-teal-400 border border-teal-500/40 shadow-[0_0_12px_rgba(20,184,166,0.2)]'
                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                }`}
              >
                <Users className="w-3.5 h-3.5" /><span>Dossier</span>
                {myLeads.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-teal-500/30 text-teal-300 text-[9px] font-black leading-none border border-teal-500/40">
                    {myLeads.length}
                  </span>
                )}
              </button>
            </div>
            <button onClick={handleOpenVideo}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold tracking-widest uppercase text-slate-500 border border-slate-800 hover:border-slate-600 hover:text-slate-300 bg-black/30 transition-all">
              <BookOpen className="h-3.5 w-3.5" /><span>Guide</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── MY LEADS / DOSSIER TAB ── */}
      <AnimatePresence mode="wait">
      {activeTab === 'myLeads' && (
        <motion.div key="myLeads" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">

          {loadingMyLeads && (
            <div className="rounded-xl border border-slate-800 bg-[#07090f] flex flex-col items-center justify-center py-20 text-center">
              <div className="relative w-12 h-12 mb-5">
                <div className="absolute inset-0 rounded-full border-2 border-teal-500/20" />
                <div className="absolute inset-0 rounded-full border-2 border-t-teal-400 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
              </div>
              <p className="text-white font-black text-sm tracking-widest uppercase mb-1">Retrieving Intelligence</p>
              <p className="text-slate-600 text-xs tracking-wider">Fetching saved leads from your account</p>
            </div>
          )}

          {!loadingMyLeads && myLeads.length === 0 && (
            <div className="rounded-xl border border-slate-800 bg-[#07090f] flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-xl border border-slate-700 bg-slate-900/50 flex items-center justify-center mb-5">
                <Users className="h-8 w-8 text-slate-600" />
              </div>
              <h3 className="text-base font-black text-white tracking-widest uppercase mb-2">No Contacts Saved</h3>
              <p className="text-slate-600 text-xs max-w-sm tracking-wide">
                Use the Discover tab to find targets and save them to your dossier.
              </p>
              <button
                className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-500/15 text-teal-400 border border-teal-500/35 hover:bg-teal-500/25 transition-all text-xs font-bold tracking-widest uppercase"
                onClick={() => setActiveTab('search')}
              >
                <Search className="w-3.5 h-3.5" /><span>Start Hunt</span>
              </button>
            </div>
          )}

          {/* Individual Leads — CONTACTS */}
          {!loadingMyLeads && sortedLeads.filter(lead => lead?.custom_fields?.lead_type === 'individual').length > 0 && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-slate-800 bg-[#07090f] overflow-hidden">
              {/* Section header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/80 bg-[#060810]">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.6)]" />
                  <span className="text-xs font-black tracking-[0.2em] text-blue-400 uppercase">Contacts</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/25 text-blue-400 font-bold">
                    {sortedLeads.filter(lead => lead?.custom_fields?.lead_type === 'individual').length}
                  </span>
                </div>
                <button onClick={fetchMyLeads} disabled={loadingMyLeads}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest uppercase text-slate-500 border border-slate-800 hover:border-slate-600 hover:text-slate-300 transition-all disabled:opacity-40">
                  <RefreshCw className={`w-3 h-3 ${loadingMyLeads ? 'animate-spin' : ''}`} /><span>Sync</span>
                </button>
              </div>
              <div className="p-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
                {[...sortedLeads].filter(lead => lead?.custom_fields?.lead_type === 'individual').sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0)).map((lead, index) => (
                  <motion.div key={lead._id || index}
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
                    className="rounded-xl border border-blue-500/20 bg-blue-950/10 hover:bg-blue-950/20 transition-all duration-300 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-blue-500/10">
                      <h3 className="text-sm font-black text-white truncate max-w-[220px]" title={lead.name || 'N/A'}>{lead.name || 'N/A'}</h3>
                      <button
                        onClick={() => handleDeleteLead(lead._id)}
                        disabled={deletingLeadId === lead._id}
                        className="p-1.5 rounded-lg text-slate-600 hover:bg-red-500/15 hover:text-red-400 border border-transparent hover:border-red-500/25 transition-all disabled:opacity-50"
                      >
                        {deletingLeadId === lead._id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <div className="p-4 space-y-2">
                      <div className="flex items-center gap-2"><Briefcase className="w-3 h-3 text-slate-600 shrink-0" /><span className="text-xs text-slate-400 truncate">{lead.job_title || 'N/A'}</span></div>
                      <div className="flex items-center gap-2">
                        <Building className="w-3 h-3 text-slate-600 shrink-0" />
                        <span className="text-xs text-slate-400 truncate flex-1">{lead.company || 'N/A'}</span>
                        {lead.linkedin_url && (
                          <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-2 py-1 rounded border border-[#0A66C2]/30 bg-[#0A66C2]/10 hover:bg-[#0A66C2]/20 transition-colors ml-auto">
                            <Linkedin className="w-3 h-3 text-[#4d9de0]" /><ArrowUpRight className="w-2.5 h-2.5 text-[#4d9de0]/60" />
                          </a>
                        )}
                      </div>
                      {lead.custom_fields?.search_context && (
                        <>
                          <div className="border-t border-slate-800/80 my-2" />
                          <div>
                            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2">Search Context</p>
                            <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
                              <div className="flex items-center gap-1.5"><Clock className="w-3 h-3 text-teal-600 shrink-0" /><span className="text-[10px] text-slate-500">{new Date(lead.custom_fields.search_context.saved_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
                              <div className="flex items-center gap-1.5"><Target className="w-3 h-3 text-teal-600 shrink-0" /><span className="text-[10px] text-slate-500 capitalize">{lead.custom_fields.search_context.mode || 'company'}</span></div>
                              <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3 text-teal-600 shrink-0" /><span className="text-[10px] text-slate-500 truncate">{lead.custom_fields.search_context.location || 'Global'}</span></div>
                              <div className="flex items-center gap-1.5"><FactoryIcon className="w-3 h-3 text-teal-600 shrink-0" /><span className="text-[10px] text-slate-500 truncate">{lead.custom_fields.search_context.industry || 'All Industries'}</span></div>
                              <div className="col-span-2 flex items-center gap-1.5"><Search className="w-3 h-3 text-teal-600 shrink-0" /><span className="text-[10px] text-slate-500 break-words">{lead.custom_fields.search_context.query || '—'}</span></div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Company Leads — SAVED INTELLIGENCE */}
          {!loadingMyLeads && sortedLeads.filter(lead => lead.custom_fields?.lead_type === 'company').length > 0 && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl border border-slate-800 bg-[#07090f] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/80 bg-[#060810]">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-teal-400 shadow-[0_0_6px_rgba(20,184,166,0.6)]" />
                  <span className="text-xs font-black tracking-[0.2em] text-teal-400 uppercase">Saved Intelligence</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-teal-500/15 border border-teal-500/25 text-teal-400 font-bold">
                    {sortedLeads.filter(lead => lead.custom_fields?.lead_type === 'company').length}
                  </span>
                </div>
                <button onClick={fetchMyLeads} disabled={loadingMyLeads}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest uppercase text-slate-500 border border-slate-800 hover:border-slate-600 hover:text-slate-300 transition-all disabled:opacity-40">
                  <RefreshCw className={`w-3 h-3 ${loadingMyLeads ? 'animate-spin' : ''}`} /><span>Sync</span>
                </button>
              </div>
              <div className="p-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
                {[...sortedLeads].filter(lead => lead.custom_fields?.lead_type === 'company').sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0)).map((lead, index) => {
                  const score = lead.lead_score || 0;
                  const borderCls = score >= 65 ? 'border-teal-500/30 bg-teal-950/10 hover:bg-teal-950/20' : score >= 35 ? 'border-amber-500/30 bg-amber-950/10 hover:bg-amber-950/20' : 'border-slate-600/25 bg-slate-900/10 hover:bg-slate-800/15';
                  const initials = (lead.name || '?').charAt(0).toUpperCase();
                  const ringColor = score >= 65 ? '#14b8a6' : score >= 35 ? '#f59e0b' : '#64748b';
                  return (
                    <motion.div key={lead._id || index}
                      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
                      className={`rounded-xl border transition-all duration-300 overflow-hidden ${borderCls}`}>
                      <div className="p-4 flex items-start gap-4">
                        {/* Company logo placeholder */}
                        <div className="flex-shrink-0 flex flex-col items-center gap-1.5">
                          {lead.custom_fields?.lead_card_data?.profile_image
                            ? <img src={lead.custom_fields.lead_card_data.profile_image} alt={lead.name} className="w-12 h-12 rounded-xl object-cover border border-slate-700" />
                            : (
                              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black text-white border border-slate-700"
                                style={{ background: `linear-gradient(135deg, ${ringColor}30, ${ringColor}15)`, borderColor: `${ringColor}40` }}>
                                {initials}
                              </div>
                            )
                          }
                          {/* Mini score */}
                          <div className="text-center">
                            <div className="text-sm font-black text-white leading-none">{score}</div>
                            <div className="text-[9px] text-slate-600 uppercase tracking-wider">score</div>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-black text-white truncate mb-1" title={lead.name}>{lead.name}</h3>
                          <div className="flex items-center gap-2 flex-wrap mb-3">
                            {lead.linkedin_url && (
                              <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-2 py-1 rounded border border-[#0A66C2]/30 bg-[#0A66C2]/10 hover:bg-[#0A66C2]/20 transition-colors">
                                <Linkedin className="w-3 h-3 text-[#4d9de0]" /><ArrowUpRight className="w-2.5 h-2.5 text-[#4d9de0]/60" />
                              </a>
                            )}
                            {lead.custom_fields?.lead_card_data?.website && (
                              <a href={lead.custom_fields.lead_card_data.website} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-2 py-1 rounded border border-slate-700 bg-slate-900/50 hover:bg-slate-800 transition-colors text-[10px] text-slate-400">
                                <ExternalLink className="w-3 h-3" /><span>Website</span>
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => { if (setAnalysisQuery) { setAnalysisQuery(lead.linkedin_url || lead.name); } if (setActivePage) { setActivePage('company-analysis'); } }}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all">
                              <BarChart2 className="w-3 h-3" /><span>Analysis</span>
                            </button>
                            <button
                              onClick={() => { if (lead.linkedin_url) openDetailedReport(lead.linkedin_url); }}
                              disabled={!lead.linkedin_url}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all disabled:opacity-40">
                              <FileText className="w-3 h-3" /><span>Report</span>
                            </button>
                            <button
                              onClick={() => { globalThis.dispatchEvent(new CustomEvent('navigateTo', { detail: { page: 'campaign', companyName: lead.name } })); }}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-all">
                              <Megaphone className="w-3 h-3" /><span>Campaign</span>
                            </button>
                            <button
                              onClick={() => handleDeleteLead(lead._id)}
                              disabled={deletingLeadId === lead._id}
                              className="p-1.5 rounded-lg text-slate-600 hover:bg-red-500/15 hover:text-red-400 border border-transparent hover:border-red-500/25 transition-all ml-auto disabled:opacity-50">
                              {deletingLeadId === lead._id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          {lead.custom_fields?.search_context && (
                            <div className="mt-3 pt-3 border-t border-slate-800/60">
                              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2">Search Context</p>
                              <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
                                <div className="flex items-center gap-1.5"><Clock className="w-3 h-3 text-teal-600 shrink-0" /><span className="text-[10px] text-slate-500">{new Date(lead.custom_fields.search_context.saved_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
                                <div className="flex items-center gap-1.5"><Target className="w-3 h-3 text-teal-600 shrink-0" /><span className="text-[10px] text-slate-500 capitalize">{lead.custom_fields.search_context.mode || 'company'}</span></div>
                                <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3 text-teal-600 shrink-0" /><span className="text-[10px] text-slate-500 truncate">{lead.custom_fields.search_context.location || 'Global'}</span></div>
                                <div className="flex items-center gap-1.5"><FactoryIcon className="w-3 h-3 text-teal-600 shrink-0" /><span className="text-[10px] text-slate-500 truncate">{lead.custom_fields.search_context.industry || 'All Industries'}</span></div>
                                <div className="col-span-2 flex items-center gap-1.5"><Search className="w-3 h-3 text-teal-600 shrink-0" /><span className="text-[10px] text-slate-500 break-words">{lead.custom_fields.search_context.query || '—'}</span></div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* ── SEARCH / DISCOVER TAB ── */}
      {activeTab === 'search' && (
        <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">

          {/* Selection bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-teal-500/30 bg-teal-950/20 px-5 py-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                <span className="text-xs font-black text-teal-300 tracking-widest uppercase">{selectedIds.size} targets selected</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={openGroupModal} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-teal-500/30 bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 transition-all">Add to Group</button>
                <button onClick={clearSelection} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-slate-700 text-slate-500 hover:text-slate-300 transition-all">Clear</button>
              </div>
            </div>
          )}

          {/* ── SEARCH COMMAND CENTER ── */}
          <div className="rounded-xl border border-slate-800 bg-[#07090f] overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800/80 bg-[#060810] flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
              <span className="text-[10px] font-black tracking-[0.2em] text-slate-500 uppercase">Recon Parameters</span>
            </div>
            <div className="p-5 space-y-4">
              {/* Search Row */}
              <div className="flex gap-3">
                {/* Main search input */}
                <div className={`relative flex-1 rounded-xl transition-all duration-300 ${searchFocused ? 'shadow-[0_0_0_2px_rgba(20,184,166,0.4),0_0_20px_rgba(20,184,166,0.08)]' : 'shadow-[0_0_0_1px_rgba(255,255,255,0.06)]'}`}>
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-teal-500 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Describe target profile (e.g., 'tech CEOs in Silicon Valley')"
                    className="w-full pl-11 pr-4 h-[52px] text-sm text-white placeholder-slate-600 bg-slate-900/60 rounded-xl outline-none border-0 font-mono tracking-wide"
                  />
                </div>
                {/* Mode toggle chips */}
                <div className="flex rounded-xl overflow-hidden border border-slate-800 bg-black/30 flex-shrink-0">
                  <button type="button" onClick={() => !leadsData.length && setSearchMode('individual')} disabled={leadsData.length > 0}
                    className={`flex items-center justify-center gap-2 px-4 h-[52px] text-xs font-black uppercase tracking-widest transition-all duration-200 ${searchMode === 'individual' ? 'bg-blue-500/20 text-blue-400 border-r border-blue-500/30' : leadsData.length > 0 ? 'text-slate-700 cursor-not-allowed border-r border-slate-800' : 'text-slate-500 hover:text-slate-300 border-r border-slate-800'}`}>
                    <User className="w-3.5 h-3.5" /><span className="hidden sm:inline">Individual</span>
                  </button>
                  <button type="button" onClick={() => !leadsData.length && setSearchMode('company')} disabled={leadsData.length > 0}
                    className={`flex items-center justify-center gap-2 px-4 h-[52px] text-xs font-black uppercase tracking-widest transition-all duration-200 ${searchMode === 'company' ? 'bg-teal-500/20 text-teal-400' : leadsData.length > 0 ? 'text-slate-700 cursor-not-allowed' : 'text-slate-500 hover:text-slate-300'}`}>
                    <Building className="w-3.5 h-3.5" /><span className="hidden sm:inline">Company</span>
                  </button>
                </div>
                {/* Launch button */}
                <button onClick={handleSearch} disabled={loading || !searchQuery.trim()}
                  className="relative h-[52px] px-7 rounded-xl text-xs font-black uppercase tracking-widest text-black flex items-center gap-2 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed overflow-hidden transition-all"
                  style={{ background: loading ? 'rgba(20,184,166,0.4)' : 'linear-gradient(135deg, #14b8a6, #0d9488)' }}>
                  {loading && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />}
                  {loading ? <RefreshCw className="h-4 w-4 animate-spin text-teal-200" /> : <Search className="h-4 w-4" />}
                  <span>{loading ? 'Scanning...' : 'Launch Scan'}</span>
                </button>
                {leadsData.length > 0 && (
                  <button onClick={() => { setSearchQuery(''); setLocation(''); setIndustryType(''); setTechStack([]); setLeadsData([]); setTotalLeads(0); setSelectedIds(new Set()); setCartIds(new Set()); setError(null); setSelectedCategory(null); }}
                    className="h-[52px] px-4 flex items-center justify-center gap-2 rounded-xl border border-slate-800 text-slate-600 hover:text-slate-400 hover:border-slate-700 hover:bg-slate-900/40 transition-all flex-shrink-0">
                    <XCircle className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">Clear</span>
                  </button>
                )}
              </div>
              {/* Filter params row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600 pointer-events-none" />
                  <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                    placeholder="Location — city, country"
                    className="w-full pl-10 pr-4 py-2.5 text-xs text-slate-400 placeholder-slate-700 bg-slate-900/50 border border-slate-800/80 rounded-lg outline-none focus:border-teal-500/40 transition-colors font-mono tracking-wide" />
                </div>
                <div className="relative">
                  <FactoryIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600 pointer-events-none" />
                  <select value={industryType} onChange={(e) => setIndustryType(e.target.value)}
                    className="w-full pl-10 pr-8 py-2.5 text-xs text-slate-400 bg-slate-900/50 border border-slate-800/80 rounded-lg outline-none focus:border-teal-500/40 transition-colors appearance-none font-mono tracking-wide">
                    <option value="">All Industries</option>
                    {INDUSTRY_TYPES.flatMap(cat => cat.options.map(ind => <option key={ind} value={ind}>{ind}</option>))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-700 pointer-events-none" />
                </div>
                <div>
                  <div className="relative">
                    <Layers3 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600 pointer-events-none" />
                    <select value="" onChange={(e) => { const v = e.target.value; if (v && !techStack.includes(v)) setTechStack(prev => [...prev, v]); }}
                      className="w-full pl-10 pr-8 py-2.5 text-xs text-slate-400 bg-slate-900/50 border border-slate-800/80 rounded-lg outline-none focus:border-teal-500/40 transition-colors appearance-none font-mono tracking-wide">
                      <option value="">Add Tech Stack</option>
                      {TECH_STACK_OPTIONS.filter(t => !techStack.includes(t)).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-700 pointer-events-none" />
                  </div>
                  {techStack.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {techStack.map(t => (
                        <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-500/10 border border-teal-500/25 text-teal-400 text-[10px] font-bold tracking-wider">
                          {t}
                          <button type="button" onClick={() => setTechStack(prev => prev.filter(x => x !== t))} className="ml-0.5 text-teal-600 hover:text-teal-300 transition-colors"><X className="h-2.5 w-2.5" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Error state */}
          {error && (
            <div className="rounded-xl border border-red-500/25 bg-red-950/20 px-5 py-4 flex items-center gap-4">
              <div className="w-8 h-8 rounded-lg border border-red-500/30 bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <XCircle className="h-4 w-4 text-red-400" />
              </div>
              <div>
                <p className="text-xs font-black text-red-400 uppercase tracking-widest mb-0.5">Scan Failed</p>
                <p className="text-xs text-red-500/80">{error}</p>
              </div>
            </div>
          )}

          {/* Group modal */}
          {groupModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setGroupModalOpen(false)} />
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="relative rounded-xl border border-slate-700 bg-[#080c14] w-full max-w-md p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-black text-white uppercase tracking-widest">File Selection to Group</h3>
                  <button onClick={() => setGroupModalOpen(false)} className="p-1.5 rounded-lg text-slate-600 hover:text-slate-400 hover:bg-slate-800 transition-all"><X className="h-4 w-4" /></button>
                </div>
                {groups.length > 0 && (
                  <div className="mb-4">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Existing Group</label>
                    <select value={selectedExistingGroup} onChange={(e) => setSelectedExistingGroup(e.target.value)}
                      className="w-full px-3 py-2.5 text-xs text-slate-300 bg-slate-900/60 border border-slate-700 rounded-lg outline-none focus:border-teal-500/40 transition-colors font-mono">
                      <option value="">-- None --</option>
                      {groups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="mb-5">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Create New</label>
                  <input value={groupNameInput} onChange={(e) => setGroupNameInput(e.target.value)} placeholder="e.g., Priority Accounts"
                    className="w-full px-3 py-2.5 text-xs text-slate-300 placeholder-slate-700 bg-slate-900/60 border border-slate-700 rounded-lg outline-none focus:border-teal-500/40 transition-colors font-mono" />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setGroupModalOpen(false)} className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-500 border border-slate-700 hover:border-slate-600 hover:text-slate-300 transition-all">Cancel</button>
                  <button onClick={addSelectionToGroup} className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-teal-500/20 text-teal-400 border border-teal-500/35 hover:bg-teal-500/30 transition-all">Add to Group</button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Groups display */}
          {groups.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-[#07090f] px-5 py-4">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Active Groups</p>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <span key={g.name} className="px-3 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/25 text-xs text-teal-400 font-bold tracking-wider">
                    {g.name} <span className="text-teal-600">· {g.leadIds.length}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── SELECTED TARGETS CART ── */}
          {cartIds.size > 0 && (
            <div className="rounded-xl border border-teal-500/25 bg-teal-950/10 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-teal-500/15 bg-teal-950/20">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.6)] animate-pulse" />
                  <span className="text-[10px] font-black tracking-[0.2em] text-teal-400 uppercase">Selected Targets</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-teal-500/20 border border-teal-500/30 text-teal-300 font-black">{cartIds.size}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={clearCart} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-red-500 border border-red-500/20 hover:bg-red-500/10 transition-all"><Trash2 className="w-3 h-3" /><span>Clear</span></button>
                  <button onClick={saveCartToDatabase} disabled={savingCart || cartIds.size === 0}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-teal-500/20 text-teal-400 border border-teal-500/35 hover:bg-teal-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                    <Save className="w-3 h-3" /><span>{savingCart ? 'Filing...' : 'Save with Reports'}</span>
                  </button>
                </div>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                {(() => {
                  const items: LeadData[] = [];
                  leadsData.forEach(cat => { cat.leads.forEach(ld => { if (cartIds.has(ld.id)) items.push(ld); }); });
                  return items.map(ld => (
                    <div key={ld.id} className="flex items-center justify-between rounded-lg border border-teal-500/15 bg-teal-950/10 px-3 py-2.5 hover:bg-teal-950/20 transition-colors">
                      <div className="min-w-0">
                        <p className="font-black text-white truncate text-xs">{ld.LeadName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <a href={safeHref(ld.LinkedinLink)} target="_blank" rel="noopener noreferrer" className="text-[#4d9de0] text-[10px] hover:text-[#60a5fa]"><Linkedin className="w-3 h-3 inline" /></a>
                          {ld.website && <a href={safeHref(ld.website)} target="_blank" rel="noopener noreferrer" className="text-teal-600 text-[10px] hover:text-teal-400">website</a>}
                        </div>
                      </div>
                      <button onClick={() => removeFromCart(ld.id)} className="ml-3 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-slate-500 border border-slate-700 hover:border-slate-600 hover:text-slate-300 transition-all">Remove</button>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          {/* ── RESULTS ── */}
          {leadsData.length > 0 && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-[10px] font-black text-teal-400 uppercase tracking-widest">
                  <Users className="w-3 h-3" /><span>{totalLeads} signals detected</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/50 border border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  <SlidersHorizontal className="w-3 h-3" /><span className="capitalize">{searchMode}</span>
                </div>
                {location && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/50 border border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <MapPin className="w-3 h-3" /><span>{location}</span>
                  </div>
                )}
                <button onClick={handleRefresh} disabled={refreshing}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest text-slate-600 border border-slate-800 hover:border-slate-700 hover:text-slate-400 transition-all disabled:opacity-40">
                  <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} /><span>Refresh</span>
                </button>
              </div>

              {(() => {
                const allLeads = leadsData
                  .flatMap(c => c.leads)
                  .sort((a, b) => Number(b?.leadScore || 0) - Number(a?.leadScore || 0));
                const visible = selectedCategory === 'all' ? allLeads : allLeads.slice(0, 6);
                return (
                  <>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {visible.map((lead, idx) => renderLeadCard(lead, idx))}
                    </div>
                    {allLeads.length > 6 && selectedCategory !== 'all' && (
                      <div className="text-center pt-2">
                        <button onClick={() => setSelectedCategory('all')}
                          className="inline-flex items-center gap-2 px-5 py-2 rounded-lg border border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-400 hover:border-slate-700 transition-all">
                          <span>{allLeads.length - 6} more leads</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </motion.div>
      )}
      </AnimatePresence>

      {/* ── DETAILED REPORT MODAL ── */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm">
          <div className="relative flex items-start gap-3 w-full max-w-4xl m-4">
            <div className="rounded-xl border border-slate-700 bg-[#08090f] flex-1 max-h-[90vh] overflow-auto shadow-2xl">
              <div className="flex justify-between items-center px-6 py-5 border-b border-slate-800/80 bg-[#060810] sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-teal-400 shadow-[0_0_6px_rgba(20,184,166,0.6)]" />
                  <h3 className="text-sm font-black text-white uppercase tracking-widest">Intelligence Report</h3>
                </div>
              </div>
              <div className="p-6">
                {reportLoading && (
                  <div className="text-center py-16">
                    <div className="relative w-12 h-12 mx-auto mb-5">
                      <div className="absolute inset-0 rounded-full border-2 border-teal-500/20" />
                      <div className="absolute inset-0 rounded-full border-2 border-t-teal-400 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                    </div>
                    <p className="text-white font-black text-xs tracking-widest uppercase mb-1">Extracting Intelligence</p>
                    <p className="text-slate-600 text-xs">Loading detailed company report...</p>
                  </div>
                )}
                {reportError && (
                  <div className="text-center py-16">
                    <XCircle className="w-10 h-10 mx-auto mb-3 text-red-500" />
                    <p className="text-red-400 font-black text-xs uppercase tracking-widest mb-1">Extraction Failed</p>
                    <p className="text-slate-600 text-xs">{reportError}</p>
                  </div>
                )}
                {!reportLoading && !reportError && reportData && (
                  <div className="space-y-6">
                    {reportData.cover_image_url && (
                      <div className="-mx-6 -mt-6 mb-4">
                        <img src={reportData.cover_image_url} alt="Company Cover" className="w-full h-32 object-cover opacity-60 rounded-t-xl" />
                      </div>
                    )}
                    <div className="flex items-start space-x-4">
                      {reportData.logo_url && (
                        <img src={reportData.logo_url} alt="Company Logo" className="w-16 h-16 rounded-xl object-contain border border-slate-700 bg-slate-900/50 p-2" />
                      )}
                      <div className="flex-1">
                        {reportData.company_name && <h4 className="text-xl font-black text-white">{reportData.company_name}</h4>}
                        {reportData.headline && <p className="text-slate-500 text-sm mt-1">{reportData.headline}</p>}
                        <div className="flex items-center gap-3 mt-2">
                          {reportData.verified_status && (
                            <span className="px-2 py-0.5 bg-teal-500/15 text-teal-400 text-[10px] font-black rounded border border-teal-500/30 uppercase tracking-wider">✓ Verified</span>
                          )}
                          {reportData.followers_count && (
                            <span className="text-xs text-slate-500">{reportData.followers_count.toLocaleString()} followers</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {(reportData.about || reportData.description) && (
                      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                        <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">About</h5>
                        <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-line">{reportData.about || reportData.description}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                      {reportData.industry && <div><span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Industry</span><p className="text-sm text-slate-300 mt-1">{reportData.industry}</p></div>}
                      {reportData.company_size && <div><span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Size</span><p className="text-sm text-slate-300 mt-1">{reportData.company_size}</p></div>}
                      {reportData.headquarters && <div><span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">HQ</span><p className="text-sm text-slate-300 mt-1">{reportData.headquarters}</p></div>}
                      {reportData.type && <div><span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Type</span><p className="text-sm text-slate-300 mt-1">{reportData.type}</p></div>}
                      {reportData.founded && <div><span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Founded</span><p className="text-sm text-slate-300 mt-1">{reportData.founded}</p></div>}
                      {reportData.website && (
                        <div>
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Website</span>
                          <a href={reportData.website} target="_blank" rel="noopener noreferrer" className="text-sm text-teal-400 hover:text-teal-300 mt-1 block transition-colors hover:underline">{reportData.website}</a>
                        </div>
                      )}
                    </div>
                    {reportData.specialties && reportData.specialties.length > 0 && (
                      <div>
                        <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Specialties</h5>
                        <div className="flex flex-wrap gap-2">
                          {reportData.specialties.map((specialty: string, idx: number) => (
                            <span key={idx} className="px-2.5 py-1 rounded-lg border border-slate-800 bg-slate-900/50 text-slate-400 text-xs font-mono">{specialty}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {reportData.locations && reportData.locations.length > 0 && (
                      <div>
                        <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Locations</h5>
                        <ul className="space-y-1">
                          {reportData.locations.map((loc: string, idx: number) => (
                            <li key={idx} className="text-sm text-slate-500 flex items-center"><MapPin className="w-3.5 h-3.5 mr-2 text-slate-700 shrink-0" />{loc}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {reportData.employees_preview && reportData.employees_preview.length > 0 && (
                      <div>
                        <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Key Personnel</h5>
                        <div className="space-y-2">
                          {reportData.employees_preview.slice(0, 5).map((emp: any, idx: number) => (
                            <div key={idx} className="flex items-center space-x-3 p-3 rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-900/60 transition-colors">
                              {typeof emp === 'string' ? (
                                <p className="text-sm font-bold text-slate-300">{emp}</p>
                              ) : (
                                <>
                                  {emp.profile_image && <img src={emp.profile_image} alt={emp.name} className="w-8 h-8 rounded-full border border-slate-700" />}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-300 truncate">{emp.name}</p>
                                    <p className="text-xs text-slate-600 truncate">{emp.title}</p>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {reportData.recent_updates && reportData.recent_updates.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Recent Updates</h5>
                          <a
                            href={reportData.linkedin_url || `https://www.linkedin.com/company/${reportData.company_name?.toLowerCase().replace(/\s+/g, '-')}`}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#0A66C2]/10 border border-[#0A66C2]/20 text-[#4d9de0] text-[10px] font-bold hover:bg-[#0A66C2]/20 transition-colors">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                            via LinkedIn
                          </a>
                        </div>
                        <div className="space-y-2">
                          {reportData.recent_updates.slice(0, 5).map((update: any, idx: number) => (
                            <div key={idx} className="p-3 rounded-lg border border-slate-800 bg-slate-900/40"><p className="text-sm text-slate-500">{update.text}</p></div>
                          ))}
                        </div>
                      </div>
                    )}
                    {[
                      { key: 'Product Launches', label: 'Product Launches' },
                      { key: 'Signals', label: 'Market Signals' },
                      { key: 'News', label: 'Company News' },
                      { key: 'Competitor Activity', label: 'Competitor Activity' },
                      { key: 'Rapid Hiring', label: 'Rapid Hiring' },
                      { key: 'Layoffs / Regulations', label: 'Layoffs / Regulations' },
                      { key: 'Event Attendance', label: 'Event Attendance' },
                    ].map(({ key, label }) =>
                      reportData.company_news?.[key] && reportData.company_news[key].length > 0 ? (
                        <div key={key}>
                          <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">{label}</h5>
                          <div className="space-y-2">
                            {reportData.company_news[key].map((item: any, idx: number) => (
                              <div key={idx} className="p-3 rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-900/60 transition-colors">
                                <p className="text-sm font-bold text-slate-300 mb-1">{item['News Title']}</p>
                                <p className="text-xs text-slate-600 mb-1.5">{item.Source} · {new Date(item['Published Date']).toLocaleDateString()}</p>
                                {item.Link && (
                                  <a href={item.Link} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-500 hover:text-teal-400 font-bold transition-colors">Read more →</a>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null
                    )}
                    {reportData._fallback && (
                      <div>
                        <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Additional Data</h5>
                        <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/40">
                          <pre className="text-xs text-slate-600 whitespace-pre-wrap overflow-auto max-h-40">{JSON.stringify(reportData._fallback, null, 2)}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {/* Close button */}
            <button
              onClick={() => setReportOpen(false)}
              className="sticky top-0 flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full border border-slate-700 bg-slate-900 shadow-lg hover:bg-red-500/15 hover:border-red-500/40 transition-all group"
            >
              <X className="h-4 w-4 text-slate-500 group-hover:text-red-400 transition-colors" />
            </button>
          </div>
        </div>
      )}

      {/* ── VIDEO GUIDE MODAL ── */}
      {showVideoModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleCloseVideo}>
          <div className="relative w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-800" onClick={(e) => e.stopPropagation()}>
            <button onClick={handleCloseVideo} className="absolute top-4 right-4 z-10 w-10 h-10 bg-black/70 hover:bg-black rounded-full flex items-center justify-center text-slate-500 hover:text-white transition-all duration-200 hover:scale-110 border border-slate-800">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <iframe className="w-full h-full" src="https://www.youtube.com/embed/vlsBP50Qc6k?autoplay=0&rel=0" title="Guide Me – Lead Generation" style={{ border: 'none' }} allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          </div>
        </div>
      )}

      {/* ── FEATURE HIGHLIGHTS ── */}
      <div className="rounded-xl border border-slate-800 bg-[#07090f] p-6 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-10 items-center">
          <div className="relative w-full aspect-video scale-105 rounded-xl overflow-hidden border border-slate-800 bg-black">
            <iframe className="w-full h-full" src="https://www.youtube.com/embed/TJoBtHKch4A?autoplay=0&rel=0" title="Feature Highlights Video" style={{ border: 'none' }} allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
              <h2 className="text-xs font-black text-teal-400 tracking-[0.2em] uppercase">System Capabilities</h2>
            </div>
            <div className="space-y-5">
              {[
                { title: 'Smart Lead Search', desc: 'Search by company name, industry, location, and tech stack to find your ideal prospects' },
                { title: 'Dual Search Modes', desc: 'Toggle between individual professionals and company-level searches for flexible targeting' },
                { title: 'Lead Scoring & Reports', desc: 'AI-powered lead scoring with detailed company reports and LinkedIn integration' },
                { title: 'Save & Organize', desc: 'Add leads to cart, save to database, and manage your pipeline efficiently' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded flex items-center justify-center bg-teal-500/15 border border-teal-500/25 flex-shrink-0 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-white tracking-wide mb-0.5">{item.title}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Leads;
