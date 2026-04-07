import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, ChevronDown, Search, X, User,
  CheckCircle2, Sparkles, FileText, Video,
} from 'lucide-react';
import type { TargetDuration, VideoStudioMode } from './videoStudioTypes';
import { BG_OPTIONS, DURATION_INFO } from './videoStudioTypes';
import { getAuthHeaders } from '../../utils/getAuthToken';
import { API_BASE_URL } from '../../config/api';

interface CompanyOption { name: string; industry: string; logo_url: string }

interface VideoStudioConfigPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate?: () => void;
  prompt: string;              setPrompt: (v: string) => void;
  companyName: string;         setCompanyName: (v: string) => void;
  videoMode: VideoStudioMode;  setVideoMode: (v: VideoStudioMode) => void;
  targetDuration: TargetDuration; setTargetDuration: (v: TargetDuration) => void;
  senderMode: 'personal' | 'company'; setSenderMode: (v: 'personal' | 'company') => void;
}

export const VideoStudioConfigPopup = ({
  isOpen, onClose, onGenerate,
  prompt, setPrompt,
  companyName, setCompanyName,
  videoMode, setVideoMode,
  targetDuration, setTargetDuration,
  senderMode, setSenderMode,
}: VideoStudioConfigPopupProps) => {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [cSearch, setCSearch] = useState('');
  const [cOpen, setCOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_BASE_URL}/companies`, { headers });
        const data = await res.json();
        if (data.companies) setCompanies(data.companies);
      } catch { /* ignore */ }
    };
    void load();
  }, [isOpen]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setCOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = companies.filter(c =>
    !cSearch || c.name.toLowerCase().includes(cSearch.toLowerCase())
  );

  const handleGenerate = useCallback(() => {
    onClose();
    onGenerate?.();
  }, [onClose, onGenerate]);

  const secLabel = 'text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2.5';

  const optCard = (active: boolean) =>
    `rounded-xl border transition-all cursor-pointer ${
      active
        ? 'border-teal-500/40 bg-teal-500/[0.08]'
        : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]'
    }`;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-5"
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.97, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-6xl rounded-2xl border border-white/[0.08] bg-[#13141a] shadow-[0_32px_100px_rgba(0,0,0,0.85)] flex flex-col"
            style={{ height: 'calc(100vh - 2.5rem)' }}
          >
            {/* Teal accent line */}
            <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl bg-gradient-to-r from-transparent via-teal-500/60 to-transparent pointer-events-none" />

            {/* ── HEADER ── */}
            <div className="flex-shrink-0 flex items-center justify-between px-8 pt-6 pb-5 border-b border-white/[0.06]">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500/20 to-blue-600/20 border border-teal-500/20 flex items-center justify-center flex-shrink-0">
                  <Video className="h-5 w-5 text-teal-400" />
                </div>
                <div>
                  <p className="text-lg font-bold text-white leading-none">New Video</p>
                  <p className="text-xs text-white/30 mt-1">Configure your video before generating</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2.5 rounded-xl text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* ── BODY — 3-column, no scroll ── */}
            <div className="flex-1 min-h-0 grid grid-cols-3 divide-x divide-white/[0.05]">

              {/* ── COL 1: Video Brief (prompt fills height) ── */}
              <div className="flex flex-col px-8 py-6 gap-3">
                <p className={secLabel}>
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="h-3 w-3" />
                    What's this video about?
                    <span className="normal-case font-normal text-red-400/60 ml-0.5">*</span>
                  </span>
                </p>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="e.g. Introduce our AI analytics platform to enterprise decision-makers and highlight key ROI benefits — focus on time savings and cost reduction…"
                  className="flex-1 min-h-0 w-full bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-3.5 text-sm text-white/80 placeholder-white/20 resize-none focus:outline-none focus:border-teal-500/40 focus:bg-teal-500/[0.02] transition-all leading-relaxed"
                />
                <p className="text-[10px] text-white/20 flex-shrink-0">
                  Describe your product, campaign goal, or target audience
                </p>
              </div>

              {/* ── COL 2: Narrator Voice + Target Company ── */}
              <div className="flex flex-col px-8 py-6 gap-7">

                {/* Narrator Voice */}
                <div className="flex-shrink-0">
                  <p className={secLabel}>Narrator voice</p>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { id: 'personal' as const, Icon: User,     label: 'Personal', hint: 'I / My / We', sub: 'Direct & conversational' },
                      { id: 'company'  as const, Icon: Building2, label: 'Company',  hint: 'Brand voice', sub: 'Professional & polished'  },
                    ]).map(({ id, Icon, label, hint, sub }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSenderMode(id)}
                        className={`flex flex-col gap-2.5 px-4 py-4 text-left ${optCard(senderMode === id)}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${senderMode === id ? 'bg-teal-500/20' : 'bg-white/[0.05]'}`}>
                            <Icon className={`h-4 w-4 ${senderMode === id ? 'text-teal-400' : 'text-white/30'}`} />
                          </div>
                          <p className={`text-sm font-semibold ${senderMode === id ? 'text-teal-300' : 'text-white/60'}`}>{label}</p>
                          {senderMode === id && <CheckCircle2 className="h-4 w-4 text-teal-400 ml-auto flex-shrink-0" />}
                        </div>
                        <p className={`text-[11px] font-medium ${senderMode === id ? 'text-teal-400/70' : 'text-white/35'}`}>{hint}</p>
                        <p className="text-[10px] text-white/20 leading-snug">{sub}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target Company */}
                <div className="flex-shrink-0">
                  <p className={secLabel}>
                    Target company{' '}
                    <span className="normal-case font-normal text-white/20 tracking-normal">(optional)</span>
                  </p>
                  <div className="relative" ref={dropRef}>
                    <button
                      type="button"
                      onClick={() => setCOpen(o => !o)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04] transition-all"
                    >
                      <Building2 className="h-4 w-4 text-white/25 flex-shrink-0" />
                      <span className={`flex-1 text-sm truncate text-left ${companyName ? 'text-white/80' : 'text-white/25'}`}>
                        {companyName || 'Select a company…'}
                      </span>
                      <ChevronDown className={`h-4 w-4 text-white/25 flex-shrink-0 transition-transform ${cOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                      {cOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.14 }}
                          className="absolute z-50 top-full mt-2 left-0 right-0 rounded-xl border border-white/[0.10] bg-[#1a1c26] shadow-2xl overflow-hidden"
                        >
                          <div className="p-3 border-b border-white/[0.06] flex items-center gap-2">
                            <Search className="h-4 w-4 text-white/25 flex-shrink-0" />
                            <input
                              autoFocus
                              value={cSearch}
                              onChange={e => setCSearch(e.target.value)}
                              placeholder="Search companies…"
                              className="flex-1 bg-transparent text-sm text-white/80 focus:outline-none placeholder-white/25"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => { setCompanyName(''); setCOpen(false); setCSearch(''); }}
                            className="w-full px-4 py-2.5 text-left text-sm text-white/30 hover:bg-white/[0.04] hover:text-white/50 transition-colors"
                          >
                            — None
                          </button>
                          <div className="max-h-48 overflow-y-auto">
                            {filtered.length === 0
                              ? <p className="px-4 py-5 text-sm text-white/20 text-center">No companies found</p>
                              : filtered.map(c => (
                                <button
                                  key={c.name}
                                  type="button"
                                  onClick={() => { setCompanyName(c.name); setCSearch(''); setCOpen(false); }}
                                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.05] transition-colors ${companyName === c.name ? 'bg-teal-500/[0.07]' : ''}`}
                                >
                                  {c.logo_url
                                    ? <img src={c.logo_url} alt="" className="w-5 h-5 rounded object-contain bg-white/5 flex-shrink-0" />
                                    : <div className="w-5 h-5 rounded bg-white/[0.06] flex items-center justify-center flex-shrink-0"><Building2 className="h-3 w-3 text-white/20" /></div>}
                                  <span className="text-sm text-white/70 truncate flex-1">{c.name}</span>
                                  {companyName === c.name && <CheckCircle2 className="h-4 w-4 text-teal-400 flex-shrink-0" />}
                                </button>
                              ))
                            }
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <p className="text-[10px] text-white/20 mt-2">
                    Used to personalise script and branding
                  </p>
                </div>

              </div>

              {/* ── COL 3: Video Length + Background Style ── */}
              <div className="flex flex-col px-8 py-6 gap-7">

                {/* Video Length */}
                <div className="flex-shrink-0">
                  <p className={secLabel}>Video length</p>
                  <div className="grid grid-cols-3 gap-2.5">
                    {(['short', 'medium', 'long'] as const).map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setTargetDuration(d)}
                        className={`flex flex-col items-center gap-1.5 py-3.5 px-2 ${optCard(targetDuration === d)}`}
                      >
                        <span className={`text-sm font-bold ${targetDuration === d ? 'text-teal-300' : 'text-white/55'}`}>
                          {DURATION_INFO[d].label}
                        </span>
                        <span className="text-[9px] text-white/25 text-center leading-tight">
                          {DURATION_INFO[d].hint}
                        </span>
                        {targetDuration === d && <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Background Style */}
                <div className="flex flex-col flex-1 min-h-0">
                  <p className={`${secLabel} flex-shrink-0`}>Background style</p>
                  <p className="text-[10px] text-white/20 mb-3 flex-shrink-0">
                    Shown behind text overlays — overridable per scene
                  </p>
                  <div className="flex flex-col gap-2 flex-1">
                    {BG_OPTIONS.map(m => {
                      const active = videoMode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setVideoMode(m.id)}
                          className={`flex items-center gap-3.5 px-4 py-3 rounded-xl border transition-all flex-1 min-h-0 ${
                            active ? m.bgColor : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]'
                          }`}
                        >
                          <span className="text-lg leading-none flex-shrink-0 w-6 text-center">{m.icon}</span>
                          <div className="flex-1 text-left min-w-0">
                            <p className={`text-sm font-semibold ${active ? m.color : 'text-white/60'}`}>{m.label}</p>
                            <p className="text-[10px] text-white/25 mt-0.5 truncate">
                              {m.id === 'none'  && 'Animated gradient — free'}
                              {m.id === 'dalle' && 'DALL·E 3 image per scene'}
                              {m.id === 'fal-ai/kling-video/v1.6/standard/text-to-video' && 'Kling AI · 5s · standard'}
                              {m.id === 'fal-ai/kling-video/v1.6/pro/text-to-video'      && 'Kling AI · 5–10s · pro'}
                              {m.id === 'fal-ai/kling-video/v2/master/text-to-video'     && 'Kling v2 · 5–10s · master'}
                            </p>
                          </div>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 border ${
                            active ? `${m.bgColor} ${m.color}` : 'bg-white/[0.04] text-white/25 border-white/[0.06]'
                          }`}>
                            {m.tag}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>

            {/* ── FOOTER ── */}
            <div className="flex-shrink-0 flex items-center justify-between px-8 py-5 border-t border-white/[0.06] bg-white/[0.01]">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl border border-white/[0.07] text-white/40 hover:text-white/70 hover:bg-white/[0.05] text-sm font-medium transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                className="flex items-center gap-2.5 px-8 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-teal-500 to-blue-600 text-white hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-teal-500/20"
              >
                <Sparkles className="h-4 w-4" />
                Generate Video
              </button>
            </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
