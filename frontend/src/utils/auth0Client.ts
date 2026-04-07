
const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;

export const auth0Config = {
  domain,
  clientId,
  authorizationParams: {
    redirect_uri: `${globalThis.location.origin}/auth/callback`,
  },
};

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  company_name?: string | null;
  timezone?: string | null;
  subscription_plan?: string | null;
  subscription_status?: string | null;
  subscription_current_period_end?: string | null;
  stripe_customer_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}
