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
    App.tsx              router (hash routes) + first-run gate; starts/stops the Reading Queue
    Layout.tsx           header and nav around every screen
    services.tsx         AppServices {store, gateway, readingQueue}: created per launch, read with useServices()
    config.ts            base path, public URL, attribution title
    persistentStorage.ts navigator.storage.persist() on launch
  store/store.ts         Store: the only module that touches IndexedDB (Dexie)
  gateway/               Model Gateway: the only module that talks to OpenRouter
    gateway.ts           operations (checkKey, readPage) + shared `send` and `complete`
    errors.ts            GatewayError kinds: NoKey, InvalidKey, NoCredit, Offline, RateLimited, Unavailable, BadResponse
    dataUrl.ts           bytes → data URL (image and file parts)
  prompts/               Prompt Builder: context.ts (Language, Grade Level, Markdown+math rules) + one file per prompt
  pageSplitter/          Page Splitter: picked file → MaterialDraft (photos so far)
  pageViewer/            Page Viewer: a Page's original (photos: <img>)
  readingQueue/          Reading Queue: reads unread Pages one at a time, records status in the Store
  settings/models.ts     AI jobs and their default models
  exams/calendar.ts      school year of a day, days until an Exam Date (local time)
  components/            shared UI (Section, NeedsKey, RichText, ExamList, DeleteWithConfirmation + confirmations, ...)
  screens/               one folder/file per screen (home, Period, exams/, material/, subjects/, settings/)
tests/
  harness/               the app-level test harness (below)
  *.test.tsx             app-level tests, one file per feature
```

New modules from spec #1 (Page Splitter, Reading Queue, Quiz Maker, ...) get their own folder under `src/`. Screens reach them through `useServices()`; if a module needs the outside world, add it to `AppServices` in `src/app/services.tsx` so tests can swap it.

### Material and Pages

- **Store**: a `Material` has `Page`s (status `unread → reading → read | failed`, `recognizedText`, `failure` = the GatewayErrorKind of the last failed read). A Page's original scan lives in its own table and is read with `getPageOriginal(pageId)` → `{ bytes: Uint8Array, mime }`, so listing Pages never loads scans. Bytes are stored as an `ArrayBuffer` (fake-indexeddb drops Blobs).
- **Page Splitter** (`splitIntoPages(file)`, `materialFromFile(file)`): `ACCEPTED_TYPES` is also the picker's `accept`. A PDF branch goes there.
- **Model Gateway**: chat-based operations build a request body and call `complete(job, request)`, which picks the job's model from Settings (`getModel`) and turns an unusable 200 into a GatewayError (`finish_reason` `length`/`content_filter` or empty → `BadResponse`; `error` → `Unavailable`). It returns `{ content, annotations }`.
- **Prompt Builder**: every prompt takes a `PromptContext` (`{ language, gradeLevel }`); shared lines (`studentLine`, `MARKDOWN_WITH_MATH`) are in `src/prompts/context.ts`.
- **Reading Queue**: `start()` (idempotent) reads every unread Page in order; `stop()` on app close. A failure marks the Page `failed` with its error kind; `NoKey` leaves it `unread` and stops. Pages left `reading` are requeued on the first start.
- **RichText** (`src/components/RichText.tsx`) renders Markdown with `$`/`$$` math (KaTeX), and rewrites `\(..\)`/`\[..\]`. Use it for every model-written text.

### Data under an Exam

Deleting an Exam, or a Subject with its Exams, removes everything stored under it after a confirmation that names it. When a ticket adds data under an Exam (Material, Summary, Explainers, quizzes), it adds a kind to `ExamPartKind` and an entry to `examParts` in `src/store/store.ts` (tables, count, delete), plus its line in `strings.deletion.examParts`. Both confirmations and both cascades pick it up from there.

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
  - `options.student` / `options.openRouterKey` / `options.subjects` / `options.exams` are preconditions written through the Store's public API before launch. `exams[].materials: [{ name: 'Unidad 1', pages: ['# Fracciones ...'] }]` adds photo Material whose Pages are already read (one Recognized Text per Page), so no reading request is sent. Use them to skip setup that isn't what the test is about; drive the behaviour under test through the screens. Add more options here as later tickets need them (always via Store methods, never raw tables).
- **MSW** (`tests/harness/openRouter.ts`): every test starts with `defaultHandlers` (a working key, no limit). Override per test with `server.use(openRouter.key.invalid())`, `.status(402)`, `.offline()` and so on. Unhandled requests fail the test, so add a scripted response to `openRouter` for each new endpoint or operation. Page reading is `openRouter.readPage.text(md)` / `.texts([md1, md2])` / `.status(401)` / `.cutOff()` / `.offline()`. Chat completions are told apart with `chatHandler(matches, respond)`: a handler only answers the requests it matches (e.g. readPage = has an image/file part) and lets others fall through, so add e.g. `openRouter.structured.*` the same way. `chatCompletion(content)` builds the response body.
- **Files** (`tests/harness/files.ts`): `photo('unidad 1.jpg')` for `user.upload(screen.getByLabelText('Agregar material'), ...)`, and `dataUrlOf(type, bytes)` for the request check. `openRouterRequests` lists the requests sent in the current test, for the spec's one allowed request check (headers, Language and Grade Level in the prompt).
- **Fake clock** (`tests/harness/clock.ts`): `setClock('2026-10-18T09:00')` freezes `Date` only; timers stay real, so `findBy*`/`waitFor`, user-event, MSW and Dexie work unchanged. Call it again to move time; it is reset after each test.
- **Queries**: prefer roles and labels with the literal Spanish text. Each Settings card is a `region` named by its heading (`<Section title>`), so `within(screen.getByRole('region', { name: 'Modelos' }))` scopes a query to it.
- `tests/harness/setup.ts` wires all of this up and resets it after every test.
