import React, { useEffect, useRef, useState } from 'react';
import * as LucideReact from 'lucide-react';
import { ProcessedResult } from '../types';
import { MasonryUtils } from '../utils/index';
import { downloadAllAsZip, downloadImage } from '../utils/download';
import { ImageAnalytics } from './ImageAnalytics';

interface ResultsGridProps {
  results: ProcessedResult[];
  loading: boolean;
  onResultSelect: (result: ProcessedResult) => void;
  onReset: () => void;
}

const ResultsGridComponent: React.FC<ResultsGridProps> = ({
  results,
  loading,
  onResultSelect,
  onReset
}) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsImage, setAnalyticsImage] = useState<{ url: string; name: string } | null>(null);

  // Apply masonry layout when results change
  useEffect(() => {
    if (gridRef.current && results.length > 0) {
      const images = Array.from(gridRef.current.querySelectorAll('.result-thumb')) as HTMLElement[];
      
      let loadedCount = 0;
      const totalImages = images.length;

      if (totalImages === 0) return;

      const onImageLoad = () => {
        loadedCount++;
        if (loadedCount === totalImages) {
          MasonryUtils.applyLayout(gridRef.current!, images, 120, 16);
        }
      };

      images.forEach((thumb) => {
        const img = thumb.querySelector('img');
        if (img) {
          if (img.complete) {
            onImageLoad();
          } else {
            img.addEventListener('load', onImageLoad);
          }
        }
      });

      return () => {
        images.forEach((thumb) => {
          const img = thumb.querySelector('img');
          if (img) {
            img.removeEventListener('load', onImageLoad);
          }
        });
      };
    }
  }, [results]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (gridRef.current && results.length > 0) {
        const images = Array.from(gridRef.current.querySelectorAll('.result-thumb')) as HTMLElement[];
        MasonryUtils.applyLayout(gridRef.current, images, 120, 16);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [results]);

  const handleDownloadAll = async () => {
    setDownloading(true);
    try {
      await downloadAllAsZip(results, 'pixelflow-results.zip');
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadSingle = (result: ProcessedResult, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    downloadImage(result.processedUrl, `processed-${index + 1}.jpg`);
  };

  const handleShowAnalytics = (result: ProcessedResult, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setAnalyticsImage({
      url: result.processedUrl,
      name: `Result ${index + 1}`
    });
    setShowAnalytics(true);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-600 dark:text-gray-400" role="status">
          <LucideReact.Image aria-hidden="true" className="w-16 h-16 mx-auto mb-4" />
          <p className="font-semibold text-lg mb-2">Processing...</p>
          <p className="text-sm">Results will appear when ready</p>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-600 dark:text-gray-400">
          <LucideReact.Image aria-hidden="true" className="w-16 h-16 mx-auto mb-4" />
          <p className="font-semibold text-lg mb-2">Processed results will appear here</p>
          <p className="text-sm">Apply a pipeline to your selected images</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 flex flex-col">
        <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-zinc-700 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
            Results ({results.length})
          </h2>
          
          <div className="flex items-center gap-2">
            <button
              onClick={onReset}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
              title="Reset results"
            >
              <LucideReact.RotateCcw aria-hidden="true" className="w-4 h-4" />
              <span>Reset</span>
            </button>
            
            <button
              onClick={handleDownloadAll}
              disabled={downloading}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloading ? (
                <>
                  <LucideReact.Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />
                  <span>Creating ZIP...</span>
                </>
              ) : (
                <>
                  <LucideReact.Download aria-hidden="true" className="w-4 h-4" />
                  <span>Download All</span>
                </>
              )}
            </button>
          </div>
        </div>
        
        <div 
          ref={gridRef}
          className="flex-1 p-4 overflow-y-auto relative"
          style={{ minHeight: '300px' }}
        >
          {results.map((result, index) => (
            <div
              key={result.id}
              className="result-thumb rounded-md overflow-hidden bg-white dark:bg-zinc-800 shadow-sm hover:shadow-lg transition-all duration-200 group"
              data-id={result.id}
            >
              <div 
                className="relative cursor-pointer"
                onClick={() => onResultSelect(result)}
              >
                <img
                  src={result.processedUrl}
                  alt={`Processed result ${index + 1}`}
                  className="w-full h-auto block"
                  loading="lazy"
                />
              </div>

              {/* Actions are always visible (they used to appear only on hover
                  as an overlay covering the image, which touch users could not
                  reach; WCAG 1.4.13, 2.1.1). */}
              <div className="p-2">
                <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                  Result {index + 1}
                </p>
                <div className="mt-1 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={(e) => handleDownloadSingle(result, index, e)}
                    className="p-1.5 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                    title="Download"
                    aria-label={`Download result ${index + 1}`}
                  >
                    <LucideReact.Download aria-hidden="true" className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleShowAnalytics(result, index, e)}
                    className="p-1.5 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                    title="Analytics"
                    aria-label={`Analytics for result ${index + 1}`}
                  >
                    <LucideReact.BarChart3 aria-hidden="true" className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onResultSelect(result);
                    }}
                    className="p-1.5 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                    title="Inspect"
                    aria-label={`Inspect result ${index + 1}`}
                  >
                    <LucideReact.Eye aria-hidden="true" className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Analytics Modal */}
      {analyticsImage && (
        <ImageAnalytics
          isOpen={showAnalytics}
          onClose={() => {
            setShowAnalytics(false);
            setAnalyticsImage(null);
          }}
          imageUrl={analyticsImage.url}
          imageName={analyticsImage.name}
        />
      )}
    </>
  );
};

export default ResultsGridComponent;
