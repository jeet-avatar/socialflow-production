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
  const outputPath = path.join(os.tmpdir(), `socialflow-${Date.now()}.mp4`);
  try {
    // TODO: actual Remotion render (Phase 06)
    res.json({ success: true, outputPath });
  } catch (err) {
    cleanupFile(outputPath);
    res.status(500).json({ error: String(err) });
  } finally {
    setImmediate(() => cleanupFile(outputPath));
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
app.listen(PORT, () => console.log(`Remotion service listening on :${PORT}`));
