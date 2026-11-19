import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type Tab = 'board' | 'forecast' | 'sales' | 'contracts' | 'backup';
export type View =
  | { name: 'contract'; id: string }
  | { name: 'new'; client?: string }
  | { name: 'client'; client: string }
  | { name: 'settings' }
  | { name: 'audit' };

interface Nav {
  tab: Tab;
  stack: View[];
  go: (t: Tab) => void;
  push: (v: View) => void;
  back: () => void;
  replaceTop: (v: View) => void;
}

const Ctx = createContext<Nav | null>(null);

export const NavProvider = ({ children }: { children: ReactNode }) => {
  const [tab, setTab] = useState<Tab>('board');
  const [stack, setStack] = useState<View[]>([]);
  const depth = useRef(0);
  depth.current = stack.length;

  useEffect(() => {
    // 手機「返回」鍵：退回上一層
    const onPop = () => setStack((s) => (s.length ? s.slice(0, -1) : s));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const push = useCallback((v: View) => {
    history.pushState({ d: depth.current + 1 }, '');
    setStack((s) => [...s, v]);
  }, []);
  const back = useCallback(() => {
    if (depth.current > 0) history.back();
  }, []);
  const go = useCallback((t: Tab) => {
    const n = depth.current;
    setStack([]);
    setTab(t);
    if (n > 0) history.go(-n);
  }, []);
  const replaceTop = useCallback((v: View) => setStack((s) => [...s.slice(0, -1), v]), []);

  return <Ctx.Provider value={{ tab, stack, go, push, back, replaceTop }}>{children}</Ctx.Provider>;
};

export const useNav = () => {
  const n = useContext(Ctx);
  if (!n) throw new Error('NavProvider missing');
  return n;
};
