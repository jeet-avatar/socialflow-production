import { motion } from 'framer-motion';
import { X } from 'lucide-react';

interface VideoPreviewModalProps {
  outputUrl: string;
  title: string;
  onClose: () => void;
}

export default function VideoPreviewModal({ outputUrl, title, onClose }: VideoPreviewModalProps) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#0d1117] border border-white/[0.08] rounded-2xl overflow-hidden w-full max-w-xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <h3 className="text-sm font-medium text-white truncate pr-4">{title}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4">
          <video
            src={outputUrl}
            controls
            autoPlay
            className="w-full rounded-xl bg-black aspect-video"
          />
        </div>
      </motion.div>
    </div>
  );
}
