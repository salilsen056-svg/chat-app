import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, checkPassword, cookieToken, cleanMessage } from '../lib/security.mjs';
test('password hashes are salted and reject wrong passwords', () => { const hash = hashPassword('sample-password'); assert.notEqual(hash, hashPassword('sample-password')); assert.equal(checkPassword('sample-password', hash), true); assert.equal(checkPassword('incorrect-password', hash), false); });
test('session parsing requires the exact cookie name', () => { assert.equal(cookieToken('other=one; session=abc; theme=light'), 'abc'); assert.equal(cookieToken('fake_session=abc'), undefined); });
test('messages reject empty, oversized and non-string values', () => { assert.equal(cleanMessage(' hello '), 'hello'); for (const input of ['', '  ', null, {}, 'x'.repeat(2001)]) assert.throws(() => cleanMessage(input)); });
