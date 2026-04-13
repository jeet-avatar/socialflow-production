// frontend/src/hooks/useModelConfig.ts
import { useState, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface Providers {
  script_models: string[];
  voice_providers: string[];
  video_bg_providers: string[];
  research_providers: string[];
}

interface ModelConfigPayload {
  channel_id?: string | null;
  script_model?: string;
  voice_provider?: string;
  voice_id?: string;
  video_bg_provider?: string;
  research_provider?: string;
}

export function useModelConfig(channelId?: string) {
  const { getToken } = useAuth();
  const [providers, setProviders] = useState<Providers | null>(null);
  const [config, setConfig] = useState<ModelConfigPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        // No auth needed for providers
        const provRes = await fetch(`${API_BASE}/model-config/providers`);
        const provData = await provRes.json();

        // Auth required for saved config
        const token = await getToken();
        const cfgUrl = channelId
          ? `${API_BASE}/model-config/${channelId}`
          : `${API_BASE}/model-config`;
        const cfgRes = await fetch(cfgUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const cfgData = await cfgRes.json();

        if (!cancelled) {
          setProviders(provData);
          setConfig(cfgData);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [channelId]);

  async function updateConfig(payload: ModelConfigPayload) {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/model-config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const updated = await res.json();
    setConfig(updated);
    return updated;
  }

  return { providers, config, updateConfig, loading, error };
}
