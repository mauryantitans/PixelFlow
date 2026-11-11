import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  ImageData, 
  PipelineStep, 
  StatusMessage, 
  ProcessedResult, 
  UIState,
  ProcessingCache,
  ProcessingTiming,
  StepErrorDTO,
} from '../types';
import { ApiService, getCookie } from '../services/api';
import { SessionUtils, ThemeUtils } from '../utils';

/**
 * Session management hook - CLEANUP DISABLED for testing
 * Images will only be deleted on logout or manual cleanup
 */
export function useSession() {
  const [sessionId] = useState(() => SessionUtils.getSessionId());

  // Tab-close cleanup is intentionally disabled — images persist across reloads
  // because reload events and tab-close events are indistinguishable in the browser.
  // Cleanup is handled server-side via the retention / session-expiry policies.

  return { sessionId };
}

/**
 * Session heartbeat hook - Keeps session active with periodic pings
 */
export function useSessionHeartbeat() {
  const { sessionId } = useSession();
  const [isActive, setIsActive] = useState(true);
  
  useEffect(() => {
    // Send initial heartbeat immediately
    const sendHeartbeat = async () => {
      try {
        // Auth travels in the httpOnly cookie; credentials: 'include' sends it.
        const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000/api'}/images/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ session_id: sessionId })
        });
        
        const data = await response.json();

        if (data.success) {
          setIsActive(true);
        } else {
          setIsActive(false);
        }
      } catch {
        setIsActive(false);
      }
    };

    sendHeartbeat();
    const heartbeatInterval = setInterval(sendHeartbeat, 30000);

    return () => {
      clearInterval(heartbeatInterval);
    };
  }, [sessionId]);
  
  return { sessionId, isActive };
}

/**
 * Theme management hook
 */
export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => ThemeUtils.getTheme());
  
  const toggleTheme = useCallback(() => {
    const newTheme = ThemeUtils.toggleTheme();
    setTheme(newTheme);
  }, []);
  
  useEffect(() => {
    ThemeUtils.setTheme(theme);
  }, [theme]);
  
  return { theme, toggleTheme, setTheme };
}

/**
 * Status message management hook
 */
export function useStatus() {
  const [status, setStatus] = useState<StatusMessage>({ text: '', type: 'info' });
  const timeoutRef = useRef<NodeJS.Timeout>();
  
  const updateStatus = useCallback((text: string, type: StatusMessage['type'] = 'info', persistent = false) => {
    clearTimeout(timeoutRef.current);
    setStatus({ text, type, persistent });
    
    // Clear success/error messages after 4 seconds, but keep persistent messages
    if (!persistent && ['success', 'error'].includes(type)) {
      timeoutRef.current = setTimeout(() => {
        // Don't clear the message, instead trigger a re-evaluation of the default state
        // This will be handled by the useEffect in App.tsx
        setStatus({ text: '', type: 'info' });
      }, 4000);
    }
  }, []);
  
  const clearStatus = useCallback(() => {
    clearTimeout(timeoutRef.current);
    setStatus({ text: '', type: 'info' });
  }, []);
  
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return { status, updateStatus, clearStatus };
}

/**
 * Image management hook with database persistence
 */
export function useImages() {
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(false);
  const { sessionId } = useSession();
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Load images from database on mount
  useEffect(() => {
    const loadImagesFromDB = async () => {
      if (!isInitialized) {
        try {
          const savedImages = await ApiService.getSessionImages(sessionId);
          if (savedImages.length > 0) {
            setImages(savedImages);
          }
        } catch {
          // Continue with empty images if load fails
        }
        setIsInitialized(true);
      }
    };

    loadImagesFromDB();
  }, [sessionId, isInitialized]);
  
  const addImages = useCallback(async (files: File[]) => {
    setLoading(true);
    try {
      const uploadPromises = files.map(file => ApiService.uploadImage(file, sessionId));
      const responses = await Promise.allSettled(uploadPromises);
      
      const newImages: ImageData[] = [];
      const fileReadPromises: Promise<void>[] = [];
      let quotaError: any = null;
      const errors: string[] = [];
      
      responses.forEach((response, index) => {
        if (response.status === 'fulfilled' && response.value.success && response.value.image) {
          const imageData: ImageData = {
            ...response.value.image,
            selected: true,
            file: files[index],
            thumbnailDataUrl: response.value.thumbnail,
            dataUrl: '' // Initialize as empty, will be filled by FileReader
          };
          
          // Create a promise for the FileReader
          const fileReadPromise = new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              if (e.target?.result) {
                imageData.dataUrl = e.target.result as string;
              }
              resolve();
            };
            reader.onerror = () => resolve(); // Resolve anyway to not block
            reader.readAsDataURL(files[index]);
          });
          
          fileReadPromises.push(fileReadPromise);
          newImages.push(imageData);
        } else if (response.status === 'rejected') {
          const error = response.reason;
          errors.push(`${files[index].name}: ${error.message || 'Upload failed'}`);
          
          // Check if it's a quota error (507) or image limit error (400)
          if (error.response?.status === 507) {
            // Storage quota exceeded
            quotaError = error.response.data.detail;
          } else if (error.response?.status === 400 && error.response?.data?.detail?.error === 'Image limit reached') {
            // Image count limit reached
            const err: any = new Error(error.response.data.detail.message);
            err.response = error.response;
            throw err;
          }
        }
      });
      
      if (errors.length > 0) {
        throw new Error(`Failed to upload ${errors.length} image(s): ${errors.join('; ')}`);
      }
      
      // If quota exceeded, throw error to show popup
      if (quotaError) {
        const error: any = new Error(quotaError.message || 'Storage quota exceeded');
        error.quotaInfo = quotaError;
        throw error;
      }
      
      await Promise.all(fileReadPromises);
      setImages(prev => [...prev, ...newImages]);
      return newImages;
    } catch (error) {
      console.error('Error uploading images:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [sessionId]);
  
  const removeImage = useCallback(async (imageId: string) => {
    // Remove from UI immediately for instant feedback
    setImages(prev => prev.filter(img => img.id !== imageId));

    // Delete from database — auth travels in the httpOnly cookie; echo the CSRF
    // cookie back as a header (state-changing request).
    try {
      const csrf = getCookie('pf_csrf');
      await fetch(
        `${process.env.REACT_APP_API_URL || 'http://localhost:8000/api'}/images/image/${imageId}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers: csrf ? { 'X-CSRF-Token': csrf } : {},
        }
      );
    } catch {
      // Image is already removed from the UI; silently ignore network errors
    }
  }, []);
  
  const toggleImageSelection = useCallback((imageId: string) => {
    setImages(prev => prev.map(img => 
      img.id === imageId ? { ...img, selected: !img.selected } : img
    ));
  }, []);
  
  const selectAllImages = useCallback(() => {
    setImages(prev => prev.map(img => ({ ...img, selected: true })));
  }, []);
  
  const deselectAllImages = useCallback(() => {
    setImages(prev => prev.map(img => ({ ...img, selected: false })));
  }, []);
  
  const selectedImages = useMemo(() => images.filter(img => img.selected), [images]);
  const selectedCount = selectedImages.length;
  
  return {
    images,
    selectedImages,
    selectedCount,
    loading,
    addImages,
    removeImage,
    toggleImageSelection,
    selectAllImages,
    deselectAllImages
  };
}

/**
 * Pipeline management hook
 */
export function usePipeline() {
  const [pipeline, setPipeline] = useState<PipelineStep[]>([]);
  const [history, setHistory] = useState<PipelineStep[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const saveToHistory = useCallback((newPipeline: PipelineStep[]) => {
    // Don't save if pipeline hasn't actually changed
    const currentPipeline = history[historyIndex] || [];
    if (JSON.stringify(currentPipeline) === JSON.stringify(newPipeline)) {
      return;
    }
    
    // Remove any future history when making a new change
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...newPipeline]);
    
    // Limit history to last 50 actions to prevent memory issues
    if (newHistory.length > 50) {
      newHistory.shift();
    } else {
      setHistoryIndex(newHistory.length - 1);
    }
    
    setHistory(newHistory);
  }, [history, historyIndex]);
  
  const addStep = useCallback((operationName: string, params: Record<string, any> = {}) => {
    const newStep: PipelineStep = {
      id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: operationName,
      params
    };
    const newPipeline = [...pipeline, newStep];
    setPipeline(newPipeline);
    saveToHistory(newPipeline);
  }, [pipeline, saveToHistory]);
  
  const removeStep = useCallback((index: number) => {
    const newPipeline = pipeline.filter((_, i) => i !== index);
    setPipeline(newPipeline);
    saveToHistory(newPipeline);
  }, [pipeline, saveToHistory]);
  
  const updateStepParam = useCallback((stepId: string, paramName: string, value: any) => {
    const newPipeline = pipeline.map(step => 
      step.id === stepId 
        ? { ...step, params: { ...step.params, [paramName]: value } }
        : step
    );
    setPipeline(newPipeline);
    saveToHistory(newPipeline);
  }, [pipeline, saveToHistory]);
  
  const moveStep = useCallback((fromIndex: number, toIndex: number) => {
    const newPipeline = [...pipeline];
    const [movedStep] = newPipeline.splice(fromIndex, 1);
    newPipeline.splice(toIndex, 0, movedStep);
    setPipeline(newPipeline);
    saveToHistory(newPipeline);
  }, [pipeline, saveToHistory]);
  
  const resetPipeline = useCallback(() => {
    const newPipeline: PipelineStep[] = [];
    setPipeline(newPipeline);
    saveToHistory(newPipeline);
  }, [saveToHistory]);
  
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setPipeline([...history[newIndex]]);
    }
  }, [history, historyIndex]);
  
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setPipeline([...history[newIndex]]);
    }
  }, [history, historyIndex]);
  
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  
  const generatePipelineHash = useCallback((imageIds: string[]) => {
    return JSON.stringify({
      imageIds: imageIds.sort(),
      pipeline: pipeline.map(step => ({ name: step.name, params: step.params }))
    });
  }, [pipeline]);
  
  return {
    pipeline,
    addStep,
    removeStep,
    updateStepParam,
    moveStep,
    resetPipeline,
    undo,
    redo,
    canUndo,
    canRedo,
    generatePipelineHash
  };
}
/**
 * Live processing hook with caching
 */
// Trailing debounce for live preview. Kept snappy so a slow slider drag (which
// has natural micro-pauses) updates responsively; continuous fast drags still
// coalesce to one request on settle. Continuous during-drag updates land with
// the Phase 4.5 incremental engine (downscale + prefix cache).
const LIVE_PREVIEW_DEBOUNCE_MS = 250;

/** Decode an image data URL so the next paint is immediate. Best-effort. */
async function decodeImage(dataUrl?: string): Promise<void> {
  if (!dataUrl) return;
  try {
    const img = new Image();
    img.src = dataUrl;
    if (img.decode) {
      await img.decode();
    }
  } catch {
    // Ignore decode failures — we still show whatever we received.
  }
}

export function useLiveProcessing() {
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  // Cache lives in a ref (not state): nothing renders from it, and keeping it
  // out of state makes `processLive` stable, which prevents the live useEffect
  // from re-firing (and recomputing) after every result.
  const cacheRef = useRef<ProcessingCache | null>(null);
  const [timingData, setTimingData] = useState<{ total_time: number; step_timings: ProcessingTiming[] }>({ total_time: 0, step_timings: [] });
  const [stepErrors, setStepErrors] = useState<Array<StepErrorDTO | null> | null>(null);
  const { sessionId } = useSession();
  const abortControllerRef = useRef<AbortController>();
  
  const processLive = useCallback(async (imageId: string, pipeline: PipelineStep[]) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    
    const pipelineHash = JSON.stringify({ imageId, pipeline });
    
    // Check cache
    const cached = cacheRef.current;
    if (cached && cached.pipelineHash === pipelineHash &&
        Date.now() - cached.timestamp < 10 * 60 * 1000) {
      setResults(cached.results);
      setStepErrors(null);
      return cached.results;
    }
    
    setLoading(true);
    try {
      const response = await ApiService.processLive({
        image_id: imageId,
        pipeline: pipeline.map(step => ({ name: step.name, params: step.params })),
        session_id: sessionId
      }, abortControllerRef.current.signal);
      
      if (response.success) {
        // Decode the final image before committing results so the new preview
        // paints immediately when state updates — otherwise the "Live preview
        // updated" status flashes before the rendered image actually appears.
        await decodeImage(response.results[response.results.length - 1]);

        setResults(response.results);
        setTimingData({
          total_time: response.total_time || 0,
          step_timings: response.step_timings || []
        });
        setStepErrors(response.step_errors ?? null);

        cacheRef.current = {
          pipelineHash,
          results: response.results,
          timestamp: Date.now()
        };

        return response.results;
      } else {
        throw new Error(response.message);
      }
    } catch (error: any) {
      // A superseded request was cancelled — ignore quietly (latest wins).
      if (error?.name === 'AbortError' || error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') {
        return [];
      }
      throw error;
    } finally {
      setLoading(false);
    }
  }, [sessionId]);
  
  // Promise-aware debounce: the returned promise resolves only after the
  // trailing call actually completes (including image decode). Callers can
  // therefore `await` it and show a "preview updated" status that reflects the
  // rendered result, instead of resolving immediately (the old `debounce`
  // returned void, so `await` was a no-op and the status fired too early).
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const waitersRef = useRef<Array<{ resolve: (v: string[]) => void; reject: (e: any) => void }>>([]);

  const debouncedProcessLive = useCallback(
    (imageId: string, pipeline: PipelineStep[]): Promise<string[]> =>
      new Promise<string[]>((resolve, reject) => {
        waitersRef.current.push({ resolve, reject });
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(async () => {
          const waiters = waitersRef.current;
          waitersRef.current = [];
          try {
            const r = await processLive(imageId, pipeline);
            waiters.forEach((w) => w.resolve(r ?? []));
          } catch (e) {
            waiters.forEach((w) => w.reject(e));
          }
        }, LIVE_PREVIEW_DEBOUNCE_MS);
      }),
    [processLive]
  );
  
  const clearResults = useCallback(() => {
    setResults([]);
    setStepErrors(null);
    cacheRef.current = null;
  }, []);

  const invalidateCache = useCallback(() => {
    cacheRef.current = null;
  }, []);
  
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    results,
    loading,
    timingData,
    stepErrors,
    processLive: debouncedProcessLive,
    clearResults,
    invalidateCache
  };
}

/**
 * Batch processing hook with real-time results and cancellation
 */
export function useBatchProcessing() {
  const [results, setResults] = useState<ProcessedResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [timingData, setTimingData] = useState<{ total_time: number; step_timings: ProcessingTiming[] }>({ total_time: 0, step_timings: [] });
  const { sessionId } = useSession();
  const abortControllerRef = useRef<AbortController | null>(null);
  const isCancelledRef = useRef(false);
  
  const processBatch = useCallback(async (
    imageIds: string[], 
    pipeline: PipelineStep[],
    onProgress?: (current: number, total: number, result: ProcessedResult) => void
  ) => {
    setLoading(true);
    setResults([]);
    setTimingData({ total_time: 0, step_timings: [] });
    isCancelledRef.current = false;
    
    // Create new abort controller
    abortControllerRef.current = new AbortController();
    
    try {
      const allResults: ProcessedResult[] = [];
      const allTimings: ProcessingTiming[] = [];
      
      // Process images one by one
      for (let i = 0; i < imageIds.length; i++) {
        if (isCancelledRef.current) break;
        
        const imageId = imageIds[i];
        
        try {
          const response = await ApiService.processLive({
            image_id: imageId,
            pipeline: pipeline.map(step => ({ name: step.name, params: step.params })),
            session_id: sessionId
          });
          
          if (response.success && response.results.length > 0) {
            const result: ProcessedResult = {
              id: imageId,
              originalUrl: '',
              processedUrl: response.results[response.results.length - 1],
              intermediateResults: response.results
            };
            
            allResults.push(result);
            
            // Add to results immediately (real-time update)
            setResults(prev => [...prev, result]);
            
            // Track timings
            if (response.step_timings) {
              allTimings.push(...response.step_timings);
            }
            
            // Call progress callback
            if (onProgress) {
              onProgress(i + 1, imageIds.length, result);
            }
          }
        } catch {
          // Continue with next image on failure
        }
      }
      
      // Update final timing data
      setTimingData({
        total_time: allTimings.reduce((sum, t) => sum + t.duration, 0) / 1000,
        step_timings: allTimings
      });
      
      return allResults;
    } catch (error) {
      console.error('Batch processing error:', error);
      throw error;
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [sessionId]);
  
  const cancelBatch = useCallback(() => {
    isCancelledRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setLoading(false);
  }, []);
  
  const setResultsManually = useCallback((newResults: ProcessedResult[]) => {
    setResults(newResults);
  }, []);
  
  const clearResults = useCallback(() => {
    setResults([]);
    setTimingData({ total_time: 0, step_timings: [] });
  }, []);
  
  return {
    results,
    loading,
    timingData,
    processBatch,
    cancelBatch,
    setResultsManually,
    clearResults
  };
}

/**
 * UI state management hook
 */
export function useUI() {
  const [ui, setUI] = useState<UIState>({
    theme: 'dark',
    sidebarCollapsed: false,
    liveProcessingEnabled: false,
    currentView: 'grid',
    inspectorView: 'normal',
    selectedImages: [],
    selectedResult: null,
    viewingStepIndex: -1
  });
  
  const updateUI = useCallback((updates: Partial<UIState>) => {
    setUI(prev => ({ ...prev, ...updates }));
  }, []);
  
  const toggleSidebar = useCallback(() => {
    setUI(prev => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }));
  }, []);
  
  const setLiveProcessing = useCallback((enabled: boolean) => {
    setUI(prev => ({ ...prev, liveProcessingEnabled: enabled }));
  }, []);
  
  const setCurrentView = useCallback((view: UIState['currentView']) => {
    setUI(prev => ({ ...prev, currentView: view }));
  }, []);
  
  const setInspectorView = useCallback((view: UIState['inspectorView']) => {
    setUI(prev => ({ ...prev, inspectorView: view }));
  }, []);
  
  const setViewingStep = useCallback((stepIndex: number) => {
    setUI(prev => ({ ...prev, viewingStepIndex: stepIndex }));
  }, []);
  
  return {
    ui,
    updateUI,
    toggleSidebar,
    setLiveProcessing,
    setCurrentView,
    setInspectorView,
    setViewingStep
  };
}

/**
 * Modal management hook
 */
export function useModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  
  const openModal = useCallback((modalData?: any) => {
    setData(modalData || null);
    setIsOpen(true);
  }, []);
  
  const closeModal = useCallback(() => {
    setIsOpen(false);
    setData(null);
  }, []);
  
  const toggleModal = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);
  
  return {
    isOpen,
    data,
    openModal,
    closeModal,
    toggleModal
  };
}

/**
 * Keyboard shortcuts hook
 */
export function useKeyboardShortcuts(shortcuts: Record<string, () => void>) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const ctrlKey = event.ctrlKey || event.metaKey;

      // Don't hijack native editing keys (e.g. Ctrl+Z undo) while the user is
      // typing in a text field; only the "focus search" shortcuts still apply.
      const target = event.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.isContentEditable ||
          (target.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button', 'file', 'color'].includes((target as HTMLInputElement).type)) ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');
      if (isEditable && !(ctrlKey && (key === 'k' || key === '/'))) return;
      
      let shortcutKey = '';
      if (ctrlKey) shortcutKey += 'ctrl+';
      if (event.shiftKey) shortcutKey += 'shift+';
      if (event.altKey) shortcutKey += 'alt+';
      shortcutKey += key;
      
      if (shortcuts[shortcutKey]) {
        event.preventDefault();
        shortcuts[shortcutKey]();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}

/**
 * Resize observer hook
 */
export function useResizeObserver(callback: (entry: ResizeObserverEntry) => void) {
  const elementRef = useRef<HTMLElement>();
  
  useEffect(() => {
    if (!elementRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) callback(entries[0]);
    });
    
    observer.observe(elementRef.current);
    
    return () => observer.disconnect();
  }, [callback]);
  
  return elementRef;
}
