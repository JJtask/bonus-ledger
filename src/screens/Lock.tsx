import { useEffect, useState } from 'react';
import { cryptoReady, hashPin, verifyPin } from '../lib/crypto';
import { useStore } from '../lib/store';
import { Icon } from '../ui/kit';

const MAX_FAILS = 5;
const LOCK_MS = 30000;

/** PIN 碼鎖：首次設定（輸入兩次）或解鎖 */
export const Lock = ({ onUnlock }: { onUnlock: () => void }) => {
  const { meta, setMeta, wipeAll } = useStore();
  const setup = !meta.pin;
  const [pin, setPin] = useState('');
  const [first, setFirst] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [shake, setShake] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const locked = meta.lockUntil > now;

  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [locked]);

  useEffect(() => {
    if (pin.length !== 4 || busy) return;
    (async () => {
      setBusy(true);
      if (setup) {
        if (!first) {
          setFirst(pin);
          setPin('');
          setMsg('請再輸入一次確認');
        } else if (first === pin) {
          setMeta({ pin: await hashPin(pin), fails: 0, lockUntil: 0 });
          onUnlock();
        } else {
          setFirst(null);
          setPin('');
          setMsg('兩次不一樣，請重新設定');
          setShake((s) => s + 1);
        }
      } else if (await verifyPin(pin, meta.pin!)) {
        setMeta({ fails: 0, lockUntil: 0 });
        onUnlock();
      } else {
        const fails = meta.fails + 1;
        if (fails >= MAX_FAILS) {
          setMeta({ fails: 0, lockUntil: Date.now() + LOCK_MS });
          setNow(Date.now());
          setMsg('');
        } else {
          setMeta({ fails });
          setMsg(`PIN 碼錯誤，還可以再試 ${MAX_FAILS - fails} 次`);
        }
        setPin('');
        setShake((s) => s + 1);
      }
      setBusy(false);
    })();
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (locked || busy) return;
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < 4 ? p + e.key : p));
      if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, busy]);

  const press = (d: string) => !locked && !busy && setPin((p) => (p.length < 4 ? p + d : p));
  const wait = Math.ceil((meta.lockUntil - now) / 1000);

  if (!cryptoReady()) {
    return (
      <div className="lock">
        <Icon n="alert" size={40} />
        <p className="lock-title">請用正式網址開啟</p>
        <p className="lock-sub" style={{ maxWidth: 300 }}>這個 App 必須透過 https 網址開啟，才能啟用加密功能。請不要直接開啟手機裡的檔案。</p>
      </div>
    );
  }

  if (forgot) {
    return (
      <div className="lock">
        <Icon n="alert" size={40} />
        <p className="lock-title">忘記 PIN 碼</p>
        <p className="lock-sub" style={{ maxWidth: 320, lineHeight: 1.6 }}>
          PIN 碼無法查詢。要重設，必須先清除這支手機上的帳本，再用雲端硬碟裡的備份檔和備份密碼還原。沒有備份的異動會遺失。
        </p>
        <div style={{ display: 'grid', gap: 12, width: '100%', maxWidth: 320, marginTop: 28 }}>
          <button type="button" className="btn btn-block" style={{ background: '#fff', color: 'var(--danger)' }} onClick={() => { wipeAll(); setForgot(false); setPin(''); setFirst(null); setMsg('請設定新的 PIN 碼，之後到「資安備份」還原'); }}>
            清除資料並重設 PIN 碼
          </button>
          <button type="button" className="btn btn-block" style={{ background: 'rgba(255,255,255,.5)', color: 'var(--on-field)' }} onClick={() => setForgot(false)}>我想起來了，返回</button>
        </div>
      </div>
    );
  }

  return (
    <div className="lock" role="dialog" aria-modal="true" aria-label={setup ? '設定 PIN 碼' : '輸入 PIN 碼解鎖'}>
      <img src="./icon-192.png" alt="" width={64} height={64} style={{ borderRadius: 16, boxShadow: '0 6px 20px rgba(0,0,0,.18)' }} />
      <p className="lock-title">{setup ? (first ? '確認 PIN 碼' : '設定 4 位數 PIN 碼') : '輸入 PIN 碼'}</p>
      <p className="lock-sub" aria-live="polite">
        {locked ? `錯誤太多次，請等 ${wait} 秒` : msg || (setup ? '每次打開 App 都要輸入，保護帳本資料' : '分紅獎金帳本')}
      </p>
      <div className={`pin-dots${shake ? ' shake' : ''}`} key={shake} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => <span key={i} className={pin.length > i ? 'on' : ''} />)}
      </div>
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className="key" onClick={() => press(d)} disabled={locked}>{d}</button>
        ))}
        <span />
        <button type="button" className="key" onClick={() => press('0')} disabled={locked}>0</button>
        <button type="button" className="key ghost" aria-label="刪除" onClick={() => setPin((p) => p.slice(0, -1))} disabled={locked}><Icon n="backspace" size={26} /></button>
      </div>
      {!setup && <button type="button" className="lock-link" onClick={() => setForgot(true)}>忘記 PIN 碼？</button>}
    </div>
  );
};
