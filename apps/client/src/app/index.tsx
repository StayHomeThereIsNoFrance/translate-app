import { TranslatorScreen } from '@/features/translator/translator-screen';
import { useAccount } from '@/features/account/account-context';

export default function IndexRoute() {
  const account = useAccount();
  return <TranslatorScreen key={account.user?.id ?? 'guest'} />;
}
