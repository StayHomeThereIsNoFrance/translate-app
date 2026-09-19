import { Redirect } from 'expo-router';

// The provider stays mounted while the system browser returns to this route.
export default function AuthCallback() {
  return <Redirect href="/" />;
}
