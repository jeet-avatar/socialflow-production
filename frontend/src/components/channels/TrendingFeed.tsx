import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, Zap } from 'lucide-react';
import { getAuthHeaders } from '../../utils/getAuthToken';
import { API_BASE_URL } from '../../config/api';

interface Topic { title: string; url: string; source: string; published_at: string; }

interface TrendingFeedProps {
  channelId: string;
  onVideoQueued: () => void; // called after successful from-trend dispatch → refresh queue
}

const REFRESH_OPTIONS = [
  { label: '1h', seconds: 3600 },
  { label: '6h', seconds: 21600 },
  { label: '24h', seconds: 86400 },
];

export default function TrendingFeed({ channelId, onVideoQueued }: TrendingFeedProps) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshIntervalSecs, setRefreshIntervalSecs] = useState(21600); // 6h default
  const [generating, setGenerating] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Set<string>>(new Set());

  const fetchTopics = async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/channels/${channelId}/trending`, { headers });
      if (res.ok) {
        const d = await res.json();
        setTopics(d.topics || []);
      }
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchTopics();
    const interval = setInterval(fetchTopics, refreshIntervalSecs * 1000);
    return () => clearInterval(interval);
  }, [channelId, refreshIntervalSecs]);

  const makeVideo = async (topic: Topic) => {
    setGenerating(topic.title);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/channels/${channelId}/videos/from-trend`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.title }),
      });
      if (res.ok) {
        setGenerated(prev => new Set([...prev, topic.title]));
        onVideoQueued();
      }
    } catch { /* non-fatal */ }
    finally { setGenerating(null); }
  };

  return (
    <div className="w-56 shrink-0 border-l border-white/[0.05] pl-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-xs font-semibold text-white">Trending Now</span>
      </div>
      <p className="text-xs text-white/30 mb-3">Topics in your niche right now</p>

      {loading ? (
        <div className="flex items-center gap-1.5 text-xs text-white/30 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : topics.length === 0 ? (
        <p className="text-xs text-white/20 py-4">No trends available right now.</p>
      ) : (
        <div className="space-y-3">
          {topics.map((t, i) => (
            <div key={i} className={`rounded-xl border p-3 transition-all ${i === 0 ? 'border-amber-500/20 bg-amber-500/5' : 'border-white/[0.06] bg-white/[0.02]'}`}>
              <p className={`text-xs font-medium leading-snug mb-1 ${i === 0 ? 'text-white' : 'text-white/60'}`}>
                {t.title.length > 60 ? t.title.slice(0, 60) + '…' : t.title}
              </p>
              {t.source && <p className="text-[10px] text-white/20 mb-2">{t.source}</p>}
              <button
                disabled={generating === t.title || generated.has(t.title)}
                onClick={() => makeVideo(t)}
                className="w-full py-1 rounded-lg text-[10px] border transition-all disabled:opacity-40
                  border-teal-500/30 bg-teal-500/5 text-teal-400 hover:border-teal-500/50 hover:bg-teal-500/10">
                {generating === t.title ? (
                  <span className="flex items-center justify-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Queuing…</span>
                ) : generated.has(t.title) ? (
                  <span className="flex items-center justify-center gap-1"><Zap className="h-3 w-3" /> Queued ✓</span>
                ) : '+ Make video'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Refresh picker */}
      <div className="mt-4 pt-3 border-t border-white/[0.05]">
        <p className="text-[10px] text-white/30 mb-1.5">Refresh every</p>
        <div className="flex gap-1">
          {REFRESH_OPTIONS.map(opt => (
            <button key={opt.label} onClick={() => setRefreshIntervalSecs(opt.seconds)}
              className={`flex-1 py-1 rounded-lg text-[10px] border transition-all ${refreshIntervalSecs === opt.seconds ? 'border-teal-500/40 bg-teal-500/10 text-teal-400' : 'border-white/[0.07] text-white/30 hover:border-white/[0.14]'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <button onClick={fetchTopics} className="mt-2 flex items-center gap-1 text-[10px] text-white/20 hover:text-white/40 transition-colors">
        <RefreshCw className="h-3 w-3" /> Refresh now
      </button>
    </div>
  );
}
