import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export function hashPassword(password) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
export function checkPassword(password, stored) { const [salt, hash] = stored.split(':'); const actual = scryptSync(password, salt, 64); const expected = Buffer.from(hash, 'hex'); return actual.length === expected.length && timingSafeEqual(actual, expected); }
export function cookieToken(header = '') { return header.split(';').map(v => v.trim()).find(v => v.startsWith('session='))?.slice(8); }
export function cleanMessage(value) { if (typeof value !== 'string' || !value.trim() || value.trim().length > 2000) throw new Error('Messages must contain 1–2000 characters.'); return value.trim(); }
