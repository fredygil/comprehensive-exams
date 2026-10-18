# Comprehensive Exams

An installable web app (PWA) that helps a Student prepare for each quarter's comprehensive Exams from her own scanned notebooks. All data stays on the tablet; the app calls OpenRouter directly with a key entered in Settings ([ADR-0001](docs/adr/0001-v0-is-an-on-device-pwa.md)). Vocabulary: [GLOSSARY.md](GLOSSARY.md).

Live at https://fredygil.github.io/comprehensive-exams/ (deployed from `main`).

## Commands

```sh
npm ci                 # install
npm run dev            # dev server
npm test               # all tests (Vitest, jsdom)
npm run test:watch
npm run typecheck      # tsc -b over app, config and tests
npm run build          # typecheck + production build into dist/
npm run preview        # serve dist/ at /comprehensive-exams/ (service worker included)
npm run generate-pwa-assets   # regenerate icons from public/icon.svg
```

CI (`.github/workflows/deploy.yml`) typechecks, tests and builds every push and PR, and deploys `main` to GitHub Pages. The repo's Pages source must be set to "GitHub Actions".

## Layout

```
src/
  main.tsx               entry: creates the real services, renders <App>
  strings.ts             every piece of UI text (Spanish); components never hard-code copy
  app/
    App.tsx              router (hash routes) + first-run gate
    Layout.tsx           header and nav around every screen
    services.tsx         AppServices {store, gateway}: created per launch, read with useServices()
    config.ts            base path, public URL, attribution title
    persistentStorage.ts navigator.storage.persist() on launch
  store/store.ts         Store: the only module that touches IndexedDB (Dexie)
  gateway/               Model Gateway: the only module that talks to OpenRouter
    gateway.ts           operations (checkKey so far) + shared `send`
    errors.ts            GatewayError kinds: NoKey, InvalidKey, NoCredit, Offline, RateLimited, Unavailable, BadResponse
  settings/models.ts     AI jobs and their default models
  components/            shared UI (Section, GradeLevelSelect, NeedsKey)
  screens/               one folder/file per screen
tests/
  harness/               the app-level test harness (below)
  *.test.tsx             app-level tests, one file per feature
```

New modules from spec #1 (Page Splitter, Reading Queue, Quiz Maker, ...) get their own folder under `src/`. Screens reach them through `useServices()`; if a module needs the outside world, add it to `AppServices` in `src/app/services.tsx` so tests can swap it.

## Writing an app-level test

Tests use the app the way the Student does and assert on what she sees. The outside world is faked at its edges: IndexedDB (fake-indexeddb), OpenRouter (MSW) and time (a fake clock). Don't reach into Dexie tables, component state or prompt strings.

```tsx
import { screen } from '@testing-library/react'
import { it, expect } from 'vitest'
import { setClock } from './harness/clock'
import { openRouter, openRouterRequests, server } from './harness/openRouter'
import { renderApp } from './harness/renderApp'

it('shows the spend limit', async () => {
  setClock('2026-10-18T09:00')                               // fake clock (only Date)
  server.use(openRouter.key.valid({ limit: 10, limitRemaining: 7.5 }))  // scripted OpenRouter
  const app = await renderApp({ student: { name: 'Ana', gradeLevel: 5 } })

  await app.user.click(await screen.findByRole('link', { name: 'Ajustes' }))
  await app.user.type(screen.getByLabelText('Clave'), 'sk-or-v1-good')
  await app.user.click(screen.getByRole('button', { name: 'Probar clave' }))

  expect(await screen.findByText('Límite de gasto: $10.00.')).toBeInTheDocument()
})
```

- **`renderApp(options?)`** (`tests/harness/renderApp.tsx`) renders the whole app on a fresh "tablet": its own fake IndexedDB database and fake `navigator.storage`. It returns:
  - `user`: a user-event instance for taps and typing;
  - `reopen()`: closes the app (unmount + close the Store) and launches it again on the same database at the start URL. Use it for anything that must survive a restart;
  - `storage`: the fake `navigator.storage` (`persist` / `persisted` are `vi.fn`s).
  - `options.student` / `options.openRouterKey` are preconditions written through the Store's public API before launch. Use them to skip setup that isn't what the test is about; drive the behaviour under test through the screens. Add more options here as later tickets need them (always via Store methods, never raw tables).
- **MSW** (`tests/harness/openRouter.ts`): every test starts with `defaultHandlers` (a working key, no limit). Override per test with `server.use(openRouter.key.invalid())`, `.status(402)`, `.offline()` and so on. Unhandled requests fail the test, so add a scripted response to `openRouter` for each new endpoint (chat completions, etc.). `openRouterRequests` lists the requests sent in the current test, for the spec's one allowed request check (headers, Language and Grade Level in the prompt).
- **Fake clock** (`tests/harness/clock.ts`): `setClock('2026-10-18T09:00')` freezes `Date` only; timers stay real, so `findBy*`/`waitFor`, user-event, MSW and Dexie work unchanged. Call it again to move time; it is reset after each test.
- **Queries**: prefer roles and labels with the literal Spanish text. Each Settings card is a `region` named by its heading (`<Section title>`), so `within(screen.getByRole('region', { name: 'Modelos' }))` scopes a query to it.
- `tests/harness/setup.ts` wires all of this up and resets it after every test.
