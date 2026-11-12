import axios from 'axios';
import {
  User,
  AuthMessageResponse,
  RegisterRequest,
  SavedPipeline,
  ShareLink,
  SharedPipelineView,
  CreatePipelineRequest
} from '../types';
import { markTokensFresh, prepareRequest, refreshTokens, retryOn401 } from './tokenRefresh';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

// Auth is cookie-based (httpOnly): tokens live in cookies set by the backend and
// are never readable by JS. Send credentials on every request and echo the CSRF
// cookie back as a header on state-changing requests (double-submit-cookie).
axios.defaults.withCredentials = true;

// Shared with the `api` instance: proactive token refresh + CSRF header.
axios.interceptors.request.use(prepareRequest);

export const authService = {
  // Login — backend sets httpOnly cookies and returns the user record.
  async login(email: string, password: string): Promise<User> {
    const response = await axios.post<User>(`${API_BASE_URL}/auth/login`, {
      email,
      password,
    });
    markTokensFresh();
    return response.data;
  },

  // Register
  async register(data: RegisterRequest): Promise<User> {
    const response = await axios.post<User>(`${API_BASE_URL}/auth/register`, data);
    return response.data;
  },

  // Get current user (auth cookie sent automatically). Throws if not authenticated.
  async getCurrentUser(): Promise<User> {
    const response = await axios.get<User>(`${API_BASE_URL}/auth/me`);
    return response.data;
  },

  // Update user profile
  async updatePreferences(prefs: { ui_theme?: string; mode?: 'light' | 'dark' }): Promise<User> {
    const response = await axios.put<User>(`${API_BASE_URL}/auth/me/preferences`, prefs);
    return response.data;
  },

  async updateProfile(data: Partial<User>): Promise<User> {
    const response = await axios.put<User>(`${API_BASE_URL}/auth/me`, data);
    return response.data;
  },

  // Silently rotate tokens using the httpOnly refresh cookie.
  // Returns true on success, false if the refresh token is invalid/expired.
  refreshTokens(): Promise<boolean> {
    return refreshTokens();
  },

  // Password reset: always resolves with the same generic message (the
  // backend never reveals whether an account exists for the address).
  async forgotPassword(email: string): Promise<AuthMessageResponse> {
    const response = await axios.post<AuthMessageResponse>(`${API_BASE_URL}/auth/forgot-password`, { email });
    return response.data;
  },

  // Set a new password with the token from the emailed link.
  async resetPassword(token: string, newPassword: string): Promise<AuthMessageResponse> {
    const response = await axios.post<AuthMessageResponse>(`${API_BASE_URL}/auth/reset-password`, {
      token,
      new_password: newPassword,
    });
    return response.data;
  },

  // Confirm the email address with the token from the emailed link.
  async verifyEmail(token: string): Promise<AuthMessageResponse> {
    const response = await axios.post<AuthMessageResponse>(`${API_BASE_URL}/auth/verify-email`, { token });
    return response.data;
  },

  // Signed in: email a fresh verification link.
  async resendVerification(): Promise<AuthMessageResponse> {
    const response = await axios.post<AuthMessageResponse>(`${API_BASE_URL}/auth/resend-verification`);
    return response.data;
  },

  // Logout: backend clears the cookies and cleans up session data.
  async logout(sessionId: string) {
    try {
      const formData = new FormData();
      if (sessionId) formData.append('session_id', sessionId);
      await axios.post(`${API_BASE_URL}/auth/logout`, formData);
    } catch (error) {
      console.error('Logout cleanup error:', error);
      // Continue with client-side logout even if backend fails
    }
  },
};

// Pipeline service — auth travels in the httpOnly cookie (withCredentials default).
export const pipelineService = {
  // Get user's pipelines
  async getUserPipelines(category?: string): Promise<SavedPipeline[]> {
    const params = category ? { category } : {};
    const response = await axios.get<SavedPipeline[]>(`${API_BASE_URL}/pipelines/`, { params });
    return response.data;
  },

  // Get public pipelines
  async getPublicPipelines(category?: string): Promise<SavedPipeline[]> {
    const params = category ? { category } : {};
    const response = await axios.get<SavedPipeline[]>(`${API_BASE_URL}/pipelines/public`, {
      params,
    });
    return response.data;
  },

  // Get specific pipeline
  async getPipeline(id: number): Promise<SavedPipeline> {
    const response = await axios.get<SavedPipeline>(`${API_BASE_URL}/pipelines/${id}`);
    return response.data;
  },

  // Create pipeline
  async createPipeline(data: CreatePipelineRequest): Promise<SavedPipeline> {
    const response = await axios.post<SavedPipeline>(`${API_BASE_URL}/pipelines/`, data);
    return response.data;
  },

  // Update pipeline
  async updatePipeline(id: number, data: Partial<CreatePipelineRequest>): Promise<SavedPipeline> {
    const response = await axios.put<SavedPipeline>(`${API_BASE_URL}/pipelines/${id}`, data);
    return response.data;
  },

  // Delete pipeline
  async deletePipeline(id: number): Promise<void> {
    await axios.delete(`${API_BASE_URL}/pipelines/${id}`);
  },

  // Share by link
  async getShareLink(id: number): Promise<ShareLink | null> {
    const response = await axios.get<{ share: ShareLink | null }>(`${API_BASE_URL}/pipelines/${id}/share`);
    return response.data.share;
  },

  async createShareLink(id: number): Promise<ShareLink> {
    const response = await axios.post<{ share: ShareLink }>(`${API_BASE_URL}/pipelines/${id}/share`);
    return response.data.share;
  },

  async deleteShareLink(id: number): Promise<void> {
    await axios.delete(`${API_BASE_URL}/pipelines/${id}/share`);
  },

  /** Public: open a shared pipeline (no account needed). */
  async getSharedPipeline(token: string): Promise<SharedPipelineView> {
    const response = await axios.get<SharedPipelineView>(`${API_BASE_URL}/pipelines/shared/${encodeURIComponent(token)}`);
    return response.data;
  },

  // Duplicate pipeline
  async duplicatePipeline(id: number, newName: string): Promise<SavedPipeline> {
    const response = await axios.post<SavedPipeline>(
      `${API_BASE_URL}/pipelines/${id}/duplicate`,
      null,
      { params: { new_name: newName } }
    );
    return response.data;
  },
};

// Track whether a refresh is already in-flight to avoid parallel refresh storms.
// On 401: refresh once (single-flight, shared with the api instance) and retry.
axios.interceptors.response.use((response) => response, retryOn401((config) => axios(config)));
