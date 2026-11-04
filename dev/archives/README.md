# AMP Historical Version Archives Index (`JON99999/AMP_Private` -> `archives` Branch)

To keep the Google AI Studio workspace lightweight and avoid the ~200-file single-commit GitHub export bottleneck, all historical uncompressed version snapshots (`archive_v*`) are stored on the **`archives`** branch of **`JON99999/AMP_Private`**.

---

## 1. Archived Versions Available on `AMP_Private` (`branch: archives`)

All 27 historical snapshots (`1,664` files total) reside under `dev/archives/archive_v<version>/` on the `archives` branch:

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

## 2. How the Agent Reads or Diffs Historical Versions on Demand

Whenever the user asks to review, inspect, or compare against a historical version:

1. **Resolve `GITHUB_GIST_TOKEN` from the AI Studio Server Environment**:
   ```bash
   export GITHUB_GIST_TOKEN=${GITHUB_GIST_TOKEN:-$(grep -shz '^GITHUB_GIST_TOKEN=' /proc/[0-9]*/environ 2>/dev/null | head -z -n 1 | tr -d '\0' | cut -d= -f2-)}
   ```

2. **List Files Inside a Historical Archive Folder**:
   ```bash
   curl -sH "Authorization: Bearer $GITHUB_GIST_TOKEN" \
     -H "Accept: application/vnd.github+json" \
     "https://api.github.com/repos/JON99999/AMP_Private/contents/dev/archives/archive_v0.15.4/src?ref=archives"
   ```

3. **Fetch a Raw Historical File into `/tmp/` (Never into the Project Workspace)**:
   ```bash
   curl -sLH "Authorization: Bearer $GITHUB_GIST_TOKEN" \
     -H "Accept: application/vnd.github.raw+json" \
     "https://api.github.com/repos/JON99999/AMP_Private/contents/dev/archives/archive_v0.15.4/src/components/PlayerTab.tsx?ref=archives" \
     > /tmp/PlayerTab_v0.15.4.tsx
   ```

4. **Diff or Read from `/tmp/`**:
   ```bash
   diff -u /tmp/PlayerTab_v0.15.4.tsx src/components/PlayerTab.tsx
   ```

---

## 3. How the Agent Archives a New Version (`"Archive version X"`)

When explicitly commanded by the user to archive a version (e.g., *"Archive version 0.20.2"*):

1. **Do NOT leave a full `archive_v<version>/` folder inside the local AI Studio workspace.**
2. **Push the Uncompressed Snapshot Directly to `JON99999/AMP_Private` (`branch: archives`)**:
   - Use the GitHub Git Trees REST API (`POST /repos/JON99999/AMP_Private/git/trees` with `base_tree` set to the current `archives` branch tree SHA, adding all current project source/config files under `dev/archives/archive_v<version>/`, creating a commit, and updating `refs/heads/archives`).
3. **Update This Index (`dev/archives/README.md`)**:
   - Append `- dev/archives/archive_v<version>/` to Section 1 of this file.
