// Image related types
export interface ImageData {
  id: string;
  filename: string;
  file_path: string;
  thumbnail_path?: string;
  session_id: string;
  size_bytes: number;
  width: number;
  height: number;
  format: string;
  selected?: boolean;
  file?: File;
  dataUrl?: string;
  thumbnailDataUrl?: string;
}

// Pipeline related types
export interface PipelineStep {
  id: string;
  name: string;
  params: Record<string, any>;
  /** false = switched off: the step is kept but passes the image through. */
  enabled?: boolean;
  lastProcessingTime?: number; // Add individual step timing
}

// ---- Dynamic operation schema (GET /processing/operations, Phase 2/3) ----
// The backend registry is the single source of truth; the frontend fetches
// these DTOs from /processing/operations and renders controls from them.
export type ParamType =
  | 'int'
  | 'float'
  | 'odd_kernel'
  | 'angle'
  | 'enum'
  | 'bool'
  | 'color'
  | 'point'
  | 'points'
  | 'rect'
  | 'matrix'
  | 'text'
  | 'steps';

export interface ParamSpecDTO {
  name: string;
  label: string;
  type: ParamType;
  default: any;
  help?: string;
  advanced?: boolean;
  // numeric (int / float / odd_kernel / angle)
  min?: number;
  max?: number;
  step?: number;
  // enum
  options?: Array<{ value: string; label: string }>;
  // coordinate (point / points / rect)
  space?: 'normalized' | 'pixel';
  min_points?: number;
  max_points?: number | null;
  // matrix (custom kernels)
  min_size?: number;
  max_size?: number;
  value_min?: number;
  value_max?: number;
  presets?: Array<{ label: string; value: number[][] }>;
  // text / steps
  max_length?: number;
  /** A formula: monospace field, no spell-check or auto-capitalization. */
  code?: boolean;
  max_steps?: number;
}

export interface OperationSpecDTO {
  id: string;
  label: string;
  category: string;
  subcategory: string | null;
  description: string;
  interactive: boolean;
  /** Executable but not listed in the palette (e.g. Custom Filter). */
  hidden?: boolean;
  /** Starting points for the whole step; choosing one sets these params. */
  presets?: OperationPresetDTO[];
  params: ParamSpecDTO[];
}

export interface OperationPresetDTO {
  label: string;
  params: Record<string, any>;
}

export interface OperationSchema {
  version: string;
  categories: Array<{
    name: string;
    subcategories: Array<{ name: string | null; operations: OperationSpecDTO[] }>;
  }>;
}

export interface StepErrorDTO {
  op: string;
  kind: string;
  message: string;
  param_errors: Array<{ param: string; message: string }>;
}

export interface ProcessingTiming {
  step_name: string;
  duration: number; // in seconds
  step_index: number;
}

// API request/response types
export interface ProcessRequest {
  image_ids: string[];
  pipeline: Array<{
    name: string;
    params: Record<string, number | string | boolean>;
  }>;
  session_id: string;
}

export interface LiveProcessRequest {
  image_id: string;
  pipeline: Array<{
    name: string;
    params: Record<string, number | string | boolean>;
  }>;
  session_id: string;
}

export interface ProcessResponse {
  success: boolean;
  processed_images: string[];
  intermediate_results?: string[][];
  total_time: number;
  step_timings: ProcessingTiming[];
  step_errors?: Array<Array<StepErrorDTO | null> | null> | null;
  message: string;
}

export interface LiveProcessResponse {
  success: boolean;
  results: string[];
  total_time: number;
  step_timings: ProcessingTiming[];
  step_errors?: Array<StepErrorDTO | null> | null;
  message: string;
}

export interface UploadResponse {
  success: boolean;
  image?: ImageData;
  thumbnail?: string;
  message: string;
}

export interface MultipleUploadResponse {
  success: boolean;
  uploaded_count: number;
  failed_count: number;
  uploaded_images: Array<{
    image: ImageData;
    thumbnail: string;
  }>;
  failed_uploads: Array<{
    filename: string;
    error: string;
  }>;
  message: string;
}

// UI State types
export interface UIState {
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  liveProcessingEnabled: boolean;
  currentView: 'grid' | 'inspector' | 'live';
  inspectorView: 'normal' | 'side-by-side' | 'slider' | 'diff';
  selectedImages: string[];
  selectedResult: ProcessedResult | null;
  viewingStepIndex: number; // -1 for final result
}

export interface ProcessedResult {
  id: string;
  originalUrl: string;
  processedUrl: string;
  intermediateResults?: string[];
  totalTime?: number; // Add timing
  stepTimings?: ProcessingTiming[]; // Add step timings
}


// Status types
export type StatusType = 'info' | 'processing' | 'success' | 'error' | 'warning';

export interface StatusMessage {
  text: string;
  type: StatusType;
  persistent?: boolean;
}

// Modal types
export interface ModalState {
  galleryOpen: boolean;
  lightboxOpen: boolean;
  lightboxImages: string[];
  lightboxIndex: number;
}

// Zoom/Pan types
export interface ZoomState {
  scale: number;
  x: number;
  y: number;
  isDragging: boolean;
}

// Session types
export interface SessionInfo {
  id: string;
  createdAt: Date;
  lastActivity: Date;
}

// API Error types
export interface APIError {
  success: false;
  error: string;
  message: string;
}

// Masonry layout types
export interface MasonryItem {
  id: string;
  element: HTMLElement;
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface MasonryOptions {
  columnWidth: number;
  gap: number;
  containerWidth: number;
}

// Event types for custom hooks
export interface ImageUploadEvent {
  files: FileList;
  sessionId: string;
}

export interface PipelineChangeEvent {
  pipeline: PipelineStep[];
  sessionId: string;
}

export interface ParameterChangeEvent {
  stepId: string;
  paramName: string;
  value: number | string | boolean;
}

// Component props types
export interface BaseComponentProps {
  className?: string;
  children?: React.ReactNode;
}

export interface ButtonProps extends BaseComponentProps {
  variant?: 'primary' | 'secondary' | 'sm';
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export interface SliderProps {
  min: number;
  max: number;
  value: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
}

export interface SelectProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

// File validation types
export interface FileValidation {
  maxSize: number; // in bytes
  allowedTypes: string[];
  maxFiles: number;
}

// Cache types for live processing
export interface ProcessingCache {
  pipelineHash: string;
  results: string[];
  timestamp: number;
}

// Constants
export const SUPPORTED_IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff'];
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_FILES = 20;
export const THUMBNAIL_SIZE = { width: 150, height: 150 };
export const MASONRY_COLUMN_WIDTH = 150;
export const MASONRY_GAP = 16;
export const DEBOUNCE_DELAY = 500;
export const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
export const CACHE_EXPIRY = 10 * 60 * 1000; // 10 minutes

// Authentication types
export interface User {
  id: number;
  email: string;
  username: string;
  full_name?: string;
  is_active: boolean;
  is_admin: boolean;
  profile_picture?: string;  // OAuth profile picture URL
  email_verified?: boolean;  // false until the emailed link is opened (Google sign-ins are verified)
  /** Saved to the account so the appearance follows the user to other browsers. */
  preferences?: { ui_theme?: string; mode?: 'light' | 'dark' } | null;
  created_at: string;
}

/** Response of the password-reset / email-verification endpoints. */
export interface AuthMessageResponse {
  success: boolean;
  message: string;
  email?: string;
  already_verified?: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  full_name?: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
}

// Saved Pipeline types
export interface SavedPipeline {
  id: number;
  user_id: number;
  name: string;
  description?: string;
  pipeline_data: Array<{
    name: string;
    params: Record<string, any>;
    enabled?: boolean;
  }>;
  is_public: boolean;
  is_template: boolean;
  category?: string;
  tags?: string[];
  thumbnail_data?: string;
  usage_count: number;
  created_at: string;
  updated_at?: string;
}

export interface CreatePipelineRequest {
  name: string;
  description?: string;
  pipeline_data: Array<{
    name: string;
    params: Record<string, any>;
    enabled?: boolean;
  }>;
  is_public?: boolean;
  category?: string;
  tags?: string[];
  thumbnail_data?: string;
}

/** A pipeline's share link (GET/POST /pipelines/{id}/share). */
export interface ShareLink {
  token: string;
  /** Frontend path, e.g. /p/abc123 */
  path: string;
  view_count: number;
}

/** What anyone with a share link sees (GET /pipelines/shared/{token}). */
export interface SharedPipelineView {
  name: string;
  description?: string | null;
  pipeline_data: Array<{ name: string; params: Record<string, any>; enabled?: boolean }>;
  author?: string | null;
  created_at?: string | null;
  view_count: number;
}

/** A background batch run (POST/GET /processing/jobs). */
export interface BatchJob {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  total: number;
  completed: number;
  results: Array<{
    image_id: string;
    status: 'done' | 'skipped' | 'failed';
    error?: string | null;
    total_time?: number | null;
    step_timings?: ProcessingTiming[] | null;
    step_errors?: Array<StepErrorDTO | null> | null;
  }>;
  error?: string | null;
}
