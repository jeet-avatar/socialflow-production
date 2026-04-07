/**
 * Background leads search service.
 *
 * Lives at module level — survives React component mount/unmount cycles.
 * Results and status are persisted to sessionStorage so that when the
 * Leads component remounts it can restore the last search immediately.
 */

import { notify } from './notificationService';
import { API_BASE_URL } from '../config/api';

const STORAGE_KEY = 'sf_leads_search_state';

export interface LeadsSearchParams {
  query: string;
  mode: 'individual' | 'company';
  location: string;
  industry: string;
  techStack: string;
}

export interface LeadCategory {
  title: string;
  count: number;
  leads: unknown[];
}

export interface LeadsSearchState {
  params: LeadsSearchParams;
  status: 'running' | 'done' | 'error';
  results?: { categories: LeadCategory[]; total: number };
  error?: string;
  startedAt: number;
}

// ----- Module-level state (persists across React mounts) -----
let _activeAbort: AbortController | null = null;
// Listeners that want live status updates (e.g. mounted Leads component)
const _listeners = new Set<() => void>();

// ----- SessionStorage helpers -----
function loadState(): LeadsSearchState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LeadsSearchState) : null;
  } catch {
    return null;
  }
}

function saveState(state: LeadsSearchState | null) {
  try {
    if (state) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* storage quota */ }
}

function notifyListeners() {
  _listeners.forEach(fn => fn());
}

// ----- Public API -----

/** Subscribe to state changes. Returns an unsubscribe function. */
export function subscribe(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/** Get current persisted state (or null if no search has been run). */
export function getState(): LeadsSearchState | null {
  return loadState();
}

/** Clear stored state (e.g. when user clears search). */
export function clearState() {
  saveState(null);
  notifyListeners();
}

/** Cancel any in-progress search. */
export function cancel() {
  _activeAbort?.abort();
  _activeAbort = null;
  const current = loadState();
  if (current?.status === 'running') {
    saveState({ ...current, status: 'error', error: 'Search cancelled.' });
    notifyListeners();
  }
}

/**
 * Start a background lead search.
 * Returns immediately — use subscribe() or getState() to follow progress.
 */
export async function startSearch(
  params: LeadsSearchParams,
  getToken: () => Promise<string | null>,
): Promise<void> {
  // Cancel any previous in-flight search
  _activeAbort?.abort();
  _activeAbort = new AbortController();

  const state: LeadsSearchState = {
    params,
    status: 'running',
    startedAt: Date.now(),
  };
  saveState(state);
  notifyListeners();

  try {
    const token = await getToken();

    const urlParams = new URLSearchParams({
      query: params.query,
      mode: params.mode,
      location: params.location,
      industry: params.industry,
      techStack: params.techStack,
    });

    const response = await fetch(`${API_BASE_URL}/api/live-leads?${urlParams.toString()}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: _activeAbort.signal,
    });

    if (response.status === 401) {
      const errState: LeadsSearchState = { ...state, status: 'error', error: 'Authentication required. Please login again.' };
      saveState(errState);
      notifyListeners();
      notify('Authentication Error', 'Your session has expired. Please refresh and log in again.', 'error');
      return;
    }

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    const categories: LeadCategory[] = data.categories ?? [];
    const total = categories.reduce((s, c) => s + (c.count ?? 0), 0);

    const doneState: LeadsSearchState = {
      ...state,
      status: 'done',
      results: { categories, total },
    };
    saveState(doneState);
    notifyListeners();
    notify(
      'Lead Scan Complete',
      `Found ${total} leads for "${params.query}"`,
      'success',
    );
  } catch (err: unknown) {
    if ((err as Error)?.name === 'AbortError') return;

    const errState: LeadsSearchState = {
      ...state,
      status: 'error',
      error: 'Lead scan failed. Please check your connection and try again.',
    };
    saveState(errState);
    notifyListeners();
    notify('Lead Scan Failed', 'Could not complete the search. Please try again.', 'error');
  } finally {
    _activeAbort = null;
  }
}
