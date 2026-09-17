import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import embedHandler from './api/embed.js';
import chatHandler from './api/chat.js';

function apiDevServerPlugin(env) {
  // Populate process.env with loaded env vars so handlers can access GEMINI_API_KEY
  Object.assign(process.env, env);

  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ? req.url.split('?')[0] : '';
        if (url === '/api/embed' || url === '/api/chat') {
          try {
            const buffers = [];
            for await (const chunk of req) buffers.push(chunk);
            const rawBody = Buffer.concat(buffers).toString();
            req.body = rawBody ? JSON.parse(rawBody) : {};
          } catch {
            req.body = {};
          }

          res.status = (code) => { 
            res.statusCode = code; 
            return res; 
          };
          res.json = (data) => {
            if (!res.headersSent) {
              res.setHeader('Content-Type', 'application/json');
            }
            res.end(JSON.stringify(data));
          };

          if (url === '/api/embed') {
            return embedHandler(req, res);
          }
          if (url === '/api/chat') {
            return chatHandler(req, res);
          }
        }
        next();
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), apiDevServerPlugin(env)],
    optimizeDeps: {
      include: ['pdfjs-dist']
    }
  };
});

