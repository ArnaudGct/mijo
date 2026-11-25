import { authenticated } from '@/lib/auth';
import { withAccount } from '@/lib/account-scope';
import { state } from '@/lib/db';
import { AccountForm } from '@/components/account-form';
import { Workspace } from '@/components/workspace';

export default async function NotebookLayout({ children }: { children: React.ReactNode }) {
  const account = await authenticated();
  if (!account) return <AccountForm />;
  const initial = await withAccount(account.id, state);
  return (
    <Workspace key={account.id} account={account} initial={initial}>
      {children}
    </Workspace>
  );
}
