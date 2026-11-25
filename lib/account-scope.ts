import { AsyncLocalStorage } from 'node:async_hooks';

// Set only after session lookup, or explicitly by an administrative CLI.
const scope = new AsyncLocalStorage<string>();
export const originalNotebook = '00000000-0000-4000-8000-000000000001';
export function withAccount<T>(id: string, work: () => T): T {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) throw Error('Compte invalide.');
  return scope.run(id, work);
}
export function accountId(): string {
  const id = scope.getStore();
  if (!id) throw Error('Compte requis.');
  return id;
}
