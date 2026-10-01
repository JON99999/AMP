# Repository Architecture & Public Synchronization Specification

This document details the architectural layout, credential structure, and automated deployment pipeline between the private development repository (**AMP_Private**) and the public release repository (**AMP**).

---

## 1. Architectural Model

```
+---------------------------+
|     Google AI Studio      |
+-------------+-------------+
              | (Direct Export / Sync)
              v
+---------------------------+
|  JON99999 / AMP_Private   |  <-- PRIVATE Source of Truth
|  - Full Source & Tests    |
|  - dev/ (Archives & Docs) |
|  - AGENTS.md / Philosophy |
+-------------+-------------+
              | (GitHub Actions: .github/workflows/sync-public.yml)
              | (Scrub dev/, AGENTS.md, AGENTS_PHILOSOPHY.md)
              v
+---------------------------+
|      JON99999 / AMP       |  <-- PUBLIC Clean Distribution
|  - Production App Source  |
|  - Standalone Releases    |
+---------------------------+
```

---

## 2. Repositories

1. **Private Development Repository**:
   - **URL**: `https://github.com/JON99999/AMP_Private`
   - **Visibility**: Private
   - **Purpose**: Primary workspace connected to Google AI Studio. Houses development archives (`dev/archives/`), architectural specifications (`dev/docs/`), and internal agent guidelines (`AGENTS.md`, `AGENTS_PHILOSOPHY.md`).

2. **Public Distribution Repository**:
   - **URL**: `https://github.com/JON99999/AMP`
   - **Visibility**: Public
   - **Purpose**: Clean distribution repository for end-users, station operators, and automated release packaging.

---

## 3. Automated Sync Workflow (`.github/workflows/sync-public.yml`)

Whenever changes or version tags (`v*`) are pushed to `main` on `AMP_Private`:

1. **Trigger**: Push to `main` branch or tag matching `v*`.
2. **Checkout**: Checks out the full commit tree from `AMP_Private`.
3. **Scrubbing & Metadata Transfer Phase**:
   - Extracts full commit message body and change deltas from `AMP_Private`.
   - Recursively deletes `dev/` (`rm -rf dev/`).
   - Removes internal rule files (`rm -f AGENTS.md AGENTS_PHILOSOPHY.md`).
   - Removes synchronizer workflow (`rm -f .github/workflows/sync-public.yml`).
4. **Target Push**:
   - Authenticates via `PUBLIC_REPO_TOKEN` secret.
   - Stages and commits the sanitized tree using the extracted delta commit message.
   - Pushes directly to `https://github.com/JON99999/AMP.git` (`main` and any associated version tags).

---

## 4. Public Release Building (`.github/workflows/release.yml`)

The public repository build workflow supports:
- **Automatic Tag Triggers**: Pushes matching `v*` (e.g. `v0.16.8`).
- **Release UI Triggers**: Publishing a release via GitHub Releases UI (`release: types: [published, created]`).
- **Manual Trigger**: "Run workflow" button in the GitHub Actions tab (`workflow_dispatch`).
- **Automated Release Notes**: Uses `generate_release_notes: true` to compile full change logs, commits, and deltas into the GitHub Release.

---

## 5. Setup & Secret Configuration

To maintain the automated pipeline:

1. **Personal Access Token (PAT)**:
   - Created on GitHub under **Settings** > **Developer Settings** > **Personal Access Tokens (classic)**.
   - Required scopes:
     * **`repo`** (Full control of private and public repositories).
     * **`workflow`** (Update GitHub Action workflows — required whenever pushing `.github/workflows/` files such as `release.yml`).
2. **Repository Secret**:
   - Configured in `AMP_Private` under **Settings** > **Secrets and variables** > **Actions**.
   - Secret Name: `PUBLIC_REPO_TOKEN`
   - Value: Generated GitHub Personal Access Token.

---

## 6. AI Studio Connection Procedure

When reconnecting or linking Google AI Studio to GitHub:

1. Disconnect any existing linked repo in AI Studio.
2. Select **Export to GitHub** / **Connect to GitHub**.
3. Choose `AMP_Private` (or create as **Private** repository).
4. Export the workspace.
5. All future AI Studio commits pushed to `AMP_Private` automatically propagate to `AMP` via GitHub Actions.
