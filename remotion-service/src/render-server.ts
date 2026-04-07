/**
 * Remotion Render Server
 * Express HTTP server that accepts render jobs and returns rendered MP4 file paths.
 * Listens on port 3001.
 *
 * POST /render
 *   Body: RenderRequest JSON
 *   Returns: { success: true, output_path: string }
 *
 * GET /health
 *   Returns: { status: 'ok' }
 */

import express, { Request, Response } from 'express';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = 3001;
const ENTRY_POINT = path.resolve(__dirname, '../src/index.tsx');

export interface SubtitleSegment {
  text: string;
  start: number;
  end: number;
}

export interface TextLayoverItem {
  text: string;
  start_time: number;
  duration: number;
}

export interface TemplateSceneSpec {
  segment_index?: number;
  segment_indices?: number[];
  template: string;
  headline: string;
  subtext?: string;
  accent_color: string;
  icon?: string;
  transition_out: 'cross_fade' | 'flash' | 'zoom_out' | 'none';
  description?: string;
  background_image_url?: string;   // DALL-E generated cinematic background
  background_video_url?: string;   // Kling/fal.ai generated video clip (preferred)
  background_opacity?: number;     // 0.1–1.0, default 0.85 image / 1.0 video
  particle_intensity?: number;     // 0–1, default 1 (0 = off)
  pulse_rings?: boolean;           // default true
  template_blend?: 'screen' | 'normal';
}

export interface RenderRequest {
  voiceover_url: string;
  bgm_url: string;
  client_logo_url: string;
  user_logo_url: string;
  company_name?: string;
  sender_name?: string;
  cta_text?: string;
  template_video_url?: string;
  subtitle_segments: SubtitleSegment[];
  caption_segments?: SubtitleSegment[];
  scene_descriptors: TemplateSceneSpec[];
  text_layovers: TextLayoverItem[];
  voiceover_duration_seconds: number;
  show_captions?: boolean;
  output_filename?: string;
}

// Bundle is cached per process lifetime — restart the server to pick up theme changes.
// In dev: set REMOTION_NO_CACHE=1 to always rebuild.
let bundleCache: string | null = null;

async function getBundle(): Promise<string> {
  if (bundleCache && !process.env.REMOTION_NO_CACHE) return bundleCache;

  console.log('[remotion] Bundling compositions...');
  bundleCache = await bundle({
    entryPoint: ENTRY_POINT,
    onProgress: (progress) => {
      if (progress % 25 === 0) {
        console.log(`[remotion] Bundle progress: ${progress}%`);
      }
    },
  });
  console.log('[remotion] Bundle ready.');
  return bundleCache;
}

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'remotion-render-server' });
});

// Main render endpoint
app.post('/render', async (req: Request, res: Response) => {
  const body = req.body as RenderRequest;

  const {
    voiceover_url,
    bgm_url,
    client_logo_url,
    user_logo_url,
    company_name,
    sender_name,
    cta_text,
    template_video_url,
    subtitle_segments = [],
    caption_segments = [],
    scene_descriptors = [],
    text_layovers = [],
    voiceover_duration_seconds,
    show_captions = true,
    output_filename,
  } = body;

  if (!voiceover_url || !voiceover_duration_seconds) {
    res.status(400).json({ success: false, error: 'voiceover_url and voiceover_duration_seconds are required' });
    return;
  }

  const FPS = 30;
  const TAIL_BUFFER_FRAMES = 30; // 1s buffer so audio never outlasts video (pydub may under-measure by ~0.5s)
  const totalDurationInFrames = Math.ceil(voiceover_duration_seconds * FPS) + TAIL_BUFFER_FRAMES;

  const filename = output_filename || `socialflow_${Date.now()}.mp4`;
  const outputPath = path.join(os.tmpdir(), filename);

  try {
    console.log(`[remotion] Starting render: ${filename}`);
    console.log(`[remotion]   Duration: ${voiceover_duration_seconds}s = ${totalDurationInFrames} frames`);
    console.log(`[remotion]   Subtitles: ${subtitle_segments.length} segments`);
    console.log(`[remotion]   Scene descriptors: ${scene_descriptors.length} items`);

    const bundlePath = await getBundle();

    const inputProps = {
      voiceover_url,
      bgm_url,
      client_logo_url,
      user_logo_url,
      company_name,
      sender_name,
      cta_text,
      template_video_url: template_video_url || '',
      subtitle_segments,
      caption_segments,
      scene_descriptors,
      text_layovers,
      voiceover_duration_seconds,
      show_captions,
    };

    // Select composition (validates props against registered compositions)
    const composition = await selectComposition({
      serveUrl: bundlePath,
      id: 'SocialFlowVideo',
      inputProps,
    });

    // Override duration to match actual voiceover length
    composition.durationInFrames = totalDurationInFrames;

    await renderMedia({
      composition,
      serveUrl: bundlePath,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps,
      onProgress: ({ progress }) => {
        if (Math.round(progress * 100) % 10 === 0) {
          console.log(`[remotion] Render progress: ${Math.round(progress * 100)}%`);
        }
      },
      // Concurrency: use half of available CPUs for rendering
      concurrency: Math.max(1, Math.floor(os.cpus().length / 2)),
    });

    const stat = fs.statSync(outputPath);
    console.log(`[remotion] Render complete: ${outputPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

    res.json({
      success: true,
      output_path: outputPath,
      filename,
      file_size_bytes: stat.size,
      duration_seconds: voiceover_duration_seconds,
      total_frames: totalDurationInFrames,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[remotion] Render failed: ${message}`);
    res.status(500).json({ success: false, error: message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`[remotion] Render server listening on http://localhost:${PORT}`);
  console.log(`[remotion] Health check: http://localhost:${PORT}/health`);

  // Pre-warm the bundle on startup
  getBundle().catch((err) => {
    console.error('[remotion] Pre-warm bundling failed:', err);
  });
});

export default app;
