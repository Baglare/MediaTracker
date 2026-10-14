import AuthRecoveryPanel from '@/components/auth-recovery-panel';
import { getBackendProvider } from '@/lib/backend/provider';
import type { Metadata } from 'next';
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default function Page() {
  return <AuthRecoveryPanel mode='reset' native={getBackendProvider() === 'native'} />;
}
