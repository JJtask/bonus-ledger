import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/* ---------- 圖示（同一套線條風格） ---------- */
const P: Record<string, ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M9.5 20v-6h5v6" /></>,
  chart: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.8c2 .6 3.2 2.4 3.5 5.2" /></>,
  file: <><path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z" /><path d="M14 3v5h5" /><path d="M8.5 13h7" /><path d="M8.5 17h5" /></>,
  shield: <><path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  back: <path d="m15 5-7 7 7 7" />,
  close: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  chev: <path d="m9 5 7 7-7 7" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  alert: <><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.5" /><path d="M12 17.3v.2" /></>,
  copy: <><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" /><path d="M15.5 8.5V5.5A1.5 1.5 0 0 0 14 4H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5h3" /></>,
  share: <><path d="M12 15V3.5" /><path d="m7.5 8 4.5-4.5L16.5 8" /><path d="M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5" /></>,
  upload: <><path d="M12 4v11" /><path d="m7.5 8.5 4.5-4.5 4.5 4.5" /><path d="M4.5 19.5h15" /></>,
  swap: <><path d="M4 8h13l-3.5-3.5" /><path d="M20 16H7l3.5 3.5" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  list: <><path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" /><path d="M4.5 6h.01" /><path d="M4.5 12h.01" /><path d="M4.5 18h.01" /></>,
  backspace: <><path d="M21 5H8.5L3 12l5.5 7H21z" /><path d="m12 9 6 6" /><path d="m18 9-6 6" /></>,
  trash: <><path d="M4 7h16" /><path d="M9.5 7V4.5h5V7" /><path d="M6.5 7l1 13h9l1-13" /></>
};

export const Icon = ({ n, size = 22, sw = 1.8, className }: { n: keyof typeof P | string; size?: number; sw?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
    {P[n]}
  </svg>
);

/* ---------- 提示訊息 ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => undefined);
export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [msg, setMsg] = useState<{ text: string; k: number } | null>(null);
  const timer = useRef<number>();
  const show = useCallback((text: string) => {
    window.clearTimeout(timer.current);
    setMsg({ text, k: Date.now() });
    timer.current = window.setTimeout(() => setMsg(null), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status" key={msg.k}>
          <Icon n="check" size={18} sw={2.4} />
          {msg.text}
        </div>
      )}
    </ToastCtx.Provider>
  );
};
export const useToast = () => useContext(ToastCtx);

/* ---------- 底部面板 ---------- */
export const Sheet = ({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="關閉">
            <Icon n="close" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>
  );
};

/* ---------- 頁首 ---------- */
export const Header = ({
  title, onBack, right, children
}: { title: string; onBack?: () => void; right?: ReactNode; children?: ReactNode }) => (
  <header className="hdr">
    <div className="hdr-bar">
      {onBack && (
        <button type="button" className="icon-btn plain" onClick={onBack} aria-label="返回" style={{ marginLeft: -10 }}>
          <Icon n="back" size={24} sw={2} />
        </button>
      )}
      <h1 className="hdr-title">{title}</h1>
      {right}
    </div>
    {children}
  </header>
);

/* ---------- 分段切換 ---------- */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; t: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>
          {o.t}
        </button>
      ))}
    </div>
  );
}

/* ---------- 金額輸入 ---------- */
export const MoneyInput = ({ id, value, onChange, big, placeholder, invalid }: { id: string; value: number | null; onChange: (n: number | null) => void; big?: boolean; placeholder?: string; invalid?: boolean }) => (
  <input
    id={id}
    className={`fld${big ? ' big' : ''}`}
    inputMode="numeric"
    autoComplete="off"
    placeholder={placeholder}
    aria-invalid={invalid || undefined}
    value={value == null ? '' : value.toLocaleString('en-US')}
    onChange={(e) => {
      const digits = e.target.value.replace(/[^0-9]/g, '');
      onChange(digits ? Math.min(Number(digits), 99999999999) : null);
    }}
  />
);

export const NumInput = ({ id, value, onChange, step, width }: { id: string; value: number; onChange: (n: number) => void; step?: string; width?: number }) => {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      id={id}
      className="fld"
      inputMode="decimal"
      value={text}
      step={step}
      style={{ width: width ?? 76, textAlign: 'right', fontWeight: 600, padding: '0 10px' }}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.]/g, '');
        setText(t);
        const n = parseFloat(t);
        if (!isNaN(n)) onChange(n);
      }}
    />
  );
};

/* ---------- 原地確認（不用系統對話框） ---------- */
export const ConfirmInline = ({ label, confirmLabel, onConfirm, danger, children, block }: { label: string; confirmLabel: string; onConfirm: () => void; danger?: boolean; children?: ReactNode; block?: boolean }) => {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className={`btn ${danger ? 'btn-danger-out' : 'btn-out'}${block ? ' btn-block' : ''}`} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  return (
    <div className={`${danger ? 'inset-danger' : 'inset'} reveal stack-12`}>
      {children}
      <div className="grid-2">
        <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>取消</button>
        <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-pri'}`} onClick={() => { setOpen(false); onConfirm(); }}>{confirmLabel}</button>
      </div>
    </div>
  );
};

export const Seal = ({ date, fresh }: { date: string; fresh?: boolean }) => (
  <div className={`seal${fresh ? ' fresh' : ''}`} aria-label={`已核銷 ${date}`}>
    <span className="t">已核銷</span>
    <span className="d">{date}</span>
  </div>
);
