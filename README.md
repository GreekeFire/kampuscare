# KampusCare

> ## 👋 Start here
>
> **Live app:** https://kampuscare.vercel.app
>
> **What it is:** a website where Kaplan students ask "how do I…" questions in English or 中文 (or any language they type in). It answers only from verified Kaplan info, shows the source and the date checked, and says so when it doesn't know.
>
> **Status (2 Nov 2026):** working and deployed. 32 entries: 20 topics from Kaplan's public website plus 12 Student Services contacts. Two surprise features, built and presented (section 9): **F1 Your User Changed** (Round 1) and **F3 No More Typing** (Round 2). The other three were removed to keep the app and the 3-minute demo focused. 2 topics (timetable, leave) show "steps unverified" because Kaplan360 screens aren't public.
>
> **What the team needs to do:**
> 1. **Fill in the organisers' disclosure table** (presenting F1 Your User Changed + F3 No More Typing).
> 2. **Read [PITCH-NOTES.md](PITCH-NOTES.md):** how we differ from Ask K360, and answers to likely judge questions.
> 3. **Record a backup demo video** using the 3-minute script in section 8.
> 4. **Finish the checklist** in [HACKATHON-PLAN.md](HACKATHON-PLAN.md), Step 5.
>
> **Files you'll touch:** `knowledge.json` (the answers) and nothing else. Everything below is technical detail.

**A Kaplan "how do I…" guide that only answers from verified Kaplan information.**

A student asks in their own words, e.g. "how do I see my classes?" KampusCare replies with step-by-step instructions, who to contact, a source link, and the date the information was last checked. If it doesn't know, it says so and points to the right Student Services contact instead of guessing.

- **Who it's for:** freshmen first, then anyone with a task they do once a year (leave, withdrawal, appeals, enrolment), plus international students.
- **Why not just Kaplan360's "Ask K360"?** See [section 7](#7-pitch-how-we-differ-from-ask-k360). Judges *will* ask this.

---

## 1. Run it on your laptop (5 minutes)

Needs [Node.js 20+](https://nodejs.org). No other installs.

1. Get a free Gemini API key: https://aistudio.google.com/apikey (sign in with Google, then "Create API key").
2. In this folder, copy `.env.example` to `.env` and paste the key after `LLM_API_KEY=`.
3. Run:
   ```bash
   npm run dev
   ```
4. Open http://localhost:3000.
5. Run the self-check (crisis filter, knowledge base, plan, AI-busy fallback, wellbeing matching):
   ```bash
   npm test
   ```

**If Gemini errors** (check the terminal), switch to Groq's free tier. Get a key at https://console.groq.com/keys, then change the `LLM_` lines in `.env` (the Groq example is in `.env.example`; check Groq's console for the current model name). Any OpenAI-compatible provider works, including NVIDIA build.nvidia.com and OpenRouter `:free` models.

## 2. Put it online for the demo (free, about 10 minutes)

1. Put this folder in a GitHub repo. `.env` is git-ignored, so **never commit your key**.
2. Go to https://vercel.com, sign in with GitHub, choose "Add New Project", and pick the repo.
3. In **Environment Variables**, add `LLM_API_KEY` (plus `LLM_MODEL`, `LLM_FALLBACK_MODEL`, `LLM_BASE_URL` if you changed them). `LLM_FALLBACK_MODEL` takes a comma list of extra models. Each free model has its own quota, so adding one or two more makes a dead demo less likely.
4. Deploy. You get a `https://….vercel.app` link to put on the slides and as a QR code.

Vercel serves `index.html` and runs `api/*.js` as serverless functions, so no config is needed. `dev.js` is only for running it locally. `.vercelignore` keeps the `.md` notes, `test.js`, `dev.js` and `.prompts` off the live site.

**Already deployed?** The app no longer uses `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `UPSTASH_REDIS_REST_*`, `STAFF_PASSWORD` or `CHECK_ALL`. Delete them from Vercel → Settings → Environment Variables, and disconnect the Upstash Redis store if nothing else uses it.

## 3. How it works

```
Student ──► index.html ──► /api/chat ──► 1. Crisis keyword check (no AI involved)
 (text, voice   │                         │     └─ match → fixed crisis card (SOS 1767, 995, mindline 1771)
  or photo)     │                         ├─ 2. Gemini + knowledge.json (+ voice/photo)
                │                         ├─ 3. Server builds the cards (contacts, links, dates never come from the AI)
                │                         └─ AI busy → closest knowledge-base pages by keyword, no AI, labelled "AI is busy"
                ├──────────► /api/plan ──► arrival plan, same checks, items must cite knowledge-base ids
                └─ Wellbeing page ──► runs in the browser only, no AI, nothing stored
```

| File | What it is |
|---|---|
| `knowledge.json` | **The product.** 32 entries from Kaplan's public pages and the Oct 2026 Student Services PDF. Each has `title_zh`. |
| `api/chat.js` | Chat: crisis filter, AI call (text, voice or photo), card building, feedback, and the keyword fallback when the AI is busy. |
| `api/plan.js` | Surprise feature 1: the arrival plan. |
| `lib/shared.js` | Shared code: knowledge base, crisis regex, model call with fallback models. |
| `index.html` | The student page, including the Wellbeing page and the English / 中文 strings. One file, no framework. |
| `dev.js` / `test.js` | Local server / self-check. |

**Why there's no vector database:** 32 entries fit easily in one prompt. Sending everything is more reliable than searching for the closest matches, and it's still grounded retrieval: the AI may only answer from the verified entries. Add vector search only past a few hundred entries. Say this if a judge asks "is it RAG?"

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

- **Gemini free tier:** costs $0. Google lists `gemini-3.5-flash-lite` (the default here) as "Free of charge" on the free tier. Limits are shown at https://aistudio.google.com/rate-limit. They're plenty for a demo. If the main model is overloaded or rate-limited, the app retries on `LLM_FALLBACK_MODEL` (`gemini-3.1-flash-lite`, or a comma list of models, each with its own free quota). If all fail, chat shows the closest Kaplan knowledge-base pages, matched by keyword with no AI, labelled "AI is busy". Groq is the backup provider.
- **Why Flash-Lite and not Flash:** when tested on 2026-11-01, `gemini-3.6-flash` and `gemini-3.8-flash` returned "high demand" (503) errors, while Flash-Lite answered in a few seconds and translated steps correctly.
- **If you ever upgraded to paid:** Flash-Lite is $0.30 per 1M input tokens and $2.50 per 1M output tokens. Each question sends about 8k tokens (mostly the knowledge base), so it's roughly **S$0.005 per question**, or about S$5 per 1,000 questions. A plan costs about the same.
- **Free-tier catch (put on the responsible-AI slide):** Google may use free-tier inputs to improve its products. That's why the app tells students not to type names, IDs or medical details.
- **Hosting:** Vercel's free plan. No database.
- **Claude:** the team's Anthropic key was used only for Claude Code while building. The live app never calls Claude.

## 6. Responsible AI (already built in, so put it on the slide)

| Risk | What KampusCare does |
|---|---|
| AI makes things up | Answers only from `knowledge.json`. Contacts, links and dates are filled in by the server, not the AI. Unknown entry ids and links are dropped. |
| Outdated info | Every card shows its source link and "last checked" date. Unverified steps are badged. |
| AI is busy or out of quota | Chat still answers: it shows the closest Kaplan knowledge-base pages, matched by keyword with no AI, labelled "AI is busy". Error messages point to **Urgent help**. The crisis card never needs the AI. |
| Someone in crisis | A keyword check in 10+ languages (including phrasings like "kms", "unalive", 跳楼) runs **before** the AI, on chat and plan text, and shows a fixed card. The AI's own crisis flag is a second net. An "Urgent help" button is always visible. It never tries to counsel. |
| Privacy | No login, no database, no chat history stored. Feedback logs only the rating, reason, a short comment and entry ids, never the question. |
| Translation errors | App and menu names stay in English so they match the screen. Crisis numbers never change. A Chinese speaker must still review the 中文 text. |
| Wellbeing page | Calming breath, check-in, counselling booking and the buddy finder use **no AI and store nothing**. Buddy profiles are labelled samples, with a not-a-counsellor note. |
| Voice and photos | The app says: "KampusCare doesn't keep your photo or voice clip; Google's Gemini reads it to answer." Never stored or logged by KampusCare. Checked on the server (type and size) before the AI sees them. The AI is told not to repeat names, IDs or NRIC/FIN it sees, and the crisis check also runs on what it read or heard. |
| Transparency | The footer labels the app as AI-assisted and names the model. |

**Crisis numbers** (checked 2 Nov 2026, in `index.html`): 995, SOS 1767 / WhatsApp 9151 1767, mindline 1771 / WhatsApp 6669 1771. IMH's old 6389 2222 was retired when mindline launched in June 2025.

## 7. Pitch: how we differ from Ask K360

Kaplan360 already has **"Ask K360"**, an AI chatbot. Kaplan's own page warns it "may not always be accurate or complete". Turn that into your pitch:

| | Ask K360 | KampusCare |
|---|---|---|
| Where answers come from | Not shown | A verified knowledge base, with the source and a "last checked" date on every answer |
| When it doesn't know | Unclear | Says so, and points to the right Student Services contact |
| Answer format | Chat text | Step-by-step cards, contact, source; personalised arrival plan |
| Crisis handling | Not stated | Fixed safety card before the AI runs, in 10+ languages |
| Languages | Not stated | English / 中文 switch, plus any typed language; menu names kept in English |
| Who can use it | Students with a Kaplan360 login | Anyone with the link, including students before they get their login |

Don't trash Ask K360. Frame it as: *"KampusCare shows how a student-support bot can be trustworthy: grounded, sourced and safe. Kaplan could fold this approach into Ask K360."*

## 8. Demo script (3 minutes, laptop)

We present **F1 Your User Changed** and **F3 No More Typing**. If you fall behind, cut step 4.

1. **Start screen (10s):** *"Ask in your own words, in any language. It only answers from these Kaplan pages, each with a source and a checked date."* Point at the big arrival-plan entry and the mic.
2. **F1 arrival plan (75s):** click **"New international student? Get your first 2 weeks planned"** → type *"I'm from China, starting a Murdoch degree on 20 Nov, under 18, staying in a hostel"* → **Generate plan**. Show **"What we understood about you"** (*"editable: fix a field and regenerate"*), then the dated Before you fly / Week 1 / Week 2 steps, each with its source, and **Your Student Services team** with the Murdoch contact line. If time allows, switch the header to **中文** and regenerate. *"Same knowledge base, new user group, different output."*
3. **F3 voice (50s):** click **KampusCare** (or **← Home**) to get back. **Hold the mic** (or Tab to it and hold **Space**) and say *"How do I book a counsellor?"*. Point at the red dot and seconds counter, release → **"You said: …"** → the counselling card with source and date. *"It shows what it heard, so you can check, then answers only from Kaplan pages."*
4. **Photo (optional, only if time):** camera button → the prepared, blurred photo of a Kaplan notice → **"In your photo: …"** → steps.
5. **Urgent help (10s):** click **Urgent help**. Don't type a crisis phrase live.
6. **Close (15s):** *"Works before the Kaplan360 login arrives, every answer is checkable, safety runs before the AI. Kaplan could fold this approach into Ask K360."*

See the "Before the pitch" checklist in [HACKATHON-PLAN.md](HACKATHON-PLAN.md). **Always have a backup video**, recorded the night before.

## Wellbeing page

A calm page, opened from "Feeling stressed?" on the start screen or from the counselling card. It uses **no AI and stores nothing**.
- **Calming breath:** one rhythm (in 4, hold 2, out 6, 5 rounds) shown as animated water waves with a glow and bubbles, an optional soft tone, then a "how do you feel?" check-in.
- **Counselling booking:** illustrated steps for booking Kaplan counselling.
- **Talk to a senior / student buddy:** clearly labelled **sample** profiles, with a note that buddies are not counsellors. The arrival plan links here.

## 9. Surprise features we built

| Slide wording | What KampusCare does |
|---|---|
| **Your User Changed** *(Round 1)*: AI must understand a new user group's needs and generate output for them. | New user group: incoming international students. They describe themselves in free text; the AI shows "What we understood about you" (editable), then a Before you fly / Week 1 / Week 2 plan. Every item cites a knowledge-base entry with its source and checked date. It uses their programme's contact line and LMS link, and links to a student buddy from home. Dates are suggested. Print / save as PDF. |
| **No More Typing** *(Round 2)*: let people give a voice clip or photo; an AI model must understand it. | Voice first: hold the mic button (or hold Space while it's focused); a red dot and seconds counter show it's listening, and the clip is sent as WAV for Gemini to hear. Photo second: a photo or screenshot (Kaplan360 error, letter, timetable, notice) is resized in the browser and read by Gemini. The answer opens with "You said: …" / "In your photo: …", then the usual sourced steps, in English or 中文. |

## 10. Not building (put on the "next steps" slide)

Kaplan360 integration (deep links into the app), LMS integration, a staff queue for questions KampusCare can't answer yet, notifying staff about at-risk students (needs consent, a staff process and privacy review), accounts and chat history.

## Media and AI disclosure

- **AI model in the app:** Google Gemini (`gemini-3.5-flash-lite`, fallback `gemini-3.1-flash-lite`) via the Gemini API free tier.
- **Code:** most of it written by Claude Code (Opus) and Claude (Anthropic), reviewed and tested by the team.
- **Knowledge base:** text adapted from Kaplan Singapore's public Student Handbook pages and the Oct 2026 Student Services contact PDF (sources on each entry). Chinese titles drafted by AI, pending review by a Chinese speaker.
- **Photos and voice:** KampusCare doesn't keep students' photos or voice clips; Google's Gemini reads them to answer. No generated images, audio or video in the app. List any you add here.
