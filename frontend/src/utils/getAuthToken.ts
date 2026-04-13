/**
 * Central async token utility.
 * Call registerTokenGetter() once at app startup (useAuth hook) to wire up
 * Clerk's getToken — after that every caller gets a fresh token.
 */

let _getter: (() => Promise<string>) | null = null;

export const registerTokenGetter = (getter: () => Promise<string>) => {
  _getter = getter;
};

export const getAuthToken = async (): Promise<string | null> => {
  if (_getter) {
    try {
      return await _getter();
    } catch {
      return null;
    }
  }
  return null;
};

export const getAuthHeaders = async (): Promise<HeadersInit> => {
  const token = await getAuthToken();
  if (token) {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  }
  return { 'Content-Type': 'application/json' };
};
