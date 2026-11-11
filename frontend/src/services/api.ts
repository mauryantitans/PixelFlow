import axios, { AxiosResponse } from 'axios';
import {
  ImageData,
  ProcessRequest,
  LiveProcessRequest,
  ProcessResponse,
  LiveProcessResponse,
  UploadResponse,
  MultipleUploadResponse,
  OperationSchema
} from '../types';

// Read a cookie value by name (used for the CSRF double-submit token).
export function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

const UNSAFE_METHODS = ['post', 'put', 'delete', 'patch'];

// Create axios instance with base configuration.
// withCredentials sends the httpOnly auth cookies on every request.
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000/api',
  timeout: 30000, // 30 second timeout
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: echo the CSRF cookie back as a header on state-changing
// requests (double-submit-cookie CSRF protection; the backend verifies the match).
api.interceptors.request.use((config) => {
  if (config.method && UNSAFE_METHODS.includes(config.method.toLowerCase())) {
    const csrf = getCookie('pf_csrf');
    if (csrf) {
      config.headers = config.headers ?? {};
      (config.headers as any)['X-CSRF-Token'] = csrf;
    }
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
);

export class ApiService {
  /**
   * Upload a single image
   */
  static async uploadImage(file: File, sessionId: string): Promise<UploadResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('session_id', sessionId);

      // Auth travels in the httpOnly cookie (sent via withCredentials).
      const response: AxiosResponse<UploadResponse> = await api.post('/images/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      return response.data;
    } catch (error: any) {
      console.error('Upload error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Upload multiple images
   */
  static async uploadMultipleImages(files: File[], sessionId: string): Promise<MultipleUploadResponse> {
    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });
      formData.append('session_id', sessionId);

      // Auth travels in the httpOnly cookie (sent via withCredentials), so
      // authenticated users get their quota, not guest quota.
      const response: AxiosResponse<MultipleUploadResponse> = await api.post('/images/upload-multiple', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  /**
   * Process images through pipeline (batch mode)
   */
  static async processImages(request: ProcessRequest): Promise<ProcessResponse> {
    try {
      const response: AxiosResponse<ProcessResponse> = await api.post('/processing/process', request);
      return response.data;
    } catch (error: any) {
      console.error('Process error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Process single image with live updates
   */
  static async processLive(
    request: LiveProcessRequest,
    signal?: AbortSignal
  ): Promise<LiveProcessResponse> {
    try {
      const response: AxiosResponse<LiveProcessResponse> = await api.post(
        '/processing/process-live',
        request,
        { signal }
      );
      return response.data;
    } catch (error: any) {
      // Let cancellations propagate raw so the caller can ignore them quietly.
      if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError') {
        throw error;
      }
      console.error('Live process error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Get available operations (legacy flat list of labels).
   */
  static async getOperations(): Promise<Record<string, any>> {
    try {
      const response = await api.get('/processing/operations');
      return response.data.operations;
    } catch (error: any) {
      console.error('Get operations error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Get the full operation schema (categories → subcategories → typed params).
   * This is the source of truth for schema-driven UI rendering.
   */
  static async getOperationsSchema(): Promise<OperationSchema> {
    const response = await api.get('/processing/operations');
    return response.data as OperationSchema;
  }

  /**
   * Get all images for a session (from database)
   */
  static async getSessionImages(sessionId: string): Promise<ImageData[]> {
    try {
      const response = await api.get(`/images/session/${sessionId}/images?include_data=true`);
      
      if (response.data.success) {
        return response.data.images.map((img: any) => ({
          id: img.id,
          filename: img.filename,
          file_path: img.file_path,
          session_id: img.session_id,
          size_bytes: img.size_bytes,
          width: img.width,
          height: img.height,
          format: img.format,
          dataUrl: img.image,  // Full image as base64 data URL
          thumbnailDataUrl: img.thumbnail,  // Thumbnail as base64 data URL
          selected: false  // Default to not selected
        }));
      }
      
      return [];
    } catch (error: any) {
      console.error('Get session images error:', error);
      // Return empty array if session doesn't exist yet
      if (error.response?.status === 404) {
        return [];
      }
      throw this.handleError(error);
    }
  }

  /**
   * Clean up session files
   */
  static async cleanupSession(sessionId: string): Promise<void> {
    try {
      await api.post('/images/cleanup-session', { session_id: sessionId });
    } catch (error: any) {
      console.error('Cleanup error:', error);
      // Don't throw error for cleanup failures
    }
  }

  /**
   * Get session statistics (for debugging)
   */
  static async getSessionStats(): Promise<any> {
    try {
      const response = await api.get('/images/session-stats');
      return response.data.stats;
    } catch (error: any) {
      console.error('Session stats error:', error);
      return null;
    }
  }

  /**
   * Health check
   */
  static async healthCheck(): Promise<boolean> {
    try {
      const response = await api.get('/processing/health');
      return response.data.success;
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle API errors and convert to standard format
   */
  /**
   * Turn an axios error into an Error with a readable message, keeping the
   * HTTP status and response so callers can react to specific cases (quota
   * popups check `response.status === 507` / the 400 "Image limit reached"
   * detail; a 403/409 on the session starts a new one). FastAPI puts the
   * reason in `detail` (a string, or an object with `message`/`error`).
   */
  private static handleError(error: any): Error {
    let err: any;
    if (error.response) {
      const data = error.response.data;
      const detail = data?.detail;
      const message =
        (typeof detail === 'string' && detail) ||
        (detail && typeof detail === 'object' && (detail.message || detail.error)) ||
        data?.message ||
        data?.error ||
        `HTTP ${error.response.status}: ${error.response.statusText}`;
      err = new Error(message);
      err.status = error.response.status;
      err.response = error.response;
      err.code = detail && typeof detail === 'object' ? detail.error : undefined;
    } else if (error.request) {
      err = new Error('Network error: Unable to connect to server');
      err.isNetworkError = true;
    } else {
      err = new Error(error.message || 'An unexpected error occurred');
    }
    return err;
  }

  /**
   * Send cleanup beacon when page is closing (for reliable cleanup)
   */
  static sendCleanupBeacon(sessionId: string): void {
    try {
      const url = `${process.env.REACT_APP_API_URL || 'http://localhost:8000/api'}/images/cleanup-session`;
      
      if (navigator.sendBeacon) {
        // Create JSON blob instead of FormData
        const blob = new Blob(
          [JSON.stringify({ session_id: sessionId })],
          { type: 'application/json' }
        );
        navigator.sendBeacon(url, blob);
      }
    } catch (error) {
      console.error('Beacon cleanup error:', error);
      // Silently fail - this is a best-effort cleanup
    }
  }

  /**
   * Validate file before upload
   */
  static validateFile(file: File): { isValid: boolean; error?: string } {
    const maxSize = 50 * 1024 * 1024; // 50MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/tiff'];

    if (file.size > maxSize) {
      return { isValid: false, error: 'File is too large. Maximum size is 50MB.' };
    }

    if (!allowedTypes.includes(file.type)) {
      return { isValid: false, error: 'File type not supported. Please use JPEG, PNG, BMP, or TIFF.' };
    }

    return { isValid: true };
  }

  /**
   * Validate multiple files
   */
  static validateFiles(files: File[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const maxFiles = 20;

    if (files.length > maxFiles) {
      errors.push(`Too many files. Maximum ${maxFiles} files allowed.`);
    }

    files.forEach((file, index) => {
      const validation = this.validateFile(file);
      if (!validation.isValid) {
        errors.push(`File ${index + 1} (${file.name}): ${validation.error}`);
      }
    });

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Convert File to base64 string (for compatibility with legacy code if needed)
   */
  static fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result && typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = () => reject(new Error('Error reading file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Download processed image
   */
  static downloadImage(dataUrl: string, filename: string): void {
    try {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download error:', error);
      throw new Error('Failed to download image');
    }
  }

  /**
   * Generate a unique, unguessable session ID (guest data isolation relies on it).
   */
  static generateSessionId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `session_${crypto.randomUUID()}`;
    }
    // Fallback for older browsers: 16 random bytes hex.
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return `session_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
}

export default ApiService;