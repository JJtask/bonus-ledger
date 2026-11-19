/* 瀏覽器原生加密：PIN 雜湊與 AES-256-GCM 備份 */

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string): BufferSource => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) as BufferSource;

export const ITERATIONS = 100000;

export const cryptoReady = () => typeof crypto !== 'undefined' && !!crypto.subtle;

const pbkdf2Bits = async (secret: string, salt: BufferSource, iterations = ITERATIONS) => {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
  return { key, bits: await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256) };
};

export interface PinRecord { salt: string; hash: string; iter: number }

export const hashPin = async (pin: string): Promise<PinRecord> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { bits } = await pbkdf2Bits(pin, salt);
  return { salt: b64(salt), hash: b64(bits), iter: ITERATIONS };
};

export const verifyPin = async (pin: string, rec: PinRecord) => {
  const { bits } = await pbkdf2Bits(pin, unb64(rec.salt), rec.iter);
  const a = new Uint8Array(bits);
  const b = new Uint8Array(unb64(rec.hash) as ArrayBuffer);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};

export const BACKUP_FORMAT = 'bonus-ledger-backup';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  v: 1;
  createdAt: string;
  kdf: 'PBKDF2-SHA256';
  iter: number;
  salt: string;
  iv: string;
  data: string;
}

const aesKey = async (password: string, salt: BufferSource, iter: number) => {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

export const encryptBackup = async (payload: unknown, password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey(password, salt, ITERATIONS);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(payload)));
  const file: BackupFile = {
    format: BACKUP_FORMAT, v: 1, createdAt: new Date().toISOString(),
    kdf: 'PBKDF2-SHA256', iter: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(ct)
  };
  return JSON.stringify(file);
};

export class BackupError extends Error {
  constructor(public reason: 'format' | 'password') { super(reason); }
}

/** 解密並驗證：GCM 驗證失敗代表密碼錯誤或檔案遭竄改 */
export const decryptBackup = async (text: string, password: string): Promise<unknown> => {
  let file: BackupFile;
  try {
    file = JSON.parse(text.trim());
  } catch {
    throw new BackupError('format');
  }
  if (!file || file.format !== BACKUP_FORMAT || !file.salt || !file.iv || !file.data) throw new BackupError('format');
  try {
    const key = await aesKey(password, unb64(file.salt), file.iter || ITERATIONS);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.iv) }, key, unb64(file.data));
    return JSON.parse(dec.decode(pt));
  } catch {
    throw new BackupError('password');
  }
};
