import { useEffect, useState } from 'react';
import type { Ledger, Scope } from '../engine/types';

const KEY = 'bonus-scope';
const same = (a: Scope, b: Scope) => JSON.stringify(a) === JSON.stringify(b);

/** 看板與水位共用的「看哪個範圍」：全部／類別／專案 */
export const useScope = (ledger: Ledger): [Scope, (s: Scope) => void] => {
  const [scope, setScope] = useState<Scope>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || '') as Scope; } catch { return { kind: 'all' }; }
  });
  const valid =
    scope.kind === 'all' ||
    (scope.kind === 'cat' && (ledger.settings.projects.some((p) => p.category === scope.v) || ledger.contracts.some((c) => c.terms.category === scope.v))) ||
    (scope.kind === 'proj' && (ledger.settings.projects.some((p) => p.id === scope.id) || ledger.contracts.some((c) => c.terms.projectId === scope.id)));
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(scope)); } catch { /* 忽略 */ }
  }, [scope]);
  return [valid ? scope : { kind: 'all' }, setScope];
};

export const ScopeChips = ({ ledger, scope, onChange }: { ledger: Ledger; scope: Scope; onChange: (s: Scope) => void }) => {
  const projects = ledger.settings.projects.filter((p) => !p.archived || ledger.contracts.some((c) => c.terms.projectId === p.id));
  const cats = [...new Set(projects.map((p) => p.category))];
  const opts: { s: Scope; t: string }[] = [
    { s: { kind: 'all' }, t: '全部' },
    ...(cats.length > 1 ? cats.map((v) => ({ s: { kind: 'cat', v } as Scope, t: v })) : []),
    // 類別底下只有一個專案時，專案和類別是同一件事，不重複列出
    ...(projects.length > 1
      ? projects.filter((p) => cats.length === 1 || projects.filter((x) => x.category === p.category).length > 1).map((p) => ({ s: { kind: 'proj', id: p.id } as Scope, t: p.name }))
      : [])
  ];
  if (opts.length <= 1) return null;
  return (
    <div className="chips scope-chips" role="group" aria-label="資金範圍">
      {opts.map((o) => (
        <button key={JSON.stringify(o.s)} type="button" className="chip" aria-pressed={same(o.s, scope)} onClick={() => onChange(o.s)}>{o.t}</button>
      ))}
    </div>
  );
};
