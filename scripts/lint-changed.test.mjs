import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { checkChanged, run } from './lint-changed.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { newDiagnostics, normalizeMessages, parseChanges } from './lint-policy.mjs';

function fixture(t, files = {}) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-gate-'));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, source) => {
    fs.mkdirSync(path.dirname(path.join(project, file)), { recursive: true });
    fs.writeFileSync(path.join(project, file), source);
  };
  git('init', '-q');
  git('config', 'user.email', 'gate@example.invalid');
  git('config', 'user.name', 'Gate test');
  write('README.md', 'fixture\n');
  for (const [file, source] of Object.entries(files)) write(file, source);
  git('add', '.');
  git('commit', '-qm', 'reference');
  const base = git('rev-parse', 'HEAD');
  const output = [];
  const check = () => checkChanged({ project, base, log: message => output.push(message) });
  return { project, base, git, write, output, check };
}

const debt = 'export const value: any = 1;\n';
const clean = 'export const value: number = 1;\n';

test('new files: clean passes, errors fail, including untracked paths with spaces', async t => {
  const f = fixture(t);
  f.write('src/new clean.ts', clean);
  assert.equal(await f.check(), 0);
  f.write('src/new broken.ts', debt);
  assert.equal(await f.check(), 1);
  assert.match(f.output.join('\n'), /new broken\.ts:1:21 error @typescript-eslint\/no-explicit-any/);
});

test('unchanged existing errors survive line shifts; fixed debt disappears automatically', async t => {
  const f = fixture(t, { 'src/existing.ts': debt });
  f.write('src/existing.ts', '\n// moved down\n' + debt);
  assert.equal(await f.check(), 0);
  assert.match(f.output.at(-1), /1 existing error/);
  f.write('src/existing.ts', clean);
  assert.equal(await f.check(), 0);
  assert.match(f.output.at(-1), /1 resolved/);
});

test('additional errors and equal-total replacements fail', async t => {
  const f = fixture(t, { 'src/existing.ts': debt });
  f.write('src/existing.ts', debt + 'export const extra: any = 2;\n');
  assert.equal(await f.check(), 1);
  f.write('src/existing.ts', 'export const value = {} as {};\n');
  assert.equal(await f.check(), 1);
  assert.match(f.output.join('\n'), /@typescript-eslint\/no-empty-object-type/);
});

test('a pre-existing error on an untouched line cannot hide a new one', async t => {
  const f = fixture(t, { 'src/existing.ts': debt + clean.replace('value', 'other') });
  f.write('src/existing.ts', debt + 'export const other: any = 2;\n');
  assert.equal(await f.check(), 1);
  assert.match(f.output.at(-1), /1 existing error.*1 new/);
});

test('renames retain their own debt, deletions are skipped, copies must be clean', async t => {
  const f = fixture(t, { 'src/old name.ts': debt, 'src/delete.ts': debt });
  f.git('mv', 'src/old name.ts', 'src/new name.ts');
  f.git('rm', 'src/delete.ts');
  assert.equal(await f.check(), 0);
  assert.match(f.output.at(-1), /1 changed file.*1 existing error/);
  f.write('src/copy.ts', debt);
  assert.equal(await f.check(), 1);
});

test('debt cannot move from excluded or non-lintable files into source', async t => {
  const f = fixture(t, { 'dist/generated.ts': debt, 'notes.txt': debt });
  fs.mkdirSync(path.join(f.project, 'src'));
  f.git('mv', 'dist/generated.ts', 'src/generated.ts');
  f.git('mv', 'notes.txt', 'src/notes.ts');
  assert.equal(await f.check(), 1);
  assert.match(f.output.at(-1), /0 existing error.*2 new/);
});

test('new inline disable comments and eslint-env/config comments cannot bypass rules', async t => {
  const f = fixture(t);
  f.write('src/suppressed.ts', '/* eslint-disable */\n/* eslint @typescript-eslint/no-explicit-any: off */\n' + debt);
  assert.equal(await f.check(), 1);
  assert.match(f.output.join('\n'), /no-explicit-any/);
});

test('existing inline suppressions are ignored in both versions', async t => {
  const f = fixture(t, { 'src/existing.ts': '/* eslint-disable */\n' + debt });
  f.write('src/existing.ts', '/* eslint-disable */\n\n' + debt);
  assert.equal(await f.check(), 0);
  assert.match(f.output.at(-1), /1 existing error/);
});

test('warnings are visible and do not fail the gate', async t => {
  const f = fixture(t);
  f.write('src/warning.tsx', 'export const helper = () => 1;\nexport const Component = () => <div />;\n');
  assert.equal(await f.check(), 0);
  assert.match(f.output.join('\n'), /warning react-refresh\/only-export-components/);
});

test('parser errors fail visibly rather than becoming baseline debt', async t => {
  const f = fixture(t);
  f.write('src/broken.ts', 'export const = ;');
  await assert.rejects(f.check(), /parser\/configuration failure.*Parsing error/);
});

test('Deno sources use repository rules; uncovered extensions fail', async t => {
  const f = fixture(t);
  f.write('supabase/functions/new/index.ts', debt);
  assert.equal(await f.check(), 1);
  fs.rmSync(path.join(f.project, 'supabase'), { recursive: true });
  f.write('src/new.mts', clean);
  await assert.rejects(f.check(), /no ESLint configuration/);
});

test('generated directories are explicitly reported as excluded', async t => {
  const f = fixture(t);
  f.write('dist/generated.ts', debt);
  assert.equal(await f.check(), 0);
  assert.match(f.output.join('\n'), /excluded generated\/dependency directory/);
});

test('candidate config and checker cannot weaken trusted rules', async t => {
  const f = fixture(t);
  f.write('eslint.config.js', 'throw new Error("candidate config executed");');
  f.write('scripts/lint-changed.mjs', 'throw new Error("candidate checker executed");');
  f.write('src/error.ts', debt);
  assert.equal(await f.check(), 1);
});

test('missing references and missing base argument fail', async t => {
  const f = fixture(t);
  await assert.rejects(checkChanged({ project: f.project, base: 'missing-target' }));
  await assert.rejects(run([]), /explicit --base/);
});

test('uses the requested target merge base even when the target advances', async t => {
  const f = fixture(t, { 'src/existing.ts': debt });
  f.git('branch', 'actual-target');
  f.git('checkout', '-qb', 'feature');
  f.write('src/existing.ts', '\n' + debt);
  f.git('add', '.');
  f.git('commit', '-qm', 'feature shift');
  f.git('checkout', '-q', 'actual-target');
  f.write('src/target-only.ts', debt);
  f.git('add', '.');
  f.git('commit', '-qm', 'target advance');
  f.git('checkout', '-q', 'feature');
  const output = [];
  assert.equal(await checkChanged({ project: f.project, base: 'actual-target', log: message => output.push(message) }), 0);
  assert.match(output.at(-1), /1 changed file.*1 existing error/);
  assert.ok(output.at(-1).endsWith(`Reference: ${f.base}.`));
});

test('a broken trusted configuration fails checking visibly', async t => {
  const f = fixture(t);
  const trusted = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-trusted-'));
  t.after(() => fs.rmSync(trusted, { recursive: true, force: true }));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  fs.mkdirSync(path.join(trusted, 'scripts'));
  for (const file of ['lint-changed.mjs', 'lint-policy.mjs']) {
    fs.copyFileSync(path.join(root, 'scripts', file), path.join(trusted, 'scripts', file));
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(trusted, 'node_modules'), 'dir');
  fs.writeFileSync(path.join(trusted, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(trusted, 'eslint.config.js'), 'throw new Error("broken trusted config");');
  const checker = await import(pathToFileURL(path.join(trusted, 'scripts/lint-changed.mjs')).href);
  await assert.rejects(checker.run(['--project', f.project, '--base', f.base]), /broken trusted config/);
});

test('comparison distinguishes source and multiplicity independently of locations', () => {
  const a = { ruleId: 'rule', message: 'message', source: 'first', line: 1 };
  assert.deepEqual(newDiagnostics([{ ...a, line: 50 }], [a]), []);
  assert.equal(newDiagnostics([a, a], [a]).length, 1);
  assert.equal(newDiagnostics([{ ...a, source: 'second' }], [a]).length, 1);
  assert.equal(newDiagnostics([], [a]).length, 0);
});

test('NUL parsing preserves unusual paths and rejects malformed output', () => {
  assert.deepEqual(parseChanges('R100\0old\tname.ts\0new\nname.ts\0D\0deleted.ts\0'), [
    { status: 'R', file: 'new\nname.ts', previousFile: 'old\tname.ts' },
    { status: 'D', file: 'deleted.ts', previousFile: 'deleted.ts' },
  ]);
  assert.throws(() => parseChanges('A\0incomplete'));
  assert.throws(() => parseChanges('R100\0old.ts\0'));
});

test('multiline diagnostic spans normalize whitespace', () => {
  const [diagnostic] = normalizeMessages([{ line: 2, column: 2, endLine: 3, endColumn: 3 }], 'header\n first\n  second');
  assert.equal(diagnostic.source, 'first');
});
