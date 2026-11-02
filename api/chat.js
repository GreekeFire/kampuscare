import { KB, byId, API_KEY, isCrisis, readBody, send, callModel } from '../lib/shared.js';

const system = (kb) => `You are KampusCare, a guide that helps Kaplan Singapore students find how to do things and who to contact.

RULES
- Answer ONLY from the KNOWLEDGE BASE below. Never invent steps, menus, links, phone numbers, emails or policies.
- If nothing in the knowledge base fits, return an empty "matches" list and suggest contacting Student Services (+65 6733 1877).
- Pick at most 3 entries, most relevant first.
- Reply in the same language the student wrote in. Keep app and menu names (e.g. "Kaplan360", "Academic", "Counselling", "+ New") in English, inside quotes.
- Be warm and brief: "reply" is at most 2 sentences.
- You are not a counsellor and do not give medical, legal or financial advice. For stress or feeling low, point to the "counselling" entry.
- Set "crisis" to true ONLY if the student expresses wanting to die, suicide, self-harm, or being in immediate physical danger. Stress, anxiety, sadness, loneliness, exam pressure or "I'm so done with this module" are NOT a crisis: answer those normally and point to the "counselling" entry gently, without mentioning hotlines.

Return JSON only, in this shape:
{"seen": string, "reply": string, "crisis": boolean, "matches": [{"id": string, "why": string, "steps": [string], "notes": string}]}
- "reply", "why", every item in "steps" and "notes" must be written in the reply language (the student's language unless the message says otherwise). If that is Chinese, translate each knowledge-base step and the entry's notes into Chinese; do not copy the English. "notes" is "" if the entry has none.
- "why" is one sentence on why this entry fits the student's situation.
- Write non-English text as normal characters, never as \\u escape codes.

PHOTOS AND VOICE
- If the student sends a photo (a Kaplan360 screen, a letter, a timetable, an MC, a poster…), read it, then answer ONLY from the knowledge base as usual.
- "seen" is one sentence, in the reply language, saying what you read in the photo, e.g. "A Kaplan360 error: 'Leave application could not be submitted'". For a voice message, "seen" is what the student said. "seen" is "" when there is neither.
- If the photo has nothing to do with Kaplan student life, say so kindly in "reply" and return an empty "matches" list.
- Never repeat personal data you see or hear (names, student IDs, NRIC/FIN, phone numbers, addresses) in any field. Write "[name]" or "[ID]" instead.
- Apply the crisis rule to words in the photo or voice message too.

KNOWLEDGE BASE
${JSON.stringify(kb.map(({ id, title, summary, steps, notes }) => ({ id, title, summary, steps, notes })))}`;

// Language picked in the header: 'zh' or English. Anything else is English.
export const LANGS = { en: 'English', zh: 'Simplified Chinese' };
export const pickLang = (l) => (l === 'zh' ? 'zh' : 'en');

// Contacts, sources and review dates always come from the knowledge base, never from the model.
// Card titles use title_zh in 中文 mode.
export function toCards(matches, byId, lang = 'en') {
  return (Array.isArray(matches) ? matches : [])
    .filter((m) => m && byId[m.id])
    .slice(0, 3)
    .map((m) => {
      const e = byId[m.id];
      return {
        id: e.id, title: (lang === 'zh' && e.title_zh) || e.title, why: m.why || '',
        steps: Array.isArray(m.steps) && m.steps.length ? m.steps : e.steps,
        notes: (m.notes && String(m.notes)) || e.notes, contact: e.contact, source: e.source, reviewed: e.reviewed, sample: e.sample,
      };
    });
}

// AI-busy fallback: plain keyword match on keywords, title words and Chinese title bigrams. No model, so no quota.
// ponytail: substring scoring, no stemming beyond a plural "s"; good enough to surface the right page for short questions.
const STOP = /^(your|when|with|using|what|which|from|that|this|have|kaplan|student|students|services|university|next)$/;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bigrams = (s) => [...new Set([...String(s || '').matchAll(/(?=([一-鿿]{2}))/g)].map((x) => x[1]))];
export function kbMatch(message, kb) {
  const m = String(message || '').toLowerCase();
  const has = (w) => new RegExp(`(^|[^a-z0-9])${esc(w)}(e?s)?($|[^a-z0-9])`).test(m);
  return kb.map((e) => {
    const title = [...new Set(String(e.title || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.test(w)))];
    const score = 2 * (e.keywords || []).filter((k) => has(String(k).toLowerCase())).length
      + 3 * title.filter(has).length + 2 * bigrams(e.title_zh).filter((b) => m.includes(b)).length;
    return { e, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map((x) => x.e);
}
const BUSY = {
  en: 'The AI is busy right now, so here are the closest Kaplan pages. Check the steps against the source.',
  zh: 'AI 现在比较忙，以下是最相关的 Kaplan 页面。请对照来源核对步骤。',
};
// null when nothing matches: the caller sends the plain busy error.
export function busyAnswer(message, kb, byId, lang) {
  const hits = kbMatch(message, kb);
  return hits.length ? { reply: BUSY[pickLang(lang)], cards: toCards(hits.map((e) => ({ id: e.id })), byId, lang), busy: true } : null;
}

// Photos and voice clips arrive as data URLs. Checked here, at the trust boundary; never logged or stored.
// Image: the browser resizes to 1280px JPEG; ~4 MB cap keeps us under Vercel's 4.5 MB body limit.
// Audio: the browser sends 16 kHz mono 16-bit WAV (Gemini's OpenAI endpoint takes only wav/mp3); 1.3 MB ≈ 30 s.
const MEDIA = {
  image: [/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/, 4_000_000],
  audio: [/^data:audio\/wav;base64,[A-Za-z0-9+/]+={0,2}$/, 1_300_000],
};
export const validMedia = (kind, v) => typeof v === 'string' && v.length <= MEDIA[kind][1] && MEDIA[kind][0].test(v);

// Feedback: rating, one of 4 fixed reasons, short free text. Never the student's question.
const REASONS = ['not_asked', 'incorrect', 'slow', 'other'];
export function cleanFeedback(body) {
  const down = body.feedback !== 'up';
  return {
    rating: down ? 'down' : 'up',
    reason: down && REASONS.includes(body.reason) ? body.reason : undefined,
    comment: down && body.comment ? String(body.comment).slice(0, 200) : undefined,
    ids: [].concat(body.ids || []).slice(0, 3),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Bad JSON' }); }

  if (body.feedback) {
    console.log('feedback', JSON.stringify(cleanFeedback(body)));
    return send(res, 200, { ok: true });
  }

  const message = String(body.message || '').trim().slice(0, 1000);
  const { image, audio } = body;
  if (image != null && !validMedia('image', image)) return send(res, 400, { error: "That photo couldn't be read. Try a JPEG or PNG under 3 MB." });
  if (audio != null && !validMedia('audio', audio)) return send(res, 400, { error: "That voice message couldn't be read. Keep it under 30 seconds." });
  if (!message && !image && !audio) return send(res, 400, { error: 'Empty message' });

  if (isCrisis(message)) return send(res, 200, { crisis: true });
  if (!API_KEY) return send(res, 500, { error: 'Server is missing LLM_API_KEY' });

  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-6)
    .filter((h) => h && (h.role === 'user' || h.role === 'assistant'))
    .map((h) => ({ role: h.role, content: String(h.content).slice(0, 1000) }));

  const lang = pickLang(body.lang);
  const text = `${message || "(The student's question is in the voice message.)"}\n\n(Reply in ${LANGS[lang]} unless the student clearly wrote or spoke in another language. Translate "steps" and "notes" too. Keep app and menu names in English.)`;
  // OpenAI-style content parts; a plain string when nothing is attached.
  const turn = (text) => (image || audio ? [{ type: 'text', text },
    ...(image ? [{ type: 'image_url', image_url: { url: image } }] : []),
    ...(audio ? [{ type: 'input_audio', input_audio: { data: audio.slice(audio.indexOf(',') + 1), format: 'wav' } }] : [])] : text);
  const messages = [{ role: 'system', content: system(KB) }, ...history, { role: 'user', content: turn(text) }];
  const { out, error } = await callModel(messages);
  if (error) {
    const fallback = busyAnswer(message, KB, byId, lang);
    return fallback ? send(res, 200, fallback) : send(res, 502, { error });
  }
  const seen = image || audio ? String(out.seen || '') : '';
  // Keyword check again on what the model read or heard: words in a photo or voice clip skipped the first check.
  if (out.crisis || isCrisis(seen)) return send(res, 200, { crisis: true });
  return send(res, 200, { seen, reply: String(out.reply || ''), cards: toCards(out.matches, byId, lang) });
}
