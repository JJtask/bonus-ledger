import { useCallback, useEffect, useRef, useState } from 'react';
import { board } from './engine/engine';
import { useStore } from './lib/store';
import { Backup, AuditPage, SettingsPage } from './screens/Backup';
import { Board } from './screens/Board';
import { ClientPage, ContractDetail, ContractList, NewContract } from './screens/Contracts';
import { Forecast } from './screens/Forecast';
import { Lock } from './screens/Lock';
import { Sales } from './screens/Sales';
import { Icon } from './ui/kit';
import { useNav, type Tab } from './ui/nav';
import { LockCtx } from './ui/TopActions';

const AUTO_LOCK_MS = 30000;

const TABS: { id: Tab; t: string; icon: string }[] = [
  { id: 'board', t: '首週看板', icon: 'home' },
  { id: 'forecast', t: '12月水位', icon: 'chart' },
  { id: 'sales', t: '業務對帳', icon: 'users' },
  { id: 'contracts', t: '合約管理', icon: 'file' },
  { id: 'backup', t: '資安備份', icon: 'shield' }
];

export const App = () => {
  const { ledger, today, meta, storageError } = useStore();
  const nav = useNav();
  const [unlocked, setUnlocked] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  const lock = useCallback(() => setUnlocked(false), []);

  useEffect(() => {
    // 退到背景超過 30 秒自動上鎖
    const onVis = () => {
      if (document.hidden) hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current >= AUTO_LOCK_MS) setUnlocked(false);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  if (!unlocked || !meta.pin) return <Lock onUnlock={() => setUnlocked(true)} />;

  const top = nav.stack[nav.stack.length - 1];
  let body;
  if (top?.name === 'contract') body = <ContractDetail id={top.id} />;
  else if (top?.name === 'new') body = <NewContract presetClient={top.client} />;
  else if (top?.name === 'client') body = <ClientPage client={top.client} />;
  else if (top?.name === 'settings') body = <SettingsPage />;
  else if (top?.name === 'audit') body = <AuditPage />;
  else if (nav.tab === 'board') body = <Board />;
  else if (nav.tab === 'forecast') body = <Forecast />;
  else if (nav.tab === 'sales') body = <Sales />;
  else if (nav.tab === 'contracts') body = <ContractList />;
  else body = <Backup />;

  const b = board(ledger, today);
  const boardBadge = b.overdue.length > 0 || b.items.some((e) => e.blocked);

  return (
    <LockCtx.Provider value={lock}>
      <div className="shell">
        {storageError && <div className="banner banner-danger" role="alert"><Icon n="alert" size={18} />{storageError}</div>}
        <div key={top ? JSON.stringify(top) : nav.tab} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{body}</div>
        <nav className="tabbar" aria-label="主選單">
          {TABS.map((t) => (
            <button key={t.id} type="button" className="tab" aria-current={nav.tab === t.id && !top ? 'page' : undefined} onClick={() => nav.go(t.id)}>
              <Icon n={t.icon} size={24} />
              {t.t}
              {t.id === 'board' && boardBadge && <span className="badge" aria-label="有待處理款項" />}
              {t.id === 'backup' && meta.dirty > 0 && <span className="badge" aria-label="有資料未備份" />}
            </button>
          ))}
        </nav>
      </div>
    </LockCtx.Provider>
  );
};
