# Comprehensive Exams

An installable web app (PWA) that helps a Student prepare for each quarter's comprehensive Exams from her own scanned notebooks. All data stays on the tablet; the app calls OpenRouter directly with a key entered in Settings ([ADR-0001](docs/adr/0001-v0-is-an-on-device-pwa.md)). Vocabulary: [GLOSSARY.md](GLOSSARY.md).

Live at https://fredygil.github.io/comprehensive-exams/ (deployed from `main`).

## Commands

```sh
npm ci                 # install
npm run dev            # dev server
npm test               # all tests: the app in jsdom + the Page Viewer in Chromium
npm run test:unit      # only the app-level tests (jsdom)
npm run test:browser   # only the browser-mode tests (needs `npx playwright install chromium` once)
npm run test:watch
npm run typecheck      # tsc -b over app, config and tests
npm run build          # typecheck + production build into dist/
npm run preview        # serve dist/ at /comprehensive-exams/ (service worker included)
npm run generate-pwa-assets   # regenerate icons from public/icon.svg
OPENROUTER_API_KEY=sk-or-... npm run live-check   # manual: real models on sample Pages (see "Live check")
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
    services.tsx         AppServices {store, gateway, readingQueue, quizMaker, quizSession, backup, saveFile}: created per launch, read with useServices()
    downloadFile.ts      the real saveFile: hands a file to the browser as a download
    config.ts            base path, public URL, attribution title
    persistentStorage.ts navigator.storage.persist() on launch
  store/store.ts         Store: the only module that touches IndexedDB (Dexie)
  gateway/               Model Gateway: the only module that talks to OpenRouter
    gateway.ts           operations (checkKey, readPage, generateStructured, generateWithWebSearch) + shared `send` and `complete`
    errors.ts            GatewayError kinds: NoKey, InvalidKey, NoCredit, Offline, RateLimited, Unavailable, BadResponse
    dataUrl.ts           bytes → data URL (image and file parts)
  prompts/               Prompt Builder: context.ts (Language, Grade Level, Markdown+math rules) + one file per prompt
  pageSplitter/          Page Splitter: picked file → MaterialDraft (a photo is one Page; a PDF is split with pdf-lib)
  pageViewer/            Page Viewer: a Page's original (photos: <img>; PDF Pages: PDF.js canvas, PdfPage.tsx)
  quizMaker/             Quiz Maker: generates a Practice Quiz's Questions and places the correct options
  quizSession/           Quiz Session: answers and submits a quiz; Score and Feedback (offline)
  backup/                Backup: backup.ts (exportAll, read, importAll; the file format), errors.ts (InvalidBackupError)
  readingQueue/          Reading Queue: reads unread Pages one at a time, records status in the Store; retries, pauses, resumes
  studyAids/             Study Aids: examText.ts (examText, promptContext), summary.ts (generateSummary), explainers.ts (suggestTopics, generateExplainer)
  settings/models.ts     AI jobs and their default models
  exams/calendar.ts      school year of a day, days until an Exam Date (local time)
  components/            shared UI (Section, NeedsKey, RichText, ExamList, DeleteWithConfirmation + confirmations, ...)
  screens/               one folder/file per screen (home, Period, exams/, material/, summary/, explainers/, quiz/, subjects/, settings/)
tests/
  harness/               the app-level test harness (below)
  *.test.tsx             app-level tests, one file per feature
  browser/               browser-mode tests (Chromium) of the Page Viewer, with fixtures/
live-check/              manual check against real OpenRouter (not in npm test or CI), with neutral sample Pages in fixtures/
```

New modules from spec #1 (Page Splitter, Reading Queue, Quiz Maker, ...) get their own folder under `src/`. Screens reach them through `useServices()`; if a module needs the outside world, add it to `AppServices` in `src/app/services.tsx` so tests can swap it.

### Material and Pages

- **Store**: a `Material` has `Page`s (status `unread → reading → read | failed`, `recognizedText`, `failure` = the GatewayErrorKind of the last failed read). A Page's original scan lives in its own table and is read with `getPageOriginal(pageId)` → `{ bytes: Uint8Array, mime }`, so listing Pages never loads scans. Bytes are stored as an `ArrayBuffer` (fake-indexeddb drops Blobs).
- **Page Splitter** (`splitIntoPages(file)`, `materialFromFile(file)`): `ACCEPTED_TYPES` is also the picker's `accept`. A PDF becomes one single-page PDF (`mime: 'application/pdf'`) per page, in order; pdf-lib is loaded on the first PDF. A PDF pdf-lib can't open throws `UnreadablePdfError`, a file of another type `UnsupportedFileError`; the Material section names the file and adds the rest of the pick.
- **Page Viewer** (`<PageViewer original alt />`): draws a PDF Page with PDF.js on a canvas fitted to its column (`role="img"`, `data-state` loading/ready), or a photo as an `<img>`. PDF.js is lazy-loaded. The Material screen pages through a Material with "Página anterior" / "Página siguiente" ("Página 2 de 3").
- **Model Gateway**: `readPage` sends a photo as an `image_url` part and a PDF Page as a `file` part with `plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }]`. Chat-based operations build a request body and call `complete(job, request)`, which picks the job's model from Settings (`getModel`) and turns an unusable 200 into a GatewayError (`finish_reason` `length`/`content_filter` or empty → `BadResponse`; `error` → `Unavailable`). It returns `{ content, annotations }`.
- **Prompt Builder**: every prompt takes a `PromptContext` (`{ language, gradeLevel }`); shared lines (`studentLine`, `MARKDOWN_WITH_MATH`) are in `src/prompts/context.ts`.
- **Reading Queue**: `start()` (idempotent) reads every unread Page in order and ends any pause; `stop()` on app close; `retry(pageId)` reads a failed Page again ("Reintentar"). `RateLimited`/`Unavailable` are retried with backoff (`RETRY_DELAYS_MS`; `AppServices` takes a `wait`, instant in tests), then the Page is marked `failed` with its error kind and the queue moves on. `NoKey`/`Offline`/`InvalidKey`/`NoCredit` put the Page back to `unread` and **pause** the queue (`pause()` + `subscribe()`; screens use `useReadingPause()` / `<ReadingPausedNotice />` from `src/components/ReadingPaused.tsx`). It resumes on `start()`: "Reintentar", saving or testing a key in Settings, the window `online` event (`<App>`), adding Material, or the next launch. Pages left `reading` are requeued on the first start. Progress per Material: `store.examReadingProgress(examId)` / `readingProgress(pages)` → `strings.material.progress` ("12 / 30 páginas").
- **Correcting Material**: `editRecognizedText(pageId, text)` saves the Student's text and sets `editedByStudent`; every reading transition (`markPageReading/Read/Failed/Unread`, `requeueInterruptedPages`) skips an edited Page, so reading never overwrites her text. `renameMaterial`, `materialDeletion` (for the confirmation) and `deleteMaterial` (with its Pages and scans) are on the Store; the Material screen's "Este material" section uses them.
- **Material revision**: `Exam.materialRevision` (0 for a new Exam) goes up once per `addMaterials` call, `deleteMaterial` and real `editRecognizedText` change, inside the same transaction. Renaming and reading a Page don't change it. A Summary stores the revision it was built at; a mismatch means Outdated.
- **RichText** (`src/components/RichText.tsx`) renders Markdown with `$`/`$$` math (KaTeX), and rewrites `\(..\)`/`\[..\]`. Use it for every model-written text.

### Summary

- **Store**: at most one `Summary` per Exam (table keyed by `examId`): `markdown` (one `##` per topic), `builtAtRevision`, `builtWithLanguage`, `includedPageIds`, `createdAt`. `saveSummary(examId, draft)` replaces the one there; `examSummary(examId)` returns `{ summary, outdated, notIncluded }` or null. Outdated = the Exam's material revision or its Subject's Language differs from what it was built with, so a Language change (user story 15) needs no write of its own, and changing the Language back clears it. `notIncluded` = the Exam's Pages not in `includedPageIds` (unread, failed, or read after it was made). It is the `summary` Exam part ("El resumen").
- **Study Aids**: `examText(store, examId)` (`src/studyAids/examText.ts`, shared with Explainers) gives the read Pages' Recognized Text by Material, their `pageIds`, and `readPages` / `notIncluded` counts. `generateSummary(services, examId)` (`src/studyAids/summary.ts`) asks the `summary` model for `{ topics: [{ title, content }] }` (schema `summary`) and stores it with the revision and Language read *before* the request, so Material changed meanwhile leaves it Outdated. A failure throws a GatewayError and keeps the earlier Summary.
- **Screens**: the Exam screen's "Resumen" section ("Generar resumen", or "Leer el resumen" + "Regenerar"), and `#/examenes/:examId/resumen` (`SummaryScreen`). Both use `SummaryActions` for the Outdated notice, the "N páginas aún no se incluyen" warning, the key and read-Page rules, and the Spanish error.

### Explainers

- **Store**: an `Explainer` (`topic`, `markdown`, `sources: { url, title }[]`, `createdAt`) belongs to an Exam: `addExplainer`, `examExplainers` (newest first), `getExplainer`, `deleteExplainer`. It is an Exam part (`'explainers'`), and nothing marks it Outdated.
- **Model Gateway**: `generateStructured(prompt, schema, job)` sends a strict `json_schema` response format with `provider.require_parameters`, parses the content and returns `schema.parse(json)` (a `StructuredSchema<T>`: `{ name, schema, parse: (json: unknown) => T }`); content that isn't JSON, or that `parse` throws on, is `BadResponse`. Check counts and ranges in `parse`, not in the schema (strict modes vary by provider). `generateWithWebSearch(prompt)` uses the `explainer` model with the `openrouter:web_search` server tool and returns `{ markdown, citations }`: the `url_citation` annotations, each http(s) URL once.
- **Study Aids** (`src/studyAids/explainers.ts`): `examText` (see Summary) gives the availability rule (at least one read Page) and the topic suggestions' text. There is no "N páginas aún no se incluyen" warning: an Explainer is researched on the web, not written from her Material. `suggestTopics` uses the `summary` model; `generateExplainer` stores the Explainer and returns its id.
- **Screens**: the Exam screen's "Explicaciones" section (list, "Sugerir temas", a "Tema" field); `#/examenes/:examId/explicaciones/:explainerId` shows one, with "Fuentes" and its delete.

### Practice Quizzes

- **Store**: a `Question` (examId, prompt, four `options` in the order its Practice Quiz shows them, `correctIndex`, `explanation`, `sourceMaterialId` + `sourceMaterialName` snapshot, `isMistake`) belongs to its Exam, not to a quiz or Material, so deleting a Material leaves it intact. A `PracticeQuiz` (kind `practice` | `mistakes`, state `inProgress` → `submitted`, `items: [{ questionId, chosenIndex | null, optionOrder? }]`, `score`, `mayRepeat`, `createdAt`, `submittedAt`) lists its Questions in order. `getQuiz(id)` returns `{ quiz, questions }`, each Question as that quiz shows it: an item's `optionOrder` (indexes into `options`; missing = as stored) reorders its options, and `correctIndex` and `chosenIndex` are positions in that order, so Score, Feedback and the review need nothing else. `examRecognizedText(examId)` gives the read Pages' text per Material (what quizzes are made from; Study Aids use `examText`, above). The quizzes are the `quizzes` Exam part.
- **Model Gateway**: quizzes use `generateStructured(prompt, schema, 'practiceQuiz')` (see Explainers) with the `practice_quiz` schema; its `parse` keeps only well-formed Questions.
- **Quiz Maker** `createPracticeQuiz(examId, { count, materialIds? })`: one request with the read Recognized Text of the chosen Materials (all by default; labelled by id) plus the prompts of every earlier Question on the Exam (`store.examQuestionPrompts`, de-duplicated) to avoid; keeps well-formed Questions from those Materials, up to `count`. It places the correct option itself: each run of four Questions uses every position once, so the position always varies. A Question whose normalized prompt (case, accents, punctuation and spacing ignored) matches an earlier one is a repeat, and the quiz gets `mayRepeat: true`.
- **Quiz Session**: `answer(quizId, position, chosenIndex)` saves at once; `submit(quizId)` scores in the Store's transaction (`scoreOf`), with no network. `feedbackOf({ quiz, questions })` lists the wrong (or unanswered) ones for the results screen.
- **Mistakes**: `submit(quizId)` also sets each Question's `isMistake` in the same transaction (`mistakesOf`): a wrong or unanswered Question becomes a Mistake in any quiz; a right one stops being one only in a Mistakes Quiz. `store.mistakesFor(examId)` lists the current Mistakes. `createMistakesQuiz(examId, count)` picks up to `min(count, 20)` of them at random and stores a quiz of kind `mistakes` (`store.addMistakesQuiz`) that reuses those Question records (no model call, no key, works offline) but gives each its own `optionOrder`, placing the correct options like a Practice Quiz does, so a Mistake's correct option moves from quiz to quiz.
- **Resume and history**: a quiz also stores `currentPosition` (optional, missing = 0), the Question she is on; `quizSession.goTo(quizId, position)` saves it on every move, so `QuizQuestions` reopens there. `store.inProgressQuizzes(examId)` (newest first) and `store.submittedQuizzes(examId)` (most recently submitted first) list them. `quizSession.discard(quizId)` (`store.discardQuiz`) deletes an In Progress quiz with the Questions no other quiz lists (a Mistakes Quiz's reused Questions stay); nothing deletes a single Submitted quiz. `quizSession.unanswered(quizId)` reads the count from the Store, so an answer tapped just before "Entregar" counts.
- **Screens**: "Practicar" section on the Exam screen (`src/screens/quiz/QuizSection.tsx`: the In Progress quizzes (`InProgressQuizzes`: "Continuar" / "Descartar quiz"), count, a "Material del quiz" checkbox group when the Exam has 2+ Materials, and the "N páginas aún no se incluyen." warning for unread/failed Pages in scope), "Quiz de errores" section below it only while the Exam has Mistakes (`MistakesQuizSection.tsx`), "Historial" (`QuizHistorySection.tsx`), and `#/examenes/:examId/quiz/:quizId` (`QuizScreen`: `QuizQuestions` + `DiscardQuiz` while In Progress, with the "N de M respondidas" count and the unanswered warning before submitting; `QuizResults` + `QuizReview` ("Todas las preguntas") once Submitted; the "Algunas preguntas pueden repetirse" notice when `mayRepeat`, which only a Practice Quiz can set). A quiz is named after its kind with `strings.quiz.kinds[quiz.kind]` ("Quiz de práctica" / "Quiz de errores"), on its screen and in any list of quizzes. Copy for resuming, discarding and history is in `strings.quizzes`.

### Backup

- **Store**: `exportAll()` returns a `StoreSnapshot` (every table of the Dexie schema by name, rows as stored, scans as `ArrayBuffer`s) without the OpenRouter key; `replaceAll(snapshot)` clears every table and writes the snapshot's rows in one transaction, keeps this tablet's key, and puts Pages left `reading` back to `unread`. Both walk `db.tables`, so **a new table is in every backup without anyone listing it**; `isSnapshotOfThisStore(snapshot)` requires exactly the schema's tables, so a file missing one (or from another schema) is refused. A file whose rows IndexedDB won't take (missing or duplicate keys) throws `InvalidSnapshotError` and leaves everything as it was.
- **Backup** (`src/backup/backup.ts`, `services.backup`): `exportAll()` → a `File` named `mis-examenes-YYYY-MM-DD.backup`: one line of JSON (`{ format: 'mis-examenes-backup', version: 1, exportedAt, tables }`, each `ArrayBuffer` replaced by `{ $bytes: [offset, length] }`), a newline, then every scan's bytes back to back (no base64, no giant string). `read(file)` checks it without changing anything and returns `{ exportedAt, snapshot }`, or throws `InvalidBackupError` with `reason` `notABackup` or `newerVersion` (Spanish text in `strings.backup.invalid`). `importAll(contents)` stops the Reading Queue, replaces everything, and starts it again on the backup's unread Pages. **When the Store's schema changes** (a new table or a new `version(n)`), bump `BACKUP_VERSION` and convert older files in `read`.
- **Reading Queue**: `stop()` doesn't wait for the Page still out; whatever comes back for a Page sent before the last `stop()` is dropped, so an import never hangs on a slow read and a late text can't land on a restored Page with the same id.
- **Late Study Aids and quizzes**: a Summary, Explainer or Practice Quiz still being generated when its Exam is deleted, or when a backup replaces everything, is dropped when it comes back. Its maker takes `store.epoch()` before the model call and passes it to the write (`saveSummary`, `addExplainer`, `addPracticeQuiz`), which, inside its transaction, stores nothing if the Exam is gone or `replaceAll` has started a new epoch since (they return `false` / `null`). Any new write that follows a slow job should do the same.
- **Screens**: Settings' "Copia de seguridad" section (`BackupSection`: "Exportar copia", then `saveFile(file)` and "Copia lista: …"; "Importar copia"), and the same import on the first-run screen of a new tablet. `<ImportBackup onRestored>` (`src/components/ImportBackup.tsx`) reads the file, shows the `alertdialog` "¿Restaurar esta copia?" (the copy's day, that the key stays), then imports. From Settings it goes home with "Copia restaurada."; on the first-run screen the restored Student ends the first run. The picker has no `accept`: Android greys out file types it doesn't know.

### Data under an Exam

Deleting an Exam, or a Subject with its Exams, removes everything stored under it after a confirmation that names it. When a ticket adds data under an Exam (Material, Summary, Explainers, quizzes), it adds a kind to `ExamPartKind` and an entry to `examParts` in `src/store/store.ts` (tables, count, delete), plus its line in `strings.deletion.examParts`. Both confirmations and both cascades pick it up from there.

## Live check

A manual check that the default models are good enough, run by hand before handing the app over and after changing a default model. It is never part of `npm test` or CI (`vitest.config.ts` doesn't include `live-check/`), and the key comes only from the environment: never write it to a file in the repo.

```sh
OPENROUTER_API_KEY=sk-or-v1-... npm run live-check
# try other models (the defaults are in src/settings/models.ts):
OPENROUTER_API_KEY=sk-or-v1-... LIVE_CHECK_READ_MODEL=google/gemini-3.8-flash npm run live-check
```

Without the key it stops at once with a message saying how to set it. With one, it uses the app's real Model Gateway, prompts and Practice Quiz schema to:

1. read `live-check/fixtures/sample-page-es.pdf` (a scanned, handwritten-style Ciencias page in Spanish: a chemical equation and a table) with `readPage`, then make a 5-Question Practice Quiz in Spanish from that Recognized Text with `generateStructured`;
2. do the same with `live-check/fixtures/sample-photo-en.jpg` (a tilted phone photo of a math page in English: the Pythagorean theorem, a triangle, worked examples), with the quiz in English.

It prints the models used, each Recognized Text, the Questions with the correct option marked (`<- correct`) and the explanation, and after every call its token usage, cost, the model and provider that answered and how long it took, then the totals. A failed call is printed as `FAILED: <GatewayError kind>` and the run ends with a failed test; `InvalidKey` means the key is wrong, `NoCredit` that it has no credit left. `LIVE_CHECK_QUIZ_MODEL` and `LIVE_CHECK_GRADE_LEVEL` (default 6) are also read.

What to look for:

- **Recognized Text**: every word is there, in reading order and *not translated*; subscripts and formulas are LaTeX in `$...$` (e.g. `$6CO_2 + 6H_2O \rightarrow C_6H_{12}O_6 + 6O_2$`, `$a^2 + b^2 = c^2$`, `$\sqrt{25}$`); the comparison table is a Markdown table; no commentary or summary was added; unreadable words are `[?]`, not invented. The photo is the harder case (tilt, shadow). If it misses things, try `google/gemini-3.8-flash`, the stronger alternative.
- **Questions**: in the right Language and plain enough for the Grade Level; answerable from the page alone (nothing about topics the page doesn't cover); exactly one clearly correct option, with plausible wrong ones of similar length; the explanation says why; five different ideas, not the same fact five times; `Only N of 5 Questions came back usable` means the model sent malformed ones.
- **Cost**: at the default models' prices (`docs/research/openrouter-models.md`) each call should cost around a tenth of a cent; much more points at runaway reasoning or output tokens (`reasoning` in the usage line). Multiply the per-Page read cost by the Pages a Student adds in a quarter to see what reading costs.

The samples contain no personal information. They were rendered from HTML in a handwriting font (the PDF holds one JPEG, like a Drive scan); real notebook Pages must not be committed, since the repo is public.

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
  - `store`: the running app's Store, only for rules nothing on screen shows yet (e.g. `(await app.store.currentPeriodExams())!.exams[0].materialRevision`). Read through it; don't use it to set things up or change data mid-test;
  - `storage`: the fake `navigator.storage` (`persist` / `persisted` are `vi.fn`s);
  - `savedFiles`: the files the app handed to the tablet to keep (`saveFile`, a download in the real app), e.g. an exported backup to `user.upload` on another tablet;
  - `close()`: closes the app for good, so a second `renderApp()` can be another tablet (e.g. export on one, import on the next).
  - `options.student` / `options.openRouterKey` / `options.subjects` / `options.exams` are preconditions written through the Store's public API before launch. `exams[].materials: [{ name: 'Unidad 1', pages: ['# Fracciones ...'] }]` adds photo Material whose Pages are already read (one Recognized Text per Page), so no reading request is sent; `unreadPages: n` adds n more Pages still to be read (read on launch). `exams[].explainers: [{ topic, markdown, sources }]` adds Explainers. `exams[].summary: '## Tema ...'` adds a Summary as if generated after that Material was read (not Outdated, includes every read Page). Use them to skip setup that isn't what the test is about; drive the behaviour under test through the screens. Add more options here as later tickets need them (always via Store methods, never raw tables).
- **MSW** (`tests/harness/openRouter.ts`): every test starts with `defaultHandlers` (a working key, no limit). Override per test with `server.use(openRouter.key.invalid())`, `.status(402)`, `.offline()` and so on. Unhandled requests fail the test, so add a scripted response to `openRouter` for each new endpoint or operation. Page reading is `openRouter.readPage.text(md)` / `.texts([md1, md2])` / `.status(401)` / `.cutOff()` / `.offline()` / `.held()` (`{ handler, answer(md) }`: every read waits until the test answers), or `.inTurn(['md', 400, 'offline', 'hang'])` to script each Page in turn (`'hang'` never answers during the test, e.g. a Page still out when the app closes; setup.ts releases it afterwards). Structured JSON is matched by its schema name (`asksForJson(name)`), one group per schema, each with `.json(value)` / `.raw(text)` / `.status(n)` / `.offline()` / `.held()` (`{ handler, answer(value) }`, like `readPage.held()`): topic suggestions are `openRouter.topics.*`, Summaries are `openRouter.summary.*` (`.json({ topics: [{ title, content }] })`), quiz generation is `openRouter.practiceQuiz.*` plus `.questions([...])` (a `ScriptedQuestion[]`; Materials on a fresh tablet are ids `'1'`, `'2'`, ... in the order seeded). Add a new schema with `structured(name)`. Web-searched answers are `openRouter.webSearch.answer(md, [urlCitation(url, title)])` / `.answers([...])` / `.status(n)` / `.offline()` / `.held()` (`answer({ markdown, annotations? })`) (matches the `openrouter:web_search` tool). Chat completions are told apart with `chatHandler(matches, respond)`: a handler only answers the requests it matches (e.g. readPage = has an image/file part) and lets others fall through, so add new kinds the same way. `chatCompletion(content)` builds the response body.
- **Files** (`tests/harness/files.ts`): `photo('unidad 1.jpg')` and `await pdf('unidad 3.pdf', 3)` for `user.upload(screen.getByLabelText('Agregar material'), ...)`, and `dataUrlOf(type, bytes)` for the request check. Page n of a `pdf()` is told apart with `pdfPageNumber(bytes)`; `openRouter.readPage.as(({ mime, bytes }) => markdown)` answers each Page from the scan it was sent, e.g. `` `Texto de la página ${await pdfPageNumber(bytes)}.` ``. `openRouterRequests` lists the requests sent in the current test, for the spec's one allowed request check (headers, Language and Grade Level in the prompt).
- **Page Viewer stand-in**: jsdom has no canvas, so `setup.ts` replaces `src/pageViewer/PageViewer` with `tests/harness/pageViewerStandIn.tsx` (every Page is an `<img>` named "Página N: original"). The real viewer is tested in `tests/browser/` (see below).
- **Fake clock** (`tests/harness/clock.ts`): `setClock('2026-10-18T09:00')` freezes `Date` only; timers stay real, so `findBy*`/`waitFor`, user-event, MSW and Dexie work unchanged. Call it again to move time; it is reset after each test.
- **Queries**: prefer roles and labels with the literal Spanish text. Each Settings card is a `region` named by its heading (`<Section title>`), so `within(screen.getByRole('region', { name: 'Modelos' }))` scopes a query to it.
- `tests/harness/setup.ts` wires all of this up and resets it after every test.

## Writing a browser-mode test

The spec's secondary seam: the Page Viewer in real Chromium (Vitest browser mode, Playwright), because PDF.js needs a real canvas. Tests are `tests/browser/*.browser.test.tsx` (the `browser` project in `vitest.config.ts`; no jsdom setup, no MSW, no IndexedDB) and typecheck with `tsconfig.browser.json`, apart from the jsdom tests, because `vitest/browser` declares its own DOM matchers. Render with `await render(...)` from `vitest-browser-react`, find with `page.getByRole(...)` from `vitest/browser`, and wait with `await expect.element(locator)...` or `await expect.poll(...)`. Fixtures (`tests/browser/fixtures/`, neutral content only) are imported with `?url` and fetched.
