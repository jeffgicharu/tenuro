export class SignInError extends Error {
  readonly kind: 'limit' | 'failed';
  constructor(kind: 'limit' | 'failed') {
    super(kind);
    this.kind = kind;
  }
}

const headers = { 'content-type': 'application/json', 'x-tenuro-client': 'web' };

// The account id is the local id inside the User global id.
export function localId(globalId: string): string {
  return atob(globalId).split(':').slice(1).join(':');
}

// Signs in and reloads, so no data from a previous account stays in memory.
export async function signInAs(userGlobalId: string, then = '/leases'): Promise<void> {
  const res = await fetch('/api/session', {
    method: 'POST', credentials: 'same-origin', headers, body: JSON.stringify({ accountId: localId(userGlobalId) }),
  });
  if (res.status === 429) throw new SignInError('limit');
  if (!res.ok) throw new SignInError('failed');
  window.location.assign(then);
}

export async function signOut(): Promise<void> {
  await fetch('/api/session', { method: 'DELETE', credentials: 'same-origin', headers }).catch(() => undefined);
  window.location.assign('/sign-in');
}
