import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { excluded, lintable, newDiagnostics, normalizeMessages, parseChanges } from './lint-policy.mjs';

const checkerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

export async function checkChanged({ project = checkerRoot, base, log = console.log }) {
  project = path.resolve(project);
  // Resolve the reference before passing it to other commands. No shell is used,
  // and NUL-delimited paths preserve spaces, tabs, and newlines in filenames.
  const baseSha = git(project, ['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`]).trim();
  const reference = git(project, ['merge-base', baseSha, 'HEAD']).trim();
  // Local runs include tracked worktree edits; CI checks out the exact PR head.
  const changes = parseChanges(git(project, ['diff', '--no-ext-diff', '--no-textconv', '--find-renames', '--name-status', '-z', reference, '--']));
  for (const file of git(project, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)) {
    changes.push({ status: 'A', file, previousFile: null });
  }
  const eslint = new ESLint({
    cwd: project,
    overrideConfigFile: path.join(checkerRoot, 'eslint.config.js'),
    allowInlineConfig: false,
    cache: false,
  });
  let addedCount = 0;
  let existingCount = 0;
  let resolvedCount = 0;
  let checkedCount = 0;
  async function lint(source, file) {
    const absolute = path.join(project, file);
    if (!await eslint.calculateConfigForFile(absolute)) {
      throw new Error(`${file}: lintable file has no ESLint configuration or is unexpectedly ignored.`);
    }
    const [result] = await eslint.lintText(source, { filePath: absolute });
    if (!result || result.messages.some(message => message.fatal || (!message.ruleId && message.severity === 2))) {
      throw new Error(`${file}: parser/configuration failure: ${result?.messages.map(message => message.message).join('; ') ?? 'missing lint result'}`);
    }
    return normalizeMessages(result.messages, source);
  }
  // Validate configuration and parser execution even without lintable changes.
  await lint('export const lintGateProbe = 1;', 'src/__lint_gate_probe__.ts');
  for (const change of changes) {
    if (change.status === 'D' || !lintable(change.file)) continue;
    if (excluded(change.file)) {
      log(`${change.file}: excluded generated/dependency directory.`);
      continue;
    }
    const absolute = path.join(project, change.file);
    if (!fs.lstatSync(absolute).isFile()) throw new Error(`${change.file}: lintable paths must be regular files.`);
    const current = await lint(fs.readFileSync(absolute, 'utf8'), change.file);
    // A rename carries debt only from a previously linted, non-excluded file.
    const previous = change.previousFile && lintable(change.previousFile) && !excluded(change.previousFile)
      ? await lint(git(project, ['show', `${reference}:${change.previousFile}`]), change.previousFile) : [];
    const errors = current.filter(message => message.severity === 2);
    const previousErrors = previous.filter(message => message.severity === 2);
    const added = newDiagnostics(errors, previousErrors);
    for (const message of current.filter(message => message.severity === 1)) {
      log(`${change.file}:${message.line}:${message.column} warning ${message.ruleId}: ${message.message}`);
    }
    for (const message of added) {
      log(`${change.file}:${message.line}:${message.column} error ${message.ruleId}: ${message.message}`);
    }
    addedCount += added.length;
    existingCount += errors.length - added.length;
    resolvedCount += newDiagnostics(previousErrors, errors).length;
    checkedCount++;
  }
  log(`ESLint ${ESLint.version}: ${checkedCount} changed file(s), ${existingCount} existing error(s), ${resolvedCount} resolved, ${addedCount} new. Reference: ${reference}.`);
  return addedCount ? 1 : 0;
}

export async function run(args = process.argv.slice(2)) {
  let project = checkerRoot;
  let base;
  while (args.length) {
    const option = args.shift();
    const value = args.shift();
    if (!value || !['--base', '--project'].includes(option)) {
      throw new Error('Usage: pnpm lint:changed --base <target-ref> [--project PATH]');
    }
    if (option === '--base') {
      if (base) throw new Error('Duplicate --base.');
      base = value;
    } else project = path.resolve(value);
  }
  if (!base) throw new Error('An explicit --base target reference is required.');
  return checkChanged({ project, base });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await run(); }
  catch (error) { console.error(`ESLint gate failed: ${error.message}`); process.exitCode = 1; }
}
