import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  TargetDuration, VideoStudioMode,
  StudioScene, StudioAnalyzeResult, StudioError,
} from './videoStudioTypes';
import { getAuthHeaders } from '../../utils/getAuthToken';
import { API_BASE_URL } from '../../config/api';
import { BGM_TRACKS, DEFAULT_BGM_ID, DEFAULT_VOICE_ID, type VoiceId, type BgmId } from '../campaign/campaignConstants';
import { pollRenderProgress } from '../campaign/campaignApi';

// ── Draft persistence ─────────────────────────────────────────────────────────
const DRAFT_KEY = 'socialflow_vs_draft';

function loadDraft(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch { return {}; }
}

function saveDraft(data: Record<string, unknown>) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch { /* quota */ }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

// ── Scene duration enforcement ────────────────────────────────────────────────
// Ensures each scene is ≤ MAX_SCENE_DURATION seconds and there are enough
// scenes to cover the full voiceover (ceil(voiceoverDur / MAX_SCENE_DURATION)).
// 10s matches Kling's maximum clip duration, preventing unnecessary duplication
// (e.g. a short 8.6s video now stays as 1 scene instead of being split into 2).
const MAX_SCENE_DURATION = 10;

function enforceSceneDurations(scenes: StudioScene[], voiceoverDur: number): StudioScene[] {
  if (scenes.length === 0) return scenes;

  const totalDur = voiceoverDur > 0 ? voiceoverDur : scenes.length * MAX_SCENE_DURATION;
  const minScenes = Math.max(scenes.length, Math.ceil(totalDur / MAX_SCENE_DURATION));

  // Expand scene list by repeating source scenes if we need more.
  // Extra scenes beyond the original count get their AI-generated content cleared
  // so the backend produces fresh/varied prompts for each duplicate.
  const expanded: StudioScene[] = [];
  for (let i = 0; i < minScenes; i++) {
    const src = scenes[i % scenes.length];
    const isExtra = i >= scenes.length;
    expanded.push({
      ...src,
      render_state: 'idle' as const,
      rendered_url: undefined,
      background_video_url: undefined,
      background_image_url: undefined,
      // Clear AI-generated prompt on duplicates so the backend generates a unique one
      ...(isExtra ? { video_prompt: undefined } : {}),
    });
  }

  // Distribute duration evenly so no scene exceeds MAX_SCENE_DURATION
  const evenDur = totalDur / minScenes;
  let cursor = 0;
  return expanded.map((s, i) => {
    const start = cursor;
    const end = parseFloat((start + evenDur).toFixed(3));
    cursor = end;
    return { ...s, start, end, duration_seconds: parseFloat(evenDur.toFixed(3)), segment_index: i };
  });
}

export function useVideoStudioState() {
  // Load persisted draft once
  const [_draft] = useState(() => loadDraft());

  // ── Status flags ──────────────────────────────────────────────────────────
  const [isGenerating,     setIsGenerating]     = useState(false);
  const [generatingStatus, setGeneratingStatus] = useState('');
  const [isRendering,      setIsRendering]      = useState(false);
  const [showRenderModal,  setShowRenderModal]  = useState(false);

  // ── Config ────────────────────────────────────────────────────────────────
  const [targetDuration, setTargetDuration] = useState<TargetDuration>((_draft.targetDuration as TargetDuration) ?? 'medium');
  const [videoMode,      setVideoMode]      = useState<VideoStudioMode>((_draft.videoMode as VideoStudioMode) ?? 'dalle');
  const [prompt,         setPrompt]         = useState((_draft.prompt as string) ?? '');
  const [companyName,    setCompanyName]    = useState((_draft.companyName as string) ?? '');
  const [senderMode,     setSenderMode]     = useState<'personal' | 'company'>((_draft.senderMode as 'personal' | 'company') ?? 'personal');

  // ── Content ───────────────────────────────────────────────────────────────
  const [dialogue,      setDialogue]      = useState((_draft.dialogue as string) ?? '');
  const [socialCaption, setSocialCaption] = useState((_draft.socialCaption as string) ?? '');
  const [videoTitle,    setVideoTitle]    = useState((_draft.videoTitle as string) ?? '');

  // ── Scenes ────────────────────────────────────────────────────────────────
  const [analyzeResult,       setAnalyzeResult]       = useState<StudioAnalyzeResult | null>((_draft.analyzeResult as StudioAnalyzeResult) ?? null);
  const [editedScenes,        setEditedScenes]        = useState<StudioScene[]>((_draft.editedScenes as StudioScene[]) ?? []);
  const [selectedSceneIndex,  setSelectedSceneIndex]  = useState((_draft.selectedSceneIndex as number) ?? 0);
  // Track what was used when analyze ran so we can detect user edits before render
  const [analyzedDialogue,    setAnalyzedDialogue]    = useState((_draft.dialogue as string) ?? '');
  const [analyzedVoiceId,     setAnalyzedVoiceId]     = useState<VoiceId>((_draft.voiceId as VoiceId) ?? DEFAULT_VOICE_ID);

  // ── Audio / Display ───────────────────────────────────────────────────────
  const [voiceId,      setVoiceId]      = useState<VoiceId>((_draft.voiceId as VoiceId) ?? DEFAULT_VOICE_ID);
  const [bgmId,        setBgmId]        = useState<BgmId>((_draft.bgmId as BgmId) ?? DEFAULT_BGM_ID);
  const [showCaptions, setShowCaptions] = useState((_draft.showCaptions as boolean) ?? true);
  const [voiceVolume,  setVoiceVolume]  = useState((_draft.voiceVolume as number) ?? 0.8);
  const [bgmVolume,    setBgmVolume]    = useState((_draft.bgmVolume as number) ?? 0.3);
  const [captionStyle,    setCaptionStyle]    = useState<'pill' | 'bar' | 'outline' | 'highlight'>((_draft.captionStyle as 'pill' | 'bar' | 'outline' | 'highlight') ?? 'pill');
  const [captionFontSize, setCaptionFontSize] = useState<'sm' | 'md' | 'lg'>((_draft.captionFontSize as 'sm' | 'md' | 'lg') ?? 'md');

  // ── Render output ─────────────────────────────────────────────────────────
  const [videoUrl,       setVideoUrl]       = useState((_draft.videoUrl as string) ?? '');
  const [fullVideoUrl,   setFullVideoUrl]   = useState((_draft.fullVideoUrl as string) ?? '');
  const [showResult,     setShowResult]     = useState((_draft.showResult as boolean) ?? !!((_draft.fullVideoUrl as string)));
  const [renderProgress, setRenderProgress] = useState<{ percent: number; stage: string; detail: string } | null>(null);

  // ── Playhead ──────────────────────────────────────────────────────────────
  const [playheadTime, setPlayheadTime] = useState(0);
  const [isPlaying,    setIsPlaying]    = useState(false);

  // ── Error ─────────────────────────────────────────────────────────────────
  const [error, setError] = useState<StudioError | null>(null);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const abortRef       = useRef<AbortController | null>(null);
  const renderJobIdRef = useRef<string>('');

  // ── Scene helpers ─────────────────────────────────────────────────────────
  const updateScene = useCallback((index: number, updates: Partial<StudioScene>) => {
    setEditedScenes(prev => prev.map((s, i) => i === index ? { ...s, ...updates } : s));
  }, []);

  const updateSceneMode = useCallback((index: number, mode: VideoStudioMode | 'template') => {
    setEditedScenes(prev => prev.map((s, i) =>
      i === index ? { ...s, scene_mode: mode, render_state: 'idle', rendered_url: undefined } : s
    ));
  }, []);

  // ── Generate: script + analyze ────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setError({ message: 'Please describe your product or company.', retryable: false });
      return;
    }
    
    setError(null);
    setIsGenerating(true);
    setGeneratingStatus('Writing your script…');
    setShowResult(false);
    setFullVideoUrl('');
    setPlayheadTime(0);
    setIsPlaying(false);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const headers = await getAuthHeaders();

      // 1a. Generate dialogue
      const genRes = await fetch(`${API_BASE_URL}/generate`, {
        method: 'POST', headers, signal: controller.signal,
        body: JSON.stringify({ prompt: prompt.trim(), sender_mode: senderMode, target_duration: targetDuration }),
      });
      if (!genRes.ok) throw new Error(`Script generation failed (${genRes.status})`);
      const genData = await genRes.json();
      if (genData.error) throw new Error(genData.error);

      const newDialogue: string = genData.video_dialogue || '';
      setDialogue(newDialogue);
      setSocialCaption(genData.social_caption || '');
      setVideoTitle(genData.video_title || '');

      // 1b. Analyze → scenes + voiceover
      setGeneratingStatus('Planning your scenes…');
      const bgmUrl = BGM_TRACKS.find(t => t.id === bgmId)?.url ?? '';

      const analyzeRes = await fetch(`${API_BASE_URL}/video-remotion/analyze`, {
        method: 'POST', headers, signal: controller.signal,
        body: JSON.stringify({
          dialogue: newDialogue,
          company_name: companyName.trim() || prompt.slice(0, 60),
          client_logo_url: '',
          user_logo_url: '',
          voice_id: voiceId || '',
          bgm: bgmUrl,
          target_duration: targetDuration,
          // Used for prompt generation (time + purpose + model).
          video_mode: videoMode,
        }),
      });
      if (!analyzeRes.ok) throw new Error(`Scene planning failed (${analyzeRes.status})`);
      const analyzeData: StudioAnalyzeResult & { error?: string } = await analyzeRes.json();
      if (!analyzeData.success || analyzeData.error) throw new Error(analyzeData.error || 'Scene planning failed');

      setAnalyzeResult(analyzeData);
      setAnalyzedDialogue(newDialogue);
      setAnalyzedVoiceId(voiceId);
      const rawScenes = (analyzeData.scene_descriptors || []).map(s => ({
        ...s,
        scene_mode: videoMode,
        render_state: 'idle' as const,
        rendered_url: undefined,
        particle_intensity: 0,
        pulse_rings: false,
        template_blend: 'normal' as const,
        transition_out: 'cut',
      }));
      const voiceoverDur = analyzeData.voiceover_duration_seconds || 0;
      setEditedScenes(enforceSceneDurations(rawScenes, voiceoverDur));
      setSelectedSceneIndex(0);
      globalThis.dispatchEvent(new CustomEvent('app-notification', {
        detail: { title: 'Script ready', message: 'Scene plan generated — review and hit Render when ready.', type: 'info' },
      }));
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError({ message: msg, retryable: true, onRetry: () => { void handleGenerate(); } });
    } finally {
      setIsGenerating(false);
      setGeneratingStatus('');
    }
   
  }, [prompt, companyName, senderMode, targetDuration, bgmId, voiceId, videoMode]);

  // ── Per-scene render ──────────────────────────────────────────────────────
  const handleRenderScene = useCallback(async (index: number) => {
    setEditedScenes(prev => prev.map((s, i) =>
      i === index ? { ...s, render_state: 'rendering' as const, render_error: undefined } : s
    ));
    try {
      const headers = await getAuthHeaders();
      const scene = editedScenes[index];
      const sceneMode = scene.scene_mode ?? videoMode;
      let prompt = scene.video_prompt || scene.headline || '';

      // Keep the prompt aligned with the *current* per-scene settings (especially if
      // the user changed background model after analysis).
      const inferModelLabel = (mode: string): string => {
        if (mode === 'dalle') return 'DALL·E 3';
        if (mode === 'none' || mode === 'template') return 'Gradient (no AI background)';
        if (mode.includes('v1.6/standard')) return 'Kling Std';
        if (mode.includes('v1.6/pro')) return 'Kling Pro';
        if (mode.includes('v2/master')) return 'Kling Master';
        return 'Kling Video';
      };

      const durationSeconds =
        typeof scene.duration_seconds === 'number'
          ? scene.duration_seconds
          : (typeof scene.end === 'number' && typeof scene.start === 'number' ? (scene.end - scene.start) : undefined);

      const safeDuration = typeof durationSeconds === 'number' && durationSeconds > 0 ? durationSeconds : 5;
      const purpose =
        typeof scene.purpose === 'string'
          ? scene.purpose
          : (index === 0 ? 'Hook / Attention' : (index === editedScenes.length - 1 ? 'CTA / Closing' : 'Value / Feature'));
      const modelLabel = inferModelLabel(sceneMode);

      const headerPrefix = `Scene purpose: ${purpose}. Allocated motion time: ${safeDuration.toFixed(1)} seconds. Background model selected: ${modelLabel}.`;
      if (/Scene purpose:/i.test(prompt)) {
        prompt = prompt
          .replace(/Scene purpose:\s*[^.]*\.?/i, `Scene purpose: ${purpose}.`)
          .replace(/Allocated motion time:\s*[^.]*\.?/i, `Allocated motion time: ${safeDuration.toFixed(1)} seconds.`)
          .replace(/Background model selected:\s*[^.]*\.?/i, `Background model selected: ${modelLabel}.`);
      } else {
        prompt = `${headerPrefix} ${prompt}`;
      }

      // DALL-E image background
      if (sceneMode === 'dalle') {
        const res = await fetch(`${API_BASE_URL}/video-remotion/render-background-image`, {
          method: 'POST', headers,
          body: JSON.stringify({ scene_prompt: prompt }),
        });
        if (!res.ok) throw new Error(`DALL-E render failed (${res.status})`);
        const data = await res.json();
        if (!data.success || !data.image_url) throw new Error(data.error || 'No image URL returned');
        // Store as background_image_url so backend enrichment skips regeneration
        setEditedScenes(prev => prev.map((s, i) =>
          i === index ? {
            ...s,
            render_state: 'rendered' as const,
            rendered_url: data.image_url,
            background_image_url: data.image_url,
            background_video_url: undefined,
          } : s
        ));
        return;
      }

      // Kling AI video background (or fallback for 'none'/'template' — shouldn't happen)
      const falModel = sceneMode !== 'none' && sceneMode !== 'template'
        ? sceneMode
        : 'fal-ai/kling-video/v1.6/standard/text-to-video';

      const res = await fetch(`${API_BASE_URL}/video-remotion/render-clip`, {
        method: 'POST', headers,
        body: JSON.stringify({
          scene_prompt: prompt,
          fal_model: falModel,
          scene_duration_seconds: typeof scene?.duration_seconds === 'number'
            ? scene.duration_seconds
            : (typeof scene?.end === 'number' && typeof scene?.start === 'number' ? (scene.end - scene.start) : undefined),
        }),
      });
      if (!res.ok) throw new Error(`Render failed (${res.status})`);
      const data = await res.json();
      if (!data.success || !data.video_url) throw new Error(data.error || 'No video URL returned');

      // Store as background_video_url so backend enrichment skips regeneration
      setEditedScenes(prev => prev.map((s, i) =>
        i === index ? {
          ...s,
          render_state: 'rendered' as const,
          rendered_url: data.video_url,
          background_video_url: data.video_url,
          background_image_url: undefined,
        } : s
      ));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Render failed';
      setEditedScenes(prev => prev.map((s, i) =>
        i === index ? { ...s, render_state: 'error' as const, render_error: msg } : s
      ));
    }
   
  }, [editedScenes, videoMode]);

  // ── Generate AI background prompt for a scene ─────────────────────────────
  const handleGeneratePrompt = useCallback(async (index: number) => {
    const scene = editedScenes[index];
    if (!scene) return;
    setGeneratingPrompt(true);
    try {
      const headers = await getAuthHeaders();
      const sceneMode = scene.scene_mode ?? videoMode;
      const res = await fetch(`${API_BASE_URL}/video-remotion/generate-scene-prompt`, {
        method: 'POST', headers,
        body: JSON.stringify({
          headline: scene.headline || '',
          subtext: scene.subtext || '',
          scene_number: index + 1,
          total_scenes: editedScenes.length,
          scene_mode: sceneMode,
          template: scene.template || '',
        }),
      });
      if (!res.ok) throw new Error(`Prompt generation failed (${res.status})`);
      const data = await res.json();
      if (data.prompt) {
        setEditedScenes(prev => prev.map((s, i) =>
          i === index ? { ...s, video_prompt: data.prompt } : s
        ));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Prompt generation failed';
      setError({ message: msg, retryable: false });
    } finally {
      setGeneratingPrompt(false);
    }
   
  }, [editedScenes, videoMode]);

  // ── Full render ───────────────────────────────────────────────────────────
  const handleRender = useCallback(async () => {
    if (!analyzeResult) return;
    setError(null);
    setIsRendering(true);
    setShowRenderModal(true);
    setVideoUrl('');
    setFullVideoUrl('');
    setShowResult(false);
    setRenderProgress({ percent: 0, stage: 'Starting…', detail: '' });

    const controller = new AbortController();
    abortRef.current = controller;
    const jobId = crypto.randomUUID();
    renderJobIdRef.current = jobId;

    // 'dalle' uses OpenAI (use_veo3=false); only actual fal.ai model IDs need use_veo3=true
    const isAi = videoMode !== 'template' && videoMode !== 'dalle';
    const TIMEOUT_MS = 5 * 60 * 1000;
    const deadline = Date.now() + TIMEOUT_MS;

    let polling = true;
    const poll = async () => {
      while (polling && Date.now() < deadline) {
        const p = await pollRenderProgress(jobId);
        setRenderProgress(p);
        if (p.percent >= 100) break;
        await new Promise(r => setTimeout(r, 2000));
      }
    };
    void poll();

    try {
      const headers = await getAuthHeaders();
      const bgmUrl = BGM_TRACKS.find(t => t.id === bgmId)?.url ?? '';

      // If the user edited the dialogue or changed voice since analyze ran,
      // omit the precomputed voiceover so the backend regenerates it from scratch.
      const audioChanged = dialogue !== analyzedDialogue || voiceId !== analyzedVoiceId;

      // Ensure scene_descriptors count matches subtitle_segments so the backend
      // renders the correct number of scenes with the user's edited template/settings.
      const subtitleCount = analyzeResult.subtitle_segments?.length ?? 0;
      const scenesToRender: StudioScene[] =
        subtitleCount > 0 && subtitleCount !== editedScenes.length
          ? Array.from({ length: subtitleCount }, (_, i) => editedScenes[i % editedScenes.length])
          : editedScenes;

      const res = await fetch(`${API_BASE_URL}/video-remotion`, {
        method: 'POST', headers, signal: controller.signal,
        body: JSON.stringify({
          dialogue,
          company_name: companyName.trim() || prompt.slice(0, 60),
          video_title: videoTitle,
          social_caption: socialCaption,
          voice_id: voiceId || '',
          show_captions: showCaptions,
          job_id: jobId,
          use_veo3: isAi,
          fal_model: isAi ? videoMode : undefined,
          // Send empty strings when audio changed so backend regenerates voiceover/subtitles
          voiceover_url: audioChanged ? '' : analyzeResult.voiceover_url,
          subtitle_segments: audioChanged ? [] : analyzeResult.subtitle_segments,
          caption_segments: audioChanged ? [] : analyzeResult.caption_segments,
          voiceover_duration_seconds: audioChanged ? 0 : analyzeResult.voiceover_duration_seconds,
          scene_descriptors: scenesToRender,
          client_logo_url: analyzeResult.client_logo_url,
          user_logo_url: analyzeResult.user_logo_url,
          bgm: bgmUrl,
        }),
      });
      polling = false;
      if (!res.ok) throw new Error(`Render failed (${res.status})`);
      const data = await res.json();
      if (!data.success || !data.video_url) throw new Error(data.error || 'Video generation failed');

      // Update edited scenes with the background URLs the backend generated during render.
      // This allows the editor to show the correct backgrounds when the user goes back to editing.
      if (data.scene_descriptors && Array.isArray(data.scene_descriptors)) {
        setEditedScenes(prev => prev.map((scene, i) => {
          const rendered = data.scene_descriptors[i];
          if (!rendered) return scene;
          const bgVideoUrl: string = rendered.background_video_url || '';
          const bgImageUrl: string = rendered.background_image_url || '';
          const renderedUrl = bgVideoUrl || bgImageUrl;
          if (!renderedUrl) return scene;

          // Resolve scene_mode so the canvas knows whether to render <video> or <img>
          let resolvedMode = scene.scene_mode;
          if (bgVideoUrl) {
            const isKling = scene.scene_mode && scene.scene_mode !== 'none' && scene.scene_mode !== 'template' && scene.scene_mode !== 'dalle';
            resolvedMode = isKling ? scene.scene_mode : 'fal-ai/kling-video/v1.6/standard/text-to-video';
          } else if (bgImageUrl) {
            resolvedMode = 'dalle';
          }

          return {
            ...scene,
            background_video_url: bgVideoUrl || undefined,
            background_image_url: bgImageUrl || undefined,
            render_state: 'rendered' as const,
            rendered_url: renderedUrl,
            scene_mode: resolvedMode,
          };
        }));
      }

      setVideoUrl(data.video_url);
      setFullVideoUrl(data.video_url);
      setRenderProgress({ percent: 100, stage: 'Done!', detail: '' });
      globalThis.dispatchEvent(new CustomEvent('app-notification', {
        detail: { title: 'Video ready', message: `"${videoTitle || companyName || 'Your video'}" finished rendering.`, type: 'success' },
      }));
      setTimeout(() => {
        setShowRenderModal(false);
        setShowResult(true);
      }, 1200);
    } catch (err: unknown) {
      polling = false;
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Render failed.';
      globalThis.dispatchEvent(new CustomEvent('app-notification', {
        detail: { title: 'Render failed', message: msg, type: 'error' },
      }));
      setError({ message: msg, retryable: true, onRetry: () => { void handleRender(); } });
      setShowRenderModal(false);
    } finally {
      setIsRendering(false);
    }
   
  }, [analyzeResult, editedScenes, dialogue, analyzedDialogue, analyzedVoiceId, videoTitle, socialCaption, prompt, companyName, voiceId, bgmId, showCaptions, videoMode]);

  const cancelGenerate = useCallback(() => {
    abortRef.current?.abort();
    setIsGenerating(false);
    setGeneratingStatus('');
  }, []);

  const cancelRender = useCallback(() => {
    abortRef.current?.abort();
    setIsRendering(false);
    setRenderProgress(null);
    if (!videoUrl) setShowRenderModal(false);
  }, [videoUrl]);

  const reset = useCallback(() => {
    clearDraft();
    setIsGenerating(false); setIsRendering(false); setShowRenderModal(false);
    setGeneratingStatus(''); setPrompt(''); setCompanyName('');
    setDialogue(''); setSocialCaption(''); setVideoTitle('');
    setAnalyzeResult(null); setEditedScenes([]); setSelectedSceneIndex(0);
    setVideoUrl(''); setFullVideoUrl(''); setShowResult(false);
    setRenderProgress(null); setError(null);
    setPlayheadTime(0); setIsPlaying(false);
  }, []);

  // ── Load a video from the library (result view) ───────────────────────────
  const loadFromLibrary = useCallback((video: {
    video_url: string; title: string;
    social_caption?: string; dialogue?: string;
  }) => {
    setVideoUrl(video.video_url);
    setFullVideoUrl(video.video_url);
    setVideoTitle(video.title);
    setSocialCaption(video.social_caption ?? '');
    if (video.dialogue) setDialogue(video.dialogue);
    setShowResult(true);
  }, []);

  // ── Load a video into the editor for re-editing (no result view) ──────────
  const loadForEdit = useCallback((video: {
    video_url: string; title: string;
    social_caption?: string; dialogue?: string;
  }) => {
    setVideoUrl(video.video_url);
    setFullVideoUrl('');
    setVideoTitle(video.title);
    setSocialCaption(video.social_caption ?? '');
    if (video.dialogue) setDialogue(video.dialogue);
    // Reset scene/analysis state so the editor reflects this video's content
    setEditedScenes([]);
    setAnalyzeResult(null);
    setSelectedSceneIndex(0);
    setShowResult(false);
  }, [setAnalyzeResult]);

  // ── Persist draft to localStorage ─────────────────────────────────────────
  useEffect(() => {
    saveDraft({
      prompt, companyName, senderMode, targetDuration, videoMode,
      dialogue, socialCaption, videoTitle,
      voiceId, bgmId, showCaptions, voiceVolume, bgmVolume,
      captionStyle, captionFontSize,
      editedScenes, analyzeResult,
      videoUrl, fullVideoUrl, showResult,
      selectedSceneIndex,
    });
  }, [
    prompt, companyName, senderMode, targetDuration, videoMode,
    dialogue, socialCaption, videoTitle,
    voiceId, bgmId, showCaptions, voiceVolume, bgmVolume,
    captionStyle, captionFontSize,
    editedScenes, analyzeResult,
    videoUrl, fullVideoUrl, showResult,
    selectedSceneIndex,
  ]);

  return {
    // status
    isGenerating, generatingStatus, isRendering,
    showRenderModal, setShowRenderModal,
    // config
    targetDuration, setTargetDuration,
    videoMode, setVideoMode,
    prompt, setPrompt,
    companyName, setCompanyName,
    senderMode, setSenderMode,
    // content
    dialogue, setDialogue,
    socialCaption, videoTitle,
    // scenes
    analyzeResult,
    editedScenes, updateScene, updateSceneMode,
    selectedSceneIndex, setSelectedSceneIndex,
    // audio
    voiceId, setVoiceId,
    bgmId, setBgmId,
    showCaptions, setShowCaptions,
    voiceVolume, setVoiceVolume,
    bgmVolume, setBgmVolume,
    captionStyle, setCaptionStyle,
    captionFontSize, setCaptionFontSize,
    // render output
    videoUrl, fullVideoUrl,
    showResult, setShowResult,
    renderProgress,
    // error
    error, setError,
    // playhead
    playheadTime, setPlayheadTime,
    isPlaying, setIsPlaying,
    // actions
    handleGenerate, handleRender, handleRenderScene,
    handleGeneratePrompt, generatingPrompt,
    cancelGenerate, cancelRender, reset, loadFromLibrary, loadForEdit,
  };
}
