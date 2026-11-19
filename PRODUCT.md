# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static single-file HTML/CSS/JS app (per spec V4: 單檔應用程式), deployed to GitHub Pages like the user's earlier CRM project (github.com/chichien43). Installed to the phone home screen as a PWA. Data lives in the browser's local storage on the phone; no backend.

## Users

Primary: the fundraising team's owner (團隊負責人), maintaining the ledger alone on their own phone. Secondary: a finance person (財務人員) who reads the same numbers. Sales staff never use the app; they receive plain-text statements pasted into LINE.

The user describes themself as having very little computer knowledge. Everything must work by tapping; no typing commands, no setup steps.

## Product Purpose

A phone-first ledger and decision tool for a fundraising team: records each client's contract, schedules the client dividend track and the sales bonus track, tells the owner exactly how much cash to prepare for each month's first week (1st–7th), and records every payout as a write-off (核銷). Success: nothing is paid twice, nothing is missed, and the owner never gets surprised by a cash cliff.

## Positioning

Two decoupled tracks (client dividends vs. sales bonus 50/50 head/tail) projected onto one "first-week" cash calendar with a most-conservative total (unconfirmed renewals counted as principal due). Encrypted local ledger with no server.

## Operating Context

- Monthly rhythm: 1st–7th pay and write off; 10th review M+2 peaks and maturing contracts; 25th lock next month's renewal intentions.
- Contract rules (V4 spec, as amended in discussion 2026-11-19):
  - Funds received any day of month M → contract effective on the 1st of M+1, fixed 1-year term.
  - Dividend plans (紅利方案) defined in settings: months per period (1/2/3/4/6/12) and % per period. Each contract picks a plan. Payout in the first week of the month after each period ends.
  - Simple interest, principal locked; each deposit is its own contract code (e.g. C2602-01).
  - Renewal intention tri-state: 未確認 / 確認續存 / 不續存. Unconfirmed counts principal as due in forecasts. Final-period write-off blocked while unconfirmed.
  - Sales bonus % auto-filled from amount tiers in settings, editable per contract. 50% at effective first week, 50% at maturity first week.
  - Early redemption: refund = principal × fixed % (settings, editable per case); current period dividend paid pro rata for months held only; later periods not paid; unpaid tail bonus voided; paid head bonus recorded as clawback.
  - Extra dividend pool split by principal × effective months among contracts active at settlement.
  - Salesperson leaves → bulk transfer active contracts; historical paid bonuses stay with original.
- Amounts in NTD, rounded to whole dollars.
- Payouts not written off after the 7th show as overdue.
- Write-off may note last 5 digits of the transfer (optional).

## Capabilities and Constraints

- Five tabs max: 首週看板, 12 月水位, 業務對帳, 合約管理, 資安備份 (plus a client view reachable from names).
- 4-digit PIN lock (hashed; 5 failures → 30 s lockout; auto-lock after 30 s in background; manual lock button).
- Backup: PBKDF2 + AES-256-GCM encrypted file, shared via the phone's share sheet to Google Drive. Restore by picking the file and entering the password. Red "未備份" dot after any change until backed up.
- Read-only audit trail of every write.
- Single writer: one phone at a time.

## Brand Commitments

User request: a new visual system, "professional financial tool" style, modeled on the feel of a Taiwanese retail mobile-banking app (user named Cathay United Bank's app as the reference). Emulate the category craft (teal-green brand field, white cards, big tabular amounts, bottom tab bar); never use that bank's name, logo or marks. Traditional Chinese UI.

## Evidence on Hand

Spec PDF V4 (募資團隊分紅與獎金決策系統 需求與功能規格說明書). No real client data; all demo data is synthetic and must be labeled as sample.

## Product Principles

1. The cash number for the coming first week is always the first thing seen.
2. Conservative by default: unknowns count as money owed.
3. Every payout is a deliberate, recorded act; nothing pays itself.
4. Zero technical burden on the owner.
5. Money never leaves the phone unencrypted.

## Accessibility & Inclusion

Used on a phone, often one-handed, by a non-technical owner: large tap targets, legible numerals, no jargon in labels.
