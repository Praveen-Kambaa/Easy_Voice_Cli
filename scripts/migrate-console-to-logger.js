/**
 * One-time migration: replace console.* with logger.* and add import.
 * Run: node scripts/migrate-console-to-logger.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const SKIP = new Set([
  path.normalize('src/utils/logger.js'),
]);

const REPLACEMENTS = [
  [/console\.debug\s*\(/g, 'logger.debug('],
  [/console\.log\s*\(/g, 'logger.debug('],
  [/console\.info\s*\(/g, 'logger.info('],
  [/console\.warn\s*\(/g, 'logger.warn('],
  [/console\.error\s*\(/g, 'logger.error('],
  [/console\.group\s*\(/g, 'logger.debug('],
  [/console\.groupEnd\s*\(\)/g, ''],
];

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const rel = path.relative(path.join(__dirname, '..'), p).replace(/\\/g, '/');
    if (SKIP.has(path.normalize(rel))) continue;
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (p.endsWith('.js') || p.endsWith('.jsx')) files.push(p);
  }
  return files;
}

function needsLoggerImport(content) {
  return /\blogger\.(debug|info|warn|error|apiRequest|apiResponse|apiError)\b/.test(content);
}

function hasLoggerImport(content) {
  return /from ['"].*\/utils\/logger['"]/.test(content) || /from ['"]\.\.\/utils\/logger['"]/.test(content);
}

function importPathFor(file) {
  const rel = path.relative(path.dirname(file), path.join(SRC, 'utils', 'logger.js')).replace(/\\/g, '/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

function migrateFile(file) {
  let content = fs.readFileSync(file, 'utf8');
  if (!/console\.(log|error|warn|info|debug|group|groupEnd)\s*\(?/.test(content)) return false;

  for (const [re, rep] of REPLACEMENTS) {
    content = content.replace(re, rep);
  }

  if (needsLoggerImport(content) && !hasLoggerImport(content)) {
    const importLine = `import logger from '${importPathFor(file).replace(/\.js$/, '')}';\n`;
    if (content.startsWith('/**') || content.startsWith('/*')) {
      const end = content.indexOf('*/') + 2;
      content = content.slice(0, end) + '\n' + importLine + content.slice(end);
    } else {
      content = importLine + content;
    }
  }

  fs.writeFileSync(file, content, 'utf8');
  return true;
}

const files = walk(SRC);
let n = 0;
for (const f of files) {
  if (migrateFile(f)) {
    n += 1;
    console.log('migrated', path.relative(SRC, f));
  }
}
console.log(`Done. ${n} files updated.`);
