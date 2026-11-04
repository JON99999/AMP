import express from 'express';
import fs from 'fs';
import path from 'path';
import { _appDirname, LocationPathsOverride } from './src/server/state';
import { registerSettingsRoutes } from './src/server/routes/settingsRoutes';
import { registerMediaRoutes } from './src/server/routes/mediaRoutes';
import { registerScheduleRoutes } from './src/server/routes/scheduleRoutes';
import { registerShowsRoutes } from './src/server/routes/showsRoutes';

export type { LocationPathsOverride };

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  // Register Modular Route Domains (#33)
  registerSettingsRoutes(app);
  registerMediaRoutes(app);
  registerScheduleRoutes(app);
  registerShowsRoutes(app);

  // Vite integration (Development) vs. Bundled Static SPA (Production / Electron)
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(_appDirname, 'index.html'))
      ? _appDirname
      : path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const serverInstance = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
  serverInstance.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Server] Port ${PORT} already in use. Existing process or shared port active.`);
    } else {
      console.error('[Server] Express server error:', err);
    }
  });
}

startServer();
