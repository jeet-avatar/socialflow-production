import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/render', async (req, res) => {
  // Phase 06 implements actual Remotion rendering.
  // Stub returns 501 so callers know it is not yet implemented rather than
  // silently succeeding with a missing file that would cause upstream errors.
  res.status(501).json({
    error: 'Remotion render not yet implemented (Phase 06)',
    output_path: null,
    file_size_bytes: null,
    duration_seconds: null,
  });
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
app.listen(PORT, () => console.log(`Remotion service listening on :${PORT}`));
