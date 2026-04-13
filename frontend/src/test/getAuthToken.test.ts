/**
 * getAuthToken — verifies localStorage XSS fallback was removed.
 * Run with: npx vitest
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('getAuthToken — no localStorage fallback', () => {
  beforeEach(() => {
    // Clear any registered getter
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns null when no getter is registered and localStorage has test_token', async () => {
    // Simulate the old XSS vector: a test_token sitting in localStorage
    localStorage.setItem('test_token', 'fake-token');

    const { getAuthToken } = await import('../utils/getAuthToken');
    const token = await getAuthToken();

    // Must NOT pick up the localStorage value
    expect(token).toBeNull();
  });

  it('returns null when no getter is registered (clean state)', async () => {
    const { getAuthToken } = await import('../utils/getAuthToken');
    const token = await getAuthToken();
    expect(token).toBeNull();
  });

  it('returns the token from a registered getter', async () => {
    const { registerTokenGetter, getAuthToken } = await import('../utils/getAuthToken');
    registerTokenGetter(async () => 'clerk-jwt-token');

    const token = await getAuthToken();
    expect(token).toBe('clerk-jwt-token');
  });
});
