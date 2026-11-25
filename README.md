# Spend Predictor

Reads GCash, Maya and bank screenshots, totals what you spent, and projects your spending for any date range up to one year ahead. It compares the projection with Filipino and global benchmarks derived from PSA FIES 2023 and World Bank 2023 data.

Team project for ITENT 21 at Ateneo de Manila University (Castro, Fiel, Singson, Qiu).

## How it works

- Frontend: one `index.html` with vanilla JavaScript and a date range picker.
- Backend: Node.js and Express (`server.js`), deployed on **Google Cloud Run**.
- Model: OpenAI vision in JSON mode returns structured transactions, so the server never parses free text.
- Security: the API key stays on the server and never reaches the browser.

## Run it

- Live: https://spend-predictor-741977575581.asia-southeast1.run.app

- Setup steps: [SETUP.md](SETUP.md)
- Build notes, block by block: [ARTICLE.md](ARTICLE.md)
