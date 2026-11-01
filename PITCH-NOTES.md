# KampusCare pitch notes

What matters for the pitch and Q&A. For setup and running the app, see [README.md](README.md).

## The one-liner

> Kaplan answers in one place, in your language, checked against verified Kaplan information, and usable before you even have your Kaplan360 login.

## The honest framing: yes, it's a chatbot

Under the hood KampusCare is a chatbot, and Kaplan360 already has one: **Ask K360**. Don't hide that. What's different is **who can reach it** and **the rules it follows**. Judges respect teams that name the competition themselves.

## Differences we can claim

| # | Difference | Evidence |
|---|---|---|
| 1 | **Works before students have Kaplan360.** Login details are only sent after the programme starts, so in week 0, when freshmen have the most questions, they can't use Ask K360. KampusCare is a plain link: it works for incoming international students still overseas, and for parents. | Kaplan handbook, Administrative Matters: "Credentials to access the Kaplan360 app will be sent to them in due course after their programme officially starts." |
| 2 | **Every answer can be checked.** Each answer shows its source link and a last-checked date, and the start screen lists exactly what it knows. | Kaplan's own Ask K360 page warns it "may not always be accurate or complete". |
| 3 | **Says "I don't know" instead of guessing.** Out-of-scope questions get the right contact. | Live demo: ask about bubble tea. |
| 4 | **Safety before AI.** Crisis wording shows a fixed, pre-written card in 10+ languages, before the AI runs. Stress gets a gentle counselling suggestion, not hotlines. | `api/chat.js`, `npm test` |
| 5 | **Any language,** with app menu names kept in English so they match the screen. | Live demo in Chinese. |

**Weak claims (don't lead with these):** "uses AI", "it's a chatbot", "answers student questions". Ask K360 does all of these too.

## ⚠️ Do tonight: test Ask K360 head to head

We have **not** seen Ask K360, only Kaplan's description of it. Someone with a Kaplan360 login should ask **both** bots these 5 questions and screenshot every answer:

1. How do I apply for leave?
2. Which clinic can I go to with my student insurance?
3. How do I withdraw from my programme?
4. 我生病了明天不能上课怎么办 (Chinese: "I'm sick and can't go to class tomorrow, what do I do?")
5. Where is the nearest bubble tea? (it shouldn't know)

Blur names and student IDs in the screenshots.

**What the results mean for the pitch:**
- **Ask K360 makes things up, is vague, gives no source, or struggles with Chinese** → make a side-by-side slide. That's your strongest evidence.
- **Ask K360 is genuinely good** → lead with difference #1 (works before login) and frame KampusCare as *"the front door before Kaplan360, and a model for making Ask K360 more trustworthy"*. Don't claim it's better.

## Likely judge questions

| Question | Answer |
|---|---|
| Isn't this just Ask K360? | Use the table above. Lead with #1 (before login), then #2 (checkable answers). |
| Is it RAG? | It retrieves from an approved knowledge base. With 21–50 entries, the whole list fits in the prompt, which is more reliable than vector search at this size. We'd add vector search past a few hundred entries. |
| What if the info goes out of date? | Every entry has a source and a last-checked date shown to students. Staff update one JSON file, with no retraining. Next step: a staff editing page. |
| What if a student is suicidal? | A keyword check in 10+ languages runs before the AI and shows a fixed card (995, SOS 1767, IMH). The AI's own flag is a second check. It never tries to counsel. |
| Why are some steps "unverified"? | Kaplan360 screens aren't public. We marked them honestly rather than inventing menu names. (Better: verify them tonight and remove the badge.) |
| What does it cost? | $0 on Gemini's free tier and Vercel's free plan. If paid: about S$0.005 per question. |
| What about privacy? | No login, no chat history stored, feedback logs only yes/no. Users are told not to share personal details, because Gemini's free tier may use inputs to improve Google's products. |
| How would Kaplan adopt it? | Link it from the welcome email and orientation slides (week 0), then fold the grounding and source approach into Ask K360. |

## Evidence of need (15% of the score)

Not collected yet. Quick options tonight:
- A Telegram poll to classmates: "What was hardest to find in your first month at Kaplan?"
- Screenshots of repeated questions in freshman group chats, with names blurred.

## Key facts from Kaplan's site (checked 1 Nov 2026)

- Kaplan360 login details arrive **after** the programme starts.
- Ask K360 already exists inside Kaplan360, and Kaplan says it "may not always be accurate".
- Leave: apply in Kaplan360 at least 1 working day before, or within 3 working days of an emergency. Maximum 3 days per application.
- Attendance minimum: 90% for Student's Pass holders, 75% for everyone else.
- Student's Pass holders pay $5 for a GP visit under the group insurance.
- Counselling: Kaplan360 → "Academic" → "Counselling" → "+ New". Replies within 3 working days.
