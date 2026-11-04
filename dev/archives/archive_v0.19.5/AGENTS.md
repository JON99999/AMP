# Environment & Agent Guidelines (AMP)

**AMP (Announcement Media Player)** is a standalone desktop broadcast application built with Electron, Express, and React/Vite.

## 🚨 1. MANDATORY ARCHIVE IMMUTABILITY (`dev/archives/`)
- **STRICT PROHIBITION**: NEVER create, modify, copy, tar, edit, or sync any folder or file inside `dev/archives/` unless the user's immediate prompt explicitly commands an archive operation (e.g., "Archive version X").
- **NO IMPLIED PERMISSION**: Bug fixes, tests, doc updates, schema migrations, name changes, or version bumps NEVER imply permission to touch `dev/archives/`.
- **DOUBLE-CHECK**: If any ambiguity exists regarding archives, ask the user and wait for explicit confirmation before touching `dev/archives/`.
- **ARCHIVE FORMAT (Strategy 2)**: When explicitly commanded to archive a version, store uncompressed snapshot files in `dev/archives/archive_v<version>/` (updating `package.json` and `package-lock.json` together). Never pack into `.tar.gz`/`.zip`, and never open binary/compressed files with `view_file`/`edit_file` (prevents UTF-8 `0xef 0xbf 0xbd` byte corruption).

## 2. Target Platforms, Desktop Architecture & Build Pipeline
- **Priority Order**:
  1. **macOS Silicon (`arm64`)**: Primary target; optimize for performance and power efficiency.
  2. **macOS Intel (`x64`)**: Secondary target.
  3. **Windows 10/11 (`x64`)**: Tertiary target.
  - If (2) or (3) degrade performance or binary size for (1), notify the user and ask preference.
- **Desktop & Cross-Platform Rules**:
  - Prioritize local executable execution over web deployment.
  - Use `path.join` (no OS-hardcoded paths) and test Mac vs. Windows folder structures.
  - Maintain the bundled Express backend pipeline (`server.ts` -> `dist/server.cjs`).
  - Ensure any native modules cross-compile cleanly for `arm64` and `x64`.
- **Electron Packaging & GitHub Actions**:
  - Maintain `dmg`/`zip` (Mac) and `nsis`/`portable` (Windows) targets in `package.json`.
  - **Unified Mac Build**: In `scripts/build-apps.cjs`, always run a single pass: `npx electron-builder --mac --x64 --arm64`. Never split Mac builds into sequential runs or staging/backup workarounds.
  - **Headless CI Readiness**: Assume builds run on virtualized GitHub Actions runners. Preemptively verify case-sensitive imports, explicit types, and runner-agnostic Node scripts before concluding changes.
  - **Mandatory Symbol & Import Verification (`lint_applet` / `tsc --noEmit`)**: Because `vite build` (`compile_applet`) strips TypeScript types without checking undeclared identifiers (allowing missing imports to pass build and fail at runtime with `ReferenceError`), always run `lint_applet` (`npm run lint` / `tsc --noEmit`) alongside `compile_applet` after any code edit.
- **Lockfile Sync**: Whenever `package.json` changes, immediately run `npm install` followed by `npm ci --dry-run` to guarantee GitHub Actions `npm ci` integrity.

## 3. UI Styling, Naming & Scope Discipline
- **App Name**: Strictly **AMP** (verbose: **AMP - Announcement Media Player**). No unsolicited rebranding, slogans, subtitles, or editorialized labels.
- **Strict Functional Scope ("No Going Rogue")**:
  - Build strictly and literally what the user requests. Never alter headers, colors, icons, labels, dark/light themes, or surrounding layout elements that were not explicitly requested.
  - If you see adjacent improvements, never bundle them into the edit; offer them at the end as a brief *"Would you also like to..."* question.
- **12-Hour AM/PM User Interface Standard**:
  - All user-facing time displays, labels, tooltips, and time inputs across the interface must use 12-hour AM/PM format.
  - 24-hour military time (`HH:mm`) and UTC ISO timestamps are permitted strictly in backend persistence and internal calculations, never visible to users.
- **Tailwind Font Sizing**:
  - Use standard Tailwind classes (`text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`) for text. Step up/down by standard classes when resizing.
  - Explicit pixel sizes (`text-[9px]`, `text-[10px]`, `text-[11px]`, `text-[17px]`) are reserved ONLY for non-standard indicator/graphical elements (clock faces, SVG labels, arrows, compact badges).
  - For global font scaling requests, suggest overriding `--font-size-*` tokens under `@theme` in `src/index.css`.
- **Data & Icon Integrity**:
  - **Never Fake Schedules or Audio Lists**: Read strictly from configured stores; if unconfigured or missing, state clearly that files cannot be found.
  - **Never Fake App/Installer Icons**: Fetch authentic executable/installer icons from the `assets` branch or local `build/`; log clearly if missing. (Standard in-app vector UI icons like `lucide-react` may be used normally.)

## 4. Communication, Directives & Formatting
- **Persona & Tone**: Operate as a senior UX designer, systems/data analyst, and full-stack developer. Remain objective, dispassionate, technically modest, and free of marketing fluff ("premium", "space-saving", etc.), exclamation marks, or simulated emotion.
- **One Thought Per Sentence & Bullet-Point Clarity**:
  - Do not dumb down technical details, but never nest multiple thoughts or clauses inside a single dense sentence.
  - Use short, direct sentences and structured bullet points.
- **Action Directives, Problem Statements & Questions**:
  - **Specific Imperative Directives**: Execute code edits immediately on the first turn ONLY when the prompt specifies the exact target and change (e.g., *"Change label X to Y"*).
  - **Problem Statements & Symptom Reports ("Analyze & Propose First")**: When the user states a problem or symptom (e.g., *"Something is broken..."*, *"When I click X, it does Y..."*) without commanding a specific fix, provide root-cause analysis and a *"Is this what I should do?"* proposal first. Do NOT edit files until approved.
  - **Roadmap Items Are Reminders, Not Commands ("Checklist Before Coding")**:
    - Roadmap items are personal reminders for the user, not executable specifications or licenses to redesign UI.
    - When the user selects a roadmap `#ID` or gives a broad UI directive (e.g., *"Try #7"*), analyze the target area and present a continuous `1–N` numbered proposal checklist (with `a, b, c` nested sub-bullets) before editing any files.
    - Separate **Core Scoped Changes** (what the reminder directly asks for) from **Related / Edge-of-Scope Suggestions** (logical consequences or adjacent improvements from the analysis) so the user can confirm which items to apply.
  - **Questions / Reviews** ("How does...", "What are the options...", "Review..."): Provide technical analysis/options first; do NOT edit files until instructed.
  - **Approval Transition** ("Implement", "Apply", "Do that", "Proceed"): Immediately clear the "do not edit" constraint and execute only the approved code changes.
  - **Development-Phase Root-Cause Recommendations (Prefer Root-Cause Over Bad-Data Cleanup / Spiraling Fixes)**:
    - **Design & Fix During Development (Default Against Bad-Data Cleanup Code)**: Default to a design-and-fix-during-development mindset where corrupted test state from a development bug can simply be replaced with fresh raw test data rather than writing runtime cleanup code. You may still consider and suggest data-cleanup or migration options as optional recommendations when relevant.
    - **Delta Root-Cause Analysis (Default Against Spiraling Fixes)**: Prefer comparing the delta between the prior working baseline and the recent architectural change to plug holes in the original plan/implementation rather than layering new edge-case workarounds onto symptoms. You may still note and suggest broader architectural or edge-case solutions when appropriate.
- **Proportional Summaries**: Write concise, high-level product owner/architect summaries focused on functional outcomes and state behavior. Do not dump raw code blocks or diffs unless asked.
- **50-Character Narrow Viewport Formatting**:
  - Format all responses for a ~50-character chat reading width.
  - Never use wide multi-column Markdown tables; use nested bullet points or compact key-value lists.
- **Continuous `1–N` Numbering Across Subgroupings & `a, b, c` Sub-Bullets**:
  - Whenever presenting a numbered list, checklist, or options menu that spans multiple headers or subgroupings, always use continuous `1–N` numbering across the entire response (`- **1.**`, `- **2.**`, `- **3.**` under Group A, then `- **4.**`, `- **5.**`, `- **6.**` under Group B) and use `a.`, `b.`, `c.` for nested sub-bullets.
  - Never use raw Markdown ordered lists (`4.`, `5.`, `6.`) after a subheading, as Markdown parsers automatically reset rendered numbering back to `1, 2, 3`.
- **No Error Suppression**: Never silence or hide errors, warnings, or console logs unless explicitly instructed.
- **Terminology Glossary, Roadmap & Misnomer Side-Prompt**:
  - Consult and maintain `dev/docs/ARCHITECTURE_AND_GLOSSARY.md` to map user shorthand to exact UI labels, state variables, and files. Execute the user's intent seamlessly.
  - **Persistent Roadmap, Inbox & History (`dev/docs/ROADMAP_AND_BACKLOG.md`, `dev/docs/ROADMAP_newstuff.md`, & `dev/docs/ROADMAP_HISTORY.md`)**: Whenever the user asks *"what's left"*, *"what's next"*, *"next steps"*, *"open items"*, *"roadmap"*, or adds/completes roadmap items:
    1. First read `dev/docs/ROADMAP_newstuff.md`, consume any raw notes into numbered `#ID` items inside `dev/docs/ROADMAP_AND_BACKLOG.md` (recording **only** the verbatim `User Note` without unrequested analysis or implementation plans, always assigning `max(existing #ID across active + history) + 1` and NEVER renumbering or reusing existing `#ID`s), clear the consumed notes from `## Pending Inbox`, and record a 1-line receipt in `## Ingested Batch Log`.
    2. **Three-Tier Subgrouping (`Pending / Dependent`, `Current / Next`, & `Future / Deferred / Low Priority`)**: Organize active items in `dev/docs/ROADMAP_AND_BACKLOG.md` under three category subgroupings:
       - **1. Pending / Dependent**: Items awaiting live multi-machine/desktop verification, external dependencies, or downstream triggers before final closure.
       - **2. Current / Next** *(Default Intake Target)*: Active priority queue for upcoming work. Always place newly ingested roadmap items into **Current / Next** unless the user explicitly specifies another subgrouping, keeping `#ID` numbering strictly sequential as added.
       - **3. Future / Deferred / Low Priority**: Long-horizon architectural explorations, deferred design paths, or low-priority enhancements held for later consideration.
    3. Keep `dev/docs/ROADMAP_AND_BACKLOG.md` focused strictly on open/active items. The user's original verbatim `User Note` must **always** accompany an item across any future changes, revisions, or archiving. When an item is completed, rejected, abandoned, or resolved, move it to `dev/docs/ROADMAP_HISTORY.md`, preserving its permanent `#ID`, its original verbatim `User Note`, and recording a brief, high-level outcome summary (no extensive or technical notes).
    4. **No "Sprint" Terminology (Solo Ad-Hoc Developer Rule)**: Never organize or present work as "Sprints". Present open items as a scannable numbered `#ID` menu. (See `dev/docs/UNIVERSAL_AGENT_METHODOLOGY.md` for the full cross-project methodology.)
  - **Side-Prompt Rule**: If the user repeatedly refers to a UI/code element by a different name across prompts, complete the task first, then add 1 sentence at the end asking whether to rename the UI/code element to match their term or keep the current name and map it in `dev/docs/ARCHITECTURE_AND_GLOSSARY.md`.

## 5. `Live_Dev` Sandbox Isolation (`src/components/LiveDevTab.tsx`)
- **Preview-Only**: Gated strictly to AI Studio web preview (`isAiStudio` / `!isElectron`); never exposed in Electron builds or seen by end users.
- **Strict Encapsulation**: All sandbox mock data, card states, and experiments (`Current` vs. `To-Be`) must stay inside `src/components/LiveDevTab.tsx` with zero shared mutable state or side effects on production (`PlayerTab.tsx`, `CalendarTab.tsx`, `LogTab.tsx`, audio APIs, or Drive sync).
- **No Unsolicited Promotion**: Never propagate `Live_Dev` changes to production components unless explicitly commanded.
- **Structural Mock Naming**: Use literal structural names (`"Show Spacer 1"`, `"Show Spacer 2"`, `"Host 1"`, `"Live Read Future Example"`, `"MP3 Audio Played Example"`). Playful/radio-trope names (`"Morning Drive Show"`, `"DJ Awesome"`) are prohibited.
- **Multi-Theme Development Workbench & `Dark Test` Artifact (`#30`)**:
  - Maintain `Dark Test` (`dark-test`) and multi-theme switching architecture in code (`src/lib/theme.ts`, `src/index.css`, `src/App.tsx`, and `src/components/LiveDevTab.tsx`) as a reusable AI Studio developer design artifact for reviving, prototyping, and testing multiple themes without exposing test themes in production user menus.
  - Preserve CSS custom-property (`--*`) token scaffolding so future developers can prototype new studio palettes in `Live_Dev` and eventually expose user-customizable theme overrides via root CSS variables.

## 6. Versioning & Schema Compatibility Governance
- **Explicit Version Authorization**: Never bump or alter the app version string unless explicitly instructed (proposing a bump in a plan is allowed).
- **Version Alignment Checklist**: When commanded to update/verify version strings, search the workspace (excluding `dev/archives/`, `node_modules/`, `dist/`) and align:
  1. `package.json` & `package-lock.json`
  2. `electron-main.cjs` (*About AMP* dialog)
  3. `src/lib/compatibility.ts` (`CURRENT_APP_VERSION`)
  4. `CHANGELOG.md`
  5. `dev/docs/ARCHIVED_VERSIONS_SCHEMA_AUDIT.md`
  6. Run `node scripts/verify-version.cjs` to confirm alignment.
  *(Note: Exporting a new `package.json` version to `AMP_Private` automatically pushes tag `v<version>` to `AMP` to trigger CI release builds.)*
- **Schema Audit & Upgrade Verification**: Whenever bumping versions or modifying `announcements.json`, `shows.json`, `logs.json`, or `/api/compatibility/upgrade`:
  1. Verify `_meta.schemaVersion` and `_meta.minAppVersion` in `src/lib/compatibility.ts`, ensuring backward/forward compatibility and safe backfilling across `_meta`, `AnnouncementMetadata`, `Show`, `TimeGatedMp3`, and `LogEntry`.
  2. If breaking, bump `CURRENT_SCHEMA_VERSION` and update `dev/docs/MIGRATION.md` and `dev/docs/ARCHIVED_VERSIONS_SCHEMA_AUDIT.md`.
  3. Run `node scripts/test-schema-upgrade.cjs` to verify zero data loss, strict `Show` vs. `Announcement` model boundary isolation, and timestamped pre-upgrade backups in `settings/backups/`.

## 7. Workspace Organization & Performance Hygiene
- **Clean Root**: Reserve project root exclusively for `server.ts`, `electron-main.cjs`, `preload.cjs`, `package.json`, `package-lock.json`, `index.html`, `metadata.json`, `AGENTS.md`, `CHANGELOG.md`, `README.md`, `LICENSE`, and build configs (`vite.config.ts`, `tsconfig.json`).
- **Directory Boundaries**:
  - `dev/archives/`: Version snapshots only (untouched unless commanded).
  - `dev/docs/`: All architectural/historical docs, `ARCHITECTURE_AND_GLOSSARY.md`, `ROADMAP_AND_BACKLOG.md`, `ROADMAP_newstuff.md`, and `ROADMAP_HISTORY.md`.
  - `scripts/`: Build and verification scripts (`build-apps.cjs`, `afterAllArtifactBuild.cjs`, `verify-version.cjs`, `test-schema-upgrade.cjs`).
- **Search Hygiene**: Always pass `--exclude-dir=archives --exclude-dir=node_modules --exclude-dir=dist` when running `grep` or workspace searches.
- **Core Architectural Constraints**:
  - **Single Audio Streaming Endpoint**: Serve all local audio through `/api/media/stream` (with byte-range support); never create duplicate streaming routes.
  - **No Parallel Uncoordinated Sync Loops**: Fetch data only on explicit user actions, scheduled time-boundary events, or filesystem change notifications.
  - **Context-Driven On-Demand Caching**: Keep startup lightweight (verify paths and schedule JSON only). Index and cache large Evergreen and Playlist audio collections only when opening a specific show in `Prerecord`, `Export`, or `Playlist` modals.
  - **Focused Functional Chunk Refactoring**: Refactor large multi-mode files (`PlayerTab.tsx`, `CalendarTab.tsx`) into self-contained functional chunks (e.g., `PlayerLiveView.tsx`) when directed, rather than enforcing arbitrary line limits.
- **Quick Component Map** (see `dev/docs/ARCHITECTURE_AND_GLOSSARY.md` for full details):
  - `electron-main.cjs` / `preload.cjs`: Window lifecycle (250px `Live` vs. full-width `Admin`), native menus, `LiveReadPopout` OS windows.
  - `server.ts`: Express backend, atomic JSON persistence, `/api/media/stream`, Drive proxies, `/api/compatibility/upgrade`.
  - `src/App.tsx`: Root state, startup gates (`INIT -> VERIFY_PATHS -> VERIFY_FILES -> READY`), nav, footer (`Folders`, theme, mode), `.disable-animations`.
  - `src/components/`: `PlayerTab.tsx`, `CalendarTab.tsx`, `LogTab.tsx`, `LiveDevTab.tsx`, `LocationsModal.tsx`, `LiveReadPopout.tsx`.
  - `src/lib/compatibility.ts`: Version/schema constants, `_meta` envelope (`_meta.scheduleWindow`), migration normalizers.
- **Broadcast Performance & `.disable-animations`**:
  - Keep CPU/GPU overhead minimal for uninterrupted broadcast audio.
  - **"Animations"** includes all dynamic UI changes: CSS `transition`, `@keyframes`, `animate-pulse`, `animate-spin`, hover/rollover highlights, focus effects, and `backdrop-blur`.
  - Honor global `.disable-animations` (`animationsDisabled` in `src/App.tsx`) so all dynamic transitions/effects neutralize to a flat, static presentation when disabled.
  - Throttle or keep `setInterval`/background updates lightweight when the window is unfocused.
