# Dashboard assets

`dashboard.css` and `dashboard.js` are inlined into every generated `dashboard.html` by `src/dashboard/render.ts`.
All figures are rendered server-side from `product-check-results.json`; the script only adds tabs, table filters and
a theme toggle, and is allowed by a SHA-256 hash in the page's Content-Security-Policy. Generate a dashboard with
`product-check dashboard <results.json>` (also written by `run`).
