import { useMemo, useState } from 'react';
import { addSales, renameSales, transferSales } from '../engine/actions';
import { boardYM, fmtDate, money, salesStatement, statusOf, ymMonth } from '../engine/engine';
import type { SalesPerson } from '../engine/types';
import { copyText } from '../lib/backup';
import { useStore } from '../lib/store';
import { Icon, Sheet, useToast } from '../ui/kit';
import { TopActions } from '../ui/TopActions';

export const Sales = () => {
  const { ledger, today, commit } = useStore();
  const toast = useToast();
  const ym = boardYM(today);
  const [stmt, setStmt] = useState<SalesPerson | null>(null);
  const [move, setMove] = useState<SalesPerson | null>(null);
  const [edit, setEdit] = useState<SalesPerson | null>(null);
  const [newName, setNewName] = useState('');
  const active = ledger.sales.filter((s) => s.active);
  const left = ledger.sales.filter((s) => !s.active);

  const stats = useMemo(() => {
    const m: Record<string, { n: number; principal: number; bonus: number; client: number }> = {};
    for (const s of ledger.sales) {
      const st = salesStatement(ledger, today, s.id);
      const mine = ledger.contracts.filter((c) => c.salesId === s.id && ['active', 'pending', 'maturing', 'redeeming'].includes(statusOf(c, ledger, today)));
      m[s.id] = { n: mine.length, principal: mine.reduce((t, c) => t + c.principal, 0), bonus: st.bonusTotal, client: st.clientTotal };
    }
    return m;
  }, [ledger, today]);

  const name = (id?: string) => ledger.sales.find((s) => s.id === id)?.name ?? '';

  return (
    <>
      <div className="hdr"><div className="hdr-bar"><h1 className="hdr-title">業務對帳</h1><TopActions /></div></div>
      <div className="page">
        <p className="foot-note" style={{ marginTop: 14, textAlign: 'left' }}>
          {ymMonth(ym)} 月首週發放前，按「對帳單」複製文字貼到業務的 LINE 核對。
        </p>
        <ul className="list" style={{ margin: '12px 16px 0' }}>
          {active.map((s) => (
            <li key={s.id} style={{ padding: '14px 16px' }}>
              <div className="row-flex" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <button type="button" className="btn btn-link" style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', padding: 0 }} onClick={() => setEdit(s)} aria-label={`修改 ${s.name} 的姓名`}>
                    {s.name}
                  </button>
                  <div className="item-sub">經手中 {stats[s.id]?.n ?? 0} 張・本金 {money(stats[s.id]?.principal ?? 0)}</div>
                </div>
                <div className="right">
                  <div className="xs muted">{ymMonth(ym)} 月首週應領</div>
                  <div className="item-amt">{money(stats[s.id]?.bonus ?? 0)}</div>
                </div>
              </div>
              <div className="grid-2" style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-out" onClick={() => setStmt(s)}><Icon n="copy" size={18} />對帳單</button>
                <button type="button" className="btn btn-quiet" onClick={() => setMove(s)} disabled={active.length < 2}><Icon n="swap" size={18} />離職移轉</button>
              </div>
            </li>
          ))}
          {active.length === 0 && <li className="empty"><p className="t">還沒有業務</p><p className="d">先在下面新增業務，登錄合約時才能選擇。</p></li>}
        </ul>

        <section className="section card pad">
          <label className="label" htmlFor="new-sales">新增業務</label>
          <div className="row-flex">
            <input id="new-sales" className="fld grow" placeholder="輸入姓名" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button
              type="button"
              className="btn btn-pri"
              disabled={!newName.trim() || ledger.sales.some((s) => s.name === newName.trim())}
              onClick={() => { commit(addSales(ledger, newName)); toast(`已新增 ${newName.trim()}`); setNewName(''); }}
            >
              新增
            </button>
          </div>
          {newName.trim() && ledger.sales.some((s) => s.name === newName.trim()) && <p className="err">已經有這位業務了。</p>}
        </section>

        {left.length > 0 && (
          <section className="section">
            <h2 className="section-title" style={{ marginBottom: 10 }}>已離職</h2>
            <ul className="list">
              {left.map((s) => (
                <li key={s.id} className="item" style={{ alignItems: 'center' }}>
                  <div className="grow">
                    <div className="strong">{s.name}</div>
                    <div className="item-sub">{s.leftAt ? fmtDate(s.leftAt) : ''} 離職・客戶由 {name(s.successorId)} 接手</div>
                  </div>
                  <span className="tag tag-gray">歷史獎金已鎖定</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {stmt && <StatementSheet sp={stmt} onClose={() => setStmt(null)} />}
      {move && <TransferSheet sp={move} onClose={() => setMove(null)} />}
      {edit && (
        <RenameSheet sp={edit} onClose={() => setEdit(null)} onSave={(n) => { commit(renameSales(ledger, edit.id, n)); toast('已修改姓名'); setEdit(null); }} />
      )}
    </>
  );
};

const StatementSheet = ({ sp, onClose }: { sp: SalesPerson; onClose: () => void }) => {
  const { ledger, today } = useStore();
  const toast = useToast();
  const st = salesStatement(ledger, today, sp.id);
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ text: st.text }); return; } catch { /* 取消就改用複製 */ }
    }
    toast((await copyText(st.text)) ? '已複製' : '複製失敗，請長按文字自行複製');
  };
  return (
    <Sheet title={`${sp.name} 的對帳單`} onClose={onClose}>
      <div className="pre">{st.text}</div>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <button type="button" className="btn btn-out" onClick={share}><Icon n="share" size={18} />分享</button>
        <button type="button" className="btn btn-pri" onClick={async () => toast((await copyText(st.text)) ? '已複製，可以貼到 LINE' : '複製失敗，請長按文字自行複製')}><Icon n="copy" size={18} />複製文字</button>
      </div>
    </Sheet>
  );
};

const TransferSheet = ({ sp, onClose }: { sp: SalesPerson; onClose: () => void }) => {
  const { ledger, today, commit } = useStore();
  const toast = useToast();
  const others = ledger.sales.filter((s) => s.active && s.id !== sp.id);
  const [to, setTo] = useState<string | null>(null);
  const moving = ledger.contracts.filter((c) => c.salesId === sp.id && !['closed', 'renewed', 'redeemed'].includes(statusOf(c, ledger, today)));
  return (
    <Sheet title={`${sp.name} 離職移轉`} onClose={onClose}>
      <div className="stack-14">
        <p className="small">會把 {sp.name} 名下 <b>{moving.length} 張</b>未結案合約，一次移給接手的業務。之後的頭款、尾款都改發給接手的人；已經發過的獎金仍算 {sp.name} 的，不會改。</p>
        <div>
          <span className="label">接手業務</span>
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {others.map((s) => (
              <button key={s.id} type="button" className="chip" aria-pressed={to === s.id} onClick={() => setTo(s.id)}>{s.name}</button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-pri btn-block"
          disabled={!to}
          onClick={() => {
            const r = transferSales(ledger, sp.id, to!, today);
            commit(r.ledger);
            toast(`已移轉 ${r.moved} 張合約`);
            onClose();
          }}
        >
          確認離職並移轉
        </button>
        <p className="xs muted">移轉後 {sp.name} 會標記為已離職，這個動作會寫進稽核紀錄。</p>
      </div>
    </Sheet>
  );
};

const RenameSheet = ({ sp, onClose, onSave }: { sp: SalesPerson; onClose: () => void; onSave: (n: string) => void }) => {
  const [n, setN] = useState(sp.name);
  return (
    <Sheet title="修改業務姓名" onClose={onClose}>
      <div className="stack-14">
        <div><label className="label" htmlFor="rn">姓名</label><input id="rn" className="fld" value={n} onChange={(e) => setN(e.target.value)} /></div>
        <button type="button" className="btn btn-pri btn-block" disabled={!n.trim() || n.trim() === sp.name} onClick={() => onSave(n)}>儲存</button>
      </div>
    </Sheet>
  );
};
