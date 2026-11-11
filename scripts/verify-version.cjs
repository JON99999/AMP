/**
 * Version Alignment Verification Script
 *
 * Verifies that all primary version-bearing files in the workspace are
 * strictly synchronized to the same SemVer string:
 *   1. package.json ("version")
 *   2. package-lock.json ("version" and packages[""].version)
 *   3. src/lib/compatibility.ts (CURRENT_APP_VERSION)
 *   4. electron-main.cjs ("Version X.Y.Z" in About AMP dialog)
 *   5. CHANGELOG.md (contains "## [<version>]")
 *   6. dev/docs/ARCHIVED_VERSIONS_SCHEMA_AUDIT.md (contains "Current Release: v<version>")
 *
 * Usage:
 *   node scripts/verify-version.cjs
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function readJson(relPath) {
  const fullPath = path.join(rootDir, relPath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function readText(relPath) {
  const fullPath = path.join(rootDir, relPath);
  return fs.readFileSync(fullPath, 'utf8');
}

function verifyVersionAlignment() {
  const pkg = readJson('package.json');
  const targetVersion = pkg.version;

  console.log(`🔍 Verifying workspace alignment for target version: v${targetVersion}`);

  const results = [];
  let hasMismatch = false;

  // 1. package.json
  results.push({
    file: 'package.json',
    found: targetVersion,
    ok: Boolean(targetVersion)
  });

  // 2. package-lock.json
  try {
    const lock = readJson('package-lock.json');
    const lockTop = lock.version;
    const lockRootPkg = lock.packages && lock.packages[''] ? lock.packages[''].version : undefined;
    const ok = lockTop === targetVersion && lockRootPkg === targetVersion;
    if (!ok) hasMismatch = true;
    results.push({
      file: 'package-lock.json',
      found: `top=${lockTop}, rootPkg=${lockRootPkg}`,
      ok
    });
  } catch (err) {
    hasMismatch = true;
    results.push({
      file: 'package-lock.json',
      found: `ERROR: ${err.message}`,
      ok: false
    });
  }

  // 3. src/lib/compatibility.ts
  try {
    const compatText = readText('src/lib/compatibility.ts');
    const match = compatText.match(/export\s+const\s+CURRENT_APP_VERSION\s*=\s*["']([^"']+)["']/);
    const found = match ? match[1] : 'NOT_FOUND';
    const ok = found === targetVersion;
    if (!ok) hasMismatch = true;
    results.push({
      file: 'src/lib/compatibility.ts (CURRENT_APP_VERSION)',
      found,
      ok
    });
  } catch (err) {
    hasMismatch = true;
    results.push({
      file: 'src/lib/compatibility.ts',
      found: `ERROR: ${err.message}`,
      ok: false
    });
  }

  // 4. electron-main.cjs
  try {
    const electronText = readText('electron-main.cjs');
    const match = electronText.match(/Version\s+([0-9]+\.[0-9]+\.[0-9]+)/);
    const appVerMatch = electronText.match(/const\s+APP_VERSION\s*=\s*["']([^"']+)["']/);
    const found = match ? match[1] : 'NOT_FOUND';
    const appVerFound = appVerMatch ? appVerMatch[1] : targetVersion;
    const ok = found === targetVersion && appVerFound === targetVersion;
    if (!ok) hasMismatch = true;
    results.push({
      file: 'electron-main.cjs (About AMP dialog)',
      found: appVerMatch ? `${found} (APP_VERSION=${appVerFound})` : found,
      ok
    });
  } catch (err) {
    hasMismatch = true;
    results.push({
      file: 'electron-main.cjs',
      found: `ERROR: ${err.message}`,
      ok: false
    });
  }

  // 5. CHANGELOG.md
  try {
    const changelogText = readText('CHANGELOG.md');
    const hasHeading = changelogText.includes(`## [${targetVersion}]`);
    if (!hasHeading) hasMismatch = true;
    results.push({
      file: 'CHANGELOG.md',
      found: hasHeading ? `## [${targetVersion}]` : 'MISSING_HEADING',
      ok: hasHeading
    });
  } catch (err) {
    hasMismatch = true;
    results.push({
      file: 'CHANGELOG.md',
      found: `ERROR: ${err.message}`,
      ok: false
    });
  }

  // 6. dev/docs/ARCHIVED_VERSIONS_SCHEMA_AUDIT.md
  try {
    const auditText = readText('dev/docs/ARCHIVED_VERSIONS_SCHEMA_AUDIT.md');
    const hasCurrentRelease = auditText.includes(`Current Release: v${targetVersion}`);
    if (!hasCurrentRelease) hasMismatch = true;
    results.push({
      file: 'dev/docs/ARCHIVED_VERSIONS_SCHEMA_AUDIT.md',
      found: hasCurrentRelease ? `Current Release: v${targetVersion}` : 'MISSING_CURRENT_RELEASE',
      ok: hasCurrentRelease
    });
  } catch (err) {
    hasMismatch = true;
    results.push({
      file: 'dev/docs/ARCHIVED_VERSIONS_SCHEMA_AUDIT.md',
      found: `ERROR: ${err.message}`,
      ok: false
    });
  }

  for (const r of results) {
    const icon = r.ok ? '✓' : '✗';
    console.log(`  ${icon} ${r.file}: ${r.found}`);
  }

  if (hasMismatch) {
    console.error(`\n❌ Version alignment check FAILED. Expected all files to match v${targetVersion}.`);
    process.exit(1);
  } else {
    console.log(`\n✅ All version references strictly aligned to v${targetVersion}.`);
  }
}

verifyVersionAlignment();
