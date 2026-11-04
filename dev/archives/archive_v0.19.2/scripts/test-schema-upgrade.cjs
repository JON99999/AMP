/**
 * CommonJS Test Runner for Schema Upgrade & Compatibility
 * 
 * Invokes the canonical TypeScript test suite using tsx.
 * 
 * Usage:
 *   node scripts/test-schema-upgrade.cjs
 */

const { execSync } = require('child_process');
const path = require('path');

try {
  const tsTestPath = path.join(__dirname, 'test-schema-upgrade.ts');
  execSync(`npx tsx "${tsTestPath}"`, { stdio: 'inherit' });
} catch (err) {
  process.exit(1);
}
