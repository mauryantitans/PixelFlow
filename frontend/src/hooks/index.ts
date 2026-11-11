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
import { ApiService } from '../services/api';
import { hasSignedInSession } from '../services/tokenRefresh';
import { SessionUtils } from '../utils';
import { useAppearance } from '../theme/appearance';

/**
 * Session management hook - CLEANUP DISABLED for testing
 * Images will only be deleted on logout or manual cleanup
 */
export function useSession() {
  const [sessionId, setSessionId] = useState(() => SessionUtils.getSessionId());
  // The id changes when someone signs in/out (see SessionUtils.syncWithUser)
  // or another tab switches it; follow along so uploads use the right one.
  useEffect(() => {
    const sync = () => setSessionId(SessionUtils.getSessionId());
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'pixelflow_session_id') sync();
    };
    window.addEventListener(SessionUtils.CHANGE_EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(SessionUtils.CHANGE_EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Tab-close cleanup is intentionally disabled — images persist across reloads
  // because reload events and tab-close events are indistinguishable in the browser.
  // Cleanup is handled server-side via the retention / session-expiry policies.

  return { sessionId };
}

/**
 * Light/dark mode hook (kept for existing callers). The mode is shared with the
 * appearance picker through theme/appearance.ts, so every toggle stays in sync.
 */
export function useTheme() {
  const { mode, setMode, toggleMode } = useAppearance();
  return { theme: mode, toggleTheme: toggleMode, setTheme: setMode };
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
/** Browsers can't show TIFF; everything else we accept they can. */
function isBrowserDisplayable(file?: File): boolean {
  if (!file) return false;
  const name = file.name.toLowerCase();
  return !(file.type === 'image/tiff' || name.endsWith('.tif') || name.endsWith('.tiff'));
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

export function useImages() {
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(false);
  const { sessionId } = useSession();

  // Load the session's images on mount and whenever the session changes
  // (e.g. after signing in/out), discarding the previous session's images.
  useEffect(() => {
    let cancelled = false;
    setImages([]);
    ApiService.getSessionImages(sessionId)
      .then(async (savedImages) => {
        if (cancelled) return;
        setImages(savedImages);
        // Then load the full-size images one at a time (thumbnails are used
        // until each arrives).
        for (const img of savedImages) {
          if (cancelled) return;
          if (img.dataUrl) continue;
          try {
            const dataUrl = await ApiService.getImageDataUrl(img.id);
            if (cancelled) return;
            setImages((prev) => prev.map((p) => (p.id === img.id && !p.dataUrl ? { ...p, dataUrl } : p)));
          } catch {
            /* keep the thumbnail */
          }
        }
      })
      .catch((error: any) => {
        // The session belongs to an account this browser isn't signed in as
        // (403 = another account; 401 while not signed in = a previous user's
        // session). Start a fresh one instead of showing nothing and failing
        // uploads. A 401 while signed in is retried by the refresh interceptor.
        if (cancelled) return;
        if (error?.status === 403 || (error?.status === 401 && !hasSignedInSession())) {
          SessionUtils.startNewSession();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);
  
  const addImages = useCallback(async (files: File[]) => {
    // Check the files before sending anything (limits match the server).
    if (files.length > 20) {
      throw new Error(`You selected ${files.length} files. Upload at most 20 at a time.`);
    }
    const errors: string[] = [];
    const valid: File[] = [];
    files.forEach((file) => {
      const check = ApiService.validateFile(file);
      if (check.isValid) valid.push(file);
      else errors.push(`${file.name}: ${check.error}`);
    });

    setLoading(true);
    try {
      const responses = await Promise.allSettled(valid.map((file) => ApiService.uploadImage(file, sessionId)));

      const newImages: ImageData[] = [];
      let quotaError: any = null;
      let limitError: any = null;
      let sessionReset = false;

      for (let index = 0; index < responses.length; index++) {
        const response = responses[index];
        const file = valid[index];
        if (response.status === 'fulfilled' && response.value.success && response.value.image) {
          newImages.push({
            ...response.value.image,
            selected: true,
            file,
            thumbnailDataUrl: response.value.thumbnail,
            dataUrl: '', // filled in below
          });
        } else if (response.status === 'rejected') {
          const error = response.reason;
          errors.push(`${file.name}: ${error.message || 'Upload failed'}`);
          if (
            error.code === 'session_owned_by_another_user' ||
            (error.code === 'sign_in_required' && !hasSignedInSession())
          ) {
            sessionReset = true; // this browser's session belonged to another account
          } else if (error.response?.status === 507) {
            quotaError = error.response.data.detail; // storage quota exceeded
          } else if (error.response?.status === 400 && error.response?.data?.detail?.error === 'Image limit reached') {
            limitError = error;
          }
        }
      }

      // Full-size preview: the file itself when the browser can show it,
      // otherwise (e.g. TIFF) the server's re-encoded copy.
      await Promise.all(
        newImages.map(async (img) => {
          img.dataUrl = isBrowserDisplayable(img.file)
            ? await readAsDataUrl(img.file as File)
            : await ApiService.getImageDataUrl(img.id).catch(() => img.thumbnailDataUrl || '');
        })
      );

      // Show everything that did upload, even if some files failed (before,
      // one bad file hid the successful ones until a reload).
      if (newImages.length > 0) setImages((prev) => [...prev, ...newImages]);

      if (sessionReset) {
        SessionUtils.startNewSession();
        throw new Error('Your browser session belonged to a different account and was reset. Please upload again.');
      }
      if (quotaError) {
        const error: any = new Error(quotaError.message || 'Storage quota exceeded');
        error.quotaInfo = quotaError;
        throw error;
      }
      if (limitError) {
        const err: any = new Error(limitError.response.data.detail.message);
        err.response = limitError.response;
        throw err;
      }
      if (errors.length > 0) {
        const uploaded = newImages.length;
        throw new Error(
          `${uploaded} of ${files.length} image(s) uploaded. Not uploaded: ${errors.join('; ')}`
        );
      }
      return newImages;
    } catch (error) {
      console.error('Error uploading images:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [sessionId]);
  
  const removeImage = useCallback(async (imageId: string): Promise<boolean> => {
    // Optimistic: hide it right away, but put it back if the server refuses
    // (e.g. 403/404). Before, failures were ignored and the "deleted" image
    // came back on the next reload.
    let removed: ImageData | undefined;
    let removedIndex = -1;
    setImages((prev) => {
      removedIndex = prev.findIndex((img) => img.id === imageId);
      removed = prev[removedIndex];
      return prev.filter((img) => img.id !== imageId);
    });
    try {
      await ApiService.deleteImage(imageId);
      return true;
    } catch {
      if (removed) {
        const restore = removed;
        setImages((prev) => {
          if (prev.some((img) => img.id === imageId)) return prev;
          const next = [...prev];
          next.splice(Math.min(Math.max(removedIndex, 0), next.length), 0, restore);
          return next;
        });
      }
      return false;
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
    // Also drop any pending/in-flight request so a late response can't bring
    // the old result back, and reset the timing badge.
    clearTimeout(debounceTimerRef.current);
    abortControllerRef.current?.abort();
    setResults([]);
    setStepErrors(null);
    setTimingData({ total_time: 0, step_timings: [] });
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
  // Each run gets an id. Stop or a new run makes older runs "stale": they stop
  // at the next image and never touch state again. (Before, Stop followed by
  // Apply Pipeline let both loops run and mixed their results.)
  const runIdRef = useRef(0);
  
  const processBatch = useCallback(async (
    imageIds: string[], 
    pipeline: PipelineStep[],
    onProgress?: (current: number, total: number, result: ProcessedResult) => void
  ) => {
    abortControllerRef.current?.abort();
    const runId = ++runIdRef.current;
    const isCurrent = () => runIdRef.current === runId;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setResults([]);
    setTimingData({ total_time: 0, step_timings: [] });
    
    try {
      const allResults: ProcessedResult[] = [];
      const allTimings: ProcessingTiming[] = [];
      
      // Process images one by one
      for (let i = 0; i < imageIds.length; i++) {
        if (!isCurrent()) break;
        
        const imageId = imageIds[i];
        
        try {
          const response = await ApiService.processLive({
            image_id: imageId,
            pipeline: pipeline.map(step => ({ name: step.name, params: step.params })),
            session_id: sessionId
          }, controller.signal);
          if (!isCurrent()) break;
          
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
      
      if (!isCurrent()) return allResults;

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
      // Only the current run may end the loading state.
      if (isCurrent()) {
        setLoading(false);
        abortControllerRef.current = null;
      }
    }
  }, [sessionId]);
  
  const cancelBatch = useCallback(() => {
    runIdRef.current += 1; // makes the running batch stale
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
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
