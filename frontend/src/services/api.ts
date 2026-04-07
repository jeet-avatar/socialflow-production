// API service for backend integration

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'https://socialflow.network/api';

interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterData {
  email: string;
  password: string;
  confirmPassword: string;
}

interface SocialPlatform {
  platform: string;
  accessToken: string;
  refreshToken?: string;
}

interface PostData {
  content: string;
  platforms: string[];
  scheduledFor: string;
  mediaUrls?: string[];
}


class ApiService {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('authToken');
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message ?? 'API request failed');
    }

    return response.json();
  }

  // Authentication methods
  async login(credentials: LoginCredentials) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    
    this.token = response.token;
    localStorage.setItem('authToken', this.token!);
    return response;
  }

  async register(userData: RegisterData) {
    const response = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    
    this.token = response.token;
    localStorage.setItem('authToken', this.token!);
    return response;
  }

  async googleAuth(idToken: string) {
    const response = await this.request('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });
    
    this.token = response.token;
    localStorage.setItem('authToken', this.token!);
    return response;
  }

  async appleAuth(identityToken: string) {
    const response = await this.request('/auth/apple', {
      method: 'POST',
      body: JSON.stringify({ identityToken }),
    });
    
    this.token = response.token;
    localStorage.setItem('authToken', this.token!);
    return response;
  }

  logout() {
    this.token = null;
    localStorage.removeItem('authToken');
  }

  // Social media platform methods
  async connectPlatform(platform: SocialPlatform) {
    return this.request('/platforms/connect', {
      method: 'POST',
      body: JSON.stringify(platform),
    });
  }

  async disconnectPlatform(platformId: string) {
    return this.request(`/platforms/${platformId}/disconnect`, {
      method: 'DELETE',
    });
  }

  async getConnectedPlatforms() {
    return this.request('/platforms');
  }

  // Post management methods
  async createPost(postData: PostData) {
    return this.request('/posts', {
      method: 'POST',
      body: JSON.stringify(postData),
    });
  }

  async schedulePost(postData: PostData) {
    return this.request('/posts/schedule', {
      method: 'POST',
      body: JSON.stringify(postData),
    });
  }

  async getPosts(page = 1, limit = 10) {
    return this.request(`/posts?page=${page}&limit=${limit}`);
  }

  async getPost(postId: string) {
    return this.request(`/posts/${postId}`);
  }

  async updatePost(postId: string, postData: Partial<PostData>) {
    return this.request(`/posts/${postId}`, {
      method: 'PUT',
      body: JSON.stringify(postData),
    });
  }

  async deletePost(postId: string) {
    return this.request(`/posts/${postId}`, {
      method: 'DELETE',
    });
  }

  // Analytics methods
  async getAnalytics(dateRange?: { start: string; end: string }) {
    const params = new URLSearchParams();
    if (dateRange) {
      params.append('start', dateRange.start);
      params.append('end', dateRange.end);
    }
    return this.request(`/analytics?${params.toString()}`);
  }

  async getPlatformAnalytics(platform: string, dateRange?: { start: string; end: string }) {
    const params = new URLSearchParams();
    if (dateRange) {
      params.append('start', dateRange.start);
      params.append('end', dateRange.end);
    }
    return this.request(`/analytics/${platform}?${params.toString()}`);
  }


  // Security API methods
  async moderateContent(content: string) {
    return this.request('/security/moderate', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async scanForSafety(content: string, mediaUrls?: string[]) {
    return this.request('/security/scan', {
      method: 'POST',
      body: JSON.stringify({ content, mediaUrls }),
    });
  }

  // Subscription and billing methods
  async getSubscription() {
    return this.request('/subscription');
  }

  async createCheckoutSession(priceId: string) {
    return this.request('/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ priceId }),
    });
  }

  async createPortalSession() {
    return this.request('/billing/portal', {
      method: 'POST',
    });
  }

  async cancelSubscription() {
    return this.request('/subscription/cancel', {
      method: 'POST',
    });
  }

  // User profile methods
  async getProfile() {
    return this.request('/user/profile');
  }

  async updateProfile(profileData: Record<string, unknown>) {
    return this.request('/user/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
  }

  async deleteAccount() {
    return this.request('/user/account', {
      method: 'DELETE',
    });
  }
}

export default new ApiService();