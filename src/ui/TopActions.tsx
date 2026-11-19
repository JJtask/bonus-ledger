import { createContext, useContext } from 'react';
import { useStore } from '../lib/store';
import { Icon } from './kit';
import { useNav } from './nav';

export const LockCtx = createContext<() => void>(() => undefined);

/** 頁首右側：未備份紅點＋立即鎖定 */
export const TopActions = () => {
  const { meta } = useStore();
  const lock = useContext(LockCtx);
  const nav = useNav();
  return (
    <>
      {meta.dirty > 0 && (
        <button type="button" className="pill-unsaved" onClick={() => nav.go('backup')} aria-label={`有 ${meta.dirty} 筆異動尚未備份，前往備份`}>
          <span className="dot" aria-hidden="true" />未備份 {meta.dirty}
        </button>
      )}
      <button type="button" className="icon-btn" onClick={lock} aria-label="立即鎖定">
        <Icon n="lock" />
      </button>
    </>
  );
};
