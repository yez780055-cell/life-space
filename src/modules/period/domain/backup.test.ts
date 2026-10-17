import { describe, expect, it } from 'vitest';
import type { AppData, PeriodRecord } from '../types';
import { defaultSettings } from './storage';
import { prepareRestoredData } from './backup';
import { decryptBackup, encryptBackup } from './security';

const passphrase = 'synthetic-test-passphrase';
const timestamp = '2026-01-01T00:00:00.000Z';
function period(id: string, startDate: string, endDate: string | null): PeriodRecord {
  return { id, startDate, endDate, createdAt: timestamp, updatedAt: timestamp };
}
function data(periods: PeriodRecord[] = []): AppData {
  return { periods, settings: { ...defaultSettings(), careMemo: 'synthetic fixture' } };
}
async function encrypted(periods: PeriodRecord[] = []): Promise<string> {
  return encryptBackup(data(periods), passphrase);
}

describe('legacy .xyl backup compatibility', () => {
  it('round-trips the original version 1 PBKDF2 and AES-GCM envelope', async () => {
    const text = await encrypted([period('synthetic-1', '2026-01-02', '2026-01-06')]);
    const envelope = JSON.parse(text) as Record<string, unknown>;
    expect(envelope).toMatchObject({
      format: 'xiaoyueli-encrypted-backup',
      version: 1,
      cipher: 'AES-GCM-256',
      kdf: 'PBKDF2-SHA-256',
      iterations: 250_000
    });
    expect(Object.keys(envelope).sort()).toEqual(['cipher', 'ciphertext', 'format', 'iterations', 'iv', 'kdf', 'salt', 'version']);
    const restored = prepareRestoredData(await decryptBackup(text, passphrase), '2026-10-16');
    expect(restored.periods).toEqual([period('synthetic-1', '2026-01-02', '2026-01-06')]);
    expect(restored.settings.appLock).toEqual({ enabled: false, salt: null, hash: null });
    expect(restored.settings.careMemo).toBe('synthetic fixture');
  });

  it('rejects an incorrect password, damaged ciphertext, and truncated JSON', async () => {
    const text = await encrypted([period('synthetic-1', '2026-01-02', '2026-01-06')]);
    await expect(decryptBackup(text, 'wrong-password')).rejects.toThrow('密码不正确');
    const envelope = JSON.parse(text) as { ciphertext: string };
    const corrupted = JSON.parse(text) as Record<string, unknown>;
    corrupted.ciphertext = envelope.ciphertext.slice(0, -4) + 'AAAA';
    await expect(decryptBackup(JSON.stringify(corrupted), passphrase)).rejects.toThrow();
    await expect(decryptBackup(text.slice(0, -10), passphrase)).rejects.toThrow('JSON');
  });

  it('rejects repeated ids, overlapping intervals, future dates, and unknown fields', async () => {
    const repeated = [period('same-id', '2026-01-01', '2026-01-03'), period('same-id', '2026-02-01', '2026-02-03')];
    const duplicateFile = await encrypted(repeated);
    await expect(decryptBackup(duplicateFile, passphrase).then((value) => prepareRestoredData(value, '2026-10-16'))).rejects.toThrow('重复记录编号');

    const overlapFile = await encrypted([period('first', '2026-01-01', '2026-01-04'), period('second', '2026-01-04', '2026-01-07')]);
    await expect(decryptBackup(overlapFile, passphrase).then((value) => prepareRestoredData(value, '2026-10-16'))).rejects.toThrow('重叠');

    const futureFile = await encrypted([period('future', '2026-10-17', null)]);
    await expect(decryptBackup(futureFile, passphrase).then((value) => prepareRestoredData(value, '2026-10-16'))).rejects.toThrow('晚于今天');

    const invalid = data();
    (invalid.settings as AppData['settings'] & { unexpected: string }).unexpected = 'synthetic';
    const invalidFile = await encryptBackup(invalid, passphrase);
    await expect(decryptBackup(invalidFile, passphrase).then((value) => prepareRestoredData(value, '2026-10-16'))).rejects.toThrow('字段');
  });
});
