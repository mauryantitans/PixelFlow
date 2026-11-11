import React, { useState, useEffect } from 'react';
import * as LucideReact from 'lucide-react';
import {
  useStatus,
  useImages,
  useLiveProcessing,
  useBatchProcessing,
  useUI,
  useModal,
  useKeyboardShortcuts
} from './hooks';
import { usePipelineContext } from './contexts/PipelineContext';
import { useOperationSchema } from './contexts/OperationSchemaContext';
import { ProcessedResult } from './types';
import PipelineStepComponent from './components/PipelineStep';
import ResultsGridComponent from './components/ResultsGrid';
import Inspector from './components/Inspector';
import GalleryModal from './components/GalleryModal';
import './index.css';
import MethodDetailsModal from './components/MethodDetailsModal';
import { useDocumentTitle } from './hooks/useDocumentTitle';
import { useDialog } from './hooks/useDialog';
import { announce } from './utils/announce';

const App: React.FC = () => {
  useDocumentTitle('Workspace');
  const { status, updateStatus } = useStatus();
  const {
    images,
    selectedImages,
    selectedCount,
    addImages,
    removeImage,
    toggleImageSelection,
    selectAllImages,
    deselectAllImages
  } = useImages();
  
  // Delete selected images handler
  const handleDeleteSelected = async () => {
    const selectedIds = images.filter(img => img.selected).map(img => img.id);
    const count = selectedIds.length;
    
    // Delete from database
    const deletePromises = selectedIds.map(id => removeImage(id));
    await Promise.all(deletePromises);
    
    updateStatus(`Deleted ${count} image(s)`, 'success');
  };
  
  const {
    pipeline,
    addStep,
    removeStep,
    updateStepParam,
    moveStep,
    resetPipeline,
    undo,
    redo,
    canUndo,
    canRedo
  } = usePipelineContext();
  
  const {
    results: liveResults,
    timingData: liveTimingData,
    stepErrors: liveStepErrors,
    processLive,
    clearResults: clearLiveResults
  } = useLiveProcessing();
  
  const {
    results: batchResults,
    loading: batchLoading,
    timingData: batchTimingData,
    processBatch,
    cancelBatch,
    clearResults: clearBatchResults
  } = useBatchProcessing();
  
  const {
    ui,
    toggleSidebar,
    setLiveProcessing,
    setCurrentView,
    setInspectorView,
    setViewingStep
  } = useUI();
  
  const galleryModal = useModal();
  const methodDetailsModal = useModal();
  const { palette, allLabels, getOp, getDefaults, loading: opsLoading, error: opsError } = useOperationSchema();
  const [selectedMethodName, setSelectedMethodName] = useState<string>('');
  
  // State for search functionality
  const [operationSearch, setOperationSearch] = useState('');
  
  // State for selected result in batch mode
  const [selectedResult, setSelectedResult] = useState<ProcessedResult | null>(null);
  
  // State for quota exceeded popup
  const [quotaPopup, setQuotaPopup] = useState<{
    show: boolean;
    type: 'quota' | 'count';
    message: string;
    details?: any;
  }>({ show: false, type: 'quota', message: '' });

  // Lightbox state
  const [lightboxState, setLightboxState] = useState<{
    isOpen: boolean;
    imageUrl: string;
    filename: string;
  }>({
    isOpen: false,
    imageUrl: '',
    filename: ''
  });
  
  // State for live processing toggle (separate from UI state for better control)
  const [liveProcessingEnabled, setLiveProcessingEnabled] = useState(false);
  
  // Filter operations based on search - improved logic
  const getFilteredOperations = (): Record<string, Record<string, string[]>> => {
    if (!operationSearch.trim()) {
      return palette;
    }

    const searchTerm = operationSearch.toLowerCase();
    const filteredOps = allLabels.filter((label) => label.toLowerCase().includes(searchTerm));

    return {
      'Search Results': {
        'Found Operations': filteredOps
      }
    };
  };

  // Enhanced file upload with feedback and quota handling
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;
    
    try {
      updateStatus('Uploading images...', 'processing');
      const newImages = await addImages(Array.from(files));
      updateStatus(`Successfully uploaded ${newImages.length} image(s)`, 'success');
    } catch (error: any) {
      // Check if it's a quota error
      if (error.quotaInfo) {
        setQuotaPopup({
          show: true,
          type: 'quota',
          message: error.quotaInfo.message || 'Storage quota exceeded',
          details: error.quotaInfo
        });
      } 
      // Check if it's an image count limit error
      else if (error.response?.status === 400 && error.response?.data?.detail?.error === 'Image limit reached') {
        setQuotaPopup({
          show: true,
          type: 'count',
          message: error.response.data.detail.message,
          details: error.response.data.detail
        });
      }
      else {
        updateStatus(`Upload failed: ${error.message}`, 'error');
      }
    }
    
    event.target.value = '';
  };
  
  // Enhanced live toggle with feedback - FIXED
  const handleLiveToggle = (enabled: boolean) => {
    
    if (enabled && selectedCount !== 1) {
      updateStatus('Live processing requires exactly one selected image', 'error');
      return;
    }
    
    setLiveProcessingEnabled(enabled);
    setLiveProcessing(enabled);
    
    if (enabled) {
      setCurrentView('live');
      clearBatchResults();
      setSelectedResult(null);
      updateStatus('Live mode enabled - adjust parameters to see real-time changes', 'info', true);
      // Initial processing is handled by the live useEffect (fires when live mode turns on).
    } else {
      setCurrentView('grid');
      clearLiveResults();
      setViewingStep(-1);
      updateStatus('Live mode disabled', 'info');
    }
  };
  
  // Enhanced live processing with feedback
  const handleLiveProcess = async () => {
    if (selectedImages.length !== 1 || !liveProcessingEnabled) {
      return;
    }
    
    
    try {
      updateStatus('Processing live preview...', 'processing', true);
      
      await processLive(selectedImages[0].id, pipeline);
      
      updateStatus('Live preview updated', 'success');
      
    } catch (error: any) {
      console.error('Live processing error:', error);
      updateStatus(`Live processing failed: ${error.message}`, 'error');
    }
  };

  // Enhanced batch processing with real-time results and detailed feedback
  const handleBatchProcess = async () => {
    if (selectedCount === 0) {
      updateStatus('Please upload and select at least one image', 'error');
      return;
    }
    
    if (pipeline.length === 0) {
      updateStatus('Please add at least one operation', 'error');
      return;
    }
    
    
    try {
      setCurrentView('grid');
      
      const results = await processBatch(
        selectedImages.map(img => img.id),
        pipeline,
        (current, total, result) => {
          // Progress callback - update status
          updateStatus(`Processing image ${current} of ${total}...`, 'processing', true);
        }
      );
      
      // Show final success message with actual count
      if (results && results.length > 0) {
        updateStatus(`Successfully processed ${results.length} of ${selectedCount} image(s). Click a result to inspect.`, 'success');
      } else {
        updateStatus('No images were processed successfully', 'error');
      }
      
    } catch (error: any) {
      console.error('Batch processing error:', error);
      if (!error.message?.includes('cancel')) {
        updateStatus(`Batch processing failed: ${error.message}`, 'error');
      }
    }
  };
  
  // Handle cancel batch processing
  const handleCancelBatch = () => {
    cancelBatch();
    updateStatus('Batch processing cancelled', 'warning');
  };
  
  // Handle adding operation to pipeline
  const handleAddOperation = (operationName: string) => {
    // Seed default params from the operation schema (single source of truth).
    const params = getDefaults(operationName);
    addStep(operationName, params);
    announce(`Added ${operationName} as step ${pipeline.length + 1} of ${pipeline.length + 1}`);
    // Live re-processing is driven by the live useEffect (single trigger).
  };
  
  // Handle parameter changes
  const handleParameterChange = (stepId: string, paramName: string, value: any) => {
    updateStepParam(stepId, paramName, value);
    // Live re-processing is driven by the live useEffect (single trigger).
  };

  // Show method details in modal
  const handleShowMethodDetails = (operationName: string) => {
    setSelectedMethodName(operationName);
    methodDetailsModal.openModal();
  };
  
  // Handle result selection in batch mode
  const handleResultSelect = (result: ProcessedResult) => {
    const originalImage = selectedImages.find(img => img.id === result.id);
    const resultWithOriginal: ProcessedResult = {
      ...result,
      originalUrl: originalImage?.dataUrl || originalImage?.thumbnailDataUrl || ''
    };
    setSelectedResult(resultWithOriginal);
    setCurrentView('inspector');
  };

  const handleImageView = (imageIndex: number) => {
    const image = images[imageIndex];
    setLightboxState({
      isOpen: true,
      imageUrl: image.dataUrl || image.thumbnailDataUrl || '',
      filename: image.filename
    });
  };

  const closeLightbox = () => {
    setLightboxState(prev => ({ ...prev, isOpen: false }));
  };

  const closeQuotaPopup = () => setQuotaPopup({ show: false, type: 'quota', message: '' });

  // Accessible dialogs: focus trap, Escape to close, focus returned on close.
  const lightboxRef = useDialog<HTMLDivElement>(lightboxState.isOpen, closeLightbox);
  const quotaRef = useDialog<HTMLDivElement>(quotaPopup.show, closeQuotaPopup);
  
  // Keyboard shortcuts
  useKeyboardShortcuts({
    'ctrl+k': () => document.getElementById('operationSearch')?.focus(),
    'ctrl+/': () => document.getElementById('operationSearch')?.focus(),
    'ctrl+z': () => canUndo && undo(),
    'ctrl+y': () => canRedo && redo(),
    // Escape is handled per dialog by useDialog (it closes only the top-most
    // dialog; previously one Escape closed the lightbox AND the gallery).
  });

  // Helper function for status colors
  const getStatusTextColor = (type: 'info' | 'processing' | 'success' | 'error' | 'warning') => {
    switch (type) {
      case 'processing':
        return 'text-blue-700 dark:text-blue-400';
      case 'success':
        return 'text-green-700 dark:text-green-400';
      case 'error':
        return 'text-red-600 dark:text-red-400';
      case 'warning':
        return 'text-amber-700 dark:text-yellow-400';
      case 'info':
      default:
        return 'text-slate-700 dark:text-slate-300';
    }
  };
  
  // Update status based on current state - FIXED
  useEffect(() => {
    // Don't override non-persistent status messages
    if (status.persistent === false) return;
    
    // User Guidance States (Default/Persistent)
    if (liveProcessingEnabled) {
      updateStatus('Live mode enabled - adjust parameters to see real-time changes', 'info', true);
    } else if (images.length === 0) {
      updateStatus('Upload images to start building your pipeline', 'info', true);
    } else if (selectedCount === 0) {
      updateStatus('Select images from the gallery to process', 'warning', true);
    } else if (pipeline.length === 0) {
      updateStatus('Add operations from the sidebar to build your pipeline', 'info', true);
    } else {
      updateStatus(`Ready to process ${selectedCount} image(s) with ${pipeline.length} operation(s)`, 'info', true);
    }
  }, [liveProcessingEnabled, images.length, selectedCount, pipeline.length, updateStatus, status.persistent]);
  
  // Single source of truth for live re-processing: fires whenever the pipeline,
  // selection, or live-mode toggle changes. `processLive` is debounced (and now
  // stable), so rapid edits coalesce. The status is set here so "Live preview
  // updated" only appears after the result is computed and the image decoded.
  useEffect(() => {
    if (!liveProcessingEnabled || selectedImages.length !== 1 || pipeline.length === 0) {
      return;
    }
    let cancelled = false;
    updateStatus('Processing live preview...', 'processing', true);
    processLive(selectedImages[0].id, pipeline)
      .then(() => {
        if (!cancelled) updateStatus('Live preview updated', 'success');
      })
      .catch((error: any) => {
        if (!cancelled) updateStatus(`Live processing failed: ${error?.message ?? error}`, 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [pipeline, liveProcessingEnabled, selectedImages, processLive, updateStatus]);

  // Update live processing toggle state when selection changes - FIXED
  useEffect(() => {
    if (selectedCount !== 1 && liveProcessingEnabled) {
      setLiveProcessingEnabled(false);
      setLiveProcessing(false);
      setCurrentView('grid');
      clearLiveResults();
    }
  }, [selectedCount, liveProcessingEnabled, setLiveProcessing, setCurrentView, clearLiveResults]);

  useEffect(() => {
    const handleDetailsToggle = () => {
      const allDetails = document.querySelectorAll('details');
      allDetails.forEach(details => {
        if (details.open) {
          details.classList.add('details-open');
        } else {
          details.classList.remove('details-open');
        }
      });
    };

    const allDetails = document.querySelectorAll('details');
    allDetails.forEach(details => {
      details.addEventListener('toggle', handleDetailsToggle);
    });

    handleDetailsToggle();

    return () => {
      allDetails.forEach(details => {
        details.removeEventListener('toggle', handleDetailsToggle);
      });
    };
  }, []);

  useEffect(() => {
    if (lightboxState.isOpen) {
      const container = document.querySelector('.zoom-container') as HTMLElement;
      const image = document.querySelector('.zoomable-image') as HTMLElement;
      
      if (container && image) {
        let scale = 1;
        let panning = false;
        let pointX = 0;
        let pointY = 0;
        let start = { x: 0, y: 0 };
        
        const setTransform = () => {
          image.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
          container.style.cursor = scale > 1 ? 'grab' : 'default';
        };
        
        const handleWheel = (e: WheelEvent) => {
          e.preventDefault();
          const delta = e.deltaY > 0 ? -1 : 1;
          const oldScale = scale;
          scale = Math.min(Math.max(1, scale * (1 + delta * 0.2)), 10);
          
          if (scale !== oldScale) {
            const rect = image.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const scaleRatio = scale / oldScale;
            pointX -= x * (scaleRatio - 1);
            pointY -= y * (scaleRatio - 1);
            
            if (scale === 1) {
              pointX = 0;
              pointY = 0;
            }
            setTransform();
          }
        };
        
        const handleMouseDown = (e: MouseEvent) => {
          if (scale <= 1 || e.button !== 0) return;
          e.preventDefault();
          start = { x: e.clientX - pointX, y: e.clientY - pointY };
          panning = true;
          container.style.cursor = 'grabbing';
        };
        
        const handleMouseMove = (e: MouseEvent) => {
          if (!panning) return;
          e.preventDefault();
          pointX = e.clientX - start.x;
          pointY = e.clientY - start.y;
          setTransform();
        };
        
        const handleMouseUp = () => {
          panning = false;
          container.style.cursor = scale > 1 ? 'grab' : 'default';
        };
        
        // Keyboard alternative to wheel-zoom and drag-pan (WCAG 2.1.1).
        const handleKey = (e: KeyboardEvent) => {
          const step = e.shiftKey ? 100 : 30;
          let handled = true;
          if (e.key === '+' || e.key === '=') scale = Math.min(10, scale * 1.25);
          else if (e.key === '-' || e.key === '_') scale = Math.max(1, scale / 1.25);
          else if (e.key === '0') { scale = 1; pointX = 0; pointY = 0; }
          else if (e.key === 'ArrowLeft' && scale > 1) pointX += step;
          else if (e.key === 'ArrowRight' && scale > 1) pointX -= step;
          else if (e.key === 'ArrowUp' && scale > 1) pointY += step;
          else if (e.key === 'ArrowDown' && scale > 1) pointY -= step;
          else handled = false;
          if (!handled) return;
          e.preventDefault();
          if (scale === 1) { pointX = 0; pointY = 0; }
          setTransform();
          announce(`Zoom ${Math.round(scale * 100)}%`);
        };
        const dialog = container.closest('[role="dialog"]') as HTMLElement | null;
        dialog?.addEventListener('keydown', handleKey);

        container.addEventListener('wheel', handleWheel);
        container.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        return () => {
          dialog?.removeEventListener('keydown', handleKey);
          container.removeEventListener('wheel', handleWheel);
          container.removeEventListener('mousedown', handleMouseDown);
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };
      }
    }
  }, [lightboxState.isOpen]);

  return (
    <main id="main-content" tabIndex={-1} className="flex flex-col md:flex-row bg-slate-50 dark:bg-zinc-950 min-h-screen focus:outline-none">
      {/* Single column below md (operations, toolbar, pipeline, results stacked); side by side from md up (WCAG 1.4.10 Reflow). */}
      <h1 className="sr-only">PixelFlow image processing workspace</h1>
      {/* Operations Sidebar */}
      <section aria-label="Operations" className={`md:h-screen md:sticky md:top-0 bg-white dark:bg-zinc-900 p-4 flex flex-col border-b-2 md:border-b-0 md:border-r-2 border-slate-300 dark:border-zinc-800 flex-shrink-0 transition-all duration-300 relative ${
        ui.sidebarCollapsed ? 'w-full md:w-16' : 'w-full md:w-80'
      }`}>
        
        <div className="flex items-center justify-between mb-4">
          {!ui.sidebarCollapsed && (
            <h2 id="operations-heading" className="text-xl font-bold text-slate-900 dark:text-slate-50">Operations</h2>
          )}
          <button
            onClick={toggleSidebar}
            aria-label={ui.sidebarCollapsed ? 'Expand operations panel' : 'Collapse operations panel'}
            aria-expanded={!ui.sidebarCollapsed}
            aria-controls="operations-panel"
            title={ui.sidebarCollapsed ? 'Expand operations panel' : 'Collapse operations panel'}
            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-slate-300"
          >
            <LucideReact.PanelLeftClose aria-hidden="true" className="w-5 h-5" />
          </button>
        </div>
        
        {!ui.sidebarCollapsed && (
          <div id="operations-panel" className="flex-grow flex flex-col min-h-0">
            {/* Search Bar */}
            <div className="relative mb-4">
              <label htmlFor="operationSearch" className="sr-only">Search operations</label>
              <input
                type="search"
                id="operationSearch"
                placeholder="Search operations... (Ctrl+K)"
                value={operationSearch}
                onChange={(e) => setOperationSearch(e.target.value)}
                className="input-field pr-10"
              />
              <LucideReact.Search aria-hidden="true" className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-600 dark:text-gray-400" />
            </div>

            
            {/* Enhanced Operations List */}
            <div className="flex-grow overflow-y-auto space-y-1 pr-1 max-h-[60vh] md:max-h-none">
              {(opsLoading || opsError) && (
                <div role={opsError ? 'alert' : 'status'} className="p-3 text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  {opsLoading ? (
                    <>
                      <LucideReact.Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />
                      Loading operations…
                    </>
                  ) : (
                    <>
                      <LucideReact.AlertTriangle aria-hidden="true" className="w-4 h-4 text-red-700 dark:text-red-400" />
                      Couldn't load operations: {opsError}
                    </>
                  )}
                </div>
              )}
              {Object.entries(getFilteredOperations()).map(([libraryName, libraryCategories], libraryIndex) => (
                <div key={libraryName} className={`library-container ${
                  libraryName === 'OpenCV' ? 'library-opencv' : 
                  libraryName === 'Scikit-Image' ? 'library-scikit' : 
                  'library-basic'
                }`}>
                  <details open={libraryIndex < 1} className="operation-group">
                    <summary className="library-header">
                      <div className="flex items-center">
                        {libraryName === 'OpenCV' && <LucideReact.Camera aria-hidden="true" className="library-icon" />}
                        {libraryName === 'Scikit-Image' && <LucideReact.Microscope aria-hidden="true" className="library-icon" />}
                        {libraryName === 'Basic Operations' && <LucideReact.Sliders aria-hidden="true" className="library-icon" />}
                        {libraryName === 'Search Results' && <LucideReact.Search aria-hidden="true" className="library-icon" />}
                        {libraryName}
                      </div>
                      <LucideReact.ChevronDown aria-hidden="true" className="chevron-icon" />
                    </summary>
                    
                    <div className="space-y-2 mt-2">
                      {Object.entries(libraryCategories as Record<string, any>).map(([categoryName, operations], categoryIndex) => (
                        <div key={categoryName} className="category-container">
                          <details open={categoryIndex < 2} className="operation-group">
                            <summary className="category-header">
                              <div className="flex items-center">
                                {categoryName === 'Adjustments' && <LucideReact.SlidersHorizontal aria-hidden="true" className="w-3 h-3 mr-1" />}
                                {categoryName === 'Filters' && <LucideReact.Filter aria-hidden="true" className="w-3 h-3 mr-1" />}
                                {categoryName === 'Blur & Sharpen' && <LucideReact.Focus aria-hidden="true" className="w-3 h-3 mr-1" />}
                                {categoryName === 'Effects' && <LucideReact.Sparkles aria-hidden="true" className="w-3 h-3 mr-1" />}
                                {categoryName === 'Filtering' && <LucideReact.Grid aria-hidden="true" className="w-3 h-3 mr-1" />}
                                {categoryName === 'Edge Detection' && <LucideReact.Scan aria-hidden="true" className="w-3 h-3 mr-1" />}
                                {categoryName === 'Enhancement' && <LucideReact.Sun aria-hidden="true" className="w-3 h-3 mr-1" />}
                                {categoryName === 'Restoration' && <LucideReact.Wrench aria-hidden="true" className="w-3 h-3 mr-1" />}
                                {categoryName === 'Found Operations' && <LucideReact.Search aria-hidden="true" className="w-3 h-3 mr-1" />}
                                {!['Adjustments', 'Filters', 'Blur & Sharpen', 'Effects', 'Filtering', 'Edge Detection', 'Enhancement', 'Restoration', 'Found Operations'].includes(categoryName) && 
                                <LucideReact.Folder aria-hidden="true" className="w-3 h-3 mr-1" />}
                                <span className="text-slate-700 dark:text-slate-300">{categoryName}</span>
                              </div>
                              <LucideReact.ChevronDown aria-hidden="true" className="w-3 h-3 chevron-icon" />
                            </summary>
                            
                            <div className="grid grid-cols-2 gap-1.5 mt-2">
                              {(Array.isArray(operations) 
                                ? operations 
                                : Object.keys(operations as Record<string, any>)
                              ).map((op: string) => (
                                <button
                                  key={op}
                                  type="button"
                                  data-op={op}
                                  onClick={() => handleAddOperation(op)}
                                  aria-label={`Add ${op}`}
                                  aria-describedby={getOp(op)?.description ? `op-desc-${op.replace(/[^a-zA-Z0-9]/g, '-')}` : undefined}
                                  className="operation-btn-enhanced group"
                                >
                                  {op}
                                  {getOp(op)?.description && (
                                    <div
                                      id={`op-desc-${op.replace(/[^a-zA-Z0-9]/g, '-')}`}
                                      aria-hidden="true"
                                      className="operation-tooltip"
                                    >
                                      {getOp(op)?.description}
                                    </div>
                                  )}
                                </button>
                              ))}
                            </div>
                          </details>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      
      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col md:min-h-screen">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 border-b-2 border-slate-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 md:sticky md:top-0 z-40">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            {/* The real file input stays in the tab order (it used to be
                display:none, so keyboard users could not upload). It is
                visually hidden and the label is styled as the button. */}
            <input
              type="file"
              id="upload-image"
              className="sr-only peer"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
            />
            <label
              htmlFor="upload-image"
              className="btn-primary cursor-pointer peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-700 dark:peer-focus-visible:outline-blue-300"
            >
              Upload Image(s)
            </label>
            {images.length > 0 && (
              <button
                onClick={galleryModal.openModal}
                className="btn-secondary"
              >
                Gallery ({images.length})
              </button>
            )}
            <button
              onClick={batchLoading ? handleCancelBatch : handleBatchProcess}
              disabled={liveProcessingEnabled || (!batchLoading && (selectedCount === 0 || pipeline.length === 0))}
              className={`btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                batchLoading ? 'bg-red-600 hover:bg-red-700' : ''
              }`}
            >
              {batchLoading ? (
                <>
                  <div className="relative w-5 h-5 flex items-center justify-center" aria-hidden="true">
                    {/* Outer static circle */}
                    <div className="absolute inset-0 border-2 border-black/40 rounded-full"></div>
                    {/* Rotating circle - animated spinner */}
                    <div className="absolute inset-0 border-2 border-black border-t-transparent border-r-transparent rounded-full animate-spin"></div>
                    {/* Inner stop square */}
                    <div className="absolute inset-[6px] bg-black rounded-[2px]"></div>
                  </div>
                  <span>Stop</span>
                </>
              ) : (
                'Apply Pipeline'
              )}
            </button>
          </div>

          {/* Status Display — a polite live region, so upload/processing/
              error messages are read out without moving focus (WCAG 4.1.3). */}
          <div className="order-last basis-full xl:order-none xl:basis-auto flex-1 text-center px-2" role="status" aria-live="polite" aria-atomic="true">
            {status.text && (
              <span className={`text-sm flex items-center justify-center gap-2 transition-colors duration-200 font-medium ${getStatusTextColor(status.type)}`}>
                {status.type === 'processing' && <LucideReact.Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />}
                {status.type === 'success' && <LucideReact.CheckCircle aria-hidden="true" className="w-4 h-4" />}
                {status.type === 'error' && <LucideReact.AlertTriangle aria-hidden="true" className="w-4 h-4" />}
                {status.type === 'warning' && <LucideReact.AlertCircle aria-hidden="true" className="w-4 h-4" />}
                {status.type === 'info' && status.text.includes('Live mode') && <LucideReact.Zap aria-hidden="true" className="w-4 h-4" />}
                {status.text}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Live Processing Toggle - FIXED */}
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="live-toggle" className="text-sm font-medium text-slate-900 dark:text-slate-50">Live Processing</label>
              <div className="relative inline-block w-10 align-middle select-none">
                <input
                  type="checkbox"
                  id="live-toggle"
                  role="switch"
                  aria-describedby={selectedCount !== 1 ? 'live-toggle-hint' : undefined}
                  checked={liveProcessingEnabled}
                  onChange={(e) => handleLiveToggle(e.target.checked)}
                  disabled={selectedCount !== 1}
                  className="toggle-checkbox"
                />
                <label htmlFor="live-toggle" className="toggle-label" aria-hidden="true"></label>
              </div>
              {selectedCount !== 1 && (
                <span id="live-toggle-hint" className="text-xs text-slate-600 dark:text-slate-400">
                  (Select 1 image)
                </span>
              )}
            </div>
          </div>
        </div>
        
        {/* Content Area */}
        <div className="flex-1 min-w-0 p-3 sm:p-6 flex flex-col gap-4 sm:gap-6">
          {/* Pipeline Section */}
          <section aria-labelledby="pipeline-heading" className="bg-white dark:bg-zinc-900 rounded-lg p-4 border-2 border-slate-300 dark:border-zinc-800">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
              <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                <h2 id="pipeline-heading" tabIndex={-1} className="focus:outline-none text-lg font-bold text-slate-900 dark:text-slate-50">
                  Pipeline ({pipeline.length} steps)
                </h2>
                {/* Timing Display */}
                {((liveProcessingEnabled && liveTimingData.total_time > 0) || (!liveProcessingEnabled && batchTimingData.total_time > 0)) && (
                  <div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1">
                    <LucideReact.Clock aria-hidden="true" className="w-3 h-3" />
                    {liveProcessingEnabled 
                      ? `${(liveTimingData.total_time * 1000).toFixed(0)}ms`
                      : `${(batchTimingData.total_time).toFixed(2)}s total`
                    }
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2">
              <button
              onClick={undo}
              disabled={!canUndo}
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Undo (Ctrl+Z)"
              >
              <LucideReact.Undo2 aria-hidden="true" className="w-3 h-3" />
              Undo
              </button>
              <button
              onClick={redo}
              disabled={!canRedo}
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Redo (Ctrl+Y)"
              >
              <LucideReact.Redo2 aria-hidden="true" className="w-3 h-3" />
              Redo
              </button>
              <div className="w-px h-4 bg-slate-300 dark:bg-zinc-700"></div>
              <button
              onClick={resetPipeline}
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50 transition-colors flex items-center gap-1"
              >
              <LucideReact.RotateCcw aria-hidden="true" className="w-3 h-3" />
              Reset
              </button>
              </div>
            </div>
            
            <div className="space-y-2">
              {pipeline.length === 0 ? (
                <p className="text-sm text-center py-4 text-slate-600 dark:text-slate-400">
                  Add operations from the left panel. Each step can be reordered with its Move up / Move down buttons or Alt+Arrow keys.
                </p>
              ) : (
                pipeline.map((step, index) => {
                  // Calculate step timing
                  let stepTiming: { duration: number; isAverage?: boolean } | undefined;
                  
                  if (liveProcessingEnabled && liveTimingData.step_timings.length > 0) {
                    const timing = liveTimingData.step_timings.find(t => t.step_index === index);
                    if (timing) {
                      stepTiming = { duration: timing.duration };
                    }
                  } else if (!liveProcessingEnabled && batchTimingData.step_timings.length > 0) {
                    const stepTimings = batchTimingData.step_timings.filter(t => t.step_name === step.name);
                    if (stepTimings.length > 0) {
                      const avgDuration = stepTimings.reduce((sum, t) => sum + t.duration, 0) / stepTimings.length;
                      stepTiming = { duration: avgDuration, isAverage: stepTimings.length > 1 };
                    }
                  }
                  
                  return (
                    <PipelineStepComponent
                      key={step.id}
                      step={step}
                      index={index}
                      totalSteps={pipeline.length}
                      onRemove={() => {
                        const label = getOp(step.name)?.label ?? step.name;
                        removeStep(index);
                        announce(`Removed ${label}. ${pipeline.length - 1} steps left.`);
                        // The focused button is gone; put focus somewhere sensible.
                        window.requestAnimationFrame(() => document.getElementById('pipeline-heading')?.focus());
                      }}
                      onMove={(from, to) => {
                        moveStep(from, to);
                        announce(`${getOp(step.name)?.label ?? step.name} moved to position ${to + 1} of ${pipeline.length}`);
                      }}
                      onParameterChange={handleParameterChange}
                      onPreview={() => {
                        if (liveProcessingEnabled) {
                          setViewingStep(ui.viewingStepIndex === index ? -1 : index);
                          if (ui.viewingStepIndex !== index) {
                            handleLiveProcess();
                          }
                        } else {
                          updateStatus('Enable live processing to preview individual steps', 'info');
                        }
                      }}
                      isViewing={ui.viewingStepIndex === index}
                      stepTiming={stepTiming}
                      stepError={liveProcessingEnabled ? (liveStepErrors?.[index] ?? null) : null}
                      onShowDetails={() => handleShowMethodDetails(step.name)}
                    />
                  );
                })
              )}
            </div>
          </section>
          
          {/* Results Section - IMPROVED */}
          <section aria-label="Results" className="flex-1 bg-white dark:bg-zinc-900 rounded-lg border-2 border-slate-300 dark:border-zinc-800 flex flex-col">
            {ui.currentView === 'grid' && (
              <ResultsGridComponent
                results={batchResults}
                loading={batchLoading}
                onResultSelect={handleResultSelect}
                onReset={() => {
                  clearBatchResults();
                  setSelectedResult(null);
                  updateStatus('Results cleared', 'info');
                }}
              />
            )}
            
            {ui.currentView === 'inspector' && selectedResult && (
              <Inspector
                result={selectedResult}
                view={ui.inspectorView}
                onViewChange={setInspectorView}
                onBack={() => {
                  setCurrentView('grid');
                  setSelectedResult(null);
                }}
              />
            )}
            
            {ui.currentView === 'live' && liveProcessingEnabled && (
              <Inspector
                result={{
                  id: selectedImages[0]?.id || 'live',
                  originalUrl: selectedImages[0]?.dataUrl || selectedImages[0]?.thumbnailDataUrl || '',
                  processedUrl: liveResults.length > 0 ? liveResults[liveResults.length - 1] : '',
                  intermediateResults: liveResults,
                }}
                view={ui.inspectorView}
                onViewChange={setInspectorView}
                onBack={() => {
                  setLiveProcessingEnabled(false);
                  setLiveProcessing(false);
                  setCurrentView('grid');
                  clearLiveResults();
                }}
              />
            )}
          </section>
        </div>
      </div>
      
      {/* Gallery Modal */}
      <GalleryModal
        isOpen={galleryModal.isOpen}
        images={images}
        onClose={galleryModal.closeModal}
        onImageSelect={toggleImageSelection}
        onImageRemove={removeImage}
        onDeleteSelected={handleDeleteSelected}
        onSelectAll={selectAllImages}
        onDeselectAll={deselectAllImages}
        onImageView={handleImageView}
      />

      {/* Enhanced Lightbox with Zoom/Pan */}
      {lightboxState.isOpen && (
        <div 
          className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          <div
            ref={lightboxRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Image viewer: ${lightboxState.filename}`}
            tabIndex={-1}
            className="relative w-full h-full flex justify-center items-center"
          >
            <div 
              className="zoom-container w-full h-full flex justify-center items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={lightboxState.imageUrl}
                alt={lightboxState.filename}
                className="max-w-full max-h-full object-contain zoomable-image cursor-grab"
                style={{ transformOrigin: '0px 0px' }}
              />
            </div>
            
            <p className="absolute bottom-4 left-4 text-xs text-white bg-black/70 px-2 py-1 rounded">
              Keyboard: + / − to zoom, arrow keys to pan, 0 to reset, Esc to close
            </p>
            {/* Zoom Controls */}
            <div className="absolute bottom-4 right-4 bg-gray-900/50 backdrop-blur-sm rounded-lg text-white flex items-center text-xs">
              <button 
                type="button"
                aria-label="Zoom out"
                className="p-3 hover:bg-white/20 rounded-l-lg"
                onClick={(e) => {
                  e.stopPropagation();
                  // Share zoom state with the wheel/keyboard handlers.
                  (e.currentTarget.closest('[role="dialog"]') as HTMLElement | null)?.dispatchEvent(
                    new KeyboardEvent('keydown', { key: '-', bubbles: true })
                  );
                }}
              >
                <LucideReact.ZoomOut aria-hidden="true" className="w-4 h-4" />
              </button>
              <span className="px-3 font-mono" aria-hidden="true">Zoom</span>
              <button 
                type="button"
                aria-label="Zoom in"
                className="p-3 hover:bg-white/20 rounded-r-lg"
                onClick={(e) => {
                  e.stopPropagation();
                  // Share zoom state with the wheel/keyboard handlers.
                  (e.currentTarget.closest('[role="dialog"]') as HTMLElement | null)?.dispatchEvent(
                    new KeyboardEvent('keydown', { key: '+', bubbles: true })
                  );
                }}
              >
                <LucideReact.ZoomIn aria-hidden="true" className="w-4 h-4" />
              </button>
            </div>
            
            <button
              type="button"
              onClick={closeLightbox}
              aria-label="Close image viewer"
              className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70"
            >
              <LucideReact.X aria-hidden="true" className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {/* Method Details Modal */}
      <MethodDetailsModal
        isOpen={methodDetailsModal.isOpen}
        operationName={selectedMethodName}
        config={getOp(selectedMethodName) ?? null}
        onClose={methodDetailsModal.closeModal}
      />
      
      {/* Quota/Limit Exceeded Popup */}
      {quotaPopup.show && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
          <div
            ref={quotaRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="quota-dialog-title"
            aria-describedby="quota-dialog-message"
            tabIndex={-1}
            className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl max-w-md w-full p-6 border-2 border-red-500"
          >
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                  <LucideReact.AlertTriangle aria-hidden="true" className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
              </div>
              <div className="flex-1">
                <h2 id="quota-dialog-title" className="text-lg font-bold text-slate-900 dark:text-slate-50 mb-2">
                  {quotaPopup.type === 'quota' ? 'Storage Quota Exceeded' : 'Image Limit Reached'}
                </h2>
                <p id="quota-dialog-message" className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                  {quotaPopup.message}
                </p>
                
                {quotaPopup.type === 'quota' && quotaPopup.details && (
                  <div className="bg-slate-100 dark:bg-zinc-800 rounded-lg p-3 mb-4 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Current usage:</span>
                      <span className="font-medium text-slate-900 dark:text-slate-50">
                        {quotaPopup.details.current_mb}MB
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Your quota:</span>
                      <span className="font-medium text-slate-900 dark:text-slate-50">
                        {quotaPopup.details.quota_mb}MB
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">File size:</span>
                      <span className="font-medium text-slate-900 dark:text-slate-50">
                        {quotaPopup.details.file_size_mb}MB
                      </span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-300 dark:border-zinc-700">
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Quota used:</span>
                        <span className="font-bold text-red-600 dark:text-red-400">
                          {quotaPopup.details.percentage_used}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                
                {quotaPopup.type === 'count' && quotaPopup.details && (
                  <div className="bg-slate-100 dark:bg-zinc-800 rounded-lg p-3 mb-4 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Current images:</span>
                      <span className="font-medium text-slate-900 dark:text-slate-50">
                        {quotaPopup.details.current_count}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Maximum allowed:</span>
                      <span className="font-medium text-slate-900 dark:text-slate-50">
                        {quotaPopup.details.max_count}
                      </span>
                    </div>
                  </div>
                )}
                
                <div className="space-y-2">
                  <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                    What you can do:
                  </p>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
                    <li>Delete some existing images from gallery</li>
                    <li>Clear processed results with Reset button</li>
                    {quotaPopup.type === 'quota' && <li>Create a free account for 10x more storage (500MB)</li>}
                  </ul>
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={closeQuotaPopup}
                data-autofocus
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default App;