import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const PYTHON_API_PORT = Number(process.env.WILDFIREX_API_PORT || 8001);
const PYTHON_API_HOST = '127.0.0.1';

let uvicornProcess: ChildProcess | null = null;

function isBackendAlive(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: PYTHON_API_HOST,
        port: PYTHON_API_PORT,
        path: '/api/health',
        timeout: 1200,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function resolvePythonBin(): string {
  const venvPython = path.join(__dirname, 'backend', '.venv', 'bin', 'python');
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  return 'python3';
}

async function ensurePythonBackend(): Promise<void> {
  if (await isBackendAlive()) {
    console.log(`[WildfireX] Python FastAPI backend already running on port ${PYTHON_API_PORT}`);
    return;
  }

  const pythonBin = resolvePythonBin();
  console.log(`[WildfireX] Starting FastAPI backend (${pythonBin}) on ${PYTHON_API_HOST}:${PYTHON_API_PORT}...`);

  uvicornProcess = spawn(
    pythonBin,
    [
      '-m',
      'uvicorn',
      'backend.app.main:app',
      '--host',
      PYTHON_API_HOST,
      '--port',
      String(PYTHON_API_PORT),
    ],
    {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    },
  );

  uvicornProcess.stdout?.on('data', (chunk) => {
    process.stdout.write(`[FastAPI] ${chunk.toString()}`);
  });
  uvicornProcess.stderr?.on('data', (chunk) => {
    process.stderr.write(`[FastAPI] ${chunk.toString()}`);
  });
  uvicornProcess.on('exit', (code) => {
    console.log(`[FastAPI] exited with code ${code}`);
    uvicornProcess = null;
  });

  // Wait up to 20s for FastAPI health check
  for (let i = 0; i < 40; i++) {
    if (await isBackendAlive()) {
      console.log(`[WildfireX] FastAPI backend is ready.`);
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.warn('[WildfireX] Warning: FastAPI backend did not respond within 20s startup window.');
}

function proxyToPython(req: express.Request, res: express.Response): void {
  const options: http.RequestOptions = {
    hostname: PYTHON_API_HOST,
    port: PYTHON_API_PORT,
    path: req.originalUrl,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${PYTHON_API_HOST}:${PYTHON_API_PORT}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({
        detail: `Python FastAPI backend is unavailable on port ${PYTHON_API_PORT}: ${err.message}`,
      });
    }
  });

  req.pipe(proxyReq, { end: true });
}

async function startServer() {
  await ensurePythonBackend();

  const app = express();

  // Stream /api requests directly to FastAPI (preserves multipart uploads & Swagger docs)
  app.use('/api', proxyToPython);

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.join(__dirname, 'dist');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[WildfireX] Application listening on http://0.0.0.0:${PORT}`);
  });

  const shutdown = () => {
    if (uvicornProcess) {
      uvicornProcess.kill('SIGTERM');
    }
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('[WildfireX] Fatal startup error:', err);
  process.exit(1);
});
