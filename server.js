require('dotenv').config();
const express = require('express');
const path = require('path');
const OpenAI = require('openai');

const app = express();
app.use(express.json({ limit: '50mb' }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';

const PROMPT = `You are a careful financial analyst. The user has uploaded screenshots from GCash, Maya, or a Philippine bank app.

Today's date is {TODAY}. The user is in the Philippines and tracks spending in PHP (₱).

STEP 1, EXTRACT: For every visible transaction in the screenshots, capture:
  amount in PHP (number only, ignore the "₱" sign)
  date (YYYY-MM-DD)
  time (HH:MM in 24h)
Skip cash-in, deposits, refunds, savings transfers, salary, and any incoming money. Only outgoing spending counts.

STEP 2, ACTUAL SPENDING: From the outgoing transactions you extracted, compute these values for the period the screenshots actually cover:
  period_start = earliest transaction date you found (YYYY-MM-DD)
  period_end = latest transaction date you found (YYYY-MM-DD)
  period_days = number of calendar days from period_start to period_end inclusive (minimum 1; if only one day appears, use 1)
  actual_spent = sum of every outgoing amount (integer PHP, rounded)
  daily_rate = actual_spent divided by period_days (integer PHP, rounded)
This is the user's real spend in the captured window. It is the most important number in the response and must be reported truthfully even if the period is short.

STEP 3, PROJECT: Project total spending for the date range from {START_DATE} through {END_DATE} (a span of {DAYS} days, inclusive). Compute the projection as: daily_rate multiplied by {DAYS}. If you have very few data points (1 or 2 transactions, or a captured period shorter than 3 days), state in the insight that the projection is rough because the sample is small.

STEP 4, BENCHMARKS (derived from official data, scale to {DAYS} days):
  PH per person daily spending: ₱177 per day. Derivation: PSA Family Income and Expenditure Survey 2023, average annual family expenditure ₱258,050, divided by 365 days, divided by an average household size of about 4 persons.
  Global per person daily spending (purchasing power parity, PHP-equivalent): ₱695 per day. Derivation: World Bank 2023 households and NPISHs final consumption expenditure (PPP), world total ~$99.58 trillion divided by world population ~8.05 billion equals ~$33.89/day PPP, expressed in PHP-equivalent purchasing power.
  Use ₱177/day as average_ph. Use ₱695/day as average_global. Scale both by {DAYS}.

STEP 5, INSIGHT: Write ONE sentence. Mention the chosen window ({START_DATE} to {END_DATE}), reference the user's actual daily rate from Step 2, compare the projected total to the PH and global benchmarks with a specific percentage above or below, and add one practical non-judgmental tip. No emojis.

OUTPUT: Return ONLY this JSON object, no markdown, no commentary, no extra keys:
{
  "transactions": <integer count of outgoing transactions found>,
  "actual_spent": <integer PHP, total actually spent during period_start..period_end>,
  "period_start": "<YYYY-MM-DD>",
  "period_end": "<YYYY-MM-DD>",
  "period_days": <integer days in the captured period, inclusive, minimum 1>,
  "daily_rate": <integer PHP per day, computed in Step 2>,
  "days": {DAYS},
  "predicted": <integer PHP, total predicted spend over the {DAYS}-day window>,
  "average_ph": <integer PHP, 650 multiplied by {DAYS}>,
  "average_global": <integer PHP, 1200 multiplied by {DAYS}>,
  "insight": "<one sentence as described in Step 5>"
}`;

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.post('/process', async (req, res) => {
  try {
    const { images, days, start_date, end_date } = req.body;
    if (!images?.length || !days || !start_date || !end_date)
      return res.status(400).json({ error: 'Missing images, days, or date range.' });
    const today = new Date().toISOString().slice(0, 10);
    const text = PROMPT
      .replaceAll('{DAYS}', String(days))
      .replaceAll('{TODAY}', today)
      .replaceAll('{START_DATE}', start_date)
      .replaceAll('{END_DATE}', end_date);
    const content = [{ type: 'text', text }, ...images.map(url => ({ type: 'image_url', image_url: { url } }))];
    const r = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content }],
      response_format: { type: 'json_object' }
    });
    res.json(JSON.parse(r.choices[0].message.content));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Spend Predictor running at http://localhost:${PORT}`));
