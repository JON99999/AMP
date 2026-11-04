# Senior Engineering & Architecture Principles: Lean Desktop Core

## 🚨 MANDATORY ARCHIVE RULE
- **NEVER TOUCH `dev/archives/`**: Never create, modify, copy, tar, or synchronize any directory or file inside `dev/archives/` without explicit user instruction in the immediate prompt. Never touch or sync an archive subfolder without double-checking with the user first.

## 1. Prime Directive: Simplicity & Functional Truth
- **Single Source of Truth**: Data flows unidirectionally from the local filesystem (`Media/`, `Calendar/`, `Logs/`) into local memory. Never create secondary mirrors, ghost cache objects, or redundant state layers.
- **Strict Verification Gates Before UI Mount**: The application must never render an interactive state or attempt background file operations with incomplete or unvalidated data. A strict, sequential gate (`INIT -> VERIFY_PATHS -> VERIFY_FILES -> READY`) blocks UI interactions until prerequisites are satisfied.
- **Immediate Predictability**: The user experience should feel like a sharp, dependable broadcast tool—fast file resolution, instant audio streaming, and zero background magic.

## 2. Anti-Patterns & Banned Over-Engineering
- **No Duplicate API Surfaces**: Do not create specialized endpoints for identical operations (e.g., three separate audio streaming routes for interstitials, evergreens, and playlists). One robust, range-supporting audio endpoint `/api/media/stream` serves all local audio.
- **No Parallel Uncoordinated Sync Loops**: Eliminate competing timers, polling intervals, and auto-fetch triggers. Data fetches occur upon explicit user actions, scheduled time-boundary events, or file system change notifications.
- **No Monolithic Source Files**: No single component or module should exceed 500 lines. Separate audio playback logic, schedule calculations, file operations, and UI views into modular, decoupled units.
- **No Phantom Features**: Remove half-implemented abstractions, dead configuration keys, unused UI debug toggles (rulers, artificial latency simulators), and unrequested scaffolding.

## 3. Desktop-First Performance
- **Local Filesystem as Database**: Simple, well-formatted JSON files (`interstitials.json`, `shows.json`, `logs.json`) are read on boot and written atomically on mutation.
- **Context-Driven On-Demand Caching**: Never scan or cache multi-gigabyte media directories globally at startup. Baseline startup remains lightweight and only verifies paths and schedule metadata. Large Evergreen and Playlist audio collections are indexed and cached in memory strictly when the user opens a specific show in the Prerecord, Export, or Playlist editing context (via the popup window), and released when that modal/session closes.
- **Reliable Audio Streaming**: Native HTML5 `<audio>` elements or standard Web Audio API buffers hooked into local byte-range Express routes.

## 4. UI Prototyping & Live_Dev Sandbox Isolation
- **Strict Sandbox Encapsulation**: Prototype and formatting views like `Live_Dev` exist exclusively in AI Studio web preview and are completely isolated inside `src/components/LiveDevTab.tsx`.
- **Zero Production Side Effects**: Mock datasets, timing triggers, and card format iterations in `Live_Dev` must never leak into or alter live broadcast execution (`PlayerTab.tsx`, `CalendarTab.tsx`, `LogTab.tsx`).
- **No Unsolicited Syncing**: Changes tested or created in `Live_Dev` remain strictly sandboxed and are never applied or migrated into live player code unless explicitly instructed by the user.
- **Mock Data Clarity & Literal Structural Naming**: All mock data in `Live_Dev` and sandbox environments must strictly use literal, structural descriptors (e.g., "Show Spacer 1", "Show Spacer 2", "Host 1", "Host 2", "Live Read Future Example", "MP3 Audio Played Example") rather than pseudo-realistic filler or playful names (e.g., "Midday Jams Show", "Morning Drive Show").

