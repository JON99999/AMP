# AMP Historical Version Archives Index (`JON99999/AMP_Private` -> `archives` Branch)

To keep the Google AI Studio workspace lightweight and avoid the ~200-file single-commit GitHub export bottleneck, all historical uncompressed version snapshots (`archive_v*`) are stored on the protected **`archives`** branch of **`JON99999/AMP_Private`**.

---

## 1. Security & Process Guardrails (Strictly Read-Only for the Agent)

1. **Zero Agent Write Access to GitHub Repositories**:
   - The AI Studio agent uses a **Read-Only** Fine-Grained Personal Access Token (`GITHUB_ARCHIVE_TOKEN`, scoped strictly to `JON99999/AMP_Private` with `Contents: Read-only`).
   - The agent is **strictly prohibited** from executing any mutating GitHub API calls (`POST`, `PUT`, `PATCH`, `DELETE`, `git push`) against `JON99999/AMP_Private` or `JON99999/AMP`.
2. **Automated Append-Only Archiving via GitHub Actions (`.github/workflows/sync-public.yml`)**:
   - Whenever the user exports `main` from AI Studio to `JON99999/AMP_Private`, the `Append Version Snapshot to Private Archives Branch` step in `.github/workflows/sync-public.yml` automatically copies the current release files into `dev/archives/archive_v<version>/` on the `archives` branch without ever deleting prior `archive_v*` folders.

---

## 2. Archived Versions Available on `AMP_Private` (`branch: archives`)

All historical snapshots reside under `dev/archives/archive_v<version>/` on the `archives` branch:

- `dev/archives/archive_v0.12.21/`
- `dev/archives/archive_v0.13.1/`
- `dev/archives/archive_v0.14.4/`
- `dev/archives/archive_v0.15.0/`
- `dev/archives/archive_v0.15.1/`
- `dev/archives/archive_v0.15.2/`
- `dev/archives/archive_v0.15.3/`
- `dev/archives/archive_v0.15.4/`
- `dev/archives/archive_v0.15.5/`
- `dev/archives/archive_v0.16.0/`
- `dev/archives/archive_v0.16.1/`
- `dev/archives/archive_v0.16.2/`
- `dev/archives/archive_v0.16.3/`
- `dev/archives/archive_v0.16.8/`
- `dev/archives/archive_v0.16.9/`
- `dev/archives/archive_v0.16.10/`
- `dev/archives/archive_v0.17.0/`
- `dev/archives/archive_v0.18.0/`
- `dev/archives/archive_v0.18.1/`
- `dev/archives/archive_v0.19.0/`
- `dev/archives/archive_v0.19.1/`
- `dev/archives/archive_v0.19.2/`
- `dev/archives/archive_v0.19.3/`
- `dev/archives/archive_v0.19.4/`
- `dev/archives/archive_v0.19.5/`
- `dev/archives/archive_v0.20.0/`
- `dev/archives/archive_v0.20.1/`

---

## 3. How the Agent Reads or Diffs Historical Versions on Demand (`GET` Only)

Whenever the user asks to review, inspect, or compare against a historical version:

1. **Resolve the Read-Only `GITHUB_ARCHIVE_TOKEN` from the AI Studio Server Environment**:
   ```bash
   export ARCHIVE_TOKEN=${GITHUB_ARCHIVE_TOKEN:-$(grep -shz '^GITHUB_ARCHIVE_TOKEN=' /proc/[0-9]*/environ 2>/dev/null | head -z -n 1 | tr -d '\0' | cut -d= -f2-)}
   if [ -z "$ARCHIVE_TOKEN" ]; then
     export ARCHIVE_TOKEN=${GITHUB_GIST_TOKEN:-$(grep -shz '^GITHUB_GIST_TOKEN=' /proc/[0-9]*/environ 2>/dev/null | head -z -n 1 | tr -d '\0' | cut -d= -f2-)}
   fi
   ```

2. **List Files Inside a Historical Archive Folder**:
   ```bash
   curl -sH "Authorization: Bearer $ARCHIVE_TOKEN" \
     -H "Accept: application/vnd.github+json" \
     "https://api.github.com/repos/JON99999/AMP_Private/contents/dev/archives/archive_v0.15.4/src?ref=archives"
   ```

3. **Fetch a Raw Historical File into `/tmp/` (Never into the Project Workspace)**:
   ```bash
   curl -sLH "Authorization: Bearer $ARCHIVE_TOKEN" \
     -H "Accept: application/vnd.github.raw+json" \
     "https://api.github.com/repos/JON99999/AMP_Private/contents/dev/archives/archive_v0.15.4/src/components/PlayerTab.tsx?ref=archives" \
     > /tmp/PlayerTab_v0.15.4.tsx
   ```

4. **Diff or Read from `/tmp/`**:
   ```bash
   diff -u /tmp/PlayerTab_v0.15.4.tsx src/components/PlayerTab.tsx
   ```
