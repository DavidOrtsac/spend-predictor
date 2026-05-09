# Spend Predictor, How We Built It

ITENT21 Submission, Castro, Fiel, Singson, Qiu.

A simple webpage that reads GCash and bank screenshots, tells you what you actually spent in the period the screenshots cover, and predicts what you'll spend across a date range you pick (up to one year ahead). It compares your projected spend against Filipino and global benchmarks. Two buttons, one calendar range picker, one screen.

## Architecture in One Picture

```
[ Browser, index.html ]
        |
        |  POST /unlock        (passcode)
        |  POST /process       (images + start_date + end_date + days)
        v
[ Node + Express, server.js, deployed to Google Cloud Run ]
        |
        |  OpenAI Chat Completions, vision + JSON mode
        v
[ OpenAI Model, returns structured JSON ]
```

The browser never talks to OpenAI directly. It only ever calls our own backend at `/unlock` and `/process`. The API key lives in Cloud Run's environment config (or in a local `.env` for dev), never in the page, never in the zip we hand out.

## Why This Shape

- **One HTML file, one script file, no build step.** Vanilla JS with one tiny library loaded from CDN (flatpickr for the date range). Loads instantly, works on any modern browser, easy to read on stage.
- **Tiny backend on purpose.** The OpenAI call is server-side, so the API key never travels to the browser. If we called OpenAI directly from the page, the key would be visible in DevTools.
- **JSON mode (`response_format: { type: 'json_object' }`).** We force the model to return parseable JSON. No regex, no string trimming, no markdown code fences to strip.
- **Pre-baked benchmarks in the prompt.** We give the model fixed numbers (₱650/day urban PH, ₱1,200/day global) inside the prompt itself. The model multiplies, it doesn't guess.
- **Password gate.** A passcode-protected entry page so only the teacher can hit the live site. Server-side validated, cookie-based.

## Frontend, `index.html`, Block by Block

### Block 1, Layout
```html
<!-- gate -->
<div id="gate">...passcode input + Unlock button...</div>

<!-- main app -->
<input type="file" id="files" accept="image/*" multiple hidden>
<button onclick="...files.click()">1. Upload Screenshots</button>
<button onclick="run()">2. Process</button>

<input id="dates" type="text" class="fp" readonly placeholder="Pick a start and end date">
<div id="dayCount"></div>

<div id="out"></div>
```
Two buttons and one date input. The first button triggers a hidden file input. The second runs the prediction. The date input is wired to flatpickr in range mode (one calendar, click start, click end, range highlights), capped at one year ahead, like a hotel booking site. The screenshots themselves carry the historical dates; the calendar is for the prediction window.

### Block 2, The Passcode Gate
```js
async function unlock() {
  const r = await fetch('/unlock', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode: $('code').value }) });
  if (r.ok) showApp(); else $('gate-err').textContent = 'Incorrect passcode.';
}
if (isAuthed()) showApp();
```
On load, we check `document.cookie` for an `auth=` token. If present, show the app immediately. Otherwise, show the gate. When the user enters the passcode, we POST it to `/unlock`; the server validates, sets the cookie, returns 200; we then reveal the main app.

### Block 3, Reading Files
```js
filesEl.onchange = async e => {
  imgs = await Promise.all([...e.target.files].map(f => new Promise(r => {
    const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f);
  })));
};
```
When the user picks files, we convert each one to a base64 data URL using `FileReader.readAsDataURL`. That format (`data:image/png;base64,...`) is exactly what the OpenAI vision API accepts inside `image_url`. We hold them in memory until "Process" is pressed.

### Block 4, Date Range Picker
```js
fp = flatpickr('#dates', {
  mode: 'range', minDate: today, maxDate: yearAhead,
  dateFormat: 'Y-m-d',
  defaultDate: [today, defaultEnd],
  onChange: dates => updateDayCount(dates)
});
```
flatpickr does the heavy lifting: a range-mode calendar with a hard one-year ceiling, no past dates, and a default of "today through 30 days from today". `updateDayCount` shows the live total under the input ("32 day(s) selected"). When the user presses Process, we read `fp.selectedDates`, format both dates as `YYYY-MM-DD`, compute the inclusive day count, and ship all three to the backend.

### Block 5, Calling the Server
```js
body: JSON.stringify({ images: imgs, start_date, end_date, days })
```
Single POST. The body is the array of base64 images and the date range with its computed day count.

### Block 6, Loading Animation
```js
const stages = ['Reading screenshots', 'Extracting transactions', 'Computing your actual spend', 'Building projection', 'Comparing to averages'];
ticker = setInterval(() => { i = (i + 1) % stages.length; el.firstChild.nodeValue = stages[i]; }, 1700);
```
While the OpenAI call runs (typically 5 to 15 seconds), the UI shows a CSS spinner plus a rotating status message every 1.7 seconds, with animated dots after the text. Pure CSS, no JS animation library.

### Block 7, Rendering
The result block is split into two sections:
- **What you actually spent**, the totals computed from the screenshots themselves (period start, period end, days covered, total spent, daily rate).
- **Projected for `<start>` to `<end>`**, three horizontal bars (You, PH avg, Global avg) plus a one-sentence insight.

The bars are scaled to whichever value is largest. No charting library, just three divs with `width: ...%`.

## Backend, `server.js`, Block by Block

### Block 1, Setup and Auth Token
```js
const PASSCODE = process.env.APP_PASSCODE || 'ITENT21-Submission_...';
const TOKEN = crypto.createHash('sha256').update(PASSCODE + 'spend-predictor').digest('hex').slice(0, 32);
```
The passcode comes from env (with a hard-coded fallback for local runs). We derive a 32-character SHA-256 token from it. The browser cookie carries the token, never the passcode itself.

### Block 2, The `/unlock` Route
```js
app.post('/unlock', (req, res) => {
  if (req.body.passcode === PASSCODE) {
    res.setHeader('Set-Cookie', `auth=${TOKEN}; Path=/; Max-Age=86400; SameSite=Lax`);
    res.json({ ok: true });
  } else res.status(401).json({ ok: false });
});
```
Simple constant-time-ish equality check, set cookie on success, 401 on failure. The cookie lasts 24 hours.

### Block 3, The Prompt
A five-step recipe (`EXTRACT → ACTUAL SPENDING → PROJECT → BENCHMARKS → INSIGHT`) followed by a strict JSON schema. Four placeholders, `{TODAY}`, `{START_DATE}`, `{END_DATE}`, `{DAYS}`, are substituted at request time. The benchmark numbers are baked into the prompt (₱650/day, ₱1,200/day from PSA, BSP, World Bank patterns), so the model multiplies known values rather than recalling figures.

The model is told to:
1. Extract every outgoing transaction (skipping cash-in, salary, transfers).
2. Compute what was actually spent in the captured screenshot window (period_start, period_end, period_days, actual_spent, daily_rate). This is the ground truth, reported first.
3. Project the spending across the user-chosen date range (start_date to end_date) by multiplying daily_rate by the chosen day count.
4. Multiply benchmarks by the same day count.
5. Write a single insight sentence comparing the user's projection to the benchmarks for that specific window.

### Block 4, The `/process` Endpoint
```js
app.post('/process', async (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'Locked. ...' });
  const { images, days, start_date, end_date } = req.body;
  const text = PROMPT.replaceAll('{DAYS}', String(days))
    .replaceAll('{TODAY}', today)
    .replaceAll('{START_DATE}', start_date)
    .replaceAll('{END_DATE}', end_date);
  const content = [{ type: 'text', text }, ...images.map(url => ({ type: 'image_url', image_url: { url } }))];
  const r = await openai.chat.completions.create({ model: MODEL, messages: [{ role: 'user', content }],
    response_format: { type: 'json_object' } });
  res.json(JSON.parse(r.choices[0].message.content));
});
```
Auth check first. Pull all four fields out. Substitute placeholders. Build the multimodal `content` array (one text part + N image parts). Call OpenAI with JSON mode on. Send the parsed JSON back.

### Block 5, Static File Safety
```js
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
```
We do NOT use `express.static('.')`. That would have served `.env` over HTTP. We explicitly serve only `index.html` on `GET /`.

## How It Looks End-to-End

1. User visits the URL, sees the gate, types the passcode.
2. Server validates, sets the auth cookie, browser shows the main app.
3. User clicks "Upload Screenshots", picks 1 to 10 images.
4. User clicks the date input, picks a start and end date in the dropdown calendar.
5. User clicks "Process".
6. Browser POSTs base64 images + start + end + day count to `/process`.
7. Server injects `{TODAY}`, `{START_DATE}`, `{END_DATE}`, `{DAYS}` into the prompt, attaches the images, calls OpenAI.
8. OpenAI extracts transactions, computes the actual spend in the captured window, projects forward across the chosen range, calculates benchmarks, and returns JSON.
9. Browser renders the actual-spend section, then the projection section with three bars and one insight sentence.

## Deployment, Google Cloud Run

We deployed the project to GCP Cloud Run, region asia-southeast1, free tier:

```
gcloud run deploy spend-predictor \
  --source . \
  --region=asia-southeast1 \
  --allow-unauthenticated \
  --env-vars-file=/tmp/spend-predictor-env.yaml \
  --memory=512Mi --cpu=1 --max-instances=5
```

Cloud Run reads the `Dockerfile` and builds the container itself. The API key and passcode are set via `--env-vars-file`, a YAML file that lives outside the project directory and is deleted after deploy. The image never contains the secrets, so anyone pulling our zip cannot extract the key from the container.

The service auto-scales from zero, so it costs nothing when idle (well within the free tier for a school demo).

## Running It Locally

```bash
cd spend-predictor
npm install
cp .env.example .env
# paste your OpenAI key into .env
npm start
# open http://localhost:3000
```

## Things to Know on Stage

- **"Why a backend?"** Security. The API key would be visible in the browser otherwise.
- **"Why a date range instead of a slider?"** Slider made you guess how many days "next month" is. Booking-site-style ranges are how people actually think about windows. Click start, click end, done.
- **"Why max one year?"** Beyond 12 months, daily-rate projection from a small screenshot sample becomes meaningless. The cap keeps results trustworthy.
- **"Why GPT-5.5?"** Vision + JSON mode in one call, latest model the team has access to. Configurable via env var, so we can swap to `gpt-4o-mini` or another vision model if needed.
- **"What about the passcode?"** Server-side check, cookie-based session, 24-hour expiry, SHA-256 token in the cookie (not the raw passcode).
- **"What if the screenshot is unclear?"** The model returns its best estimate; if there's only 1 or 2 transactions, it explicitly flags the projection as rough in the `insight` field.
- **"How accurate is the average?"** The benchmarks are baked from PSA Family Income and Expenditure Survey 2023, BSP consumer payment data, and World Bank household consumption. They are baselines for context, not absolute truth.
- **"Why those colors?"** Red for the user's projection (attention), blue for the local benchmark, green for the global benchmark. Clear visual hierarchy at a glance.

## File Map

```
spend-predictor/
├── index.html         Frontend: gate, upload, date range, render
├── server.js          Backend: auth, prompt, OpenAI proxy
├── package.json       Dependencies (express, openai, dotenv)
├── package-lock.json  Reproducible install
├── Dockerfile         For Cloud Run / any container host
├── .env.example       Template for the API key
├── .gitignore         Hides .env and node_modules
├── ARTICLE.md         This document
└── SETUP.md           Step-by-step setup for the teacher
```
