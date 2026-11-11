import React, { useState, useEffect, useMemo } from 'react';
import * as LucideReact from 'lucide-react';
import { ProcessedResult } from '../types';
import { downloadImage, downloadAllIntermediates } from '../utils/download';
import { ImageAnalytics } from './ImageAnalytics';
import PreviewCanvas from './PreviewCanvas';
import CompareSlider from './CompareSlider';
import DiffView from './DiffView';
import { usePicker } from '../contexts/PickerContext';
import { usePipelineContext } from '../contexts/PipelineContext';

type InspectorView = 'normal' | 'side-by-side' | 'slider' | 'diff';

interface InspectorProps {
  result: ProcessedResult;
  view: InspectorView;
  onViewChange: (view: InspectorView) => void;
  onBack: () => void;
  /** Step to show (0-based) when the user presses a step's "Preview" button; -1 = final. */
  selectedStepIndex?: number;
}

const Inspector: React.FC<InspectorProps> = ({
  result,
  view,
  onViewChange,
  onBack,
  selectedStepIndex
}) => {
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1); // -1 = final result
  const [analyticsImageUrl, setAnalyticsImageUrl] = useState('');
  const [analyticsImageName, setAnalyticsImageName] = useState('');

  // Reset step when result changes
  useEffect(() => {
    setCurrentStepIndex(-1);
  }, [result.id]);

  // A pipeline step's "Preview this step" button selects that step here (it
  // used to only highlight the button).
  useEffect(() => {
    if (typeof selectedStepIndex !== 'number') return;
    setCurrentStepIndex(selectedStepIndex);
    if (selectedStepIndex >= 0) onViewChange('normal');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStepIndex]);

  // While a point / region / colour is being picked for step k, show that
  // step's INPUT image (the original for step 1). Picking on the final image
  // gave wrong coordinates whenever a later step crops, flips or rotates.
  const { activePicker } = usePicker();
  const { pipeline } = usePipelineContext();
  const pickStepIndex = activePicker ? pipeline.findIndex((st) => st.id === activePicker.stepId) : -1;
  const pickInputUrl =
    pickStepIndex < 0
      ? null
      : pickStepIndex === 0
      ? result.originalUrl
      : result.intermediateResults?.[pickStepIndex - 1] ?? null;

  // Update analytics image when step changes
  useEffect(() => {
    // Inline updateAnalyticsImage logic
    if (currentStepIndex === -1) {
      // Final result
      setAnalyticsImageUrl(result.processedUrl);
      setAnalyticsImageName('Final Result');
    } else if (result.intermediateResults && currentStepIndex < result.intermediateResults.length) {
      // Intermediate step
      setAnalyticsImageUrl(result.intermediateResults[currentStepIndex]);
      setAnalyticsImageName(`Step ${currentStepIndex + 1}`);
    }
  }, [currentStepIndex, result]);

  const updateAnalyticsImage = () => {
    if (currentStepIndex === -1) {
      // Final result
      setAnalyticsImageUrl(result.processedUrl);
      setAnalyticsImageName('Final Result');
    } else if (result.intermediateResults && currentStepIndex < result.intermediateResults.length) {
      // Intermediate step
      setAnalyticsImageUrl(result.intermediateResults[currentStepIndex]);
      setAnalyticsImageName(`Step ${currentStepIndex + 1}`);
    }
  };

  const hasIntermediates = result.intermediateResults && result.intermediateResults.length > 0;
  const totalSteps = hasIntermediates ? (result.intermediateResults?.length || 0) : 0;
  const maxStepIndex = totalSteps - 1;

  // Comparison stages: Original + each pipeline step (last = final).
  const stages = useMemo(() => {
    const list: { label: string; url: string }[] = [{ label: 'Original', url: result.originalUrl }];
    const inter = result.intermediateResults ?? [];
    if (inter.length > 0) {
      inter.forEach((url, i) =>
        list.push({ label: i === inter.length - 1 ? `Final (Step ${i + 1})` : `Step ${i + 1}`, url })
      );
    } else {
      list.push({ label: 'Final', url: result.processedUrl });
    }
    return list;
  }, [result]);

  const [stageA, setStageA] = useState(0);
  const [stageB, setStageB] = useState(1);
  useEffect(() => {
    setStageA(0);
    setStageB(Math.max(1, stages.length - 1));
  }, [result.id, stages.length]);

  const getStageUrl = (idx: number) => stages[idx]?.url ?? result.processedUrl;

  const getCurrentImageUrl = () => {
    if (currentStepIndex === -1) {
      return result.processedUrl;
    }
    if (hasIntermediates && currentStepIndex >= 0 && currentStepIndex < result.intermediateResults!.length) {
      return result.intermediateResults![currentStepIndex];
    }
    return result.processedUrl;
  };

  const handlePreviousStep = () => {
    if (currentStepIndex > -1) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleNextStep = () => {
    if (currentStepIndex < maxStepIndex) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handleDownload = () => {
    const imageUrl = getCurrentImageUrl();
    const filename = currentStepIndex === -1 
      ? `pixelflow_result_${result.id}.jpg`
      : `pixelflow_result_${result.id}_step_${currentStepIndex + 1}.jpg`;
    
    downloadImage(imageUrl, filename);
  };

  const handleDownloadAllSteps = async () => {
    await downloadAllIntermediates(result, `result-${result.id}`);
  };

  const handleShowAnalytics = () => {
    updateAnalyticsImage();
    setShowAnalytics(true);
  };

  const getStepLabel = () => {
    if (currentStepIndex === -1) {
      return 'Final Result';
    }
    return `Step ${currentStepIndex + 1}${totalSteps > 0 ? ` of ${totalSteps}` : ''}`;
  };

  return (
    <>
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4 border-b border-gray-200 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onBack} className="btn-sm" title="Back to results grid" aria-label="Back to results grid">
              <LucideReact.ArrowLeft aria-hidden="true" className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Inspector</h2>
          </div>
          
          {/* Step Navigation - Center (normal view only) */}
          {hasIntermediates && view === 'normal' && (
            <div className="flex items-center space-x-3 bg-gray-100 dark:bg-zinc-800 px-3 py-2 rounded-lg">
              <button
                onClick={handlePreviousStep}
                disabled={currentStepIndex <= -1}
                className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Previous step"
                aria-label="Previous step"
              >
                <LucideReact.ChevronLeft aria-hidden="true" className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </button>
              
              <span className="text-sm font-semibold text-gray-900 dark:text-white min-w-[96px] text-center" aria-live="polite">
                {getStepLabel()}
              </span>
              
              <button
                onClick={handleNextStep}
                disabled={currentStepIndex >= maxStepIndex}
                className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Next step"
                aria-label="Next step"
              >
                <LucideReact.ChevronRight aria-hidden="true" className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </button>
            </div>
          )}
          
          <div className="flex flex-wrap items-center gap-2">
            {/* View Controls */}
            <button
              onClick={() => onViewChange('normal')}
              className={`btn-sm ${view === 'normal' ? 'active' : ''}`}
              title="Normal View"
              aria-label="Normal View"
              aria-pressed={view === 'normal'}
            >
              <LucideReact.Image aria-hidden="true" className="w-5 h-5" />
            </button>
            <button
              onClick={() => onViewChange('side-by-side')}
              className={`btn-sm ${view === 'side-by-side' ? 'active' : ''}`}
              title="Side-by-side View"
              aria-label="Side-by-side View"
              aria-pressed={view === 'side-by-side'}
            >
              <LucideReact.Columns aria-hidden="true" className="w-5 h-5" />
            </button>
            <button
              onClick={() => onViewChange('slider')}
              className={`btn-sm ${view === 'slider' ? 'active' : ''}`}
              title="Before/After slider"
              aria-label="Before/After slider"
              aria-pressed={view === 'slider'}
            >
              <LucideReact.SlidersHorizontal aria-hidden="true" className="w-5 h-5" />
            </button>
            <button
              onClick={() => onViewChange('diff')}
              className={`btn-sm ${view === 'diff' ? 'active' : ''}`}
              title="Difference / overlay"
              aria-label="Difference / overlay"
              aria-pressed={view === 'diff'}
            >
              <LucideReact.Layers aria-hidden="true" className="w-5 h-5" />
            </button>

            <div className="w-px h-6 bg-gray-300 dark:bg-zinc-700"></div>
            
            {/* Action Buttons */}
            <button 
              onClick={handleShowAnalytics} 
              className="btn-sm" 
              title="View Analytics"
              aria-label="View Analytics"
            >
              <LucideReact.BarChart3 aria-hidden="true" className="w-5 h-5" />
            </button>

            {hasIntermediates && (
              <button 
                onClick={handleDownloadAllSteps} 
                className="btn-sm" 
                title="Download All Steps"
                aria-label="Download All Steps"
              >
                <LucideReact.FolderDown aria-hidden="true" className="w-5 h-5" />
              </button>
            )}
            
            <button 
              onClick={handleDownload} 
              className="btn-sm" 
              title={`Download ${getStepLabel()}`}
              aria-label={`Download ${getStepLabel()}`}
            >
              <LucideReact.Download aria-hidden="true" className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-3 sm:p-4 flex flex-col min-h-0">
          {/* A/B stage selectors for the comparison views */}
          {view !== 'normal' && (
            <div className="flex flex-wrap items-center justify-center gap-4 mb-3 text-sm">
              <label className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                A:<span className="sr-only"> first image to compare</span>
                <select
                  value={stageA}
                  onChange={(e) => setStageA(Number(e.target.value))}
                  className="param-select"
                >
                  {stages.map((s, i) => (
                    <option key={i} value={i}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                B:<span className="sr-only"> second image to compare</span>
                <select
                  value={stageB}
                  onChange={(e) => setStageB(Number(e.target.value))}
                  className="param-select"
                >
                  {stages.map((s, i) => (
                    <option key={i} value={i}>{s.label}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="flex-1 min-h-0">
            {view === 'normal' && (
              <div className="w-full h-full flex flex-col items-center justify-center">
                {pickInputUrl && (
                  <p className="mb-2 text-sm font-medium text-blue-800 dark:text-blue-200" role="status">
                    Picking on the input of step {pickStepIndex + 1}
                    {pickStepIndex === 0 ? ' (the original image)' : ` (the result of step ${pickStepIndex})`}
                  </p>
                )}
                <PreviewCanvas
                  src={pickInputUrl || getCurrentImageUrl()}
                  alt={pickInputUrl ? `Input of step ${pickStepIndex + 1}` : getStepLabel()}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                />
                {hasIntermediates && (
                  <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">{getStepLabel()}</div>
                )}
              </div>
            )}

            {view === 'side-by-side' && (
              <div className="w-full h-full grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[stageA, stageB].map((idx, k) => (
                  <div key={k} className="flex flex-col min-h-0">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-2 text-center">
                      {stages[idx]?.label}
                    </h3>
                    <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-2">
                      <img
                        src={getStageUrl(idx)}
                        alt={stages[idx]?.label}
                        className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {view === 'slider' && (
              <div className="w-full h-full flex items-center justify-center">
                <CompareSlider
                  beforeSrc={getStageUrl(stageA)}
                  afterSrc={getStageUrl(stageB)}
                  beforeLabel={stages[stageA]?.label}
                  afterLabel={stages[stageB]?.label}
                />
              </div>
            )}

            {view === 'diff' && (
              <div className="w-full h-full flex items-center justify-center">
                <DiffView aSrc={getStageUrl(stageA)} bSrc={getStageUrl(stageB)} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Analytics Modal - Dynamic based on current step */}
      <ImageAnalytics
        isOpen={showAnalytics}
        onClose={() => setShowAnalytics(false)}
        imageUrl={analyticsImageUrl}
        imageName={analyticsImageName}
      />
    </>
  );
};

export default Inspector;
