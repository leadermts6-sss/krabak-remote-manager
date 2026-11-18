export function canManageUsers(user) {
  return user?.role === 'admin';
}

export function visibleHosts(hosts, user) {
  if (!user) return [];
  if (canManageUsers(user)) return [...hosts];
  if (user.role !== 'teacher' || typeof user.email !== 'string') return [];
  return hosts.filter(host => host.ownerEmail === user.email);
}

export function visibleAudit(events, user) {
  if (!user) return [];
  if (canManageUsers(user)) return [...events];
  if (user.role !== 'teacher' || typeof user.email !== 'string') return [];
  return events.filter(event => event.actorEmail === user.email
    || (Array.isArray(event.visibleTo) && event.visibleTo.includes(user.email)));
}
