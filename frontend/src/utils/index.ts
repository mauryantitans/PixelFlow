import { MasonryItem, ZoomState } from '../types';

/**
 * Session Management Utilities
 */
export class SessionUtils {
  private static readonly SESSION_KEY = 'pixelflow_session_id';
  // Who the current browser session belongs to: 'guest' or a user id.
  private static readonly OWNER_KEY = 'pixelflow_session_owner';
  // Last session id of each account used in this browser, so signing back in
  // restores that account's images. Safe to keep: the server only serves a
  // user's session to that user.
  private static readonly USER_SESSIONS_KEY = 'pixelflow_user_sessions';
  /** Fired on window when the session id changes (useSession listens). */
  static readonly CHANGE_EVENT = 'pixelflow:session-changed';

  private static read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private static write(key: string, value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* storage unavailable (private mode): keep working in memory */
    }
  }

  private static memoryId: string | null = null;

  static getSessionId(): string {
    let sessionId = this.read(this.SESSION_KEY) || this.memoryId;
    if (!sessionId) {
      sessionId = this.generateSessionId();
      this.write(this.SESSION_KEY, sessionId);
    }
    this.memoryId = sessionId;
    return sessionId;
  }
  
  static generateSessionId(): string {
    // Unguessable id — guest data isolation relies on it not being predictable.
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `session_${crypto.randomUUID()}`;
    }
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return `session_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }

  private static setSessionId(id: string): void {
    this.memoryId = id;
    this.write(this.SESSION_KEY, id);
    window.dispatchEvent(new Event(this.CHANGE_EVENT));
  }

  /**
   * Switch to a brand-new session id, e.g. when the server says the current
   * one belongs to a different account. The recorded owner is kept unless one
   * is given (signing out passes 'guest').
   */
  static startNewSession(owner?: string): string {
    const id = this.generateSessionId();
    if (owner) this.write(this.OWNER_KEY, owner);
    this.setSessionId(id);
    return id;
  }

  /**
   * Keep the browser session in step with who is signed in, so images never
   * leak between people sharing a browser:
   *  - signing out: the account's session is remembered and a fresh guest
   *    session starts;
   *  - signing in: the account's previous session in this browser is restored;
   *    a guest session (no previous one) is kept, so guest work carries over;
   *  - switching accounts: never reuses the other account's session.
   */
  static syncWithUser(userId: number | null): void {
    const owner = this.read(this.OWNER_KEY) || 'guest';
    const next = userId === null ? 'guest' : String(userId);
    if (owner === next) return;

    let map: Record<string, string> = {};
    try {
      map = JSON.parse(this.read(this.USER_SESSIONS_KEY) || '{}');
    } catch {
      map = {};
    }
    const current = this.getSessionId();
    if (owner !== 'guest') map[owner] = current;

    if (next === 'guest') {
      this.write(this.USER_SESSIONS_KEY, JSON.stringify(map));
      this.startNewSession('guest');
      return;
    }

    this.write(this.OWNER_KEY, next);
    if (owner === 'guest' && !map[next]) {
      // Guest work becomes the account's (the server links it on next activity).
      map[next] = current;
      this.write(this.USER_SESSIONS_KEY, JSON.stringify(map));
      return;
    }
    const restored = map[next] || this.generateSessionId();
    map[next] = restored;
    this.write(this.USER_SESSIONS_KEY, JSON.stringify(map));
    if (restored !== current) this.setSessionId(restored);
  }

  static clearSession(): void {
    this.memoryId = null;
    this.write(this.SESSION_KEY, null);
  }
}

/**
 * Theme Management Utilities
 */
export class ThemeUtils {
  private static readonly THEME_KEY = 'pixelflow_theme';
  
  static getTheme(): 'light' | 'dark' {
    const saved = localStorage.getItem(this.THEME_KEY) as 'light' | 'dark';
    if (saved) return saved;
    
    // Default to system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  
  static setTheme(theme: 'light' | 'dark'): void {
    localStorage.setItem(this.THEME_KEY, theme);
    
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
  
  static toggleTheme(): 'light' | 'dark' {
    const current = this.getTheme();
    const newTheme = current === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme);
    return newTheme;
  }
}

/**
 * Masonry Layout Utilities
 */
export class MasonryUtils {
  static calculateLayout(
    items: HTMLElement[],
    containerWidth: number,
    columnWidth: number = 150,
    gap: number = 16
  ): MasonryItem[] {
    if (!items.length || containerWidth === 0) return [];
    
    const numColumns = Math.max(1, Math.floor((containerWidth + gap) / (columnWidth + gap)));
    const totalContentWidth = numColumns * (columnWidth + gap) - gap;
    const initialOffset = (containerWidth - totalContentWidth) / 2;
    
    const columnHeights = Array(numColumns).fill(0);
    const layoutItems: MasonryItem[] = [];
    
    items.forEach((element, index) => {
      // Set width first
      element.style.width = `${columnWidth}px`;
      
      // Find shortest column
      const shortestColumnIndex = columnHeights.indexOf(Math.min(...columnHeights));
      
      // Calculate position
      const x = initialOffset + shortestColumnIndex * (columnWidth + gap);
      const y = columnHeights[shortestColumnIndex];
      
      // Apply position
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
      element.style.position = 'absolute';
      
      // Update column height
      columnHeights[shortestColumnIndex] += element.offsetHeight + gap;
      
      layoutItems.push({
        id: element.dataset.id || `item-${index}`,
        element,
        width: columnWidth,
        height: element.offsetHeight,
        x,
        y
      });
    });
    
    return layoutItems;
  }
  
  static applyLayout(
    container: HTMLElement,
    items: HTMLElement[],
    columnWidth: number = 150,
    gap: number = 16
  ): void {
    if (!container || !items.length) return;
    
    const containerWidth = container.offsetWidth;
    const layoutItems = this.calculateLayout(items, containerWidth, columnWidth, gap);
    
    // Set container height
    const maxHeight = Math.max(...layoutItems.map(item => item.y + item.height));
    container.style.height = `${maxHeight}px`;
    container.style.position = 'relative';
  }
}

/**
 * Zoom and Pan Utilities
 */
export class ZoomPanUtils {
  static setupZoomPan(
    container: HTMLElement,
    image: HTMLElement,
    controls?: HTMLElement
  ): () => void {
    let state: ZoomState = {
      scale: 1,
      x: 0,
      y: 0,
      isDragging: false
    };
    
    let startPoint = { x: 0, y: 0 };
    
    const setTransform = (transition = true) => {
      image.style.transition = transition ? 'transform 0.1s ease-out' : 'none';
      image.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
      image.style.transformOrigin = '0 0';
      
      container.classList.toggle('is-zoomable', state.scale > 1);
      
      if (controls) {
        const levelEl = controls.querySelector('[data-zoom="level"]');
        if (levelEl) {
          levelEl.textContent = `${Math.round(state.scale * 100)}%`;
        }
      }
    };
    
    const resetZoom = () => {
      state = { scale: 1, x: 0, y: 0, isDragging: false };
      setTransform();
      container.classList.remove('is-zoomable', 'is-panning');
    };
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      const rect = image.getBoundingClientRect();
      const oldScale = state.scale;
      const delta = e.deltaY > 0 ? -1 : 1;
      
      let newScale = oldScale * (1 + delta * 0.2);
      newScale = Math.min(Math.max(1, newScale), 10);
      
      if (Math.abs(newScale - oldScale) < 0.01) return;
      
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const scaleRatio = newScale / oldScale;
      
      state.x -= x * (scaleRatio - 1);
      state.y -= y * (scaleRatio - 1);
      state.scale = newScale;
      
      if (state.scale === 1) {
        state.x = 0;
        state.y = 0;
      }
      
      setTransform();
    };
    
    const handleMouseDown = (e: MouseEvent) => {
      if (state.scale <= 1 || e.button !== 0) return;
      
      e.preventDefault();
      startPoint = { x: e.clientX - state.x, y: e.clientY - state.y };
      state.isDragging = true;
      container.classList.add('is-panning');
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!state.isDragging) return;
      
      e.preventDefault();
      state.x = e.clientX - startPoint.x;
      state.y = e.clientY - startPoint.y;
      setTransform(false);
    };
    
    const handleMouseUp = () => {
      state.isDragging = false;
      container.classList.remove('is-panning');
    };
    
    const handleControlClick = (e: Event) => {
      const button = (e.target as HTMLElement).closest('button');
      if (!button) return;
      
      const action = button.dataset.zoom;
      if (action === 'reset') {
        resetZoom();
        return;
      }
      
      const rect = image.getBoundingClientRect();
      const oldScale = state.scale;
      
      let newScale: number;
      if (action === 'in') newScale = oldScale * 1.5;
      else if (action === 'out') newScale = oldScale / 1.5;
      else return;
      
      newScale = Math.min(Math.max(1, newScale), 10);
      if (Math.abs(newScale - oldScale) < 0.01) return;
      
      const x = rect.width / 2;
      const y = rect.height / 2;
      const scaleRatio = newScale / oldScale;
      
      state.x -= x * (scaleRatio - 1);
      state.y -= y * (scaleRatio - 1);
      state.scale = newScale;
      
      if (state.scale === 1) {
        state.x = 0;
        state.y = 0;
      }
      
      setTransform();
    };
    
    // Add event listeners
    container.addEventListener('wheel', handleWheel);
    container.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseleave', handleMouseUp);
    
    if (controls) {
      controls.addEventListener('click', handleControlClick);
    }
    
    // Return cleanup function
    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseUp);
      
      if (controls) {
        controls.removeEventListener('click', handleControlClick);
      }
    };
  }
}

/**
 * File Utilities
 */
export class FileUtils {
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  static getFileExtension(filename: string): string {
    return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
  }
  
  static isImageFile(file: File): boolean {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/tiff'];
    return allowedTypes.includes(file.type);
  }
  
  static fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result && typeof e.target.result === 'string') {
          resolve(e.target.result);
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = () => reject(new Error('Error reading file'));
      reader.readAsDataURL(file);
    });
  }
}

/**
 * Debounce Utility
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle Utility
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Array Utilities
 */
export class ArrayUtils {
  static moveItem<T>(array: T[], fromIndex: number, toIndex: number): T[] {
    const result = [...array];
    const [removed] = result.splice(fromIndex, 1);
    result.splice(toIndex, 0, removed);
    return result;
  }
  
  static removeItem<T>(array: T[], index: number): T[] {
    return array.filter((_, i) => i !== index);
  }
  
  static toggleItem<T>(array: T[], item: T): T[] {
    const index = array.indexOf(item);
    if (index === -1) {
      return [...array, item];
    } else {
      return array.filter((_, i) => i !== index);
    }
  }
}

/**
 * DOM Utilities
 */
export class DOMUtils {
  static getElementDimensions(element: HTMLElement): { width: number; height: number } {
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height
    };
  }
  
  static isElementInViewport(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }
  
  static scrollToElement(element: HTMLElement, behavior: 'auto' | 'smooth' = 'smooth'): void {
    element.scrollIntoView({ behavior });
  }
}

/**
 * Color Utilities
 */
export class ColorUtils {
  static hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }
  
  static rgbToHex(r: number, g: number, b: number): string {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
}

/**
 * Validation Utilities
 */
export class ValidationUtils {
  static isValidEmail(email: string): boolean {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }
  
  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  
  static sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-z0-9.-]/gi, '_').toLowerCase();
  }
}
