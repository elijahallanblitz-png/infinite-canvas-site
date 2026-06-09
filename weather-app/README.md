# Weather Tracker

A self-contained weather app — one single `index.html` file. No build step, no API key,
no backend. It uses the free [Open-Meteo](https://open-meteo.com/) API for geocoding and forecasts.

Features:
- Search any city (or ZIP) worldwide
- "Use my location" button
- Current conditions, next-hours, and 7-day forecast
- °C / °F toggle

## Run it locally

Just double-click `index.html` to open it in your browser. That's it.

## Share it with a friend (easiest hosting options)

Because it's a single file, hosting is trivial. Pick one:

1. **Netlify Drop** (no account needed to try) — go to https://app.netlify.com/drop
   and drag the `weather-app` folder onto the page. You instantly get a public link
   like `https://your-name.netlify.app` you can text to a friend.

2. **GitHub Pages (separate repo)** — create a new repo (e.g. `weather-tracker`),
   upload this `index.html`, then enable Pages in Settings → Pages. You'll get
   `https://<username>.github.io/weather-tracker/`.

3. **Vercel / Cloudflare Pages** — same idea: connect the repo or drag the folder,
   get a free link.

All of these are free and keep this app completely separate from the Infinite Canvas site.
