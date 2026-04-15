import { useEffect } from 'react';
import { useUser, useAuth as useClerkAuth, useClerk } from '@clerk/clerk-react';
import { userService } from '../services/userService';
import { registerTokenGetter } from '../utils/getAuthToken';
import { API_BASE_URL } from '../config/api';

const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';

// ── Dev bypass hook — no Clerk, returns a mock user ───────────────────────────
const useAuthBypass = () => {
  useEffect(() => {
    registerTokenGetter(async () => 'dev-bypass');
  }, []);
  const mockUser: any = {
    id: 'dev-bypass',
    sub: 'dev-bypass',
    primaryEmailAddress: { emailAddress: 'dev@local.test' },
    fullName: 'Dev User',
    imageUrl: null,
  };
  return {
    user: mockUser,
    profile: {
      id: 'dev-bypass',
      email: 'dev@local.test',
      full_name: 'Dev User',
      avatar_url: null,
      company_name: null,
      timezone: null,
      subscription_plan: 'free',
      subscription_status: null,
      subscription_current_period_end: null,
      stripe_customer_id: null,
      created_at: null,
      updated_at: null,
    },
    session: { user: mockUser, access_token: 'dev-bypass' },
    loading: false,
    signOut: async () => { globalThis.location.href = '/'; },
    refreshProfile: async () => {},
  };
};

// ── Clerk-backed hook (used when VITE_DEV_BYPASS_AUTH != 'true') ──────────────
const useAuthClerk = () => {
  const { user, isLoaded } = useUser();
  const { getToken, isSignedIn } = useClerkAuth();
  const { signOut: clerkSignOut } = useClerk();

  const profile = user ? {
    id: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? '',
    full_name: user.fullName ?? null,
    avatar_url: user.imageUrl ?? null,
    company_name: null,
    timezone: null,
    subscription_plan: null,
    subscription_status: null,
    subscription_current_period_end: null,
    stripe_customer_id: null,
    created_at: null,
    updated_at: null,
  } : null;

  const session = isSignedIn ? { user, access_token: null } : null;

  useEffect(() => {
    // Register token getter so all services get fresh tokens via getAuthToken()
    registerTokenGetter(async () => {
      const token = await getToken();
      if (!token) throw new Error('No Clerk token');
      return token;
    });
    if (isSignedIn && user) {
      getToken()
        .then(async (token) => {
          if (!token) return;

          // Sync user with MongoDB backend
          try {
            await userService.syncUserLogin({
              id: user.id,
              email: user.primaryEmailAddress?.emailAddress ?? '',
              user_metadata: {
                full_name: user.fullName,
                avatar_url: user.imageUrl,
              },
              app_metadata: { provider: 'clerk' },
              email_confirmed_at: new Date().toISOString(),
              last_sign_in_at: new Date().toISOString(),
            });
          } catch { /* MongoDB sync failed silently */ }

          // Send login notification once per session
          const email = user.primaryEmailAddress?.emailAddress;
          const notifyKey = `sf_notified_${user.id}`;
          if (email && !sessionStorage.getItem(notifyKey)) {
            sessionStorage.setItem(notifyKey, '1');
            try {
              await fetch(`${API_BASE_URL}/auth/notify-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name: user.fullName ?? '' }),
              });
            } catch { /* notification failed silently */ }
          }
        })
        .catch(() => { /* token fetch failed silently */ });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, user?.id]);

  const signOut = async () => {
    localStorage.removeItem('user_stats');
    localStorage.removeItem('user_info');
    await clerkSignOut();
  };

  const refreshProfile = async () => {
    try {
      await getToken();
    } catch { /* token refresh failed silently */ }
  };

  return {
    user: isSignedIn ? user : null,
    profile,
    session,
    loading: !isLoaded,
    signOut,
    refreshProfile,
  };
};

export const useAuth = DEV_BYPASS ? useAuthBypass : useAuthClerk;
