# Simply Habits

A gentle, installable, offline-first habit tracker built with Next.js 16, React 19, Tailwind CSS 4, and the `@schorts` shared kernel and DAO packages. A fresh cream-and-sage interface and cat/checkmark identity reference the Simply product family without copying the base UI.

## Run

Requires Node.js 22 or newer.

```sh
cd simply-habits
npm install
npm run dev
```

Open http://localhost:3000. No Firebase credentials are needed for local tracking. Create your own habit or add a starter; there are no fabricated completions or sample statistics.

For installable/offline behavior, use the production build:

```sh
npm run build
npm start
```

The build generates PNG icons and a hashed offline asset manifest. Visit online once and wait for **Ready for offline use** in Settings. Thereafter the app shell, habit CRUD, check-ins, history, and insights work offline. On deployment, serve over HTTPS. Keep `public/precache.json`, `public/sw.js`, `public/icons`, and `.next/static` with the build. Don't regenerate the asset manifest independently of the matching Next.js build.

## Features

- Personal habits with categories, colors, descriptions, daily targets, time-of-day grouping, and selected weekdays.
- English and Spanish interface, selected initially from the device language and remembered when changed; dates and scheduled push copy follow the selected language.
- One-tap progress and undo, historical check-ins, search, completion filters, archive/restore.
- Calendar-local dates, scheduled-day streaks, 12-week activity view, weekly completion rates, and JSON export.
- Optional Google sign-in and Firestore sync, durable local outbox, automatic retry on reconnect/focus and every 30 seconds.
- Account-scoped local vaults, accessible native-dialog editing, responsive navigation, English/Spanish localization, Light/Dark/System themes (System by default), reduced-motion support, install guidance, and explicit offline/update/error states.

Scope intentionally excludes the base's demo social accounts, squads, leaderboards, and penalties. Time-of-day labels organize habits; actual reminder times are configured separately in Settings.

Habit dialogs use a full-screen layout on narrow phones, with scrollable fields and pinned close/save controls. Desktop dialogs remain centered, and the underlying page stays locked while editing.

## Web Push reminders

Notifications are opt-in, account-authenticated, and configured per device in **Settings → A gentle nudge**. Choose one time for each active habit and optionally a daily encouragement. The permission prompt only appears when you press Enable notifications. Reminder bodies do not reveal habit names on a lock screen. Signing out disables this browser's subscription; other signed-in devices remain enabled.

To enable real delivery:

1. Complete Firebase setup below and deploy the app over HTTPS.
2. Generate a VAPID key pair with `npx web-push generate-vapid-keys`. Put its public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, private key in server-only `VAPID_PRIVATE_KEY`, and a contact URI such as `mailto:admin@example.com` in `VAPID_SUBJECT`. Keep the private key secret and stable; changing keys requires devices to re-subscribe.
3. Generate a random `CRON_SECRET` of at least 32 characters (for example `openssl rand -hex 32`). Store it server-side. Rebuild after adding the public VAPID key.
4. Configure your hosting platform's authenticated scheduler to call `GET /api/cron/reminders` **every five minutes**, passing `Authorization: Bearer <CRON_SECRET>`. For Vercel, configure a cron with schedule `*/5 * * * *` and this path; the platform supplies the header from its `CRON_SECRET` environment variable. Ensure your plan supports this cadence. On other hosts use Cloud Scheduler or equivalent. A daily-only job is not sufficient.
5. Deploy the Firestore TTL configuration in `firestore.indexes.json` for the `deliveries.expiresAt` field, so seven-day delivery receipts are eventually cleaned up.
6. Sign in, sync your habits, install the app shell, and enable notifications. Press **Send test** and verify receipt on a physical device. Then schedule a habit a few minutes ahead, close the app, and confirm the real scheduler sends it. Also verify disabling notifications and signing out stop delivery.

The worker respects the configured IANA timezone, DST, scheduled weekdays, archived habits, and completed cloud check-ins. It has a ten-minute recovery window and skips schedules before initial device enablement. Each device/day/habit has a durable delivery receipt and a lease, so repeated or overlapping scheduler runs do not normally duplicate reminders. Web Push is at-least-once: a crash between provider acceptance and storing a receipt can redeliver; the notification tag coalesces duplicates on supporting browsers. Provider 404/410 responses remove expired subscriptions; other failures return errors and retry on the next tick within the window. A scheduler outage longer than ten minutes intentionally does not send stale reminders.

The in-memory kernel event bus publishes `ReminderDue` events to the Web Push subscriber; the Firestore database holds durable device preferences, worker leases, and delivery receipts. No timer in the page is used to pretend that closed-app delivery works.

Operational limits: this initial worker explicitly rejects more than 500 devices, stops at a 40-second processing budget, and has a 60-second route duration. Provision a paginated/queued background worker before exceeding these limits. Set scheduler failure alerts for non-2xx responses. Provider delivery, browser support, OS focus settings, network connectivity, and device sleep can delay or suppress a notification; exact-time delivery is not guaranteed. Firefox, Chromium, Apple, and Windows push endpoints are allowlisted to prevent arbitrary outbound URLs; other vendor endpoints fail explicitly.

iPhone/iPad Web Push requires iOS/iPadOS 16.4+ and an app installed to the home screen. Desktop/Android require a supported browser and notification permission. Cloud reminders cannot know about unsynced offline check-ins until you reconnect. Changing timezone when travelling requires updating this device's settings. Browser permission revocation, subscription expiration, or clearing site data requires re-enabling notifications. A shared-device offline sign-out unsubscribes at the push provider; stale server records are removed when the provider reports expiration.

## Launch checklist

Do not consider local/emulator success proof that production credentials or device push delivery work. Before launch:

- Set the real `NEXT_PUBLIC_SITE_URL`, Firebase web configuration, Google authorized domains, Admin credentials, VAPID variables, and `CRON_SECRET`; rebuild and deploy over HTTPS.
- Finalize the Privacy Policy and Terms, set `LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_EMAIL`, and `LEGAL_EFFECTIVE_DATE`, and verify the operator/contact information is public and correct.
- Deploy deny-all Firestore rules and TTL configuration. Confirm the server's service account can read/write its database and verify authentication tokens.
- Verify real Google login/logout, account isolation, cross-device sync, and reconnect after offline edits.
- Install the PWA, wait for offline readiness, close/reopen with networking disabled, and verify create/edit/check-in/undo/history and an update without data loss.
- Verify the test push and a scheduled reminder while the app is closed on target desktop, Android, and installed iOS devices; test completed/archived suppression, disable, and sign-out.
- Check public `/robots.txt`, `/sitemap.xml`, canonical and social cards; use a social debugger against the deployed URL.
- Configure scheduler error alerts and monitor sync/push errors, Firestore usage, worker limits, and storage/backups.

The interface defaults to Spanish when the browser's preferred languages include Spanish, otherwise English. A manual selection in Settings persists on that device and synchronizes the document language; scheduled push reminders use the app language the next time their settings are saved. The public Privacy Policy and Terms are still published in English, with an explicit notice when Spanish is selected.

The repository includes automated unit and Firestore/Auth-emulator checks. Live credentials, public social crawler access, OS push delivery, and hosting scheduler behavior still require the deployment acceptance checks above.

## Privacy Policy and Terms

Public, server-rendered `/privacy` and `/terms` pages are linked from Settings and the app footer, work without sign-in or JavaScript, and are precached for offline document navigation. They describe the implemented local vaults, optional Firebase sign-in/sync, push subscriptions, reminder limitations, delivery receipts, exports, logs, provider processing, and the fact that signing out/archiving does not delete cloud data.

Set `LEGAL_OPERATOR_NAME` to the actual operator, `LEGAL_CONTACT_EMAIL` to a monitored public support/privacy inbox, and `LEGAL_EFFECTIVE_DATE` to the finalized policy's effective date in `YYYY-MM-DD` format, then rebuild. These are public page contents even though the configuration is server-side. Empty fields render conspicuous placeholders and a pre-launch draft banner. Draft pages are `noindex` and excluded from the sitemap; completed configuration adds their canonical URLs to the sitemap and removes the draft banner. Setting fields is not evidence of legal review.

These pages are starting drafts, not legal advice or a compliance certification. Before launch, have the operator and an appropriately qualified adviser check applicable law, eligibility/children, operator identity, service-provider/data-location details, lawful bases where required, international transfers, retention/backups/logs, request handling, and any additional hosting/analytics practices. No specific jurisdiction, arbitration requirement, liability cap, guaranteed deletion deadline, or unimplemented self-service deletion feature is invented. Provide a real process to verify and handle access/deletion requests before advertising it to users. Future analytics, payments, medical use, or significant data-handling changes require revisiting the policies and any consent flows.

## SEO and social sharing

Set `NEXT_PUBLIC_SITE_URL` in `.env.local` (or your deployment environment) to the app's public origin, such as `https://habits.example.com`, then rebuild. It defaults to `http://localhost:3000`. Use an origin only, without a path, query, or fragment.

The home page includes a canonical URL, descriptive title and summary, Open Graph website metadata, an X/Twitter large-image card, and `WebApplication` JSON-LD. `/robots.txt` excludes the authenticated API from public crawling, and `/sitemap.xml` lists the public home page and configured legal pages. Localhost builds deliberately emit `noindex, nofollow` and deny crawling; deploying without setting the public URL will leave indexing disabled. Private habits and account data never appear in metadata, structured data, or the sitemap.

`public/social-cover.png` is the generated 1200 × 630 cat-inspired social cover, referenced with absolute URLs in both sharing cards. It is a public asset, not an authenticated image or a screenshot of user data. Social networks need a publicly accessible deployment to fetch the page and cover; localhost cannot produce external previews. Networks may cache older cards until their sharing debugger/inspector is refreshed.

The server-rendered startup view includes an indexable app description; JavaScript hydrates it into the personal tracker. A no-JavaScript message explains the browser requirements. SEO metadata makes the page eligible for indexing and rich sharing, but does not guarantee rankings or special search-result treatment.

## Firebase setup

1. Create a Firebase project and a Firestore database.
2. Enable **Authentication → Google** and add your deployed domain (and `localhost` for development) to authorized domains.
3. Register a web app. Copy `.env.example` to `.env.local` and fill the four `NEXT_PUBLIC_FIREBASE_*` values from its configuration.
4. Set server `FIREBASE_PROJECT_ID`. Use Application Default Credentials on your deployment, or set `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` using a server-only service account. The key can contain escaped `\n` line breaks. Never expose these credentials through `NEXT_PUBLIC_` or commit them.
5. Deploy the deny-all `firestore.rules` and `firestore.indexes.json` using your Firebase CLI/project. Browser Firestore access is deliberately denied: the Next.js API uses Admin credentials, verifies Firebase ID tokens (including revocation), and derives the `users/{uid}/habits` path from the token, not request data.
6. Rebuild after setting public environment variables. In Settings, connect with Google. Guest habits are copied into the signed-in vault on this explicit action; they are not automatically copied when an existing authentication session resumes. Signing out returns to the separate guest vault.

Without credentials, the app clearly labels cloud sync as unconfigured rather than simulating successful syncing. There are no service account files in this project.

### Local emulators

With Firebase CLI installed and Java available:

```sh
firebase emulators:start --project demo-simply-habits --only auth,firestore
```

Set the emulator environment variables shown in `.env.example`, and use the demo project ID in both server and client configuration. To exercise the Firestore DAO integration:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm test
```

## Architecture

```text
src/
  habits/
    domain/habit.entity.ts            # Kernel Entity, ID value object, invariants, domain event
    domain/habit.repository.ts        # Persistence port
    domain/habit.insights.ts          # Pure calendar and progress calculations
    create-habit/                     # Command + handler slice
    edit-habit/                       # Edit, archive, restore command slice
    check-in/                        # Increment/undo command slice
    list-habits/                      # Query + plain read model slice
    infrastructure/                  # IndexedDB and server-only Firestore DAOs
    ui/                              # Habit editor, cards, dashboard, insights
    bootstrap.ts                     # CQRS + in-memory event bus composition
  sync/
    domain/merge-habits.ts            # Deterministic conflict policy
    application/sync-client.ts        # Authenticated push/pull
    infrastructure/                  # Client auth and server Admin configuration
  shared/
    domain/calendar.ts
    application/habit-runtime.ts      # Local-first orchestration
    ui/                              # Account lifecycle, PWA lifecycle, cat companion
  app/api/sync/route.ts               # Authenticated Firestore edge
```

The implementation follows the shared kernel's packaged `ai/AGENTS.md` and its domain, command, query, subscriber, and wiring skills, plus the Firestore DAO skill.

UI changes dispatch kernel commands. Handlers modify the entity and save via the repository; the IndexedDB DAO writes both the habit and its latest outbox snapshot in one `IndexedDBUnitOfWork`. Only after that commit are recorded domain events handed to `InMemoryCommandBus`, which publishes through `InMemoryEventBus`. A subscriber refreshes the read model and requests cloud sync. Reads go through `InMemoryQueryBus`. Cloud I/O never gates local commits.

Sync sends bounded batches to an authenticated endpoint. The Firestore DAO runs merge/upsert inside transactions with all reads before writes. Configuration uses last-write-wins by its ISO timestamp; **each calendar day's check-in has its own timestamp**, so independent offline days are preserved. A zero-count entry represents an undo, and archive state is retained rather than deleting history. Equal timestamps use a deterministic tie-breaker. Concurrent edits to the **same** day's count use last-write-wins, not additive merging. Device clocks should be accurate.

Reconciliation merges against the current local model, not the snapshot originally sent, retaining local changes made during a request. Outbox acknowledgements and model updates are atomic. It is a coalescing durable state outbox, not a permanent event log. Browser Web Locks serialize writes across tabs in supported browsers; BroadcastChannel refreshes peer tabs. Use one tab in older browsers without Web Locks. The API is never service-worker cached; only the static app shell and build assets are cached. Updates activate on user confirmation.

Streaks count consecutive **scheduled** days and tolerate an unfinished current day until tomorrow. Historical entries retain their target when targets change. Historical scheduling/weekly denominators use the habit's current weekday schedule; archives are excluded from active consistency metrics but retained in all-time completion totals.

## Checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Tests cover entity validation, undo, historical targets, scheduled streaks, calendar boundaries, actual CQRS/event wiring, IndexedDB persistence and durable outbox, account separation, stale-sync reconciliation, deterministic conflict merges, SEO, reminder timezone/DST planning, and service worker push handling. The Auth/Firestore emulator suite also verifies subscriptions, ownership, scheduler protection, rate-limited test sends, delivery receipts/retries, and expired-device cleanup. The push transport is injected in tests; a physical-device test is still required to confirm provider delivery.

For repeatable desktop/mobile browser verification, install Chromium once with `npx playwright install chromium`, run `npm run build`, then `npm run test:e2e`. The runner starts an isolated production server on port 3100 and stops it afterwards. Tests create their own isolated browser vaults and check CRUD, archive/restore, export, completion/undo, app-shell reload and habit creation while offline, responsive overflow, SEO assets, and unconfigured notification states. Use a local-mode build for these guest-mode browser tests.

Production dependency overrides update gRPC and rimraf's glob dependency to patched releases while preserving Firebase's modular API. Recheck these overrides on dependency updates, alongside the emulator and browser suites.

Browser storage can be evicted or cleared. Use cloud sync or export regularly for a second copy. The app does not promise background syncing while closed; pending changes resume when it is opened with connectivity. Android/desktop installation depends on browser support; iOS installation uses Safari's Share → Add to Home Screen.
