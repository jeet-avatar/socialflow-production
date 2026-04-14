import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

const app = express();
app.use(express.json());

let bundleLocation: string | null = null;
let bundleReady = false;

async function initBundle(): Promise<void> {
  console.log('Remotion: starting bundle compilation...');
  bundleLocation = await bundle({
    entryPoint: path.resolve(__dirname, '../src/index.tsx'),
  });
  bundleReady = true;
  console.log('Remotion: bundle ready at', bundleLocation);
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', bundleReady, timestamp: new Date().toISOString() });
});

app.post('/render', async (req, res) => {
  if (!bundleReady || !bundleLocation) {
    return res.status(503).json({ error: 'Render service not ready — bundle initializing' });
  }

  const { compositionId = 'SocialFlowVideo', output_filename, ...inputProps } = req.body;
  const outputPath = path.join(os.tmpdir(), output_filename || `socialflow-${Date.now()}.mp4`);

  try {
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: compositionId,
      inputProps,
    });

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps,
    });

    const stat = fs.statSync(outputPath);
    return res.json({
      success: true,
      output_path: outputPath,
      file_size_bytes: stat.size,
      duration_seconds: inputProps.voiceover_duration_seconds || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Render error:', message);
    cleanupFile(outputPath);
    return res.status(500).json({ success: false, error: `Render failed: ${message}` });
  }
});

function cleanupFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn(`Failed to clean temp file ${filePath}:`, err);
  }
}

// Periodic cleanup: remove socialflow-*.mp4 files older than 1 hour
setInterval(() => {
  const tmpDir = os.tmpdir();
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  try {
    fs.readdirSync(tmpDir)
      .filter(f => f.startsWith('socialflow-') && f.endsWith('.mp4'))
      .forEach(f => {
        const fullPath = path.join(tmpDir, f);
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < oneHourAgo) {
          fs.unlinkSync(fullPath);
          console.log(`Periodic cleanup: removed stale file ${fullPath}`);
        }
      });
  } catch (_err) { /* non-fatal */ }
}, 30 * 60 * 1000);

const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, () => {
  console.log(`Remotion service listening on :${PORT}`);
  initBundle().catch(err => {
    console.error('Bundle initialization failed:', err);
    process.exit(1);
  });
});
