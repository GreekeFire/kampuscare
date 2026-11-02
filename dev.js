// Local server: `node --env-file=.env dev.js`, then open http://localhost:3000
// On Vercel this file is unused: index.html is served as-is and api/*.js run as functions.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import handler from './api/chat.js';
import plan from './api/plan.js';
import review from './api/review.js';

createServer((req, res) => {
  if (req.url.startsWith('/api/chat')) return handler(req, res);
  if (req.url.startsWith('/api/plan')) return plan(req, res);
  if (req.url.startsWith('/api/review')) return review(req, res);
  const json = req.url === '/knowledge.json';
  const page = req.url.startsWith('/review.html') ? './review.html' : './index.html';
  res.setHeader('Content-Type', json ? 'application/json' : 'text/html; charset=utf-8');
  res.end(readFileSync(new URL(json ? './knowledge.json' : page, import.meta.url)));
}).listen(3000, () => console.log('KampusCare on http://localhost:3000'));
