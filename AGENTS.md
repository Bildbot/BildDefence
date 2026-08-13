# AGENTS.md

## Project overview

Build a 2D roguelite tower-defense game inspired by the core gameplay loop of Rogue Defense: Hybrid Tower TD. The product must run from one codebase in three environments:

1. Android as a signed APK/app bundle.
2. Telegram as a Telegram Mini App.
3. A regular desktop or mobile browser for development and optional public access.

Use Rogue Defense only as a gameplay reference. Do not copy its name, characters, artwork, audio, text, maps, UI, progression data, or other protected assets. The game must have its own identity and content.

## Product principles

- The core loop is: start a run, survive enemy waves, gain experience/resources, choose randomized upgrades, create synergistic builds, defeat a boss or lose, then use persistent progression before the next run.
- The game is primarily single-player. Do not introduce multiplayer architecture without an explicit requirement.
- Mobile portrait is the primary layout. Desktop must preserve the same fair gameplay viewport; use additional horizontal space for HUD panels rather than increasing the player's visible arena.
- A player must be able to begin a run quickly. Avoid mandatory registration before first play unless platform authentication is already automatic.
- Keep the first playable version small and vertically complete instead of implementing many unfinished systems.

## MVP scope

Unless the task says otherwise, prioritize this playable slice:

- One arena and one complete run.
- One player-controlled guardian/tower.
- Three regular enemy types and one boss.
- Three weapon families.
- Approximately fifteen upgrades, including meaningful synergies.
- Experience gain and a choice of one of three upgrades on level-up.
- Wave progression, victory, defeat, restart, pause, and settings.
- Local save support plus a clean interface for later server synchronization.
- Touch, mouse, and keyboard support where appropriate.
- Telegram Mini App launch and a testable Android build.

Do not add shops, energy systems, ads, clans, PvP, daily quests, battle passes, or complex monetization until the core combat loop has been validated.

## Preferred technology

- TypeScript in strict mode.
- Phaser 3 for gameplay, rendering, input, physics/collision helpers, audio, and scenes.
- React for menus, metagame screens, settings, account UI, and overlays that are better expressed as DOM UI.
- Vite for development and production builds.
- Capacitor for Android packaging and native bridges.
- Telegram Mini Apps JavaScript API for Telegram integration.
- A server API and PostgreSQL when server-side identity, synchronization, economy, leaderboards, or purchases are introduced.

Do not replace the stack or add a large dependency without documenting why the existing approach cannot satisfy the requirement.

## Architecture

Keep game rules independent from platform APIs and presentation whenever practical.

Suggested boundaries:

- `game/`: deterministic gameplay state, combat rules, waves, upgrades, stats, and Phaser scenes.
- `ui/`: React menus, overlays, settings, progression, and responsive layout.
- `platform/`: browser, Telegram, and Android/Capacitor adapters.
- `services/`: authentication, saves, API calls, analytics, and purchases.
- `content/`: data-driven definitions for enemies, weapons, upgrades, waves, and balance.
- `shared/`: types, validation, utilities, constants, and events.

Expose platform behavior through an interface rather than branching throughout game code. Platform features may include:

- identity and authentication;
- fullscreen and orientation;
- haptic feedback;
- safe-area information;
- storage;
- sharing;
- notifications;
- purchases.

Never make the Phaser gameplay layer depend directly on `window.Telegram`, Capacitor plugins, or a particular payment provider.

## Telegram Mini App requirements

- Load and initialize the official Telegram Mini Apps bridge only in the Telegram environment.
- Call `Telegram.WebApp.ready()` when essential UI is ready.
- Request fullscreen and orientation locking only after a user gesture when required by the client.
- Disable Telegram vertical swipes during active gameplay when supported; restore expected behavior outside gameplay if appropriate.
- Respect `safeAreaInset`, `contentSafeAreaInset`, viewport changes, and Telegram Desktop resizing.
- Pause gameplay and audio when the Mini App becomes inactive; resume only through a safe, explicit state transition.
- Treat `initDataUnsafe` as display-only, untrusted input.
- Send raw `initData` to the server and validate its signature, freshness, and expected bot identity server-side before accepting the Telegram user identity.
- Never ship the bot token or other server secrets to the client.
- Use `start_param` for referral or deep-link context only after server-side validation.
- Telegram-specific failure must not prevent ordinary browser startup.

## Android requirements

- Package the same production web build with Capacitor; do not fork gameplay code for Android.
- Support Android back-button behavior intentionally: close overlays first, then pause/confirm leaving a run, then exit only when appropriate.
- Pause gameplay and audio on app backgrounding and persist recoverable run state when possible.
- Handle safe areas, navigation bars, status bars, screen rotation, and different pixel densities.
- Keep native permissions minimal and request them only at the moment they are needed.
- Keep signing credentials, service configuration, and store secrets out of the repository.
- Treat APK sideloading, Google Play, and RuStore distribution as separate release targets when their billing or policy requirements differ.

## Responsive gameplay and input

- Design for small portrait phones first, then tablets and desktop.
- Use CSS safe-area environment variables and platform-provided safe-area values.
- Use large touch targets; interactive controls should normally be at least 44 CSS pixels in their smallest dimension.
- Do not rely on hover or right-click for required actions.
- Prevent browser scrolling, pull-to-refresh, selection, and accidental zoom only inside the active game surface; do not unnecessarily damage accessibility in menus.
- Account for high-DPI displays without rendering the canvas at an unbounded resolution.
- Keep the logical arena dimensions and simulation rules independent from physical screen pixels.
- Do not grant desktop players a larger combat view than mobile players.

## Performance rules

The game must remain usable inside mobile Telegram WebViews, not only desktop Chrome.

- Use object pools for enemies, projectiles, damage numbers, and particles with high churn.
- Avoid per-frame object allocation in hot paths.
- Avoid React state updates on every animation frame; communicate summarized game state through explicit events or a small state bridge.
- Use atlases/sprite sheets and compressed, appropriately sized assets.
- Cap particle counts and expensive effects, and provide quality tiers when necessary.
- Use spatial partitioning or another bounded approach when collision/target searches become quadratic.
- Use a fixed or otherwise well-controlled simulation timestep.
- Profile on a mid-range Android device and Telegram WebView before treating performance work as complete.
- Do not prematurely optimize cold paths; measure first and record the actual bottleneck.

## Game systems and content

- Define enemies, weapons, upgrades, and waves as typed data rather than hard-coding every variant in scene classes.
- Separate base stats, additive modifiers, multiplicative modifiers, and final derived values. Make stacking rules explicit.
- Upgrades presented to the player must be valid, understandable, and meaningfully different whenever the available pool permits.
- Seed random generation when reproducibility is useful for tests and bug reports.
- Keep combat outcomes consistent across frame rates.
- Avoid hidden economy changes. Balance constants should be reviewable and versioned.

## Saves, identity, and server authority

- Put save access behind a storage interface with browser, Telegram, Android, and remote implementations as needed.
- Version every save schema and provide migrations for compatible older saves.
- Validate parsed save data before use; handle corruption by preserving or quarantining the original where possible.
- Local storage may support guest play, settings, and offline state, but valuable persistent progression must eventually be synchronized and validated by the server.
- If progress is shared between Telegram and APK, link both identities to one internal player ID. Never use a display name as identity.
- Server-authoritative systems must include purchases, paid currency, reward claims, competitive scores, and other exploitable economy actions.
- Make retries idempotent so a repeated request cannot grant the same reward or purchase twice.
- Never log authentication payloads, bot tokens, payment secrets, or unnecessary personal data.

## Payments

- Keep the product catalog and entitlement granting independent from the payment provider.
- Use Telegram Stars for digital goods sold inside Telegram when required by Telegram rules.
- Use the appropriate store billing system for store-distributed Android builds.
- Verify all payment results server-side before granting entitlements.
- Use unique transaction IDs and idempotent fulfillment.
- Do not implement payment flows until explicitly requested.

## Coding standards

- Prefer small, explicit modules over large scene or manager classes.
- Keep TypeScript strict; do not use `any` to bypass design problems without a documented boundary.
- Use descriptive domain names such as `WaveDirector`, `UpgradeOffer`, and `PlatformAdapter`.
- Remove dead code rather than commenting it out.
- Explain non-obvious gameplay math and platform workarounds in concise comments.
- Do not duplicate rules across Phaser, React, Telegram, and Android layers.
- Avoid unrelated refactors while implementing a focused task.
- Preserve existing user changes and follow more specific `AGENTS.md` instructions found deeper in the repository.

## Testing and verification

For gameplay and platform changes, use the smallest relevant set plus any broader checks already established by the repository:

- unit tests for stat calculations, upgrade eligibility, seeded randomness, rewards, and save migrations;
- integration tests for authentication, save synchronization, and idempotent reward/payment endpoints;
- browser smoke tests for startup, new run, pause/resume, level-up selection, victory/defeat, and persistence;
- manual verification in Telegram Android, Telegram iOS when available, Telegram Desktop, mobile Chrome, and desktop Chrome;
- Android verification for lifecycle pause/resume, back button, safe areas, offline startup behavior, and release build installation.

Before declaring work complete:

1. Run formatting, linting, type checking, and relevant tests.
2. Build the production web bundle.
3. Confirm ordinary browser startup still works if Telegram or Capacitor APIs are absent.
4. Check that no secrets or generated signing files were added.
5. Report what was verified and clearly state any platform test that could not be performed.

## UX and accessibility

- Game text must remain readable on small screens and at common desktop scaling levels.
- Do not convey essential information by color alone.
- Provide independent controls for music, effects, and vibration.
- Avoid rapid flashing and excessive screen shake; provide reduced-effects options where appropriate.
- Pause menus and upgrade choices must stop or safely suspend combat.
- Confirm destructive actions involving paid currency or irreversible progression.

## Working approach

- When requirements are ambiguous, protect the core loop and cross-platform architecture first.
- For large features, propose the smallest playable vertical slice before expanding scope.
- Keep commits and changes focused and reversible.
- Document new environment variables in an example environment file without real values.
- Update this document when a durable architectural or product decision changes.
