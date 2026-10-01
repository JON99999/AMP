# Environment Guidelines

This application is primarily a **Desktop Application** built with Electron and Express. 

## Critical Operational Guardrails (Hard Prohibitions)

- **Absolute Prohibition on Proactive Archiving**:
  - The agent **MUST NEVER** create, modify, copy, tar, or synchronize any directory or file inside `dev/archives/` unless the user's prompt explicitly and directly commands an archive operation (e.g., "Archive version X", "Create an archive of this release").
  - **No Implied Authorization**: Completing a bug fix, executing tests, updating documentation, migrating data schemas, or incrementing `package.json` version strings NEVER implies permission to touch `dev/archives/`.
  - If an explicit archive directive is not in the user's prompt, the `dev/archives/` directory is strictly out of scope and must remain completely untouched.

## Target Platforms (Priority)

1. **MacOS Silicon (arm64)**: Primary target. All features must be optimized for Apple Silicon performance and power efficiency.
2. **MacOS Intel (x64)**: Secondary target. Ensure compatibility for older Mac hardware without sacrificing Silicon performance.
3. **Windows 10/11 (x64)**: Tertiary target. Ensure full functionality on Windows systems.

## Development Principles

- **Desktop First**: Do not prioritize web deployment. The app is intended to be run as a standalone local executable.
- **Cross-Platform Compatibility**:
    - When 2 or 3 (Intel/Windows) cause performance Or binary size issues for 1 (Silicon), notify the user and ask for preference.
    - Avoid platform-specific paths unless handled by `path.join` or similar utilities.
    - Test interactions with localized file systems (e.g., standard library folders on Mac vs Windows).
- **Backend**: The Express server (`server.ts`) is bundled into the desktop app. Always maintain the `dist/server.cjs` build pipeline for the Electron entry point.
- **Native Modules**: Be cautious when adding dependencies with native code. Ensure they can be cross-compiled for `arm64` and `x64`.

## Build Configuration

- Use `electron-builder` for distribution.
- Configurations for all three priorities must be maintained in `package.json`.
- Distribution should focus on `dmg` and `zip` for Mac, and `nsis` (installer) or `portable` for Windows.
- **No Staging or Backup Workarounds for Mac packaging**: Under no circumstances should Mac builds be split into multiple sequential `electron-builder` invocations requiring backup files, manual file moving, or custom renaming/staging workarounds in `scripts/build-apps.cjs`. Always run a single unified compile invocation: `npx electron-builder --mac --x64 --arm64` to output both targets in one clean pass.
- **GitHub Release-First Assumptions**: Always construct, refactor, and check code under the strict assumption that compilation and packaging occur on virtualized runners when building releases via the GitHub web interface. Ensure cross-platform build stability, explicit dependency typing, and robust bundler support to run seamlessly without interactive intervention.
- **Preemptive Cross-Platform Validation**: Before finalizing changes, proactively double-check all packaging methods and script invocations for runner-specific hazards (e.g., case-sensitivity in relative imports, implicit paths, absent native compile chains, and OS differences) to eliminate repetitive build fail cycles on GitHub Actions.

## UI Styling & Naming Guidelines

- **Strict App Naming**: The name of the application is **AMP**. Under no circumstances should custom, editorialized, or alternative names (e.g., "Remote Broadcast Synchronizer", "Desktop Application Broadcast Synch Controller") be added to the interface without explicit permission.  The verbose, descriptive text description of **AMP** is **AMP - Announcement Media Player**. 
- **No Unsolicited Rebranding**: Avoid decorative tags, marketing slogans, or secondary descriptors. Only use straightforward, literal functional labels which align with the authentic **AMP** design.
- **No Editorializing**: Respect the clean aesthetic of **AMP** and do not add any unsolicited titles, headings, or branding elements in the UI.
- **Strict Scope & Unsolicited UI Controls**: Build strictly and literally what the user requests. Do not add unrequested buttons, formatting elements, extra controls, or auxiliary visual features. If any UI addition beyond the explicit scope is considered, ask the user for permission first before modifying the interface.
- **Tailwind Utility Class Sizing Strategy & Global Customization**:
  - All text elements must use standard Tailwind Utility Classes (`text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, etc.) rather than explicit pixel values (like `text-[12px]` or `text-[14px]`).
  - Explicit pixel sizing (e.g., `text-[10px]`) must ONLY be used when you need a specific font size that is not part of Tailwind's standard definition set. Font usages for indicators and graphical elements (such as clock faces, SVG labels, and arrows) are excluded from this standard rule and should maintain their explicit pixel values (e.g., `text-[9px]`, `text-[10px]`, `text-[11px]`, or `text-[17px]`).
  - When asked to make an element or text larger or smaller, do not use custom pixel values; instead, slide up or down to the next standard Tailwind Utility Class (e.g., transitioning from `text-xs` to `text-sm`, or `text-base` to `text-lg`).
  - If the user wishes to make "everything" or broad scopes of the application a bit larger globally, suggest modifying the standard Tailwind definitions under the `@theme` block in `src/index.css` (e.g., overriding `--font-size-xs`, `--font-size-sm`, etc.). This approach is clean, centralized, traceable, and avoids polluting individual HTML elements with permanent custom pixel-sizing overrides.


## Communication & Description Guidelines

- **Professional Persona**: Adopt the persona of a highly skilled UX designer, a highly skilled systems/data analyst, and a highly skilled full-stack developer in all analytical assessments, interface proposals, and code architecture designs.
- **Literal Distinction Between Questions and Action Directives**:
  - **Statements and Imperative Directives** (e.g., "Fix...", "Change...", "Update...", "Add...", "Rename..."): Treat these as direct, explicit requests to modify code immediately. Execute the code edits directly using tools on the first turn without presenting preliminary proposal lists or asking for confirmation.
  - **Questions and Exploratory Requests** (e.g., "How does...", "What are the options for...", "Review for ideas..."): Treat these as requests for technical analysis or recommendations. Provide a clear architectural review or proposed options first, and do NOT make code edits unless instructed. Never assume a question is an indirect command to edit files.
  - **Proposal-to-Implementation Transition**: When a prior prompt requested an analysis, proposal, or review, and a subsequent prompt instructs to "Implement", "Apply", "Do that", or otherwise approves the proposal:
    - The previous "do not edit" constraint is immediately cleared.
    - The approved proposal is treated as an active implementation directive.
    - The agent must immediately execute the actual code edits via tools without waiting or re-explaining the proposal.
- **Proportional Summaries (Product Owner / Architect Voice)**:
  - Summaries must remain high-level, functional, and written in the clear, dispassionate language of a systems architect or product owner.
  - **No Raw Code Dumps in Summaries**: Do not output large, raw code blocks or line-by-line diffs in final conversation responses unless explicitly asked. Describe changes by their functional impact, interface behavior, and state updates.
  - Keep summaries concise, scannable, and focused on operational outcomes.
- **No Fluff or Marketing Language**: Avoid promotional, embellished, or descriptive marketing jargon (e.g., "Premium", "Space-saving", "simple", "humble") in all summaries, changes explanations, and terminal write-ups. Keep updates strictly technical, objective, and literal.
- **Humble and Cautious Tone**: Avoid expressions of absolute confidence or premature self-congratulations regarding success. Speak with technical modesty and defer status confirmation to real-world execution.
- **No Human Emotion or Pretentiousness**: Do not be glib, excited, or use exclamation marks or any phrasing that simulates human emotion (including happiness, sadness, or hopefulness). Treat yourself strictly as a tool for coding, not a person. You should ask probing questions or follow up with technical ideas/suggestions, but all dialogue must remain objective and dispassionate.
- **Error Link Requirement**: When explicitly asked to "Check your work in Github" or similar requests, the agent MUST consult and strictly follow the protocol defined in `/CheckYourWorkInGithubPrompt.md` at the project root. Under normal conversational flows or unrelated developer queries, this specific protocol does not apply.
- **GitHub Build Error Triaging**: Whenever checking GitHub release failures or compilation issues, do not run standard local checks blindly. Proactively check if compilation errors are due to virtualized environment constraints unique to modern headless pipelines running on different runner architectures through the GitHub web release actions interface. Ensure each solution explicitly resolves these remote compilation issues to minimize release cycle delays.
- **No Suppression of Errors or Warnings**: Never suppress, silence, or hide errors, warnings, or console logging unless the user explicitly instructs that they should not be reported as errors.
- **Narrow Width Window Formatting (50-Character Constraint)**:
  - The chat interface has an effective reading width of approximately 50 characters.
  - Multi-column Markdown tables must NOT be used for large datasets or comparative breakdowns, as they overflow and become unreadable in narrow viewports.
  - Structure all multi-attribute, tabular, or comparative data as clean nested bullet points, compact key-value lists, or indented sections for scannability.

## Integrity of Data and Schedules

- **Never Fake a Schedule or MP3 File**: Do not construct simulated, preset, or fake schedule arrays or MP3 database file listings in any mode (including Demo mode). Always read directly from designated directory stores; if folders are unconfigured or files are not found, state clearly that they cannot be found.
- **Never Fake Application Executable and Installer Icons**: Do not construct, simulate, or use dummy base64/placeholder representations for application executable and installer icons. Always fetch the authentic icon assets from the GitHub `assets` branch or local storage as required; if missing or unconfigured, log the status clearly without embedding fake icons. This rule only applies to application executable and installer icons; do not apply this rule to in-app icons (e.g. standard vector ui icons), which may be generated or modeled normally.

## Versioning Alignment Workflows

- **Explicit Version Change Authorization Only**: The agent **MUST NOT** increment or modify the application version string unless explicitly instructed to do so by the user. The agent is permitted to suggest or propose version increments when presenting plans or proposals, but must wait for user confirmation before applying version changes to the codebase.
- **Check Version References Everywhere**: When commanded to update, check, or reset the application's version, the agent **MUST** perform a global search across the workspace to locate and align all instances. This includes modifying `package.json`, `package-lock.json`, and `electron-main.cjs`. All version tags (e.g., `v0.8.3`) must remain strictly in sync with the core version string.

## Schema & Version Compatibility Governance

- **Automatic Schema Audit on Version Bumps**: Whenever creating a new version release or modifying the structure of `announcements.json`, `shows.json`, or default storage folders:
  1. The agent MUST verify `_meta.schemaVersion` and `_meta.minAppVersion` in `src/lib/compatibility.ts`.
  2. The agent MUST evaluate backward and forward compatibility against the immediate prior release.
  3. **Field & Metadata Integrity Check**: The audit MUST inspect all stored metadata structures (`_meta`, `metadata`, `AnnouncementMetadata`, `Show`, `TimeGatedMp3`, `LogEntry`) and evaluate whether any stored variables/fields were added, removed, renamed, or changed in type/range. Ensure normalization routines safely backfill or sanitize missing/legacy attributes without data loss.
  4. If a breaking change is introduced, bump `CURRENT_SCHEMA_VERSION`, update `dev/docs/MIGRATION.md`, and record the transition rules in `dev/docs/ARCHIVED_VERSIONS_SCHEMA_AUDIT.md`.
- **Mandatory Schema Upgrade Build & Verification Protocol**:
  Whenever modifying data models, migration endpoints (`POST /api/compatibility/upgrade`), or compatibility normalization logic:
  1. **Execute Test Fixture Validation**: Run `node scripts/test-schema-upgrade.cjs` to simulate legacy datasets (unversioned v0 arrays, legacy `mp3Url` fields, distinct `Show` schedules) and assert zero data loss or field conflation.
  2. **Model Boundary Isolation Check**: Explicitly verify that `Show` models (`day`, `startHour`, `durationHours`, `durationMinutes`, `host`, `description`, `active`) and `Announcement` models (`days`, `hours`, `gridRules`, `minute`, `timeGatedMp3s`, `metadata`) never inherit or overwrite each other's schema attributes during normalization.
  3. **Real Disk & Pre-Upgrade Backup Verification**: Confirm that all migrations create timestamped pre-upgrade backup files in `settings/backups/` before committing serialized changes.

## Workspace Layout & Organization Guidelines

- **Clean Project Root**: The root directory MUST remain lean and reserved exclusively for primary application and framework entry points (`server.ts`, `electron-main.cjs`, `preload.cjs`, `package.json`, `index.html`, `metadata.json`, `AGENTS.md`, `README.md`, `LICENSE`, `AGENTS_PHILOSOPHY.md`).
- **Archive Isolation (`dev/archives/`)**: All versioned codebase snapshots (e.g. `dev/archives/archive_v0.16.3/`) MUST reside inside `dev/archives/`. Under no circumstances should individual version archive directories be created at the project root.
- **Documentation Isolation (`dev/docs/`)**: All historical, architectural, and development markdown documentation (including `MIGRATION.md` and `ARCHIVED_VERSIONS_SCHEMA_AUDIT.md`) MUST be stored inside `dev/docs/`.
- **Packaging & Build Scripts (`scripts/`)**: All secondary build, bundling, and distribution scripts (such as `scripts/build-apps.cjs` and `scripts/afterAllArtifactBuild.cjs`) MUST reside inside `scripts/`.

## Dependency Management & Lockfile Synchronization

- **Strict Lockfile Synchronization**: Whenever any package or dependency is added, updated, or removed in `package.json` (or if `package.json` is edited directly):
  1. The agent MUST run `npm install` immediately in the workspace root to regenerate, resolve, and balance `package-lock.json`.
  2. The agent MUST verify lockfile integrity by running `npm ci --dry-run`. This guarantees that virtualized GitHub Actions runners executing `npm ci` will not fail with `EUSAGE` or missing dependency errors.
  3. Whenever syncing backup/archive directories (such as `dev/archives/archive_v0.16.3/`), both `package.json` and `package-lock.json` MUST be updated together.


## Archive & Backup Guidelines

- **Explicit Authorization Required Only**: The agent MUST NEVER create, fix, modify, or synchronize any archive or backup directory (e.g., `dev/archives/archive_v0.16.3/`) unless the user explicitly directs you to do so in their prompt.
- **Folder-Based Archiving (Strategy 2)**: When explicitly asked to create a codebase backup or version archive, store all archived files directly inside an uncompressed snapshot directory under `dev/archives/` (e.g., `dev/archives/archive_v0.16.3/`) rather than packing them into `.tar.gz` or `.zip` binary archives.
- **Binary Corruption Prevention**: Never attempt to inspect, view, or modify binary files or compressed archives using text-based inspection tools (`view_file`, `edit_file`), as UTF-8 string encoding transforms raw binary byte sequences (such as gzip magic headers `0x1f 0x8b`) into replacement characters (`0xef 0xbf 0xbd`), resulting in corrupt archive headers.

## Performance & Optimization Guidelines

- **Performance-First Philosophy**:
  - This application is a critical utility for radio broadcasters who need uninterrupted, reliable audio data flow—both within AMP and across other audio playback/streaming tools running on the same host operating system simultaneously.
  - The application must be as lean and computationally non-intensive as possible. Sacrifice fancy UI gimmicks or "pretty" interface tricks whenever they introduce CPU or GPU usage overhead.

- **Strict "Animation" Definition**:
  - In AMP, **"animations"** encompasses **any and all dynamic interface state changes**. This includes transitions (CSS `transition`), animations (CSS `@keyframes`, `animate-pulse`, `animate-spin`), hover effects (e.g. state changes on cursor rollover, background highlight transitions), focus effects, and GPU-intensive filters like `backdrop-blur`.

- **Debug Animation Switch Integration**:
  - Always honor the `.disable-animations` structural class applied globally when `animationsDisabled` is active.
  - Any new style addition (rollovers, scale modifications, transition effects, background color fades) must be safely neutralized globally or restricted under this switch to ensure a completely flat, non-intensive, static presentation state if the user disables them.

- **Background & Focused Run States**:
  - The main application logic (specifically standard intervals like `setInterval` or animation updates) must handle background or unfocused run states. Keep updates lightweight and do not trigger layout thrashing or intensive visual updates when the window is blurred or backgrounded.




