/**
 * Every export of a `'use server'` file is a public POST endpoint: anybody who
 * can reach the app can call it with any arguments. So each one must reach
 * `requireCampaignRole`, `requireUserId` or `requireSuperAdmin` somewhere in
 * its call chain, unless it is listed in PUBLIC below with the reason it may
 * answer a stranger.
 *
 * The call graph is built from the source with the TypeScript compiler, by
 * name: a function's calls (closures included, so `sessionAction(() => x())`
 * counts) and the functions it passes by reference, resolved through imports
 * and re-exports. It cannot see a guard reached through a dynamic import or a
 * method call, so a false alarm here means "make the guard visible", not
 * "add it to PUBLIC".
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const GUARDS = new Set([
  'requireCampaignRole',
  'requireUserId',
  'requireSuperAdmin',
]);

/** Actions that answer without a signed-in user, on purpose. */
const PUBLIC: Record<string, string> = {
  'src/@creator/library/actions.ts#listShelfAction':
    'the shelf renders for a stranger, filtered to listed public items',
  'src/@creator/library/actions.ts#getPublicationAction':
    'a listing is reachable by its link, including unlisted ones',
  'src/app/dev/mail/actions.ts#clearOutboxAction':
    'the dev mail sink; it refuses to run in production',
};

type Key = string; // "<absolute file>#<name>"

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name))
      out.push(p);
  }
  return out;
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/')
    ? join(ROOT, 'src', spec.slice(2))
    : spec.startsWith('.')
      ? resolve(dirname(from), spec)
      : null;
  if (!base) return null;
  for (const c of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ])
    if (existsSync(c)) return c;
  return null;
}

function buildGraph() {
  const calls = new Map<Key, Set<Key>>();
  const exportsOf = new Map<string, Set<string>>();
  const reexports = new Map<
    string,
    { name: string; from: string; orig: string }[]
  >();
  const useServer: string[] = [];

  for (const file of sourceFiles(join(ROOT, 'src'))) {
    const text = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    if (/^\s*['"]use server['"]/.test(text)) useServer.push(file);

    const imports = new Map<string, Key>();
    const rex: { name: string; from: string; orig: string }[] = [];
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) && st.importClause?.namedBindings) {
        const target = resolveImport(
          file,
          (st.moduleSpecifier as ts.StringLiteral).text
        );
        const nb = st.importClause.namedBindings;
        if (target && ts.isNamedImports(nb))
          for (const el of nb.elements)
            imports.set(
              el.name.text,
              `${target}#${(el.propertyName ?? el.name).text}`
            );
      }
      if (ts.isExportDeclaration(st) && st.moduleSpecifier) {
        const target = resolveImport(
          file,
          (st.moduleSpecifier as ts.StringLiteral).text
        );
        if (!target) continue;
        if (st.exportClause && ts.isNamedExports(st.exportClause))
          for (const el of st.exportClause.elements)
            rex.push({
              name: el.name.text,
              from: target,
              orig: (el.propertyName ?? el.name).text,
            });
        else rex.push({ name: '*', from: target, orig: '*' });
      }
    }
    reexports.set(file, rex);

    const exported = new Set<string>();
    const record = (name: string, body: ts.Node, isExport: boolean) => {
      if (isExport) exported.add(name);
      const out = new Set<Key>();
      const add = (id: string) => out.add(imports.get(id) ?? `${file}#${id}`);
      (function visit(n: ts.Node) {
        if (ts.isCallExpression(n)) {
          if (ts.isIdentifier(n.expression)) add(n.expression.text);
          for (const a of n.arguments) if (ts.isIdentifier(a)) add(a.text);
        }
        ts.forEachChild(n, visit);
      })(body);
      calls.set(`${file}#${name}`, out);
    };
    for (const st of sf.statements) {
      const isExport = !!ts
        .getModifiers(st as ts.HasModifiers)
        ?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
      if (ts.isFunctionDeclaration(st) && st.name && st.body)
        record(st.name.text, st.body, isExport);
      if (ts.isVariableStatement(st))
        for (const d of st.declarationList.declarations)
          if (
            ts.isIdentifier(d.name) &&
            d.initializer &&
            (ts.isArrowFunction(d.initializer) ||
              ts.isFunctionExpression(d.initializer))
          )
            record(d.name.text, d.initializer, isExport);
    }
    exportsOf.set(file, exported);
  }

  const canonical = (key: Key, depth = 0): Key => {
    if (calls.has(key) || depth > 5) return key;
    const [file, name] = key.split('#');
    for (const r of reexports.get(file) ?? []) {
      if (r.name === name) return canonical(`${r.from}#${r.orig}`, depth + 1);
      if (r.name === '*') {
        const k = canonical(`${r.from}#${name}`, depth + 1);
        if (calls.has(k)) return k;
      }
    }
    return key;
  };

  const memo = new Map<Key, boolean>();
  const guarded = (raw: Key, stack = new Set<Key>()): boolean => {
    const key = canonical(raw);
    if (GUARDS.has(key.split('#')[1])) return true;
    if (memo.has(key)) return memo.get(key)!;
    if (stack.has(key) || !calls.has(key)) return false;
    stack.add(key);
    const ok = [...calls.get(key)!].some(c => guarded(c, stack));
    stack.delete(key);
    memo.set(key, ok);
    return ok;
  };

  return { useServer, exportsOf, guarded };
}

describe('server actions', () => {
  const { useServer, exportsOf, guarded } = buildGraph();
  const actions = useServer.flatMap(file =>
    [...(exportsOf.get(file) ?? [])].map(name => ({
      file,
      name,
      id: `${relative(ROOT, file)}#${name}`,
    }))
  );

  it('finds the actions to check', () => {
    expect(actions.length).toBeGreaterThan(100);
  });

  it('each reach an auth guard, or are listed as public with a reason', () => {
    const open = actions
      .filter(a => !(a.id in PUBLIC) && !guarded(`${a.file}#${a.name}`))
      .map(a => a.id);
    expect(open).toEqual([]);
  });

  it('lists no public action that has gone or gained a guard', () => {
    const live = new Map(actions.map(a => [a.id, a]));
    const stale = Object.keys(PUBLIC).filter(id => {
      const a = live.get(id);
      return !a || guarded(`${a.file}#${a.name}`);
    });
    expect(stale).toEqual([]);
  });
});
