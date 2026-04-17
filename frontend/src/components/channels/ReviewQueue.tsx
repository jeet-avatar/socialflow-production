import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
import { getAuthHeaders } from '../../utils/getAuthToken';
import { API_BASE_URL } from '../../config/api';
import VideoPreviewModal from './VideoPreviewModal';

interface QueuedVideo {
  id: string;
  job_id: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'expired' | 'posted';
  review_deadline?: string;
  created_at: string;
  source: 'scheduled' | 'trending_trigger';
  trending_topic?: string;
  output_url?: string;
  title?: string;
  dialogue?: string;
}

interface ReviewQueueProps {
  channelId: string;
}

function countdown(deadline: string): string {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`;
}

export default function ReviewQueue({ channelId }: ReviewQueueProps) {
  const [videos, setVideos] = useState<QueuedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewVideo, setPreviewVideo] = useState<QueuedVideo | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `${API_BASE_URL}/channels/${channelId}/videos?status=pending_review,expired,approved,posted`,
        { headers }
      );
      if (!res.ok) return;
      const data: QueuedVideo[] = await res.json();
      setVideos(data);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [channelId]);

  useEffect(() => {
    fetchVideos();
    const interval = setInterval(fetchVideos, 30_000);
    return () => clearInterval(interval);
  }, [fetchVideos]);

  const action = async (videoId: string, act: 'approve' | 'reject') => {
    setActioning(videoId);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `${API_BASE_URL}/channels/${channelId}/videos/${videoId}/${act}`,
        { method: 'POST', headers }
      );
      if (res.ok) await fetchVideos();
    } catch { /* non-fatal */ }
    finally { setActioning(null); }
  };

  const pending = videos.filter(v => v.status === 'pending_review');
  const expired = videos.filter(v => v.status === 'expired');
  const done = videos.filter(v => ['approved', 'posted'].includes(v.status));

  if (loading) return (
    <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-teal-400" /></div>
  );

  return (
    <div className="space-y-4">
      {/* Pending */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">Review Queue</h3>
        {pending.length > 0 && (
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400">
            {pending.length} awaiting
          </span>
        )}
      </div>

      <AnimatePresence>
        {pending.map(v => (
          <motion.div key={v.id}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex gap-3 mb-3">
              <div className="w-20 h-12 rounded-lg bg-gradient-to-br from-teal-500/20 to-teal-900/40 shrink-0 flex items-center justify-center text-lg">▶</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{v.title || v.trending_topic || 'Generated video'}</p>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-400">
                  <Clock className="h-3 w-3" />
                  {v.review_deadline ? countdown(v.review_deadline) : ''}
                </div>
                {v.dialogue && <p className="text-xs text-white/30 truncate mt-1">{v.dialogue}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              {v.output_url && (
                <button onClick={() => setPreviewVideo(v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.07] text-xs text-white/50 hover:text-white/80 hover:border-white/[0.14] transition-all">
                  <Eye className="h-3.5 w-3.5" /> Preview
                </button>
              )}
              <button onClick={() => action(v.id, 'reject')} disabled={actioning === v.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/25 bg-red-500/5 text-xs text-red-400 hover:border-red-500/40 transition-all disabled:opacity-40">
                <XCircle className="h-3.5 w-3.5" /> Reject
              </button>
              <button onClick={() => action(v.id, 'approve')} disabled={actioning === v.id}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-teal-500 to-teal-400 text-xs font-semibold text-black disabled:opacity-40 transition-opacity">
                {actioning === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                Approve & Post
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Expired */}
      {expired.length > 0 && (
        <div>
          <p className="text-xs text-white/30 uppercase tracking-wide mb-2">Expired — not posted</p>
          {expired.map(v => (
            <div key={v.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 mb-2 opacity-60">
              <div className="flex gap-3 items-center mb-2">
                <div className="w-16 h-10 rounded-lg bg-white/5 shrink-0 flex items-center justify-center text-sm">⏰</div>
                <p className="text-xs text-white/50 truncate flex-1">{v.title || 'Expired video'}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => action(v.id, 'reject')}
                  className="text-xs px-3 py-1.5 rounded-lg border border-white/[0.07] text-white/40 hover:text-white/60 transition-all">
                  Discard
                </button>
                <button onClick={() => action(v.id, 'approve')}
                  className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-teal-500/25 bg-teal-500/5 text-teal-400 hover:border-teal-500/40 transition-all">
                  Still post it →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History */}
      {done.length > 0 && (
        <div>
          <p className="text-xs text-white/30 uppercase tracking-wide mb-2">Posted / Approved</p>
          {done.slice(0, 5).map(v => (
            <div key={v.id} className="flex gap-3 items-center p-3 rounded-xl border border-white/[0.04] opacity-50 mb-1">
              <div className="w-12 h-8 rounded-lg bg-white/5 shrink-0 flex items-center justify-center text-sm">✓</div>
              <p className="text-xs text-white/40 truncate">{v.title || 'Video'}</p>
              <span className="ml-auto text-xs text-teal-400/60 capitalize">{v.status}</span>
            </div>
          ))}
        </div>
      )}

      {pending.length === 0 && expired.length === 0 && done.length === 0 && (
        <p className="text-sm text-white/30 text-center py-10">No videos yet. Your channel will generate content on its next scheduled run.</p>
      )}

      <AnimatePresence>
        {previewVideo && previewVideo.output_url && (
          <VideoPreviewModal
            outputUrl={previewVideo.output_url}
            title={previewVideo.title || 'Video Preview'}
            onClose={() => setPreviewVideo(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
