import { Loader2 } from 'lucide-react';
import { useModelConfig } from '../../hooks/useModelConfig';

export interface ModelPickerProps {
  channelId?: string;
  field: 'script_model' | 'voice_provider' | 'video_bg_provider';
  value: string;
  onChange: (v: string) => void;
  label?: string;
}

export function ModelPicker({ channelId, field, value, onChange, label }: ModelPickerProps) {
  const { providers, loading } = useModelConfig(channelId);

  const fieldMap: Record<typeof field, 'script_models' | 'voice_providers' | 'video_bg_providers'> = {
    script_model: 'script_models',
    voice_provider: 'voice_providers',
    video_bg_provider: 'video_bg_providers',
  };

  const options: string[] = providers ? (providers[fieldMap[field]] as string[]) : [];

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-dark-text-muted text-sm py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading options...</span>
      </div>
    );
  }

  return (
    <div>
      {label && <p className="text-sm font-medium text-dark-text mb-2">{label}</p>}
      <div className="grid grid-cols-3 gap-2">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-xl border transition-all px-3 py-2 text-sm text-left ${
              value === opt
                ? 'border-teal-500/40 bg-teal-500/[0.08] text-teal-300'
                : 'border-white/[0.07] bg-white/[0.02] text-dark-text-muted hover:border-white/[0.14] hover:bg-white/[0.04] hover:text-dark-text'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
