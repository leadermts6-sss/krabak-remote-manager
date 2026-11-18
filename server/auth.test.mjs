import test from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword,parseCookies} from './auth.mjs';
test('scrypt password hashes verify and reject bad password',()=>{
 const v=hashPassword('very-long-password-123');assert.ok(verifyPassword('very-long-password-123',v));assert.equal(verifyPassword('wrong-password',v),false);
});
test('cookie parser',()=>{assert.deepEqual(parseCookies('a=b; krabak_session=xyz'),{a:'b',krabak_session:'xyz'})});
