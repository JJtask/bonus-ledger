import { encryptBackup } from './crypto';
import type { Ledger } from '../engine/types';

const stamp = (d = new Date()) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;

export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

export const makeBackupFile = async (ledger: Ledger, password: string) => {
  const text = await encryptBackup({ app: 'bonus-ledger', ledger }, password);
  // 用 .txt / text/plain：Android 與 iPhone 的分享選單都接受，可直接存到 Google 雲端硬碟
  return new File([text], `分紅帳本備份-${stamp()}.txt`, { type: 'text/plain' });
};

export const shareOrDownload = async (file: File): Promise<ShareResult> => {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: '分紅帳本加密備份' });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
};

export const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
};
