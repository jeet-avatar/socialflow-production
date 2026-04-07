/**
 * Background company analysis service.
 *
 * Handles the two-step flow: company lookup → risk analysis.
 * Lives at module level — survives React component mount/unmount cycles.
 * Persists state to sessionStorage so CreditRating restores the last search on remount.
 */

import { notify } from './notificationService';
import { API_BASE_URL } from '../config/api';

const STORAGE_KEY = 'sf_company_analysis_state';

export interface CompanyAnalysisState {
  query: string;
  status: 'running' | 'risk-analysis' | 'done' | 'error';
  creditData?: Record<string, unknown>;
  riskAnalysis?: Record<string, unknown>;
  error?: string;
  startedAt: number;
}

// ----- Module-level -----
let _activeAbort: AbortController | null = null;
const _listeners = new Set<() => void>();

function loadState(): CompanyAnalysisState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CompanyAnalysisState) : null;
  } catch {
    return null;
  }
}

function saveState(state: CompanyAnalysisState | null) {
  try {
    if (state) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* quota */ }
}

function notifyListeners() {
  _listeners.forEach(fn => fn());
}

// ----- Public API -----

export function subscribe(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getState(): CompanyAnalysisState | null {
  return loadState();
}

export function clearState() {
  saveState(null);
  notifyListeners();
}

export function cancel() {
  _activeAbort?.abort();
  _activeAbort = null;
  const current = loadState();
  if (current && (current.status === 'running' || current.status === 'risk-analysis')) {
    saveState({ ...current, status: 'error', error: 'Analysis cancelled.' });
    notifyListeners();
  }
}

function buildParams(query: string, forceRefresh = false): URLSearchParams {
  const q = query.trim();
  const params = new URLSearchParams();
  if (q.includes('linkedin.com/company/')) {
    const urlParts = q.split('/');
    const companySlug = urlParts[urlParts.indexOf('company') + 1];
    const companyName = companySlug ? companySlug.replaceAll('-', ' ') : 'Company';
    params.append('companyName', companyName);
    params.append('linkedinUrl', q);
  } else if (q.startsWith('http') || q.startsWith('www.')) {
    try {
      const hostname = new URL(q.startsWith('www.') ? `https://${q}` : q).hostname
        .replace('www.', '').split('.')[0];
      params.append('companyName', hostname);
    } catch {
      params.append('companyName', q);
    }
  } else {
    params.append('companyName', q);
  }
  if (forceRefresh) params.append('forceRefresh', 'true');
  return params;
}

export async function startAnalysis(
  query: string,
  getToken: () => Promise<string | null>,
  forceRefresh = false,
): Promise<void> {
  _activeAbort?.abort();
  _activeAbort = new AbortController();

  const state: CompanyAnalysisState = {
    query,
    status: 'running',
    startedAt: Date.now(),
  };
  saveState(state);
  notifyListeners();

  try {
    const token = await getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    // ── Step 1: Company lookup ────────────────────────────────────────────────
    const params = buildParams(query, forceRefresh);
    const lookupRes = await fetch(
      `${API_BASE_URL}/api/company-analysis/lookup?${params.toString()}`,
      { headers, signal: _activeAbort.signal },
    );

    if (lookupRes.status === 401) {
      saveState({ ...state, status: 'error', error: 'Authentication required. Please login again.' });
      notifyListeners();
      notify('Session Expired', 'Your session has expired. Please refresh and log in again.', 'error');
      return;
    }

    if (!lookupRes.ok) throw new Error(`Lookup error: ${lookupRes.statusText}`);
    const payload = await lookupRes.json();
    if (payload?.success !== true) throw new Error(payload?.message ?? 'Lookup failed');

    const creditData = payload.data as Record<string, unknown>;

    // Partial update — company data ready, risk analysis starting
    const withData: CompanyAnalysisState = { ...state, status: 'risk-analysis', creditData };
    saveState(withData);
    notifyListeners();

    // ── Step 2: Risk analysis ─────────────────────────────────────────────────
    let riskAnalysis: Record<string, unknown> | undefined;
    try {
      const riskRes = await fetch(`${API_BASE_URL}/api/risk-analysis/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify(creditData),
        signal: _activeAbort.signal,
      });
      if (riskRes.ok) {
        const riskPayload = await riskRes.json();
        if (riskPayload.success && riskPayload.analysis) {
          riskAnalysis = riskPayload.analysis;
          // Save risk score to backend — required for it to appear in Reports tab
          const companyName =
            (creditData as Record<string, Record<string, string>>)?.company?.company_name || query;
          fetch(`${API_BASE_URL}/companies/risk-score`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
              company_name: companyName,
              risk_score: riskPayload.analysis.overallRiskScore,
              risk_level: riskPayload.analysis.riskLevel,
              confidence: riskPayload.analysis.confidence,
              risk_analysis: riskPayload.analysis,
            }),
          }).then(r => {
            if (!r.ok) console.warn(`[companyAnalysis] risk-score PATCH failed: ${r.status} for "${companyName}"`);
          }).catch(err => console.warn('[companyAnalysis] risk-score PATCH error:', err));
        }
      }
    } catch (riskErr: unknown) {
      if ((riskErr as Error)?.name === 'AbortError') throw riskErr;
      // Risk analysis failure is non-fatal — show data with fallback analysis
      riskAnalysis = {
        overallRiskScore: 50,
        riskLevel: 'Medium',
        sections: [],
        keyRiskFactors: ['Risk analysis service unavailable'],
        keyPositiveFactors: ['Company data successfully loaded'],
        recommendation: 'Unable to perform detailed risk analysis. Please try again later.',
        confidence: 40,
      };
    }

    const doneState: CompanyAnalysisState = {
      ...withData,
      status: 'done',
      riskAnalysis,
    };
    saveState(doneState);
    notifyListeners();

    const companyLabel =
      (creditData as Record<string, Record<string, string>>)?.company?.company_name || query;
    notify('Analysis Complete', `Risk report ready for "${companyLabel}"`, 'success');
  } catch (err: unknown) {
    if ((err as Error)?.name === 'AbortError') return;
    saveState({ ...state, status: 'error', error: 'Analysis failed. Company may not be found or service is unavailable.' });
    notifyListeners();
    notify('Analysis Failed', 'Company not found or service temporarily unavailable.', 'error');
  } finally {
    _activeAbort = null;
  }
}
