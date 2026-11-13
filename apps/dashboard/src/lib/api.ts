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
    assignments?: Array<{
      gnId: string;
      gnName?: string;
      gnCode?: string;
      teamId?: string;
      teamNo?: string;
      validFrom: string;
    }>;
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

export type ActivityStatus = 'online' | 'offline' | 'never';
export type ActivityClientType = 'web' | 'mobile' | 'unknown';

export interface AccountActivitySummary {
  totalAccounts: number;
  onlineNow: number;
  onlineWeb: number;
  onlineMobile: number;
  offlinePreviouslyActive: number;
  neverSignedIn: number;
  activeToday: number;
}

export interface AccountActivityItem {
  id: string;
  userCode: string;
  email: string | null;
  fullName: string;
  role: string;
  isActive: boolean;
  districtName: string | null;
  dsName: string | null;
  gnName: string | null;
  teamName: string | null;
  status: ActivityStatus;
  activeClients: ActivityClientType[];
  lastClientType: ActivityClientType | null;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  currentSessionStartedAt: string | null;
  currentSessionDurationSeconds: number | null;
  lastSessionStartedAt: string | null;
  lastSessionEndedAt: string | null;
  lastSessionDurationSeconds: number | null;
  todayActiveSeconds: number;
}

export interface AccountActivityListResponse {
  generatedAt: string;
  idleTimeoutSeconds: number;
  summary: AccountActivitySummary;
  items: AccountActivityItem[];
  total: number;
  page: number;
  limit: number;
}

export interface UserSessionHistoryItem {
  id: string;
  clientType: ActivityClientType;
  deviceId: string | null;
  startedAt: string;
  lastActiveAt: string;
  endedAt: string | null;
  effectiveEndedAt: string | null;
  endReason: string | null;
  isOnline: boolean;
  durationSeconds: number;
}

export interface AccountActivityDetailResponse {
  generatedAt: string;
  idleTimeoutSeconds: number;
  account: {
    id: string;
    userCode: string;
    email: string | null;
    fullName: string;
    role: string;
    isActive: boolean;
    districtName: string | null;
    dsName: string | null;
    gnName: string | null;
    teamName: string | null;
    status: ActivityStatus;
    activeClients: ActivityClientType[];
    lastLoginAt: string | null;
    lastActiveAt: string | null;
    currentSessionStartedAt: string | null;
    currentSessionDurationSeconds: number | null;
    lastSessionDurationSeconds: number | null;
    todayActiveSeconds: number;
  };
  sessions: UserSessionHistoryItem[];
}

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
      if (!this.getToken() && this.getRefreshToken()) {
        await this.refreshSession().catch(() => false);
      }
      await this.request('/v1/auth/logout', {
        method: 'POST',
      }, false);
    } catch {
      // Invariant: Silently handle network errors during sign-out
    } finally {
      this.clearSession();
    }
  }

  async sendHeartbeat(): Promise<{ ok: boolean; lastActiveAt?: string }> {
    return this.request<{ ok: boolean; lastActiveAt?: string }>(
      '/v1/auth/heartbeat',
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    );
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
    const res = await this.request<{ success: boolean; email: string }>('/v1/auth/email/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    const stored = this.getStoredUser();
    if (stored && res.email) {
      stored.email = res.email;
      localStorage.setItem('grs_auth_user', JSON.stringify(stored));
    }
    return res;
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

  async switchArea(gnId: string): Promise<SessionTokens> {
    const data = await this.request<SessionTokens>('/v1/auth/switch-area', {
      method: 'POST',
      body: JSON.stringify({ gnId }),
    });
    this.saveSession(data);
    return data;
  }

  async getAssignments(): Promise<{
    assignments: Array<{
      gnId: string;
      gnName?: string;
      gnCode?: string;
      teamId?: string;
      teamNo?: string;
      validFrom: string;
    }>;
  }> {
    return this.request('/v1/auth/assignments');
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

  async getAccounts(params: { cursor?: string; limit?: number; take?: number; search?: string; role?: string; teamId?: string; gnId?: string } = {}): Promise<any> {
    const p = new URLSearchParams();
    if (params.cursor) p.append('cursor', params.cursor);
    if (params.limit !== undefined) p.append('limit', params.limit.toString());
    if (params.take !== undefined) p.append('take', params.take.toString());
    if (params.search) p.append('search', params.search);
    if (params.role) p.append('role', params.role);
    if (params.teamId) p.append('teamId', params.teamId);
    if (params.gnId) p.append('gnId', params.gnId);
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

  async updateAccount(
    id: string,
    data: {
      fullName?: string;
      phoneE164?: string;
      teamId?: string | null;
      isActive?: boolean;
      preferredLanguage?: 'si' | 'ta' | 'en';
    },
  ): Promise<any> {
    return this.request(`/v1/accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteAccount(id: string): Promise<{ success: boolean; id: string }> {
    return this.request(`/v1/accounts/${id}`, { method: 'DELETE' });
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

  // --- ASSIGNMENT MANAGEMENT ---

  async getAccountAssignments(params: {
    profileId?: string;
    gnId?: string;
    dsId?: string;
    districtId?: string;
    status?: 'active' | 'all';
  } = {}): Promise<{ items: any[]; total: number }> {
    const p = new URLSearchParams();
    if (params.profileId) p.append('profileId', params.profileId);
    if (params.gnId) p.append('gnId', params.gnId);
    if (params.dsId) p.append('dsId', params.dsId);
    if (params.districtId) p.append('districtId', params.districtId);
    if (params.status) p.append('status', params.status);
    const q = p.toString() ? `?${p.toString()}` : '';
    return this.request(`/v1/accounts/assignments${q}`);
  }

  async getProfileAssignmentHistory(profileId: string): Promise<{ profileId: string; items: any[] }> {
    return this.request(`/v1/accounts/${profileId}/assignments`);
  }

  async assignAccount(
    profileId: string,
    territory: { districtId?: string; dsId?: string; gnId?: string; teamId?: string; note?: string },
  ): Promise<any> {
    return this.request(`/v1/accounts/${profileId}/assign`, {
      method: 'POST',
      body: JSON.stringify(territory),
    });
  }

  async endAccountAssignment(profileId: string, assignmentId?: string): Promise<any> {
    return this.request(`/v1/accounts/${profileId}/end-assignment`, {
      method: 'POST',
      ...(assignmentId ? { body: JSON.stringify({ assignmentId }) } : {}),
    });
  }

  async transferAccountAssignment(
    fromProfileId: string,
    dto: { toProfileId: string; assignmentId?: string; districtId?: string; dsId?: string; gnId?: string; teamId?: string; note?: string },
  ): Promise<any> {
    return this.request(`/v1/accounts/${fromProfileId}/transfer`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  async getAccountActivity(params?: {
    status?: 'all' | 'online' | 'offline' | 'never';
    role?: string;
    clientType?: 'all' | 'web' | 'mobile';
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<AccountActivityListResponse> {
    const search = new URLSearchParams();
    if (params?.status) search.set('status', params.status);
    if (params?.role) search.set('role', params.role);
    if (params?.clientType) search.set('clientType', params.clientType);
    if (params?.search) search.set('search', params.search);
    if (params?.page) search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));
    const qs = search.toString();
    return this.request<AccountActivityListResponse>(
      `/v1/accounts/activity${qs ? `?${qs}` : ''}`,
    );
  }

  async getAccountActivityDetail(
    profileId: string,
  ): Promise<AccountActivityDetailResponse> {
    return this.request<AccountActivityDetailResponse>(
      `/v1/accounts/${profileId}/activity`,
    );
  }

  // --- GEOGRAPHIC HIERARCHY & TEAMS (M5.3) ---

  private async fetchAllAreaItems(
    path: string,
    params: Record<string, string | undefined> = {},
  ): Promise<any[]> {
    const collected: any[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < 20; page++) {
      const search = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v) search.set(k, v);
      }
      search.set('limit', '100');
      if (cursor) search.set('cursor', cursor);

      const res = await this.request(`${path}?${search.toString()}`);
      if (Array.isArray(res)) {
        return res;
      }
      const items = res?.items || [];
      collected.push(...items);
      cursor = res?.nextCursor;
      if (!cursor || items.length < 100) {
        break;
      }
    }

    return collected;
  }

  async getDistricts(): Promise<any[]> {
    const res = await this.request('/v1/areas/districts');
    return Array.isArray(res) ? res : res.items || [];
  }

  async createDsDivision(data: {
    districtId: string;
    nameEn: string;
    nameSi?: string;
    nameTa?: string;
    sdoName?: string;
  }): Promise<any> {
    return this.request('/v1/areas/ds', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getDsDivisions(districtId?: string): Promise<any[]> {
    return this.fetchAllAreaItems('/v1/areas/ds', { districtId });
  }

  async updateDsDivision(
    id: string,
    data: { nameEn?: string; nameSi?: string; nameTa?: string; sdoName?: string },
  ): Promise<any> {
    return this.request(`/v1/areas/ds/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteDsDivision(id: string): Promise<{ success: boolean; id: string }> {
    return this.request(`/v1/areas/ds/${id}`, { method: 'DELETE' });
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
    gnNumber?: string;
    gnName?: string;
    secretaryName?: string;
    secretaryContact?: string;
    secretaryEmail?: string;
  }): Promise<any> {
    return this.request(`/v1/areas/gn/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteGnDivision(id: string): Promise<{ success: boolean; id: string }> {
    return this.request(`/v1/areas/gn/${id}`, { method: 'DELETE' });
  }

  async getGnDivisions(dsId?: string): Promise<any[]> {
    return this.fetchAllAreaItems('/v1/areas/gn', { dsId });
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
    return this.fetchAllAreaItems('/v1/areas/teams', { gnId });
  }

  async updateTeam(
    id: string,
    data: { teamNo?: number; maxMembers?: number; memberLimit?: number; leaderId?: string },
  ): Promise<any> {
    const payload: { teamNo?: number; maxMembers?: number; leaderId?: string } = {};
    if (data.teamNo !== undefined) {
      payload.teamNo = data.teamNo;
    }
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

  async deleteTeam(id: string): Promise<{ success: boolean; id: string }> {
    return this.request(`/v1/areas/teams/${id}`, { method: 'DELETE' });
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

  async getHouseholds(params: { gnId?: string; teamId?: string; search?: string; limit?: number; cursor?: string } = {}): Promise<any> {
    const p = new URLSearchParams();
    if (params.gnId) p.append('gnId', params.gnId);
    if (params.teamId) p.append('teamId', params.teamId);
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

  async updateHousehold(id: string, data: any): Promise<any> {
    return this.request(`/v1/houses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteHousehold(id: string, reason?: string): Promise<{ success: boolean; id: string }> {
    return this.request(`/v1/houses/${id}`, {
      method: 'DELETE',
      ...(reason ? { body: JSON.stringify({ reason }) } : {}),
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

  async reopenHousehold(houseId: string): Promise<any> {
    return this.request(`/v1/houses/${houseId}/reopen`, {
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

  async deleteClient(id: string, reason?: string): Promise<{ success: boolean; id: string }> {
    return this.request(`/v1/clients/${id}`, {
      method: 'DELETE',
      ...(reason ? { body: JSON.stringify({ reason }) } : {}),
    });
  }

  async getDuplicates(params: {
    status?: string;
    classification?: string;
    minScore?: number;
    districtId?: string;
    dsId?: string;
    gnId?: string;
    teamId?: string;
    cursor?: string;
    limit?: number;
  } = {}): Promise<any> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.classification) query.set('classification', params.classification);
    if (params.minScore !== undefined) query.set('minScore', String(params.minScore));
    if (params.districtId) query.set('districtId', params.districtId);
    if (params.dsId) query.set('dsId', params.dsId);
    if (params.gnId) query.set('gnId', params.gnId);
    if (params.teamId) query.set('teamId', params.teamId);
    if (params.cursor) query.set('cursor', params.cursor);
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    const qs = query.toString();
    return this.request(`/v1/duplicates${qs ? `?${qs}` : ''}`);
  }

  async confirmDuplicate(
    id: string,
    payload: { canonicalClientId?: string; reason?: string } = {},
  ): Promise<any> {
    return this.request(`/v1/duplicates/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async dismissDuplicate(
    id: string,
    payload: { reason?: string } = {},
  ): Promise<any> {
    return this.request(`/v1/duplicates/${id}/dismiss`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Exports & Reports (M7)
  async createExport(payload: {
    kind: 'progress' | 'clients' | 'beneficiaries' | 'interests' | 'duplicates';
    format?: 'xlsx' | 'csv';
    lang?: 'en' | 'si' | 'ta';
    filters?: {
      districtId?: string;
      dsId?: string;
      gnId?: string;
      teamId?: string;
      gender?: 'M' | 'F';
      status?: 'open' | 'confirmed' | 'dismissed';
      classification?: 'probable' | 'possible';
      includeDuplicates?: boolean;
      dateFrom?: string;
      dateTo?: string;
    };
    async?: boolean;
  }): Promise<any> {
    return this.request('/v1/exports', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async listExports(
    params: { cursor?: string; limit?: number } = {},
  ): Promise<{ items: any[]; nextCursor: string | null }> {
    const sp = new URLSearchParams();
    if (params.cursor) sp.set('cursor', params.cursor);
    if (params.limit !== undefined) sp.set('limit', String(params.limit));
    const q = sp.toString();
    return this.request(`/v1/exports${q ? `?${q}` : ''}`);
  }

  async getExportJob(id: string): Promise<any> {
    return this.request(`/v1/exports/${encodeURIComponent(id)}`);
  }

  async getReportPreview(params: {
    kind: 'progress' | 'beneficiaries' | 'interests' | 'duplicates';
    lang?: 'en' | 'si' | 'ta';
    districtId?: string;
    dsId?: string;
    gnId?: string;
    teamId?: string;
  }): Promise<any> {
    const sp = new URLSearchParams();
    sp.set('kind', params.kind);
    if (params.lang) sp.set('lang', params.lang);
    if (params.districtId) sp.set('districtId', params.districtId);
    if (params.dsId) sp.set('dsId', params.dsId);
    if (params.gnId) sp.set('gnId', params.gnId);
    if (params.teamId) sp.set('teamId', params.teamId);
    return this.request(`/v1/exports/preview?${sp.toString()}`);
  }
}

export const api = new ApiClient();

