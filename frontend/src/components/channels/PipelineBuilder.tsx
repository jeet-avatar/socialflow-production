import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Save, Loader2, CheckCircle } from 'lucide-react';
import { useModelConfig } from '../../hooks/useModelConfig';
import { ModelPicker } from './ModelPicker';

interface PipelineBuilderProps {
  channelId: string;        // always a non-empty string — Dashboard gates rendering with activePipelineChannel check
  onClose: () => void;
}

export default function PipelineBuilder({ channelId, onClose }: PipelineBuilderProps) {
  const { config, updateConfig, loading, error } = useModelConfig(channelId);

  const [scriptModel, setScriptModel] = useState('');
  const [voiceProvider, setVoiceProvider] = useState('');
  const [videoBgProvider, setVideoBgProvider] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (config) {
      setScriptModel(config.script_model ?? '');
      setVoiceProvider(config.voice_provider ?? '');
      setVideoBgProvider(config.video_bg_provider ?? '');
    }
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateConfig({
        channel_id: channelId,
        script_model: scriptModel,
        voice_provider: voiceProvider,
        video_bg_provider: videoBgProvider,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen bg-dark-bg px-8 py-6 max-w-[1600px] mx-auto"
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-dark-text-muted hover:text-dark-text transition-colors text-sm font-medium"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Channels
        </button>

        <h2 className="text-xl font-display font-semibold text-dark-text">Pipeline Configuration</h2>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-teal-500 to-cyan-500 text-white hover:from-teal-400 hover:to-cyan-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-glow-teal"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : saveSuccess ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-300" />
              Saved!
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save
            </>
          )}
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-6">
          {[0, 1, 2].map(i => (
            <div key={i} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 space-y-3">
              <div className="bg-white/[0.04] rounded h-4 w-32 animate-pulse" />
              <div className="flex gap-2">
                <div className="bg-white/[0.04] rounded h-8 w-24 animate-pulse" />
                <div className="bg-white/[0.04] rounded h-8 w-24 animate-pulse" />
                <div className="bg-white/[0.04] rounded h-8 w-24 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-6 text-red-400 text-sm">
          Failed to load pipeline configuration: {error}
        </div>
      )}

      {/* Config sections */}
      {!loading && !error && (
        <div className="space-y-6">
          {/* Script Model */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
            <ModelPicker
              channelId={channelId}
              field="script_model"
              value={scriptModel}
              onChange={setScriptModel}
              label="Script Model"
            />
          </div>

          {/* Voice Provider */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
            <ModelPicker
              channelId={channelId}
              field="voice_provider"
              value={voiceProvider}
              onChange={setVoiceProvider}
              label="Voice Provider"
            />
          </div>

          {/* Video Background */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
            <ModelPicker
              channelId={channelId}
              field="video_bg_provider"
              value={videoBgProvider}
              onChange={setVideoBgProvider}
              label="Video Background"
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
