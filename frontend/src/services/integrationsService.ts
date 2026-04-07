/**
 * Integrations Service
 * Handles saving/retrieving social media platform integrations from MongoDB
 */
import { API_BASE_URL } from '../config/api';
import { getAuthHeaders } from '../utils/getAuthToken';

export interface Integration {
  platform: string;
  is_connected: boolean;
  last_updated?: string;
  last_tested?: string;
  last_error?: string;
}

export interface SaveIntegrationRequest {
  platform: string;
  credentials: Record<string, string>;
  is_connected: boolean;
}

class IntegrationsService {
  async saveIntegration(data: SaveIntegrationRequest): Promise<Record<string, unknown>> {
    const response = await fetch(`${API_BASE_URL}/api/integrations/save`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response.json();
  }

  async getIntegrations(): Promise<Integration[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/integrations/list`, {
        method: 'GET',
        headers: await getAuthHeaders(),
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      return result.integrations ?? [];
    } catch {
      return [];
    }
  }

  async getIntegration(platform: string): Promise<Integration | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/integrations/${platform}`, {
        method: 'GET',
        headers: await getAuthHeaders(),
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      return result.integration ?? null;
    } catch {
      return null;
    }
  }

  async deleteIntegration(platform: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${API_BASE_URL}/api/integrations/${platform}`, {
      method: 'DELETE',
      headers: await getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail ?? `HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async testConnection(platform: string, credentials: Record<string, string>): Promise<Record<string, unknown>> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/integrations/test`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ platform, credentials }),
      });
      return response.json();
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        is_connected: false,
      };
    }
  }

  async initiateYouTubeOAuth(): Promise<Record<string, unknown>> {
    const response = await fetch(`${API_BASE_URL}/api/integrations/youtube/oauth/authorize`, {
      method: 'GET',
      headers: await getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail ?? `HTTP error! status: ${response.status}`);
    }
    return response.json();
  }
}

export const integrationsService = new IntegrationsService();
