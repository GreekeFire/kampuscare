# KampusCare

> ## 👋 Start here
>
> **Live app:** https://kampuscare.vercel.app
>
> **What it is:** a website where Kaplan students ask "how do I…" questions in English or 中文 (or any language they type in). It answers only from verified Kaplan info, shows the source and the date checked, and says so when it doesn't know.
>
> **Status (2 Nov 2026):** working and deployed. 32 entries: 20 topics from Kaplan's public website plus 12 Student Services contacts. Both surprise features are built (section 9). 2 topics (timetable, leave) show "steps unverified" because Kaplan360 screens aren't public.
>
> **What the team needs to do:**
> 1. **Screenshots.** See [SCREENSHOTS.md](SCREENSHOTS.md). Items 1–19 are needed tonight.
> 2. **Read [PITCH-NOTES.md](PITCH-NOTES.md):** how we differ from Ask K360, and answers to likely judge questions.
> 3. **Record a backup demo video** using the script in section 8.
> 4. **Finish the checklist** in [HACKATHON-PLAN.md](HACKATHON-PLAN.md), Step 5.
>
> **Files you'll touch:** `knowledge.json` (the answers) and nothing else. Everything below is technical detail.

**A Kaplan "how do I…" guide that only answers from verified Kaplan information.**

A student asks in their own words, e.g. "how do I see my classes?" KampusCare replies with step-by-step instructions, who to contact, a source link, and the date the information was last checked. If it doesn't know, it says so and offers to send the question to Student Services instead of guessing.

- **Who it's for:** freshmen first, then anyone with a task they do once a year (leave, withdrawal, appeals, enrolment), plus international students.
- **Why not just Kaplan360's "Ask K360"?** See [section 7](#7-pitch-how-we-differ-from-ask-k360). Judges *will* ask this.

---

## 1. Run it on your laptop (5 minutes)

Needs [Node.js 20+](https://nodejs.org). No other installs.

1. Get a free Gemini API key: https://aistudio.google.com/apikey (sign in with Google, then "Create API key").
2. In this folder, copy `.env.example` to `.env` and paste the key after `LLM_API_KEY=`. Leave the `KV_` and `STAFF_PASSWORD` lines empty: locally the review queue is kept in memory and resets on restart.
3. Run:
   ```bash
   npm run dev
   ```
4. Open http://localhost:3000 (students) and http://localhost:3000/review.html (staff).
5. Run the self-check (crisis filter, knowledge base, plan, review queue):
   ```bash
   npm test
   ```

**If Gemini errors** (check the terminal), switch to Groq's free tier. Get a key at https://console.groq.com/keys, then change the `LLM_` lines in `.env` (the Groq example is in `.env.example`; check Groq's console for the current model name). Any OpenAI-compatible provider works, including NVIDIA build.nvidia.com and OpenRouter `:free` models.

## 2. Put it online for the demo (free, about 10 minutes)

1. Put this folder in a GitHub repo. `.env` is git-ignored, so **never commit your key**.
2. Go to https://vercel.com, sign in with GitHub, choose "Add New Project", and pick the repo.
3. In **Environment Variables**, add `LLM_API_KEY` (plus `LLM_MODEL`, `LLM_FALLBACK_MODEL`, `LLM_BASE_URL` if you changed them).
4. In **Storage → Marketplace**, add **Upstash Redis** (free) and connect it to the project. It fills in `KV_REST_API_URL` and `KV_REST_API_TOKEN` (the `UPSTASH_REDIS_REST_*` names work too).
5. Optional: add `STAFF_PASSWORD` to lock the review page. Without it, **anyone with the link to /review.html can approve answers**. No code change needed either way.
6. Deploy. You get a `https://….vercel.app` link to put on the slides and as a QR code.

Vercel serves the two HTML pages and runs `api/*.js` as serverless functions, so no config is needed. `dev.js` is only for running it locally.

## 3. How it works

```
Student ──► index.html ──► /api/chat ──► 1. Crisis keyword check (no AI involved)
                │                         │     └─ match → fixed crisis card (SOS 1767, 995, mindline 1771)
                │                         ├─ 2. Gemini + knowledge.json + staff-approved answers in the prompt
                │                         └─ 3. Server builds the cards (contacts, links, dates never come from the AI)
                ├──────────► /api/plan ──► arrival plan, same checks, items must cite knowledge-base ids
                └─ "Send to Student Services" ──► /api/review ◄── review.html (staff draft, tick flags, approve)
                                                      └─ queue in Upstash Redis
```

| File | What it is |
|---|---|
| `knowledge.json` | **The product.** 32 entries from Kaplan's public pages and the Oct 2026 Student Services PDF. Each has `title_zh`. |
| `api/chat.js` | Chat: crisis filter, AI call, card building, feedback. Merges approved review answers into the knowledge base. If Redis is down it uses `knowledge.json` only. |
| `api/plan.js` | Surprise feature 1: the arrival plan. |
| `api/review.js` | Surprise feature 2: the queue, AI draft with risk flags, approve or reject. |
| `lib/shared.js` | Shared code: knowledge base, crisis regex, model call with fallback, Redis queue. |
| `index.html` | The student page, including the English / 中文 strings. One file, no framework. |
| `review.html` | The staff review page. |
| `dev.js` / `test.js` | Local server / self-check. |

**Why there's no vector database:** 32 entries fit easily in one prompt. Sending everything is more reliable than searching for the closest matches, and it's still grounded retrieval: the AI may only answer from the approved entries. Add vector search only past a few hundred entries. Say this if a judge asks "is it RAG?"

**Adding an entry:** copy an existing one in `knowledge.json`, give it a new `id`, fill every field (including `title_zh`), set `reviewed` to today, set `sample` to `true` if the steps aren't confirmed yet, then run `npm test`.

## 4. ⚠️ What the team must do: real Kaplan360 steps

Everything in `knowledge.json` comes from Kaplan's public website or the Student Services PDF, **except some app menu paths**, which aren't public because Kaplan360 needs a login. Those entries show an orange **"App steps not yet confirmed"** badge.

**Minimum before the demo: the 3 tasks below.** Screenshot each screen you tap, in order, and write down the exact button names.

| # | Task | Screenshot this | Fixes entry |
|---|---|---|---|
| 1 | **See your timetable and classroom** | Kaplan360 home → the timetable → one class opened, showing room and time | `timetable` |
| 2 | **Apply for leave** | Kaplan360 home → leave menu → the leave form → **don't submit** | `leave` |
| 3 | **Check attendance rate** | Kaplan360 → where the attendance % is shown | `attendance` (already real; just confirm) |

Already verified, no screenshots needed: LMS links (Kaplan eLearn, Murdoch Moodle), counselling request, leave rules, insurance, withdrawal, contacts, campuses.

**Privacy when taking screenshots:** crop out or blur your name, student ID and photo before sharing them or putting them on slides.

When you have them: update the `steps` in each entry, set `"sample": false`, and change `reviewed` to the date you checked.

## 5. Cost: free

- **Gemini free tier:** costs $0. Google lists `gemini-3.5-flash-lite` (the default here) as "Free of charge" on the free tier. Limits are shown at https://aistudio.google.com/rate-limit. They're plenty for a demo. If the main model is overloaded or rate-limited, the app retries on `LLM_FALLBACK_MODEL` (`gemini-3.1-flash-lite`). If both fail, it says "The AI is busy" and Groq is the backup.
- **Why Flash-Lite and not Flash:** when tested on 2026-11-01, `gemini-3.6-flash` and `gemini-3.8-flash` returned "high demand" (503) errors, while Flash-Lite answered in a few seconds and translated steps correctly.
- **If you ever upgraded to paid:** Flash-Lite is $0.30 per 1M input tokens and $2.50 per 1M output tokens. Each question sends about 8k tokens (mostly the knowledge base), so it's roughly **S$0.005 per question**, or about S$5 per 1,000 questions. A plan or a staff draft costs about the same.
- **Free-tier catch (put on the responsible-AI slide):** Google may use free-tier inputs to improve its products. That's why the app tells students not to type names, IDs or medical details.
- **Hosting and storage:** Vercel's free plan and Upstash Redis's free tier.
- **Claude:** the team's Anthropic key was used only for Claude Code while building. The live app never calls Claude.

## 6. Responsible AI (already built in, so put it on the slide)

| Risk | What KampusCare does |
|---|---|
| AI makes things up | Answers only from `knowledge.json` and staff-approved answers. Contacts, links and dates are filled in by the server, not the AI. Unknown entry ids and links are dropped. |
| AI-drafted answers reach students unchecked | **Human approval gate.** Nothing from the review queue reaches students until staff approve it. Approved answers carry an "Approved by Student Services · date" badge. |
| Staff rubber-stamp the AI | Each draft comes with risk flags (`no_source`, `conflicts_with:<id>`, `policy_sensitive`, `low_confidence`), each with a reason and % confidence. **Approve stays disabled until staff tick every flag.** The server adds `no_source` and `policy_sensitive` itself, so the AI can't skip them. |
| Outdated info | Every card shows its source link and "last checked" date. Unverified steps are badged. |
| Someone in crisis | A keyword check in 10+ languages runs **before** the AI, on chat, plan and queue text, and shows a fixed card. The AI's own crisis flag is a second net. An "Urgent help" button is always visible. It never tries to counsel. |
| Privacy | No login, no chat history stored. Feedback logs only the rating, reason, a short comment and entry ids. A question is stored **only if the student taps "Send this question to Student Services"**: the question text alone, max 300 characters, no name, ID or IP. |
| Translation errors | App and menu names stay in English so they match the screen. Crisis numbers never change. A Chinese speaker must still review the 中文 text. |
| Open review page | **Right now /review.html has no password**, by the team's choice for the demo. Anyone with the link can approve. Keep it off the slides. Setting `STAFF_PASSWORD` locks it; production would use Kaplan staff SSO. |
| Transparency | The footer labels the app as AI-assisted and names the model. |

**Crisis numbers** (checked 2 Nov 2026, in `index.html`): 995, SOS 1767 / WhatsApp 9151 1767, mindline 1771 / WhatsApp 6669 1771. IMH's old 6389 2222 was retired when mindline launched in June 2025.

## 7. Pitch: how we differ from Ask K360

Kaplan360 already has **"Ask K360"**, an AI chatbot. Kaplan's own page warns it "may not always be accurate or complete". Turn that into your pitch:

| | Ask K360 | KampusCare |
|---|---|---|
| Where answers come from | Not shown | A verified knowledge base, with the source and a "last checked" date on every answer |
| When it doesn't know | Unclear | Says so, and the student can send the question to Student Services |
| New answers | Not stated | AI drafts, staff check every flag and approve |
| Answer format | Chat text | Step-by-step cards, contact, source; personalised arrival plan |
| Crisis handling | Not stated | Fixed safety card before the AI runs, in 10+ languages |
| Languages | Not stated | English / 中文 switch, plus any typed language; menu names kept in English |
| Who can use it | Students with a Kaplan360 login | Anyone with the link, including students before they get their login |

Don't trash Ask K360. Frame it as: *"KampusCare shows how a student-support bot can be trustworthy: grounded, sourced and safe. Kaplan could fold this approach into Ask K360."*

## 8. Demo script (5 minutes)

1. **Sourced answer (45s):** tap "How do I see my classes?" → step card with source and date.
2. **中文 (30s):** switch the header to 中文 → the start screen and topics change; ask "我生病了明天不能上课怎么办" → leave steps in Chinese, menu names in English.
3. **Arrival plan (1 min):** "New international student? Get your first 2 weeks planned" → type *"I'm from China, starting a Murdoch degree on 20 Nov, under 18, staying in a hostel"* → show "What we understood about you", then Before you fly / Week 1 / Week 2 with the Murdoch contact and Moodle link. *"Same knowledge base, new user group, different output."*
4. **Human decides (2 min):** ask "How do I print on campus?" → not covered → **Send this question to Student Services** → open review.html → paste the Kaplan page text → **Draft with AI** → flags appear, Approve is greyed out → tick each flag → edit a step → **Approve** → back in chat, ask again → answer with the "Approved by Student Services" badge.
5. **Safety (15s):** tap "Urgent help". Don't type a crisis phrase live.

Before the pitch, click "Reset demo" at the bottom of /review.html. **Always have a backup video**, recorded the night before.

## 9. Surprise features we built

| Slide wording | What KampusCare does |
|---|---|
| **Your User Changed:** AI must understand a new user group's needs and generate output for them. | New user group: incoming international students. They describe themselves in free text; the AI shows "What we understood about you" (editable), then a Before you fly / Week 1 / Week 2 plan. Every item cites a knowledge-base entry with its source and checked date. It uses their programme's contact line and LMS link. Dates are suggested. Print / save as PDF. |
| **Human Must Decide:** AI drafts and flags risk; a person decides. | Students opt in to send an unanswered question (or one they marked "Incorrect"). Staff paste the Kaplan page, AI drafts an entry with risk flags, staff tick every flag, then approve (with edits) or reject with a note. Nothing reaches students before approval. |

## 10. Not building (put on the "next steps" slide)

Kaplan360 integration (deep links into the app), LMS integration, staff SSO for the review page, editing existing `knowledge.json` entries from the review page, notifying staff about at-risk students (needs consent, a staff process and privacy review), accounts and chat history.

## Media and AI disclosure

- **AI model in the app:** Google Gemini (`gemini-3.5-flash-lite`, fallback `gemini-3.1-flash-lite`) via the Gemini API free tier.
- **Code:** most of it written by Claude Code (Opus) and Claude (Anthropic), reviewed and tested by the team.
- **Knowledge base:** text adapted from Kaplan Singapore's public Student Handbook pages and the Oct 2026 Student Services contact PDF (sources on each entry). Chinese titles drafted by AI, pending review by a Chinese speaker.
- **No generated images, audio or video** in the current version. List any you add here.
