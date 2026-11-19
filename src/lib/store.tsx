import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { defaultSettings, todayStr } from '../engine/engine';
import { emptyLedger } from '../engine/actions';
import type { Ledger } from '../engine/types';
import type { PinRecord } from './crypto';

const LEDGER_KEY = 'bonus-ledger-v1';
const META_KEY = 'bonus-meta-v1';

export interface Meta {
  pin?: PinRecord;
  fails: number;
  lockUntil: number;
  /** 上次備份後的異動筆數 */
  dirty: number;
  lastBackupAt?: string;
  backupHint?: string;
}

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export const isLedger = (x: unknown): x is Ledger => {
  const l = x as Ledger;
  return !!l && l.v === 1 && Array.isArray(l.contracts) && Array.isArray(l.sales) && typeof l.payments === 'object' && !!l.settings && Array.isArray(l.audit);
};

/** 網址加 ?today=2026-12-03 可模擬日期（測試用） */
const resolveToday = () => {
  const q = new URLSearchParams(location.search).get('today');
  return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayStr();
};

interface Store {
  ledger: Ledger;
  meta: Meta;
  today: string;
  /** 寫入帳本：會增加「未備份」計數 */
  commit: (next: Ledger) => void;
  replaceLedger: (next: Ledger, dirty?: number) => void;
  setMeta: (patch: Partial<Meta>) => void;
  wipeAll: () => void;
  storageError: string | null;
}

const Ctx = createContext<Store | null>(null);

export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const [ledger, setLedger] = useState<Ledger>(() => {
    const l = read<Ledger | null>(LEDGER_KEY, null);
    return isLedger(l) ? l : emptyLedger(defaultSettings());
  });
  const [meta, setMetaState] = useState<Meta>(() => ({ fails: 0, lockUntil: 0, dirty: 0, ...read<Partial<Meta>>(META_KEY, {}) }));
  const [today, setToday] = useState(resolveToday);
  const [storageError, setStorageError] = useState<string | null>(null);
  const metaRef = useRef(meta);
  metaRef.current = meta;

  useEffect(() => {
    // 要求瀏覽器保留資料，降低被自動清除的機會
    navigator.storage?.persist?.().catch(() => undefined);
    const t = setInterval(() => setToday(resolveToday()), 60000);
    return () => clearInterval(t);
  }, []);

  const save = (key: string, value: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      setStorageError(null);
    } catch {
      setStorageError('手機儲存空間不足，資料沒有存進去。請立刻做加密備份。');
    }
  };

  const setMeta = useCallback((patch: Partial<Meta>) => {
    const next = { ...metaRef.current, ...patch };
    metaRef.current = next;
    setMetaState(next);
    save(META_KEY, next);
  }, []);

  const commit = useCallback((next: Ledger) => {
    setLedger(next);
    save(LEDGER_KEY, next);
    setMeta({ dirty: metaRef.current.dirty + 1 });
  }, [setMeta]);

  const replaceLedger = useCallback((next: Ledger, dirty = 0) => {
    setLedger(next);
    save(LEDGER_KEY, next);
    setMeta({ dirty });
  }, [setMeta]);

  const wipeAll = useCallback(() => {
    localStorage.removeItem(LEDGER_KEY);
    localStorage.removeItem(META_KEY);
    const fresh: Meta = { fails: 0, lockUntil: 0, dirty: 0 };
    metaRef.current = fresh;
    setMetaState(fresh);
    setLedger(emptyLedger(defaultSettings()));
  }, []);

  const value = useMemo(
    () => ({ ledger, meta, today, commit, replaceLedger, setMeta, wipeAll, storageError }),
    [ledger, meta, today, commit, replaceLedger, setMeta, wipeAll, storageError]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
};
