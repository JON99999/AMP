# Interaction Architecture: Click Behavior & Click Priority Philosophy

## 1. Core Broadcast Philosophy

In live radio broadcast environments, operator interactions are mission-critical and time-sensitive. An on-air host or board operator running AMP alongside digital audio workstations (DAW), automation suites, browser tabs, or communication tools cannot tolerate missed, delayed, or discarded clicks.

Every mouse or trackpad interaction directed at an active visual target must immediately trigger its intended action on the first strike.

---

## 2. Window Activation & First-Click Execution (`acceptsFirstMouse`)

### Problem Definition
On macOS, standard Cocoa windowing treats the initial click on an unfocused/background window as an "activation click" (gaining application focus) while discarding the underlying hit-test event. For an audio playback application, this creates a dangerous "click twice" defect where an urgent live read or announcement trigger fails on first attempt.

### Architectural Standard
1. **Direct Window Activation (`acceptsFirstMouse: true`)**:
   - Both `mainWindow` and auxiliary windows (such as `liveReadWindow`) must explicitly enable `acceptsFirstMouse: true` in Electron window options.
   - All pointer clicks delivered while AMP is blurred or in the background must pass directly into Chromium WebContents and trigger their DOM handlers immediately.

2. **Zero Background Throttling (`backgroundThrottling: false`)**:
   - Desktop windows must maintain `backgroundThrottling: false` in `webPreferences`.
   - Prevents the Chromium event loop, timer ticks, and IPC listener queues from sleeping or delaying event processing when the window is obscured or placed in the background.

---

## 3. Card Hit Targets & Pointer Event Hierarchy

### Primary Card Body: Unbroken Surface
- **Default Play Mode**:
  - The entire card boundary represents a single primary hit target.
  - Clicking any region of an announcement card, live read card, or interstitial card directly initiates its primary action (opening the live read script or starting audio playback).
- **Decorative Child Insulation**:
  - Child elements that serve purely visual, text, or status purposes (e.g., category badges, timing labels, script icons, clock graphics, border overlays) must define `pointer-events-none`.
  - Ensures no child DOM node intercepts, delays, or preempts the event bubbling up to the card's root action handler.

### Secondary Sub-Controls & Action Isolation
- **Reordering Chevrons & Dedicated Buttons**:
  - When a view provides secondary actions (such as queue reordering up/down arrows or explicit item removal), these sub-controls must reside in distinct interactive zones.
  - Secondary controls must explicitly invoke `e.stopPropagation()` on `pointerdown` and `click` events to prevent triggering the parent card's primary action.
- **Hierarchy of Hit Targets**:
  1. *Highest Priority*: Dedicated sub-control buttons with explicit propagation stops (reorder chevrons, play/pause toggles, close buttons).
  2. *Base Priority*: Root card container click handler (play audio, open script modal, select show).
  3. *Zero Priority*: Visual child nodes, icons, labels, badges (`pointer-events-none`).

---

## 4. State Transitions & Hover Overlay Discipline

1. **No Hover Blocking**:
   - Hover cards, status indicators, and contextual tooltips must never place blocking transparent overlays above clickable elements.
   - Tooltips must use `pointer-events: none` unless the tooltip itself contains interactive controls.

2. **Deterministic Triggering**:
   - Standard click workflows must bind to `onClick` with clean event targets, avoiding brittle timing races between `onMouseDown` and `onMouseUp`.
   - Prevent artificial delay counters or debounce thresholds that could swallow rapid operator selections.

---

## 5. Summary Checklist for Interactive Components

- [ ] Window configuration includes `acceptsFirstMouse: true` and `backgroundThrottling: false`.
- [ ] Primary card elements handle the master click across their full surface area.
- [ ] Inner decorative text, badges, and SVGs carry `pointer-events-none`.
- [ ] Sub-controls (reorder arrows, auxiliary action buttons) explicitly execute `e.stopPropagation()`.
- [ ] Non-interactive overlays and indicators do not intercept pointer events.
