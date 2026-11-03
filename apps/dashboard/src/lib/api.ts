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

const DEFAULT_API_URL = '';

export class ApiClient {
  private baseUrl: string;
  private refreshPromise: Promise<boolean> | null = null;

  constructor() {
    this.baseUrl =
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      (typeof window !== 'undefined' && window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : DEFAULT_API_URL);
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('grs_access_token');
  }

  private getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('grs_refresh_token');
  }

  public saveSession(tokens: SessionTokens) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('grs_access_token', tokens.accessToken);
    localStorage.setItem('grs_refresh_token', tokens.refreshToken);
    localStorage.setItem('grs_user', JSON.stringify(tokens.user));
  }

  public clearSession() {
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
    const token = this.getToken();

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Client-Type': 'web',
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
            throw new Error('Session expired. Please sign in again.');
          }
        }
      }

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errData = await response.json();
          errMessage = errData.message || errData.error || errMessage;
        } catch { }
        throw new Error(errMessage);
      }

      return (await response.json()) as T;
    } catch (err: any) {
      throw new Error(err.message || 'Network error communicating with GRS servers.');
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

  async changePassword(currentPassword: string, newPassword: string): Promise<SessionTokens> {
    const data = await this.request<SessionTokens>('/v1/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    this.saveSession(data);
    return data;
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
          },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.accessToken) localStorage.setItem('grs_access_token', data.accessToken);
          if (data.refreshToken) localStorage.setItem('grs_refresh_token', data.refreshToken);
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

  async getDsDivisions(districtId?: string): Promise<any[]> {
    const p = districtId ? `?districtId=${districtId}` : '';
    const res = await this.request(`/v1/areas/ds${p}`);
    return Array.isArray(res) ? res : res.items || [];
  }

  async getGnDivisions(dsId?: string): Promise<any[]> {
    const p = dsId ? `?dsId=${dsId}` : '';
    const res = await this.request(`/v1/areas/gn${p}`);
    return Array.isArray(res) ? res : res.items || [];
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

  async getHouseholds(params: { gnId?: string; search?: string; limit?: number } = {}): Promise<any> {
    const p = new URLSearchParams();
    if (params.gnId) p.append('gnId', params.gnId);
    if (params.search) p.append('search', params.search);
    if (params.limit) p.append('limit', params.limit.toString());
    const q = p.toString() ? `?${p.toString()}` : '';
    return this.request(`/v1/houses${q}`);
  }

  async createHousehold(data: any): Promise<any> {
    return this.request('/v1/houses', {
      method: 'POST',
      body: JSON.stringify(data),
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
    const token = this.getToken();
    const res = await fetch(`${this.baseUrl}/v1/imports/${batchId}/errors`, {
      headers: {
        'X-Client-Type': 'web',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) throw new Error('Failed to download error report');
    return res.text();
  }

  // --- RECORDS & SUPERVISOR AUDIT (M5.5) & ONLINE ENTRY (M5.8) ---

  async getClients(params: { teamId?: string; search?: string; limit?: number; cursor?: string } = {}): Promise<any> {
    const p = new URLSearchParams();
    if (params.teamId) p.append('teamId', params.teamId);
    if (params.search) p.append('search', params.search);
    if (params.limit) p.append('limit', params.limit.toString());
    if (params.cursor) p.append('cursor', params.cursor);
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

