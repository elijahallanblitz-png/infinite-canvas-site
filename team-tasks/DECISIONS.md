# Decisions

One line each. Newest thinking wins; the code is the source of truth.

## Platform
- Cloudflare, one Worker: app, API, connector, D1, hourly Cron. One account, one login, free tier. No simpler path found in the docs.
- The app lives in `team-tasks/` inside the site repo. The marketing site at the repo root is untouched.
- `wrangler.jsonc` (the format Cloudflare now recommends).
- The app's files (about 650 KB with fonts, icons and splash screens) are packed into the Worker script instead of Cloudflare's static-assets store. The assets upload could not authenticate from the build sandbox; one script upload could. ETags and long cache times keep it fast (live Lighthouse performance: 100).
- Live address: https://team-tasks.infinitecanvas.workers.dev (workers.dev subdomain `infinitecanvas` registered for the account).
- No framework and no UI kit. Hand-written HTML, CSS and one JS module (about 30 KB before compression). No build step.
- Fonts (Cinzel 400, Lexend variable) are self-hosted: faster on cellular, no third-party requests.
- Cron runs every hour in UTC. The code decides what the Pacific hour means, so daylight saving needs no config change.

## Sign-in
- Invite links hold a 256-bit random token. Only its SHA-256 hash is stored. Sessions work the same way.
- Because only hashes are stored, an invite link can be shown once: at seeding, when a person is added, or after "Reset link".
- Cookie: `__Host-tt`, HttpOnly, Secure, SameSite=Lax, 400 days (the browser maximum), renewed on use.
- Reset link deletes every session and push subscription for that person and changes their Claude link too.
- iPhone Home Screen apps have their own cookie jar. The manifest's start link carries a sign-in for that device, so the installed app opens signed in.
- Sign-in attempts: 20 per 10 minutes per IP (bad Claude links count too).
- No "remove a person" in v1. Reset their link to lock them out. Their tasks stay.
- `/tv` uses the normal sign-in: open any invite link on the TV's browser once, then go to `/tv`.

## Board
- Status tile tap moves one step forward. Tapping a done tile opens the task sheet.
- Counts sit at the top and stick there on scroll. Tapping a count filters the board. The Add button is docked at the bottom, by the thumb.
- The board opens as names only. Tap a name to drop its tasks down; the choice is remembered on that device. Each name shows its three counts. The wall display shows everything open.
- Each person's card shows 3 done tasks, then "Show N more done", so finished work does not bury open work.
- Open tasks sort by due date, soonest first. Done tasks sort newest first.
- "This week" means this Friday. From Friday on it means Sunday.
- The Check in button shows on teammates' open tasks in the list, and on every open task in the task sheet.
- Sync is a 4-second poll that costs one tiny read when nothing changed. Simpler and cheaper than sockets for five people.
- Rows glide to their new place with View Transitions where the browser has them.
- Haptic tap uses `navigator.vibrate`. iPhones do not support it, so there it is silent.
- Undo for a status change is 5 seconds. Undo for a removal is 7.

- Each name has a character picture supplied by the owner (Elijah: silver surfer, Nevan: adventurer, Gregory: shirt-opening hero), cropped to 240px and gently animated in CSS. They are the owner's images for private team use; swap the files in `public/avatars/` to change them. New people get their initial in a ring.

## Check-ins and notifications
- Any status change by anyone answers open check-ins on that task and tells the person who asked.
- An unanswered check-in also shows as a gold banner on the owner's board, with the same two buttons. It works with notifications off.
- During quiet hours (9 PM to 8 AM Pacific) messages are held and sent at 8:00 AM. Nothing is dropped.
- "Not started for 3 or more days" counts from the last time the status changed, not from creation.
- Digest: 9:00 to 9:59 AM Pacific, Monday to Friday, once per person per day, only if they have something to look at.
- Push is hand-rolled on WebCrypto (VAPID plus aes128gcm). No library works cleanly in Workers, and it is 80 lines.
- iPhone notifications cannot show buttons. There a tap opens the board with the Done / Working on it banner. Android and desktop get real buttons.
- Push replies use a signed token in the notification, so they work even if the cookie is gone.
- Texting stays off until `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER` exist. No code change to turn on.
- A text reply of 1 or 2 answers the newest open check-in for that phone number.
- STOP is honoured in our data as well as by Twilio. Twilio error 21610 also marks the number stopped.
- VAPID subject is `https://infinitecanvas.space`, not an email address, to keep personal email out of requests.

## Claude connector
- Claude's docs confirm custom connectors support "No sign-in" servers, so the personal secret URL is the identity. No OAuth.
- The Claude link is `/<person id>.<HMAC>` signed with a server secret. Nothing is stored, and it can be shown any time.
- Streamable HTTP with plain JSON responses and no sessions. It answers the `initialize` handshake and the newer `server/discover`.
- Bad links return 404, never 401, because Claude treats 401 as "start a sign-in".
- Names match loosely (exact, short form, spelling distance, sounds-like). Two close matches return the choices instead of a guess.
- Tasks can be named by number or by a few words. Two matches return the choices.
- Due dates accept words (today, tomorrow, Wednesday, this week, Nov 20) as well as dates, resolved in Pacific time.
- The connector path is `/claude/...`. The word "MCP" appears nowhere in the app.

## Limits
- Writes: 90 a minute per person. Reads: 600 a minute per person (in memory, so polling costs no database writes).
- Connector: 120 calls a minute per person. Check-ins: 20 per 10 minutes per person, and one per task per 4 hours.
- Team size capped at 12. Titles at 200 characters.

## Testing
- Unit tests run the real Worker code against in-memory SQLite behind a small D1-shaped shim: fast, no emulator flakiness.
- End-to-end tests drive real Chromium against the running app, locally and against the live URL. They clean up after themselves.
- Playwright is pinned to the version whose browser is installed in the build container.
