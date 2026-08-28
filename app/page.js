import AppShell from '@/components/AppShell';
import { getState } from '@/lib/state';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Page() {
  const state = await getState();
  return <AppShell initialState={state} />;
}
