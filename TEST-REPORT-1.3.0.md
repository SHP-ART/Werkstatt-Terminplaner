# Test Report: Phase 5 (v1.3.0)

**Date:** 2026-01-21  
**Environment:** local dev server (macOS), backend on port 3001  
**KI mode:** local  

## Summary

- Frontend performance tested with Lighthouse (local run).
- Backend load test executed with 120 parallel requests.
- Fuzzy search accuracy sanity check performed.
- KI time estimation sanity check performed.
- Backwards compatibility check performed for core API endpoints.

## 1) Frontend Performance (Lighthouse)

Command:

```bash
npx lighthouse http://localhost:3001 --output=json --output-path=logs/lighthouse.json --quiet --chrome-flags="--headless"
```

Key metrics (from `logs/lighthouse.json`):

- Performance: 0.62
- Accessibility: 0.96
- Best Practices: 1.00
- SEO: 0.82
- FCP: 4003 ms
- LCP: 5529 ms
- TBT: 257 ms
- CLS: 0.00
- TTI: 5529 ms

## 2) Backend Load Test (120 parallel requests)

Command (Node.js):

```bash
node - <<'NODE'
const http = require('http');
const total = 120;
const url = 'http://localhost:3001/api/kunden';

function requestOnce() {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const req = http.get(url, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        const end = process.hrtime.bigint();
        resolve({ status: res.statusCode, ms: Number(end - start) / 1e6 });
      });
    });
    req.on('error', (err) => {
      const end = process.hrtime.bigint();
      resolve({ status: 0, ms: Number(end - start) / 1e6, error: err.message });
    });
  });
}

(async () => {
  const startAll = process.hrtime.bigint();
  const results = await Promise.all(Array.from({ length: total }, () => requestOnce()));
  const endAll = process.hrtime.bigint();
  const totalMs = Number(endAll - startAll) / 1e6;

  const ok = results.filter(r => r.status === 200);
  const times = ok.map(r => r.ms).sort((a, b) => a - b);
  const avg = times.reduce((sum, t) => sum + t, 0) / (times.length || 1);
  const p50 = times[Math.floor(times.length * 0.5)] || 0;
  const p95 = times[Math.floor(times.length * 0.95)] || 0;
  const p99 = times[Math.floor(times.length * 0.99)] || 0;
  const max = times[times.length - 1] || 0;

  console.log({
    totalRequests: total,
    ok: ok.length,
    errors: results.length - ok.length,
    totalWallMs: Math.round(totalMs),
    avgMs: Math.round(avg),
    p50Ms: Math.round(p50),
    p95Ms: Math.round(p95),
    p99Ms: Math.round(p99),
    maxMs: Math.round(max)
  });
})();
NODE
```

Result:

- totalRequests: 120
- ok: 120
- errors: 0
- totalWallMs: 790
- avgMs: 502
- p50Ms: 546
- p95Ms: 756
- p99Ms: 762
- maxMs: 764

## 3) Fuzzy Search Accuracy (Sanity Check)

Sample query and result:

- Candidate: `ALB DACHBAU GmbH` (id 20)
- Query: `ALB DACHAU GmbH`
- Result: candidate returned with `fuzzy_score: 66`

## 4) KI Time Estimation (Sanity Check)

Request:

```json
{
  "arbeiten": ["Inspektion klein", "Bremsen vorne", "Ölwechsel"],
  "fahrzeug": "Citroen C3"
}
```

Response (local mode):

- Inspektion klein: 1.63 h (default)
- Bremsen vorne: 1.5 h (lokal)
- Ölwechsel: 0.5 h (modell)
- Gesamtdauer: 3.63 h
- Modell-Samples: 30

## 5) Backwards Compatibility (Core Endpoints)

All returned status 200:

- GET `/api/kunden`
- GET `/api/termine`
- GET `/api/mitarbeiter`
- GET `/api/lehrlinge`
- GET `/api/arbeitszeiten`
- GET `/api/ersatzautos`
- GET `/api/einstellungen/werkstatt`
- GET `/api/auslastung/2026-01-21`

## Not Executed

- PostgreSQL migration test (requires PostgreSQL setup)
- Windows installation test (requires Windows environment)
