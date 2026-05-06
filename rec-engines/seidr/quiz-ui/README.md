# Tabletop Player Profile Quiz — Static UI

A self-contained static-HTML quiz that gathers responses to ~18 questions and computes a 24-dimension player profile. **Profile-only output** — no recommendations attached. Recommendations come in a later sprint after seidr's game-profiling pipeline lands (per `../SPRINT_LOG.md` Sprint 0.2).

## Files

- `index.html` — the quiz app. Single file, embedded CSS + JS.
- `question-bank.json` — 50-question curated bank (copied from `../data/question-bank.json` for self-contained deploy)
- `dimensions.json` — 24 dimension definitions (copied from `../data/dimensions.json`)
- `README.md` — this file

## What it does

1. Welcome screen explaining what to expect ("about 18 questions, 5 minutes, your data stays on your device")
2. Samples 18 questions from the 50-question bank with constraint guarantees:
   - Each cluster (PSY/SOC/MEC/AES/CTX/EMO) hit ≥2 times
   - At least 1 game-vs-game, 2 this-or-that, 2 Likert, 1 multiple-choice
3. Walks through questions one at a time with progress indicator
4. Computes 24-dim profile + confidence using Manus's deterministic algorithm (vector init → weighted update → confidence-normalized)
5. Generates plain-English narrative summary of the top 3–5 strongest dimensions
6. Renders dimensional bars with low-confidence dimensions at reduced opacity
7. Exports the profile as JSON (copy or download)

## What it does NOT do

**Recommendations.** The profile is the output, not a list of suggested games.

The reason: recommendations require seidr's game-profiling pipeline (LLM-generated 24-dim vectors for ~500 games) which is the next sprint. Wiring this up to mimir's content-similarity recommender would cross silo boundaries and pollute the test signal. We're respecting the discipline.

When game profiling lands, this UI will be extended to include a results page with recommendations. Until then, the profile is a research artifact — useful for refining the question bank based on whether real users' profiles cluster sensibly and match face-validity expectations.

## Deployment

### Option 1: Drop on any static host

Upload the contents of this directory to any static host:

- **Vercel**: drag the directory into vercel.com/new
- **Netlify**: drop the directory on netlify.com/drop
- **GitHub Pages**: enable Pages on the repo, point to this directory
- **Cloudflare Pages**: point at the repo, set build root to this directory

No build step required. No server-side code. No cookies, analytics, or external requests.

### Option 2: Local file:// (most browsers)

Double-click `index.html`. Modern Chrome/Firefox/Safari often work with same-directory `fetch()` from file://. If your browser blocks it (Chrome can be strict), use Option 3.

### Option 3: Local server

```bash
cd rec-engines/seidr/quiz-ui
python3 -m http.server 8080
# then visit http://localhost:8080
```

Or `npx serve .`, or any static server you prefer.

## Privacy / data handling

- Nothing leaves the user's device. No fetch to external servers.
- The profile JSON is shown to the user; they can copy or download.
- No cookies, no localStorage, no telemetry, no tracking.
- Per Afterroar Credo, the player owns their data.

If this UI is deployed publicly, the deploying party should add a one-line privacy notice on the welcome screen explicitly. (The current notice covers it implicitly: "nothing leaves your device.")

## What to learn from real-user testing

When friendly testers take the quiz, look at their result JSONs and ask:

1. **Face validity:** does the profile match what you’d predict for that person?
2. **Coverage gaps:** which dimensions consistently came back low-confidence (≤ 33%)? Those need more questions or higher-weight signals.
3. **Question dropout:** any specific question where the user said "I didn’t know how to answer"? Trim or rewrite.
4. **Cluster sensibility:** when comparing profiles, do players who you’d intuitively group together actually cluster in the 24-dim space?
5. **Time-to-completion:** if average time exceeds ~7 minutes, sample fewer questions; if under 3, the bank may be too thin.

Feed findings back into `../data/question-bank.json` revisions.

## What’s next

- Seidr Sprint 0.1: deploy this UI publicly, gather ≥10 completed quizzes from friendly testers
- Seidr Sprint 0.2: LLM-generated game profiles for top ~500 games (the missing piece in Manus’s algorithm — see `../docs/game-profiling-strategy.md`)
- Seidr Sprint 0.3: schema additions (rec_seidr_player_profile, rec_seidr_game_profile)
- Seidr Sprint 0.4: cosine-similarity matcher
- Eventually: extend this UI with a results-page recommendation list

See `../SPRINT_LOG.md` for the full forward roadmap.
