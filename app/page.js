import Masthead from '@/components/Masthead';
import TwistPanel from '@/components/TwistPanel';
import Console from '@/components/Console';
import Footer from '@/components/Footer';
import { getState } from '@/lib/state';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Page() {
  const state = await getState();

  return (
    <main className="wrap">
      <Masthead
        issueNumber={state.issueNumber}
        filedDate={state.filedDate}
        storage={state.storage}
      />
      <TwistPanel twist={state.twist} />
      <Console initialState={state} />
      <Footer />
    </main>
  );
}
