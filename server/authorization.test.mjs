import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageUsers, visibleAudit, visibleHosts } from './authorization.mjs';

test('only the administrator can manage teacher accounts', () => {
  assert.equal(canManageUsers({ email: 'admin@example.edu', role: 'admin' }), true);
  assert.equal(canManageUsers({ email: 'teacher@example.edu', role: 'teacher' }), false);
  assert.equal(canManageUsers({ email: 'admin@example.edu' }), false);
  assert.equal(canManageUsers(null), false);
});

test('host lists contain only the signed-in teacher owner or every host for admin', () => {
  const hosts = [
    { name: 'A desktop', ownerEmail: 'a@example.edu' },
    { name: 'B desktop', ownerEmail: 'b@example.edu' },
  ];
  assert.deepEqual(visibleHosts(hosts, { email: 'a@example.edu', role: 'teacher' }), [hosts[0]]);
  assert.deepEqual(visibleHosts(hosts, { email: 'admin@example.edu', role: 'admin' }), hosts);
  assert.deepEqual(visibleHosts(hosts, { email: 'a@example.edu', role: 'unknown' }), []);
  assert.deepEqual(visibleHosts(hosts, null), []);
});

test('audit rows are visible to their actors and participants, while admin sees all', () => {
  const events = [
    { actorEmail: 'a@example.edu', visibleTo: ['a@example.edu'] },
    { actorEmail: 'b@example.edu', visibleTo: ['a@example.edu', 'b@example.edu'] },
    { actorEmail: 'b@example.edu', visibleTo: ['b@example.edu'] },
  ];
  assert.deepEqual(visibleAudit(events, { email: 'a@example.edu', role: 'teacher' }), [events[0], events[1]]);
  assert.deepEqual(visibleAudit(events, { email: 'b@example.edu', role: 'teacher' }), [events[1], events[2]]);
  assert.deepEqual(visibleAudit(events, { email: 'admin@example.edu', role: 'admin' }), events);
  assert.deepEqual(visibleAudit(events, { email: 'a@example.edu', role: 'unknown' }), []);
});
