#!/usr/bin/env node
/**
 * AMP Automated Color & Theme Coverage Verifier (scripts/verify-colors.cjs)
 *
 * Verifies:
 * 1. All non-standard intermediate Tailwind color stops used in src/ are defined under @theme in src/index.css.
 * 2. All Light Mode surface, border, text, and hover classes used in production components have matching
 *    Dark Mode overrides in src/index.css.
 * 3. No colliding substring selectors (e.g., [class*="bg-amber-50"] matching bg-amber-500 or hover:bg-amber-50)
 *    exist in src/index.css.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CSS_PATH = path.join(ROOT, 'src', 'index.css');
const SRC_DIR = path.join(ROOT, 'src');

const STANDARD_STOPS = new Set([
  '50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'
]);

// Intentional exemptions where dark text is used on bright 400/500 badges in both Light and Dark mode
const INTENTIONAL_EXEMPTIONS = new Set([
  'text-slate-950'
]);

function walk(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walk(full));
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

const css = fs.readFileSync(CSS_PATH, 'utf8');
const prodFiles = walk(SRC_DIR).filter(
  f => !f.includes('LiveDevTab.tsx') && !f.includes('UiDeclutterMockups.tsx')
);

let errors = 0;

// 1. Check for colliding substring wildcards in src/index.css
const dangerousWildcards = [
  '[class*="bg-amber-50"]',
  '[class*="bg-emerald-50"]',
  '[class*="bg-blue-50"]',
  '[class*="bg-purple-50"]',
  '[class*="bg-red-50"]',
  '[class*="bg-slate-50"]'
];
for (const pattern of dangerousWildcards) {
  if (css.includes(pattern)) {
    console.error(`[FAIL] Colliding wildcard selector found in src/index.css: ${pattern}`);
    errors++;
  }
}

// 2. Scan production files for color classes
const classMap = new Map();
const colorRegex = /\b((?:hover:)?(?:bg|text|border)-(?:slate|gray|zinc|neutral|blue|amber|emerald|red|rose|purple|orange|indigo|green|yellow|cyan|white)[a-zA-Z0-9/.\-[\]#]*)\b/g;

for (const file of prodFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    let m;
    while ((m = colorRegex.exec(line)) !== null) {
      const cls = m[1];
      if (!classMap.has(cls)) classMap.set(cls, []);
      classMap.get(cls).push(`${path.relative(ROOT, file)}:${idx + 1}`);
    }
  });
}

// 3. Verify intermediate stop definitions in @theme and Dark Mode coverage
for (const [cls, locs] of [...classMap.entries()].sort()) {
  if (INTENTIONAL_EXEMPTIONS.has(cls)) continue;

  // Check if non-standard stop (e.g., slate-150, blue-150) is defined in @theme
  const stopMatch = cls.match(/^(?:hover:)?(?:bg|text|border)-([a-z]+)-(\d+)(?:\/|$)/);
  if (stopMatch) {
    const [, palette, stop] = stopMatch;
    if (!STANDARD_STOPS.has(stop)) {
      const tokenVar = `--color-${palette}-${stop}:`;
      if (!css.includes(tokenVar)) {
        console.error(
          `[FAIL] Non-standard stop "${cls}" missing "${tokenVar}" in @theme (${locs.slice(0, 3).join(', ')})`
        );
        errors++;
      }
    }
  }

  // Check Dark Mode override coverage for Light Mode surfaces/text/borders/hovers
  const escaped = cls
    .replace(/\//g, '\\/')
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/#/g, '\\#');

  const isLightBg = /^(hover:)?bg-(white|slate-(50|1\d\d|2\d\d|3\d\d)|(blue|amber|emerald|green|red|rose|purple|orange|indigo)-(50|1\d\d|2\d\d))(\/|$)/.test(cls);
  const isDarkTextForLightBg = /^(hover:)?text-(slate-(350|4\d\d|5\d\d|6\d\d|7\d\d|8\d\d|900|905)|(blue|amber|emerald|green|red|rose|purple|orange|indigo)-(6\d\d|7\d\d|8\d\d|9\d\d))(\/|$)/.test(cls);
  const isLightBorder = /^border-(slate-(1\d\d|2\d\d|3\d\d)|(blue|amber|emerald|green|red|rose|purple|orange)-(1\d\d|2\d\d|3\d\d))(\/|$)/.test(cls);

  if ((isLightBg || isDarkTextForLightBg || isLightBorder) && !css.includes('.' + escaped)) {
    console.error(
      `[FAIL] Light-mode utility "${cls}" missing Dark Mode override in src/index.css (${locs.slice(0, 3).join(', ')})`
    );
    errors++;
  }
}

if (errors > 0) {
  console.error(`\nColor verification failed with ${errors} issue(s).`);
  process.exit(1);
} else {
  console.log(
    `[OK] Verified ${classMap.size} color utilities across ${prodFiles.length} production files — 0 missing @theme tokens, 0 missing Dark Mode overrides, 0 colliding wildcards.`
  );
}
