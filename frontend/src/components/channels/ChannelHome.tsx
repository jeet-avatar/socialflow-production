import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Settings, ToggleLeft, ToggleRight } from 'lucide-react';
import { getAuthHeaders } from '../../utils/getAuthToken';
import { API_BASE_URL } from '../../config/api';
import ReviewQueue from './ReviewQueue';
import TrendingFeed from './TrendingFeed';
import AutoPostDisclaimer from './AutoPostDisclaimer';

interface Channel {
  id: string; name: string; platform: string; niche?: string;
  auto_post: boolean; auto_post_disclaimer_accepted?: boolean;
  posting_frequency: string;
}

interface ChannelHomeProps {
  channelId: string;
  onBack: () => void;
  onOpenPipeline: (channelId: string) => void;
}

const PLATFORM_EMOJI: Record<string, string> = { youtube: '📺', instagram: '📸', tiktok: '🎵', facebook: '📘', linkedin: '💼' };

export default function ChannelHome({ channelId, onBack, onOpenPipeline }: ChannelHomeProps) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [reviewKey, setReviewKey] = useState(0);

  useEffect(() => {
    getAuthHeaders().then(headers =>
      fetch(`${API_BASE_URL}/channels/`, { headers })
        .then(r => r.json())
        .then((channels: Channel[]) => {
          const ch = channels.find(c => c.id === channelId);
          if (ch) setChannel(ch);
        })
        .catch((err) => console.error('ChannelHome: failed to load channel', err))
    );
  }, [channelId]);

  const toggleAutoPost = () => {
    if (!channel) return;
    if (!channel.auto_post) {
      if (!channel.auto_post_disclaimer_accepted) {
        setShowDisclaimer(true);
        return;
      }
    }
    getAuthHeaders().then(headers =>
      fetch(`${API_BASE_URL}/channels/${channelId}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_post: !channel.auto_post }),
      }).then(r => r.ok ? setChannel(c => c ? { ...c, auto_post: !c.auto_post } : c) : null)
        .catch((err) => console.error('ChannelHome: toggleAutoPost failed', err))
    );
  };

  const handleDisclaimerAccepted = () => {
    setShowDisclaimer(false);
    setChannel(c => c ? { ...c, auto_post: true, auto_post_disclaimer_accepted: true } : c);
  };

  if (!channel) return (
    <div className="flex justify-center items-center py-20">
      <div className="h-6 w-6 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="flex items-center gap-1 text-sm text-white/40 hover:text-white/70 transition-colors">
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-2 ml-2">
          <span className="text-lg">{PLATFORM_EMOJI[channel.platform] ?? '📡'}</span>
          <h2 className="text-lg font-semibold text-white">{channel.name}</h2>
          {channel.niche && <span className="text-xs text-white/30">· {channel.niche}</span>}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={toggleAutoPost}
            className="flex items-center gap-1.5 text-sm transition-colors"
            title={channel.auto_post ? 'Auto-post ON' : 'Auto-post OFF'}>
            {channel.auto_post
              ? <ToggleRight className="h-5 w-5 text-teal-400" />
              : <ToggleLeft className="h-5 w-5 text-white/30" />}
            <span className={channel.auto_post ? 'text-teal-400 text-xs' : 'text-white/30 text-xs'}>Auto-post</span>
          </button>
          <button onClick={() => onOpenPipeline(channelId)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-white/40 hover:text-white/70 hover:border-white/20 transition-all">
            <Settings className="h-3.5 w-3.5" /> Configure
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <ReviewQueue channelId={channelId} key={reviewKey} />
        </div>
        <TrendingFeed channelId={channelId} onVideoQueued={() => setReviewKey(k => k + 1)} />
      </div>

      <AnimatePresence>
        {showDisclaimer && (
          <AutoPostDisclaimer
            channelId={channelId}
            onAccepted={handleDisclaimerAccepted}
            onCancel={() => setShowDisclaimer(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
