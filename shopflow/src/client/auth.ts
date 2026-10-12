export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

const AUTH_STORAGE_KEY = "shopflow_auth_user";

/**
 * Retrieve the current authenticated user from sessionStorage.
 */
export function getStoredAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Save authenticated user details to sessionStorage upon login or registration.
 */
export function setStoredAuthUser(user: AuthUser): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } catch {}
}

/**
 * Remove authenticated user from sessionStorage upon logout.
 */
export function clearStoredAuth(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {}
}

/**
 * Check if an authenticated user session is currently stored in sessionStorage.
 */
export function isStoredAuthenticated(): boolean {
  return getStoredAuthUser() !== null;
}
