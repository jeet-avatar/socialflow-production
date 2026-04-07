/**
 * User Service for MongoDB Integration
 * Handles user authentication sync and data isolation
 */
import { API_BASE_URL } from '../config/api';
import { getAuthHeaders } from '../utils/getAuthToken';

export interface UserSyncRequest {
  supabase_user_id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  provider?: string;
  email_confirmed_at?: string;
  last_sign_in_at?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

export interface UserStats {
  companies_count: number;
  leads_count: number;
  campaigns_count: number;
  social_posts_count: number;
}

export interface UserResponse {
  success: boolean;
  message: string;
  user?: Record<string, unknown>;
  stats?: UserStats;
}

class UserService {
  async syncUserLogin(user: Record<string, unknown>): Promise<UserResponse> {
    const userMeta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
    const syncData: UserSyncRequest = {
      supabase_user_id: (user.id ?? user.sub) as string,
      email: (user.email as string) ?? '',
      full_name: (userMeta.full_name ?? userMeta.name ?? user.name) as string | undefined,
      avatar_url: (userMeta.avatar_url ?? userMeta.picture ?? user.picture) as string | undefined,
      provider: (appMeta.provider ?? 'auth0') as string,
      email_confirmed_at: (user.email_confirmed_at as string) ?? new Date().toISOString(),
      last_sign_in_at: (user.last_sign_in_at as string) ?? new Date().toISOString(),
      user_metadata: userMeta,
      app_metadata: appMeta,
    };

    let retries = 3;
    let lastError: Error | null = null;

    while (retries > 0) {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/sync-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(syncData),
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result: UserResponse = await response.json();
        if (result.stats) localStorage.setItem('user_stats', JSON.stringify(result.stats));
        localStorage.setItem('user_info', JSON.stringify({
          id: (user.id ?? user.sub) as string,
          email: user.email as string,
          synced_at: new Date().toISOString()
        }));
        return result;
      } catch (error) {
        lastError = error as Error;
        retries--;
        if (retries > 0) await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw lastError;
  }

  async getUserProfile(): Promise<UserResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/user-profile`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const result: UserResponse = await response.json();
    if (result.stats) localStorage.setItem('user_stats', JSON.stringify(result.stats));
    return result;
  }

  async refreshUserData(): Promise<UserResponse> {
    localStorage.removeItem('user_stats');
    localStorage.removeItem('user_info');
    return this.getUserProfile();
  }

  getCachedUserStats(): UserStats | null {
    try {
      const cached = localStorage.getItem('user_stats');
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  }

  async updateSubscription(plan: string, status: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/user-subscription?plan=${plan}&status=${status}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response.json();
  }

  getCachedStats(): UserStats | null {
    try {
      const stats = localStorage.getItem('user_stats');
      return stats ? JSON.parse(stats) : null;
    } catch { return null; }
  }

  clearUserData(): void {
    localStorage.removeItem('user_stats');
  }

  async makeAuthenticatedRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: { ...getAuthHeaders(), ...options.headers },
    });
    if (response.status === 401) throw new Error('Authentication required');
    return response;
  }

  async getUserCompanies(): Promise<Record<string, unknown>[]> {
    const response = await this.makeAuthenticatedRequest('/companies');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response.json();
  }

  async getUserLeads(): Promise<Record<string, unknown>[]> {
    const response = await this.makeAuthenticatedRequest('/leads');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response.json();
  }

  async getUserCampaigns(): Promise<Record<string, unknown>[]> {
    const response = await this.makeAuthenticatedRequest('/campaigns');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response.json();
  }
}

export const userService = new UserService();
