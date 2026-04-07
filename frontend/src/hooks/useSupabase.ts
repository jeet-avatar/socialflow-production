import { useEffect } from 'react';
import { useUser, useAuth as useClerkAuth, useClerk } from '@clerk/clerk-react';
import { userService } from '../services/userService';
import { registerTokenGetter } from '../utils/getAuthToken';
import { API_BASE_URL } from '../config/api';

export const useAuth = () => {
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
          if (token) localStorage.setItem('test_token', token);

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
    localStorage.removeItem('test_token');
    localStorage.removeItem('user_stats');
    localStorage.removeItem('user_info');
    await clerkSignOut();
  };

  const refreshProfile = async () => {
    try {
      const token = await getToken();
      if (token) localStorage.setItem('test_token', token);
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
