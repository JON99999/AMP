# Roadmap Inbox & Raw Prompt Scratchpad (`ROADMAP_newstuff.md`)

> **AGENT INTAKE PROTOCOL (MANDATORY)**
> 1. This file is the user's scratchpad/inbox for raw notes, future prompts, and todo items added while the agent is busy or between sessions.
> 2. **Every time the user asks to check the roadmap (or at the start of a roadmap turn)**, the agent MUST read this file, parse all entries under **`## Pending Inbox (To Be Ingested)`**, add them as numbered `#ID` items in `dev/docs/ROADMAP_AND_BACKLOG.md` recording **only** the verbatim `User Note` (holding off on analysis until asked), and then clear those consumed entries from the Pending section below (recording a brief 1-line receipt in **`## Ingested Batch Log`** at the bottom).

---

## Standard Entry Template (Copy/Paste or Drop Raw Notes Below)
```markdown
### [MM/DD/YYYY] Batch
1. [Raw note, bug report, or feature prompt...]
2. [Another item...]
   - 2.a. [Optional sub-detail...]
```

---

## Pending Inbox (To Be Ingested)

*(Drop any new raw text, numbered lists, or rough prompts below this line — the agent will automatically parse, move to `dev/docs/ROADMAP_AND_BACKLOG.md`, and clean up this section.)*

---

## Ingested Batch Log

- **10/19/2026 Batch (Item 1)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` as **Item #14** on 10/20/2026.
- **10/23/2026 Batch (Item 1)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` as **Item #17** on 10/23/2026.
- **10/24/2026 Batch (Item 1)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` as **Item #20** on 10/24/2026.
- **10/29/2026 Batch (Item 1)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` as **Item #28** on 10/29/2026.
- **10/29/2026 Batch (Item 1 — Duplicate Promo in Export Show Plan)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` as **Item #29** and resolved/archived to `dev/docs/ROADMAP_HISTORY.md` on 10/29/2026.
- **11/03/2026 Direct Chat Prompt (Weekly Announcement Grid Removing Scheduled Days Hides Prior Calendar Events)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` as **Item #42** on 11/03/2026.
- **11/03/2026 Direct Chat Prompt (Evaluate Historical Rotating Media Track Placement Tracking)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Future / Deferred / Low Priority`) as **Item #43** on 11/03/2026.
- **11/04/2026 Direct Chat Prompt (Single macOS Universal Executable & OS/Module Compatibility Audit)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) as **Item #44** on 11/04/2026.



