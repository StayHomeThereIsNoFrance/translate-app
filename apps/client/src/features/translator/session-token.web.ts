export async function getSessionToken(): Promise<string | null> {
  return null;
}

export async function setSessionToken(_token: string): Promise<void> {
  // The web client authenticates through an HttpOnly cookie.
}
