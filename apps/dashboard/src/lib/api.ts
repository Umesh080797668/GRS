import { translateMessageKey } from './translations.ts';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    userCode: string;
    email?: string;
    role: string;
    fullName?: string;
    mustChangePassword?: boolean;
    districtId?: string;
    dsId?: string;
    gnId?: string;
    teamId?: string;
  };
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly messageKey?: string;
  public readonly retryAfter?: number;
  public readonly details?: any;

  constructor(params: {
    message: string;
    status: number;
    code?: string;
    messageKey?: string;
    retryAfter?: number;
    details?: any;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status;
    this.code = params.code;
    this.messageKey = params.messageKey;
    this.retryAfter = params.retryAfter;
    this.details = params.details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

const DEFAULT_API_URL = 'http://localhost:3000';
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';

export class ApiClient {
  private baseUrl: string;
  private refreshPromise: Promise<boolean> | null = null;
  private inMemoryAccessToken: string | null = null;

  constructor() {
    this.baseUrl =
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      (typeof window !== 'undefined' && window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : DEFAULT_API_URL);
  }

  public getToken(): string | null {
    if (this.inMemoryAccessToken) return this.inMemoryAccessToken;
    // Security migration: migrate existing token from storage to memory, then remove from storage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('grs_access_token');
      if (stored) {
        this.inMemoryAccessToken = stored;
        localStorage.removeItem('grs_access_token');
        return this.inMemoryAccessToken;
      }
    }
    return null;
  }

  public setAccessToken(token: string | null) {
    this.inMemoryAccessToken = token;
  }

  public getAccessToken(): string | null {
    return this.getToken();
  }

  private getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('grs_refresh_token');
  }

  public saveSession(tokens: SessionTokens) {
    this.inMemoryAccessToken = tokens.accessToken;
    if (typeof window === 'undefined') return;
    localStorage.removeItem('grs_access_token');
    localStorage.setItem('grs_refresh_token', tokens.refreshToken);
    localStorage.setItem('grs_user', JSON.stringify(tokens.user));
  }

  public clearSession() {
    this.inMemoryAccessToken = null;
    if (typeof window === 'undefined') return;
    localStorage.removeItem('grs_access_token');
    localStorage.removeItem('grs_refresh_token');
    localStorage.removeItem('grs_user');
  }

  public getStoredUser(): SessionTokens['user'] | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem('grs_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private async request<T = any>(
    path: string,
    options: RequestInit = {},
    retryAuth = true
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    let token = this.getToken();

    // If access token is not yet in memory but we have a valid refresh token session, refresh silently first
    if (
      !token &&
      retryAuth &&
      this.getRefreshToken() &&
      !path.includes('/v1/auth/login') &&
      !path.includes('/v1/auth/refresh')
    ) {
      const refreshed = await this.refreshSession();
      if (refreshed) {
        token = this.getToken();
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Client-Type': 'web',
      'X-App-Version': APP_VERSION,
      ...((options.headers as Record<string, string>) || {}),
    };

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, { ...options, headers });

      // Handle 401 Refresh flow
      if (response.status === 401 && retryAuth) {
        const currentToken = this.getToken();
        // If the token in storage already changed while this request was in flight, retry with new token
        if (currentToken && token && currentToken !== token) {
          return this.request<T>(path, options, false);
        }

        if (this.getRefreshToken()) {
          const refreshed = await this.refreshSession();
          if (refreshed) {
            return this.request<T>(path, options, false);
          } else {
            this.clearSession();
            if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
              window.location.href = '/login';
            }
            throw new ApiError({
              message: 'Session expired. Please sign in again.',
              status: 401,
              code: 'SESSION_EXPIRED',
              messageKey: 'errors.auth.session_revoked',
            });
          }
        }
      }

      if (!response.ok) {
        let errData: any = {};
        try {
          errData = await response.json();
        } catch { }

        const retryAfterHeader =
          response.headers.get('Retry-After') ||
          response.headers.get('retry-after');
        const retryAfterSeconds = retryAfterHeader
          ? parseInt(retryAfterHeader, 10)
          : undefined;

        const code =
          errData.code ||
          (response.status === 426
            ? 'UPGRADE_REQUIRED'
            : response.status === 429
              ? 'RATE_LIMITED'
              : undefined);

        const messageKey =
          errData.message_key ||
          (response.status === 426 ? 'errors.upgrade_required' : undefined) ||
          (response.status === 429 ? 'errors.rate_limited' : undefined) ||
          (response.status === 503 ? 'errors.server_busy' : undefined);

        // Translate via messageKey when available
        const translated = messageKey ? translateMessageKey(messageKey) : null;

        let serverMessage = '';
        if (Array.isArray(errData.message)) {
          serverMessage = errData.message.join('; ');
        } else if (typeof errData.message === 'string') {
          serverMessage = errData.message;
        } else if (errData.error) {
          serverMessage = String(errData.error);
        }

        let message =
          translated ||
          serverMessage ||
          `HTTP ${response.status}: ${response.statusText}`;

        if (retryAfterSeconds && !translated) {
          message += ` (Retry after ${retryAfterSeconds}s)`;
        }

        throw new ApiError({
          message,
          status: response.status,
          code,
          messageKey,
          retryAfter: retryAfterSeconds,
          details: errData,
        });
      }

      if (response.status === 204 || response.status === 205) {
        return undefined as unknown as T;
      }

      if (typeof response.text === 'function') {
        const text = await response.text();
        if (!text || text.trim() === '') {
          return undefined as unknown as T;
        }
        try {
          return JSON.parse(text) as T;
        } catch {
          return text as unknown as T;
        }
      }

      if (typeof response.json === 'function') {
        try {
          return (await response.json()) as T;
        } catch {
          return undefined as unknown as T;
        }
      }

      return undefined as unknown as T;
    } catch (err: any) {
      if (err instanceof ApiError) {
        throw err;
      }
      const networkTranslated = translateMessageKey('errors.network');
      throw new ApiError({
        message: err.message || networkTranslated || 'Network error communicating with GRS servers.',
        status: 0,
        code: 'NETWORK_ERROR',
        messageKey: 'errors.network',
      });
    }
  }

  // --- AUTH ENDPOINTS ---

  async login(identifier: string, password: string): Promise<SessionTokens> {
    const data = await this.request<SessionTokens>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }, false);
    this.saveSession(data);
    return data;
  }

  async logout(): Promise<void> {
    try {
      await this.request('/v1/auth/logout', {
        method: 'POST',
      }, false);
    } catch {
      // Invariant: Silently handle network errors during sign-out
    } finally {
      this.clearSession();
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<SessionTokens> {
    const data = await this.request<SessionTokens>('/v1/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    this.saveSession(data);
    return data;
  }

  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    return this.request('/v1/auth/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }, false);
  }

  async confirmPasswordReset(email: string, code: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    return this.request('/v1/auth/reset', {
      method: 'POST',
      body: JSON.stringify({ email, code, newPassword }),
    }, false);
  }

  async addPendingEmail(email: string): Promise<{ success: boolean; message: string }> {
    return this.request('/v1/auth/email/add', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async verifyEmail(code: string): Promise<{ success: boolean; email: string }> {
    return this.request('/v1/auth/email/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async refreshSession(): Promise<boolean> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const rt = this.getRefreshToken();
    if (!rt) return false;

    this.refreshPromise = (async () => {
      try {
        const res = await fetch(`${this.baseUrl}/v1/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Type': 'web',
            'X-App-Version': APP_VERSION,
          },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.accessToken) {
            this.inMemoryAccessToken = data.accessToken;
            if (typeof window !== 'undefined') {
              localStorage.removeItem('grs_access_token');
            }
          }
          if (data.refreshToken && typeof window !== 'undefined') {
            localStorage.setItem('grs_refresh_token', data.refreshToken);
          }
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  // --- CONFIG ---

  async getConfig(): Promise<any> {
    return this.request('/v1/config');
  }

  async updateConfig(data: Record<string, any>): Promise<any> {
    return this.request('/v1/config', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // --- PROGRESS & SYNC HEALTH (M5.6 & M5.7) ---

  async getProgressStats(areaType?: string, areaId?: string): Promise<any> {
    const params = new URLSearchParams();
    if (areaType) params.append('areaType', areaType);
    if (areaId) params.append('areaId', areaId);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/v1/stats/progress${query}`);
  }

  // --- USER MANAGEMENT (M5.2) ---

  async getAccounts(params: { cursor?: string; limit?: number; search?: string; role?: string } = {}): Promise<any> {
    const p = new URLSearchParams();
    if (params.cursor) p.append('cursor', params.cursor);
    if (params.limit) p.append('limit', params.limit.toString());
    if (params.search) p.append('search', params.search);
    if (params.role) p.append('role', params.role);
    const q = p.toString() ? `?${p.toString()}` : '';
    return this.request(`/v1/accounts${q}`);
  }

  async createAccount(data: any): Promise<any> {
    return this.request('/v1/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createBulkAccounts(data: { role: string; count: number; teamId?: string; gnId?: string; dsId?: string; districtId?: string }): Promise<any> {
    return this.request('/v1/accounts/bulk', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async reissueBatch(batchId: string): Promise<{
    batchId: string;
    totalReissued: number;
    credentials: Array<{
      id: string;
      userCode: string;
      fullName: string;
      initialPassword: string;
      passwordExpiresAt: string;
    }>;
  }> {
    return this.request(`/v1/accounts/batches/${batchId}/reissue`, {
      method: 'POST',
    });
  }

  async deactivateAccount(id: string): Promise<void> {
    await this.request(`/v1/accounts/${id}/deactivate`, { method: 'PATCH' });
  }

  async reactivateAccount(id: string): Promise<void> {
    await this.request(`/v1/accounts/${id}/reactivate`, { method: 'PATCH' });
  }

  async resetAccountPassword(id: string): Promise<any> {
    return this.request(`/v1/accounts/${id}/reset-password`, { method: 'POST' });
  }

  // --- GEOGRAPHIC HIERARCHY & TEAMS (M5.3) ---

  async getDistricts(): Promise<any[]> {
    const res = await this.request('/v1/areas/districts');
    return Array.isArray(res) ? res : res.items || [];
  }

  async createDsDivision(data: {
    districtId: string;
    nameEn: string;
    nameSi: string;
    nameTa: string;
    sdoName?: string;
  }): Promise<any> {
    return this.request('/v1/areas/ds', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getDsDivisions(districtId?: string): Promise<any[]> {
    const p = districtId ? `?districtId=${districtId}` : '';
    const res = await this.request(`/v1/areas/ds${p}`);
    return Array.isArray(res) ? res : res.items || [];
  }

  async createGnDivision(data: {
    dsId: string;
    gnNumber: string;
    gnName: string;
    secretaryName?: string;
    secretaryContact?: string;
    secretaryEmail?: string;
  }): Promise<any> {
    return this.request('/v1/areas/gn', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateGnDivision(id: string, data: {
    secretaryName?: string;
    secretaryContact?: string;
    secretaryEmail?: string;
  }): Promise<any> {
    return this.request(`/v1/areas/gn/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getGnDivisions(dsId?: string): Promise<any[]> {
    const p = dsId ? `?dsId=${dsId}` : '';
    const res = await this.request(`/v1/areas/gn${p}`);
    return Array.isArray(res) ? res : res.items || [];
  }

  async createTeam(data: {
    gnId: string;
    teamNo: number;
    maxMembers?: number;
  }): Promise<any> {
    return this.request('/v1/areas/teams', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getTeams(gnId?: string): Promise<any[]> {
    const p = gnId ? `?gnId=${gnId}` : '';
    const res = await this.request(`/v1/areas/teams${p}`);
    return Array.isArray(res) ? res : res.items || [];
  }

  async updateTeam(id: string, data: { maxMembers?: number; memberLimit?: number; leaderId?: string }): Promise<any> {
    const payload: { maxMembers?: number; leaderId?: string } = {};
    if (data.maxMembers !== undefined) {
      payload.maxMembers = data.maxMembers;
    } else if (data.memberLimit !== undefined) {
      payload.maxMembers = data.memberLimit;
    }
    if (data.leaderId !== undefined) {
      payload.leaderId = data.leaderId;
    }
    return this.request(`/v1/areas/teams/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async importPilotAreaCsv(csvContent: string, dryRun: boolean = false): Promise<any> {
    return this.request('/v1/areas/import-csv', {
      method: 'POST',
      body: JSON.stringify({ csvContent, dryRun }),
    });
  }

  // --- LOOKUPS ---

  async getLookups(category?: string): Promise<{ version: string; count: number; categories: Record<string, any[]> }> {
    const p = category ? `?category=${category}` : '';
    return this.request(`/v1/lookups${p}`);
  }

  // --- HOUSEHOLDS & IMPORT (M5.4) ---

  async getHouseholds(params: { gnId?: string; search?: string; limit?: number; cursor?: string } = {}): Promise<any> {
    const p = new URLSearchParams();
    if (params.gnId) p.append('gnId', params.gnId);
    if (params.search) p.append('search', params.search);
    if (params.limit) p.append('limit', params.limit.toString());
    if (params.cursor) p.append('cursor', params.cursor);
    const q = p.toString() ? `?${p.toString()}` : '';
    return this.request(`/v1/houses${q}`);
  }

  async createHousehold(data: any): Promise<any> {
    return this.request('/v1/houses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async assignHousesToTeam(teamId: string, houseIds: string[]): Promise<any> {
    return this.request(`/v1/teams/${teamId}/houses`, {
      method: 'POST',
      body: JSON.stringify({ houseIds }),
    });
  }

  async unassignHouseFromTeam(teamId: string, houseId: string): Promise<any> {
    return this.request(`/v1/teams/${teamId}/houses/${houseId}`, {
      method: 'DELETE',
    });
  }

  async finishHousehold(houseId: string): Promise<any> {
    return this.request(`/v1/houses/${houseId}/finish`, {
      method: 'POST',
    });
  }

  // --- SERVER-SIDE IMPORT (PREVIEW / CONFIRM) ---

  async previewImport(gnId: string, file: File): Promise<any> {
    const formData = new FormData();
    formData.append('gnId', gnId);
    formData.append('file', file);
    return this.request('/v1/imports/preview', {
      method: 'POST',
      body: formData,
    });
  }

  async confirmImport(batchId: string): Promise<any> {
    return this.request(`/v1/imports/${batchId}/confirm`, {
      method: 'POST',
    });
  }

  async getImportBatch(batchId: string): Promise<any> {
    return this.request(`/v1/imports/${batchId}`);
  }

  async downloadImportErrors(batchId: string): Promise<string> {
    return this.request<string>(`/v1/imports/${batchId}/errors`, {
      headers: {
        Accept: 'text/csv, */*',
      },
    });
  }

  // --- RECORDS & SUPERVISOR AUDIT (M5.5) & ONLINE ENTRY (M5.8) ---

  async getClients(params: {
    teamId?: string;
    districtId?: string;
    dsId?: string;
    gnId?: string;
    gender?: string;
    beneficiary?: string;
    language?: string;
    search?: string;
    limit?: number;
    cursor?: string;
    includeCount?: boolean;
  } = {}): Promise<any> {
    const p = new URLSearchParams();
    if (params.teamId) p.append('teamId', params.teamId);
    if (params.districtId) p.append('districtId', params.districtId);
    if (params.dsId) p.append('dsId', params.dsId);
    if (params.gnId) p.append('gnId', params.gnId);
    if (params.gender && params.gender !== 'all') p.append('gender', params.gender);
    if (params.beneficiary && params.beneficiary !== 'all') p.append('beneficiary', params.beneficiary);
    if (params.language && params.language !== 'all') p.append('language', params.language);
    if (params.search) p.append('search', params.search);
    if (params.limit) p.append('limit', params.limit.toString());
    if (params.cursor) p.append('cursor', params.cursor);
    if (params.includeCount !== undefined) p.append('includeCount', String(params.includeCount));
    const q = p.toString() ? `?${p.toString()}` : '';
    return this.request(`/v1/clients${q}`);
  }

  async createClient(data: any): Promise<any> {
    return this.request('/v1/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateClient(id: string, data: any, reason: string): Promise<any> {
    const { auditReason: _omit, ...rest } = data;
    return this.request(`/v1/clients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...rest, correctionReason: reason }),
    });
  }
}

export const api = new ApiClient();

