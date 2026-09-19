import { AccountUserSchema, type AccountUser } from '@thai-translate/contracts';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

import type { AppConfig } from './config.js';

export type GoogleIdentity = (code: string, verifier: string, nonce: string) => Promise<AccountUser>;
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export async function verifyGoogleToken(token: string, audience: string, nonce: string, keys: JWTVerifyGetKey = googleKeys): Promise<AccountUser> {
  const { payload } = await jwtVerify(token, keys, {
    audience, issuer: ['https://accounts.google.com', 'accounts.google.com'], algorithms: ['RS256'],
    requiredClaims: ['sub', 'exp', 'iat', 'nonce', 'email'],
  });
  if (payload.nonce !== nonce || payload.email_verified !== true) throw new Error('Invalid Google identity');
  return AccountUserSchema.parse({ id: payload.sub, email: payload.email, name: payload.name ?? payload.email });
}

export function googleIdentity(config: AppConfig): GoogleIdentity {
  return async (code, verifier, nonce) => {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.googleClientId!, client_secret: config.googleClientSecret!,
        code, code_verifier: verifier, grant_type: 'authorization_code',
        redirect_uri: `${config.authPublicUrl}/api/auth/google/callback`,
      }),
    });
    if (!response.ok) throw new Error('Google token exchange failed');
    const body = await response.json() as { id_token?: string };
    if (!body.id_token) throw new Error('Google identity missing');
    return verifyGoogleToken(body.id_token, config.googleClientId!, nonce);
  };
}
