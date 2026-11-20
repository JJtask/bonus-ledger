import { evLabel, fmtDate, money, payable, ymLabel } from '../engine/engine';
import type { Ev, Ledger } from '../engine/types';
import { Seal } from './kit';

export const EventRow = ({
  ev, ledger, today, onOpen, fresh, showMonth, overdue, salesName
}: { ev: Ev; ledger: Ledger; today: string; onOpen: (e: Ev) => void; fresh?: boolean; showMonth?: boolean; overdue?: boolean; salesName?: string }) => {
  const c = ledger.contracts.find((x) => x.id === ev.contractId)!;
  const paid = ledger.payments[ev.id];
  const can = payable(ev, ledger, today);
  let tag: { t: string; cls: string } | null = null;
  if (ev.kind === 'ret_unk') tag = { t: '未確認續存・先列入應備', cls: 'tag-orange' };
  else if (ev.blocked) tag = { t: '到期未確認續存', cls: 'tag-orange' };
  else if (ev.projected) tag = { t: '預估・核銷舊約後建立', cls: 'tag-blue' };
  else if (ev.kind === 'ret') tag = { t: '不續存・結案', cls: 'tag-gray' };
  else if (ev.kind === 'div' && ev.final && c.intent === 'renew') tag = { t: c.renewedTo ? '已續約' : '確認續存・核銷後建立新約', cls: 'tag-green' };
  else if (ev.kind === 'rret' || ev.kind === 'rdiv') tag = { t: '提前贖回', cls: 'tag-red' };
  if (overdue && !paid) tag = { t: `逾期・原訂 ${ymLabel(ev.ym)} 首週`, cls: 'tag-red' };

  const title = ev.track === 'bonus' ? salesName ?? '' : c.client;
  const sub = ev.track === 'bonus' ? `${evLabel(ev, c)}・客戶 ${c.client}` : evLabel(ev, c);
  const amtColor = ev.blocked || ev.kind === 'ret_unk' ? 'var(--warn)' : paid ? 'var(--ink-3)' : overdue ? 'var(--danger)' : 'var(--ink)';

  return (
    <li>
      <div className="item">
        <div className="grow">
          <div className="item-title">
            <span className="name">{title}</span>
            <span className="code">{c.code}</span>
            <span className="tag tag-proj">{c.terms.projectName}</span>
          </div>
          <div className="item-sub">{showMonth ? `${ymLabel(ev.ym)}・` : ''}{sub}</div>
          {tag && <span className={`tag ${tag.cls}`} style={{ marginTop: 6 }}>{tag.t}</span>}
        </div>
        <div style={{ textAlign: 'right', flex: 'none' }}>
          <div className="item-amt" style={{ color: amtColor }}>{money(ev.amount)}</div>
          {paid ? (
            <button type="button" onClick={() => onOpen(ev)} aria-label={`查看核銷紀錄 ${fmtDate(paid.paidOn)}`} style={{ border: 0, background: 'transparent', padding: 0, marginTop: 6, cursor: 'pointer', display: 'block', marginLeft: 'auto' }}>
              <Seal date={paid.paidOn.slice(5).replace('-', '/')} fresh={fresh} />
            </button>
          ) : ev.kind === 'ret_unk' ? null : ev.blocked ? (
            <button type="button" className="btn btn-sm btn-warn" style={{ marginTop: 8 }} onClick={() => onOpen(ev)}>確認意願</button>
          ) : ev.projected ? null : can ? (
            <button type="button" className="btn btn-sm btn-out" style={{ marginTop: 8 }} onClick={() => onOpen(ev)}>核銷</button>
          ) : (
            <span className="xs muted" style={{ display: 'block', marginTop: 8 }}>{ymLabel(ev.ym)} 首週</span>
          )}
        </div>
      </div>
    </li>
  );
};
