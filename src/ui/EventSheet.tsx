import { useState } from 'react';
import { pay, renewalEffDate, setIntent, unpay } from '../engine/actions';
import { evLabel, fmtDate, money, payable, dueText } from '../engine/engine';
import type { Ev } from '../engine/types';
import { useStore } from '../lib/store';
import { ConfirmInline, MoneyInput, Sheet, useToast } from './kit';
import { useNav } from './nav';

/** 點一筆款項後的面板：核銷／確認續存意願／查看與撤銷核銷 */
export const EventSheet = ({ ev, onClose, onPaid }: { ev: Ev; onClose: () => void; onPaid?: (id: string) => void }) => {
  const { ledger, today, commit } = useStore();
  const toast = useToast();
  const nav = useNav();
  const c = ledger.contracts.find((x) => x.id === ev.contractId)!;
  const paid = ledger.payments[ev.id];
  const sales = ledger.sales.find((s) => s.id === (paid?.salesId ?? ev.salesId));
  const [paidOn, setPaidOn] = useState(today);
  const [tail5, setTail5] = useState('');
  const [renewP, setRenewP] = useState<number | null>(c.principal);
  const isRenewFinal = ev.kind === 'div' && ev.final && c.intent === 'renew' && !c.renewedTo;
  const canPay = payable(ev, ledger, today);

  const head = (
    <div className="stack-8" style={{ marginBottom: 14 }}>
      <div className="row-flex">
        <div className="grow">
          <div className="item-title">
            <button type="button" className="btn btn-link" style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', padding: 0 }} onClick={() => { onClose(); nav.push({ name: 'contract', id: c.id }); }}>
              {c.client}
            </button>
            <span className="code">{c.code}</span>
          </div>
          <div className="item-sub">
            {evLabel(ev, c)}・{dueText(ev)}{ev.week ? ' 首週' : ''}・{c.terms.projectName}{ev.track === 'bonus' ? `・業務 ${sales?.name ?? ''}` : ''}
          </div>
        </div>
        <div className="item-amt" style={{ fontSize: 22 }}>{money(ev.amount)}</div>
      </div>
    </div>
  );

  if (paid) {
    return (
      <Sheet title="核銷紀錄" onClose={onClose}>
        {head}
        <div className="inset stack-8 small">
          <div className="row-flex"><span className="grow muted">核銷日</span><b>{fmtDate(paid.paidOn)}</b></div>
          <div className="row-flex"><span className="grow muted">轉帳後五碼</span><b>{paid.tail5 || '未填'}</b></div>
          {paid.salesId && <div className="row-flex"><span className="grow muted">發放對象</span><b>{sales?.name}</b></div>}
        </div>
        <div style={{ marginTop: 16 }}>
          {c.renewedTo && ev.final && ev.kind === 'div' ? (
            <p className="small muted">這一期已觸發續約、建立新約，不能撤銷。</p>
          ) : (
            <ConfirmInline
              block
              danger
              label="撤銷這筆核銷"
              confirmLabel="確定撤銷"
              onConfirm={() => {
                commit(unpay(ledger, ev.id));
                toast('已撤銷，稽核紀錄已留存');
                onClose();
              }}
            >
              <p className="small">撤銷後這筆款項會回到待發狀態。撤銷動作會寫進稽核紀錄。</p>
            </ConfirmInline>
          )}
        </div>
      </Sheet>
    );
  }

  if (ev.blocked) {
    return (
      <Sheet title="確認續存意願" onClose={onClose}>
        {head}
        <div className="inset-warn small" style={{ marginBottom: 14 }}>
          本約已到期，客戶還沒確認是否續存。確認後才能核銷第 {ev.periods ?? ''} 期紅利；在這之前，本金 {money(c.principal)} 會先算進應備金額。
        </div>
        <div className="grid-2">
          <button type="button" className="btn btn-out" onClick={() => { commit(setIntent(ledger, c.id, 'renew')); toast('已設為確認續存'); onClose(); }}>確認續存</button>
          <button type="button" className="btn btn-out" onClick={() => { commit(setIntent(ledger, c.id, 'close')); toast('已設為不續存，本金將退還'); onClose(); }}>不續存・退本</button>
        </div>
      </Sheet>
    );
  }

  if (ev.projected) {
    return (
      <Sheet title="預估款項" onClose={onClose}>
        {head}
        <p className="small muted">客戶已確認續存。核銷舊約最後一期紅利時，系統會自動建立新約，這筆新約頭款就會變成正式款項。</p>
      </Sheet>
    );
  }

  return (
    <Sheet title={isRenewFinal ? '核銷並建立續約新約' : '核銷'} onClose={onClose}>
      {head}
      {!canPay ? (
        <p className="small muted">這筆款項排在 {dueText(ev)}{ev.week ? ' 首週' : ''}發放，前 7 天起才能核銷。</p>
      ) : (
        <div className="stack-14">
          <div className="grid-2">
            <div>
              <label className="label" htmlFor="paid-on">發放日</label>
              <input id="paid-on" className="fld" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value || today)} />
            </div>
            <div>
              <label className="label" htmlFor="tail5">轉帳後五碼（選填）</label>
              <input id="tail5" className="fld" inputMode="numeric" maxLength={5} placeholder="例：08123" value={tail5} onChange={(e) => setTail5(e.target.value.replace(/\D/g, '').slice(0, 5))} />
            </div>
          </div>
          {isRenewFinal && (
            <div className="inset stack-12">
              <p className="small">客戶已確認續存。核銷後會自動建立 <b>{fmtDate(renewalEffDate(c))}</b> 生效的新約，條件照「{c.terms.projectName}」專案目前的設定，本金鎖定後不能改。</p>
              <div>
                <label className="label" htmlFor="renew-p">新約本金</label>
                <MoneyInput id="renew-p" value={renewP} onChange={setRenewP} />
              </div>
            </div>
          )}
          <button
            type="button"
            className="btn btn-pri btn-block"
            disabled={isRenewFinal && !renewP}
            onClick={() => {
              const r = pay(ledger, today, { eventId: ev.id, paidOn, tail5, renewPrincipal: renewP ?? undefined });
              commit(r.ledger);
              onPaid?.(ev.id);
              toast(r.renewed ? `已核銷，並建立新約 ${r.renewed.code}` : `已核銷 ${money(ev.amount)}`);
              onClose();
            }}
          >
            確認核銷 {money(ev.amount)}
          </button>
          <p className="xs muted">核銷後會寫進稽核紀錄。記錯了可以在這筆款項裡撤銷。</p>
        </div>
      )}
    </Sheet>
  );
};
