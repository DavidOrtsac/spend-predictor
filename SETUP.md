# Spend Predictor, Setup Guide

ITENT21 Submission by Castro, Fiel, Singson, Qiu.

There are two ways to use this project: the live web version (no install), or running it locally on a computer.

## Option 1, live web version

Open the deployed URL: **https://spend-predictor-741977575581.asia-southeast1.run.app**

Upload one or more GCash, Maya, or bank screenshots, click the date input to open the calendar and pick a start and end date (up to one year ahead), then press Process. The OpenAI API key lives only on the server and is never sent to the browser.

## Option 2, run locally

You need Node.js 18 or newer (https://nodejs.org).

```
unzip spend-predictor.zip
cd spend-predictor
npm install
cp .env.example .env
```

Open the new `.env` file in any text editor and paste an OpenAI API key:

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.5
```

Only `OPENAI_API_KEY` is required. `OPENAI_MODEL` has a safe default if omitted.

You can get an API key at https://platform.openai.com/api-keys

Then start the server:

```
npm start
```

Open `http://localhost:3000` in any modern browser. Upload screenshots. Done.

## If GPT-5.5 is not available on your account

Some accounts may not yet have access to `gpt-5.5`. In that case, simply change the `OPENAI_MODEL` value in `.env` to one of these working OpenAI models. No code changes are needed.

| Model | Notes |
|---|---|
| `gpt-5` | Latest flagship model. Use if available. |
| `gpt-5-mini` | Lighter and cheaper GPT-5 variant. |
| `gpt-4o` | Reliable multimodal model with vision and JSON mode. Widely available. |
| `gpt-4o-mini` | Cheapest fallback. Vision-capable, JSON mode, very low cost. **Recommended fallback.** |
| `gpt-4-turbo` | Older but stable, supports vision. |

If `gpt-5.5` returns a "model not found" error, the simplest fix is to change one line in `.env`:

```
OPENAI_MODEL=gpt-4o-mini
```

then restart with `npm start`.

## What is in the package

| File | What it does |
|---|---|
| `index.html` | The webpage shown in the browser. Contains the upload button, date range picker, process button, and result rendering. |
| `server.js` | The small Node backend. Attaches images to a prompt, calls OpenAI, returns JSON. |
| `package.json` | Lists the three dependencies (express, openai, dotenv). |
| `Dockerfile` | Used for cloud deployments. Not needed for local use. |
| `.env.example` | Template showing which environment variables to set. Copy to `.env` and fill in. |
| `ARTICLE.md` | Walkthrough of how the project was coded, for our presentation. |
| `SETUP.md` | This file. |

There is no `.env` file in this zip on purpose. The OpenAI API key never ships with the code.

## Common issues

- **"model not found"**: change `OPENAI_MODEL` in `.env` (see fallback table above).
- **Page doesn't load locally**: confirm `npm install` finished without errors and that you ran `npm start` from inside the `spend-predictor` folder.
- **No transactions detected**: the screenshots may be too blurry, cropped, or only show non-spending entries (cash-in, salary, transfers). Try clearer screenshots that include outgoing transactions.
- **API rate limits**: if OpenAI returns a rate-limit error, wait a minute and try again, or use a smaller model from the fallback table.
