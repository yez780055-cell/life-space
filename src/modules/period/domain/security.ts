import type { AppData, AppSettings } from '../types'

const ITERATIONS = 250_000
const encoder = new TextEncoder()

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('备份文件编码无效。')
  }
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function deriveKey(password: string, salt: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  )
}

async function derivePinHash(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    256
  )
  return new Uint8Array(bits)
}

export async function createPinHash(pin: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16)
  const hash = await derivePinHash(pin, salt)
  return { salt: toBase64(salt), hash: toBase64(hash) }
}

export async function verifyPin(pin: string, saltText: string, hashText: string): Promise<boolean> {
  const salt = fromBase64(saltText)
  const hash = await derivePinHash(pin, salt)
  const expected = fromBase64(hashText)
  if (hash.length !== expected.length) return false
  return hash.reduce((difference, byte, index) => difference | (byte ^ expected[index]), 0) === 0
}

export interface EncryptedBackup {
  format: 'xiaoyueli-encrypted-backup'
  version: 1
  cipher: 'AES-GCM-256'
  kdf: 'PBKDF2-SHA-256'
  iterations: number
  salt: string
  iv: string
  ciphertext: string
}

export async function encryptBackup(data: AppData, password: string): Promise<string> {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = await deriveKey(password, salt, ['encrypt'])
  const safeData: AppData = {
    periods: data.periods,
    settings: {
      ...data.settings,
      appLock: { enabled: false, salt: null, hash: null }
    }
  }
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, encoder.encode(JSON.stringify(safeData)))
  const backup: EncryptedBackup = {
    format: 'xiaoyueli-encrypted-backup', version: 1, cipher: 'AES-GCM-256',
    kdf: 'PBKDF2-SHA-256', iterations: ITERATIONS, salt: toBase64(salt),
    iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext))
  }
  return JSON.stringify(backup, null, 2)
}

export async function decryptBackup(text: string, password: string): Promise<unknown> {
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    throw new Error('备份文件不是有效的 JSON，未更改本机数据。')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('备份文件内容无效，未更改本机数据。')
  const backup = value as Partial<EncryptedBackup>
  const fields = ['format', 'version', 'cipher', 'kdf', 'iterations', 'salt', 'iv', 'ciphertext']
  if (Object.keys(backup).some((field) => !fields.includes(field)) ||
      backup.format !== 'xiaoyueli-encrypted-backup' || backup.version !== 1 ||
      backup.cipher !== 'AES-GCM-256' || backup.kdf !== 'PBKDF2-SHA-256' || backup.iterations !== ITERATIONS) {
    throw new Error('这不是受支持的小月历加密备份文件。')
  }
  if (typeof backup.salt !== 'string' || typeof backup.iv !== 'string' || typeof backup.ciphertext !== 'string') {
    throw new Error('备份文件内容不完整，未更改本机数据。')
  }
  try {
    const salt = fromBase64(backup.salt)
    const iv = fromBase64(backup.iv)
    const ciphertext = fromBase64(backup.ciphertext)
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) throw new Error('invalid envelope')
    const key = await deriveKey(password, salt, ['decrypt'])
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource }, key, ciphertext as BufferSource
    )
    return JSON.parse(new TextDecoder().decode(plaintext)) as unknown
  } catch {
    throw new Error('密码不正确，或备份文件已损坏。未更改本机数据。')
  }
}
export function validateBackupData(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<AppData>
  if (!Array.isArray(data.periods) || !data.settings || typeof data.settings !== 'object') return false
  const settings = data.settings as Partial<AppSettings>
  const validCycle = settings.referenceCycleLength === null || (Number.isInteger(settings.referenceCycleLength) && (settings.referenceCycleLength ?? 0) >= 15 && (settings.referenceCycleLength ?? 0) <= 90)
  const validLength = settings.referencePeriodLength === null || (Number.isInteger(settings.referencePeriodLength) && (settings.referencePeriodLength ?? 0) >= 1 && (settings.referencePeriodLength ?? 0) <= 15)
  const reminders = settings.reminders
  const validReminders = !!reminders && typeof reminders.forecastEnabled === 'boolean' &&
    Number.isInteger(reminders.forecastDaysBefore) && reminders.forecastDaysBefore >= 1 && reminders.forecastDaysBefore <= 7 &&
    typeof reminders.forecastTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(reminders.forecastTime) &&
    typeof reminders.checkEnabled === 'boolean' && Number.isInteger(reminders.checkAfterDays) && reminders.checkAfterDays >= 1 && reminders.checkAfterDays <= 20 &&
    typeof reminders.checkTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(reminders.checkTime)
  if (typeof settings.onboardingComplete !== 'boolean' || !validCycle || !validLength || typeof settings.careMemo !== 'string' || !validReminders) return false
  return data.periods.every((period) =>
    !!period && typeof period.id === 'string' && typeof period.startDate === 'string' &&
    (typeof period.endDate === 'string' || period.endDate === null) &&
    typeof period.createdAt === 'string' && typeof period.updatedAt === 'string'
  )
}
