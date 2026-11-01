# KampusCare

**A Kaplan "how do I…" guide that only answers from verified Kaplan information.**

A student asks in their own words and in any language, e.g. "how do I see my classes?" KampusCare replies with step-by-step instructions, who to contact, a source link, and the date the information was last checked. If it doesn't know, it says so and points to Student Services instead of guessing.

- **Who it's for:** freshmen first, then anyone with a task they do once a year (leave, withdrawal, appeals, enrolment), plus international students.
- **Why not just Kaplan360's "Ask K360"?** See [Pitch: how we differ from Ask K360](#pitch-how-we-differ-from-ask-k360). Judges *will* ask this.

---

## 1. Run it on your laptop (5 minutes)

Needs [Node.js 20+](https://nodejs.org). No other installs.

1. Get a free Gemini API key: https://aistudio.google.com/apikey (sign in with Google, then "Create API key").
2. In this folder, copy `.env.example` to `.env` and paste the key after `LLM_API_KEY=`.
3. Run:
   ```bash
   npm run dev
   ```
4. Open http://localhost:3000
5. Run the self-check (crisis filter and knowledge-base sanity):
   ```bash
   npm test
   ```

**If Gemini errors** (check the terminal), switch to Groq's free tier. Get a key at https://console.groq.com/keys, then change the three `LLM_` lines in `.env` (the Groq example is in `.env.example`; check Groq's console for the current model name). Any OpenAI-compatible provider works, including NVIDIA build.nvidia.com and OpenRouter `:free` models.

## 2. Put it online for the demo (free, about 10 minutes)

1. Put this folder in a GitHub repo. `.env` is git-ignored, so **never commit your key**.
2. Go to https://vercel.com, sign in with GitHub, choose "Add New Project", and pick the repo.
3. In **Environment Variables**, add `LLM_API_KEY` (plus `LLM_MODEL` / `LLM_BASE_URL` if you changed them).
4. Deploy. You get a `https://….vercel.app` link to put on the slides and as a QR code.

Vercel serves `index.html` and runs `api/chat.js` as a serverless function, so no config is needed. `dev.js` is only for running it locally.

## 3. How it works

```
Student ──► index.html ──► /api/chat ──► 1. Crisis keyword check (no AI involved)
                                          │     └─ match → fixed crisis card (SOS 1767, 995, IMH)
                                          ├─ 2. Gemini + the whole knowledge base in the prompt
                                          │     └─ returns: reply, crisis flag, matching entry ids
                                          └─ 3. Server builds the cards from knowledge.json
                                                (contacts, links, dates never come from the AI)
```

| File | What it is |
|---|---|
| `knowledge.json` | **The product.** 21 entries scraped from Kaplan's public handbook pages. Edit this to add or fix answers. |
| `api/chat.js` | Crisis filter, AI call, and card building. One file. |
| `index.html` | The chat page. One file, no framework. |
| `dev.js` | Local server. |
| `test.js` | Self-check. |

**Why there's no vector database:** 21–50 entries fit easily in one prompt. Sending everything is more reliable than searching for the closest matches, and it's still grounded retrieval: the AI may only answer from the approved entries. Add a vector search only if the knowledge base grows past a few hundred entries. Say this if a judge asks "is it RAG?"

**Adding an entry:** copy an existing one in `knowledge.json`, give it a new `id`, fill every field, set `reviewed` to today, set `sample` to `true` if the steps aren't confirmed yet, then run `npm test`.

## 4. ⚠️ What the team must do: real Kaplan360 steps

Everything in `knowledge.json` comes from Kaplan's public website, **except the app menu paths**, which aren't public because Kaplan360 needs a login. Those entries show an orange **"Sample steps: not yet verified"** badge in the app.

**Minimum before the demo: the 4 tasks below.** Take screenshots on your phone of each screen you tap, in order, and write down the exact button names.

| # | Task | Screenshot this | Fixes entry |
|---|---|---|---|
| 1 | **See your timetable and classroom** | Kaplan360 home → wherever the timetable is → one class opened, showing room and time | `timetable` |
| 2 | **Apply for leave** | Kaplan360 home → leave menu → the leave form (dates, reason, upload) → **don't submit** | `leave` |
| 3 | **Log in to the LMS (eLearn)** | The LMS login page *with its URL visible* → a module page → the assignment submission page | `lms` |
| 4 | **Check attendance rate** | Kaplan360 → where the attendance % is shown | `attendance` (already real; just confirm) |

Already verified from Kaplan's site, no screenshots needed: **counselling request** (Kaplan360 → "Academic" → "Counselling" → "+ New"), leave rules, insurance, withdrawal, contacts, campuses.

**Nice to have** (only if time allows): wifi login, printing, library or e-resources, onboarding checklist in Kaplan360, how to request official documents. These aren't on the public site at all, so right now the bot will (correctly) say "contact Student Services".

**Privacy when taking screenshots:** crop out or blur your name, student ID and photo before sharing them with anyone or putting them on slides.

When you have them: update the `steps` in each entry, set `"sample": false`, and change `reviewed` to the date you checked.

## 5. Cost: free

- **Gemini free tier:** costs $0. Google lists `gemini-3.5-flash-lite` (the default here) and `gemini-3.8-flash` as "Free of charge" on the free tier. Per-minute and per-day limits are shown in AI Studio at https://aistudio.google.com/rate-limit. They're plenty for a demo. If the main model is overloaded or rate-limited, the app automatically retries on `LLM_FALLBACK_MODEL` (`gemini-3.1-flash-lite`). If both fail, it says "The AI is busy" and Groq is the backup.
- **Why Flash-Lite and not Flash:** when tested on 2026-11-01, `gemini-3.6-flash` and `gemini-3.8-flash` returned "high demand" (503) errors, while Flash-Lite answered in a few seconds and translated steps correctly.
- **If you ever upgraded to paid:** Flash-Lite is $0.30 per 1M input tokens and $2.50 per 1M output tokens. Each question sends about 8k tokens (mostly the knowledge base), so it's roughly **S$0.005 per question**, or about S$5 per 1,000 questions.
- **Free-tier catch (put on the responsible-AI slide):** Google may use free-tier inputs to improve its products. That's why the app tells students not to type names, IDs or medical details, and why it stores no chat history.
- **Hosting:** Vercel's free plan.

## 6. Responsible AI (already built in, so put it on the slide)

| Risk | What KampusCare does |
|---|---|
| AI makes things up | Answers only from `knowledge.json`. Contacts, links and dates are filled in by the server, not the AI. Unknown entry ids from the AI are dropped. |
| Outdated info | Every card shows its source link and "last checked" date. Unverified steps are badged. |
| Someone in crisis | A keyword check in 10+ languages runs **before** the AI and shows a fixed, pre-written card. The AI's own crisis flag is a second safety net. An "urgent help" button is always visible. It never tries to counsel. |
| Privacy | No login, no chat history stored. Feedback logs only 👍/👎 and the entry ids, never the message. The footer warns not to share personal details. |
| Translation errors | App and menu names stay in English so they match what's on screen. |
| Transparency | The footer labels the app as AI-assisted and names the model. |

**Verify before demo day:** the crisis card numbers (995, SOS 1767, SOS CareText 9151 1767, IMH 6389 2222). Call or check the official sites. These are in `index.html`.

## 7. Pitch: how we differ from Ask K360

Kaplan360 already has **"Ask K360"**, an AI chatbot. Kaplan's own page warns it "may not always be accurate or complete". Turn that into your pitch:

| | Ask K360 | KampusCare |
|---|---|---|
| Where answers come from | Not shown | A verified knowledge base, with the source and a "last checked" date on every answer |
| When it doesn't know | Unclear | Says so and gives the right contact |
| Answer format | Chat text | Step-by-step cards, contact, source |
| Crisis handling | Not stated | Fixed safety card before the AI runs, in 10+ languages |
| Languages | Not stated | Any language; menu names kept in English |
| Who can use it | Students with a Kaplan360 login | Anyone with the link, including students before they get their login |

Don't trash Ask K360. Frame it as: *"KampusCare shows how a student-support bot can be trustworthy: grounded, sourced and safe. Kaplan could fold this approach into Ask K360."*

## 8. Demo script (5 minutes total, about 3 for the demo)

1. **Problem (30s):** "Freshmen get everything at orientation, forget it, then ask the same things in group chats." Show 2–3 real group-chat questions with names blurred, or a quick poll result.
2. **Freshman (45s):** tap "How do I see my classes?" → step card with source and date.
3. **International student (45s):** type "我生病了明天不能上课怎么办" → leave steps in Chinese, menu names in English, plus the $5 clinic card.
4. **Unknown question (20s):** ask "where is the nearest bubble tea?" → it says it doesn't know and gives the Student Services contact. *This proves it doesn't make things up.*
5. **Safety (30s):** tap "Need urgent help?" Don't type a crisis phrase live; showing the button is enough.
6. **Close (30s):** the architecture diagram above, then "next steps".

**Always have a backup video** of steps 2–5, recorded the night before.

## 9. Surprise-feature add-ons (pick to match what's announced)

Each one is small because the core is simple:

| Likely surprise feature | Add-on | Size |
|---|---|---|
| Voice or accessibility | Read-aloud button (browser `speechSynthesis`) and mic input (Web Speech API). Free, no API. | ~20 lines in `index.html` |
| Multimodal or image | Upload a photo of a letter or call screenshot → "is this a scam?" Gemini reads images; send it as an `image_url` content part. | ~30 lines |
| Media generation | AI-generated "Your first week at Kaplan" infographic. **Label it AI-generated** and list the tool used. | Outside the app |
| Analytics or impact | A count of 👍/👎 per entry from the Vercel logs → "top 5 gaps in Kaplan's info". | ~20 lines |
| Multilingual | Already built. | 0 |

## 10. Not building (put on the "next steps" slide)

Kaplan360 integration (deep links into the app), LMS integration, staff dashboard to edit `knowledge.json`, notifying staff about at-risk students (needs consent, a staff process and privacy review), accounts and chat history.

## Media and AI disclosure

- **AI model:** Google Gemini (`gemini-3.5-flash-lite`) via the Gemini API free tier.
- **Code:** written with Claude (Anthropic) assistance.
- **Knowledge base:** text adapted from Kaplan Singapore's public Student Handbook pages (sources on each entry), checked 2026-11-01.
- **No generated images, audio or video** in the current version. List any you add here.
