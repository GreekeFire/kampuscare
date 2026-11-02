// Shared by api/chat.js and api/plan.js. Lives outside api/ because Vercel turns every file there into a route.
import { readFileSync } from 'node:fs';

export const KB = JSON.parse(readFileSync(new URL('../knowledge.json', import.meta.url), 'utf8'));
export const byId = Object.fromEntries(KB.map((e) => [e.id, e]));

// Any OpenAI-compatible provider works: swap these three env vars (see README).
const BASE_URL = process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai';
// Tried in order: if one is overloaded (503) or rate-limited (429), the next one answers.
const MODELS = [process.env.LLM_MODEL || 'gemini-3.5-flash-lite', process.env.LLM_FALLBACK_MODEL || 'gemini-3.1-flash-lite'];
export const API_KEY = process.env.LLM_API_KEY;

// Checked BEFORE the AI sees anything, so a crisis never depends on the model.
// ponytail: keyword list, will miss indirect phrasing; the model's "crisis" flag is the second net.
const CRISIS = /suicid|kill my ?self|\bend (my life|it all)\b|want to die|wanna die|don'?t want to (live|be alive)|no reason to live|self[- ]?harm|hurt (my ?self)|cut(ting)? myself|自杀|自殺|想死|不想活|轻生|结束生命|bunuh diri|tự tử|자살|ฆ่าตัวตาย|आत्महत्या|தற்கொலை|magpakamatay/i;

export const isCrisis = (text) => CRISIS.test(text);

export async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || '{}');
}

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

// Each model gets one try; a busy model or unreadable JSON moves on to the next.
// Returns the parsed JSON object, or { error } with a student-friendly message.
export async function callModel(messages) {
  let status = 0;
  for (const model of MODELS) {
    try {
      const r = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ model, response_format: { type: 'json_object' }, messages }),
      });
      status = r.status;
      if (!r.ok) { console.error('LLM error', model, r.status, (await r.text()).slice(0, 300)); continue; }
      const text = (await r.json()).choices?.[0]?.message?.content || '{}';
      return { out: JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) };
    } catch (err) {
      console.error('LLM failed', model, err.message);
    }
  }
  return { error: status === 429 || status === 503 ? 'The AI is busy right now. Please try again in a minute.' : 'Something went wrong with the AI. Please try again.' };
}

// Review queue (surprise feature 2) in Upstash Redis via its REST API; in memory when the KV env vars are missing.
// ponytail: single key, last write wins; fine for a demo
const QUEUE_KEY = 'kampuscare:queue';
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
let memQueue = [];
if (!KV_URL || !KV_TOKEN) console.warn('KV_REST_API_URL/KV_REST_API_TOKEN not set: review queue is in memory and resets on restart.');

async function kv(command) {
  const r = await fetch(KV_URL, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}` }, body: JSON.stringify(command) });
  if (!r.ok) throw new Error(`KV ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).result;
}

export async function getQueue() {
  if (!KV_URL || !KV_TOKEN) return memQueue;
  const raw = await kv(['GET', QUEUE_KEY]);
  return raw ? JSON.parse(raw) : [];
}

export async function saveQueue(items) {
  if (!KV_URL || !KV_TOKEN) { memQueue = items; return; }
  await kv(['SET', QUEUE_KEY, JSON.stringify(items)]);
}

// Surprise feature 5: one tool-calling turn. No response_format: JSON mode and tools don't mix.
// Returns { msg } (the assistant message, maybe with tool_calls; send it back as-is so Gemini's thought signatures survive) or { error }.
export async function callTools(messages, tools, tool_choice = 'auto') {
  let status = 0;
  for (const model of MODELS) {
    try {
      const r = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ model, messages, tools, tool_choice }),
      });
      status = r.status;
      if (!r.ok) { console.error('LLM error', model, r.status, (await r.text()).slice(0, 300)); continue; }
      const msg = (await r.json()).choices?.[0]?.message;
      if (msg) return { msg };
    } catch (err) {
      console.error('LLM failed', model, err.message);
    }
  }
  return { error: status === 429 || status === 503 ? 'The AI is busy right now. Please try again in a minute.' : 'Something went wrong with the AI. Please try again.' };
}
