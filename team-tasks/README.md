# Team Tasks

Live at https://team-tasks.infinitecanvas.workers.dev

The shared task board for Infinite Canvas. One Cloudflare Worker serves the app, the API and the Claude connector. Data lives in D1. A Cron Trigger runs every hour.

- `src/` — the Worker (TypeScript). `core.ts` holds the board rules. `connector.ts` is "Connect your Claude". `notify.ts` is the one notify function; `push.ts` and `sms.ts` are its two channels.
- `public/` — the app. Hand-written HTML, CSS and JS. `scripts/bundle-static.mjs` packs it into the Worker on every dev run and deploy.
- `migrations/` — the D1 schema.
- `test/` — unit tests. `e2e/` — browser tests.
- `DECISIONS.md` — every choice made along the way.

## Run it locally

```sh
npm install
npm run keys                      # writes .dev.vars with fresh secrets
npm run db:local
node scripts/seed.mjs --local --sample --out .secrets-local.json   # prints three invite links
npm run dev                       # http://localhost:8787
npm test                          # unit tests
npm run e2e                       # browser tests at 390x844 and 1440x900
```

## Deploy

```sh
export CLOUDFLARE_API_TOKEN=...   # "Edit Cloudflare Workers" template, plus Account > D1 > Edit
npx wrangler d1 create team-tasks # once; put the id in wrangler.jsonc
npm run db:remote
node scripts/generate-keys.mjs --json | npx wrangler secret bulk   # once
npm run deploy
node scripts/seed.mjs --remote --origin https://<your-worker-url>  # once; prints the invite links
```

Invite links are shown once. If the owner link is ever lost, run the seed command again with `--reset`.

## Point tasks.infinitecanvas.space at it

1. The domain `infinitecanvas.space` must be on the same Cloudflare account (Add a site, then switch nameservers).
2. In `wrangler.jsonc` add: `"routes": [{ "pattern": "tasks.infinitecanvas.space", "custom_domain": true }]`.
3. Also add `"vars": { "PUBLIC_URL": "https://tasks.infinitecanvas.space" }` so links and Twilio checks use the new name.
4. Run `npm run deploy`. Cloudflare creates the DNS record and the certificate.
5. Everyone opens their invite link once on the new address and re-adds it to their Home Screen. Claude links change too.

## Turn on text messages

When Twilio approves the registration, add three secrets. Nothing else changes.

```sh
npx wrangler secret put TWILIO_ACCOUNT_SID    # starts with AC
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put TWILIO_FROM_NUMBER    # like +13105550100, or a Messaging Service SID starting with MG
```

Then, in Twilio, set the number's "A message comes in" webhook to `POST https://<your-worker-url>/webhooks/twilio/sms`.

## Check the live site

```sh
E2E_BASE_URL=https://<url> E2E_ELIJAH=<invite link> E2E_NEVAN=<invite link> npm run e2e
node scripts/check-connector.mjs <connector link from the Connect your Claude screen>
```
