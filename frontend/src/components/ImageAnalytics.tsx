import React, { useEffect, useState } from 'react';
import { X, BarChart3, Info } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';
import { calculateHistogram, calculateImageStats } from '../utils/download';

interface ImageAnalyticsProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  imageName: string;
}

export const ImageAnalytics: React.FC<ImageAnalyticsProps> = ({
  isOpen,
  onClose,
  imageUrl,
  imageName,
}) => {
  const [histogram, setHistogram] = useState<{
    red: number[];
    green: number[];
    blue: number[];
    brightness: number[];
  } | null>(null);
  
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && imageUrl) {
      loadAnalytics();
    }
    // Intentionally runs only when the dialog opens/changes; listing the
    // loader (re-created every render) would re-run it on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, imageUrl]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const [histData, statsData] = await Promise.all([
        calculateHistogram(imageUrl),
        calculateImageStats(imageUrl),
      ]);
      setHistogram(histData);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to calculate analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderHistogram = (data: number[], color: string, label: string) => {
    if (!data) return null;

    const max = Math.max(...data);
    const canvasHeight = 120;

    return (
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{label}</h4>
        <div className="relative bg-white dark:bg-zinc-800 rounded-lg p-3 border border-gray-200 dark:border-zinc-700">
          <svg width="100%" height={canvasHeight} className="overflow-visible">
            {data.map((value, index) => {
              const height = (value / max) * canvasHeight;
              const x = (index / 256) * 100;
              
              return (
                <rect
                  key={index}
                  x={`${x}%`}
                  y={canvasHeight - height}
                  width="0.4%"
                  height={height}
                  fill={color}
                  opacity="0.8"
                />
              );
            })}
          </svg>
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mt-1">
            <span>0</span>
            <span>128</span>
            <span>255</span>
          </div>
        </div>
      </div>
    );
  };

  const dialogRef = useDialog<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-2 sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-analytics-title"
        tabIndex={-1}
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 p-4 sm:p-6 border-b border-gray-200 dark:border-zinc-700 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <div className="flex items-center space-x-2">
            <BarChart3 aria-hidden="true" className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 id="image-analytics-title" className="text-xl font-bold text-gray-900 dark:text-white">Image Analytics</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close image analytics"
            className="text-gray-600 hover:text-gray-600 dark:hover:text-gray-300 transition-colors dark:text-gray-400"
          >
            <X aria-hidden="true" className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center" role="status">
                <div aria-hidden="true" className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">Analyzing image...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Image Info */}
              {stats && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Image Information</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-lg border border-gray-200 dark:border-zinc-700">
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Dimensions</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        {stats.width} × {stats.height}
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-lg border border-gray-200 dark:border-zinc-700">
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Total Pixels</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        {stats.pixels.toLocaleString()}
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-lg border border-gray-200 dark:border-zinc-700">
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Aspect Ratio</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        {(stats.width / stats.height).toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-lg border border-gray-200 dark:border-zinc-700">
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">File Name</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {imageName}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Color Statistics */}
              {stats && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Color Statistics</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Red Channel */}
                    <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
                      <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-3">Red Channel</p>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Mean:</span>
                          <span className="font-semibold text-gray-900 dark:text-white">{stats.mean.r.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Std Dev:</span>
                          <span className="font-semibold text-gray-900 dark:text-white">{stats.std.r.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Range:</span>
                          <span className="font-semibold text-gray-900 dark:text-white">{stats.min.r} - {stats.max.r}</span>
                        </div>
                      </div>
                    </div>

                    {/* Green Channel */}
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                      <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-3">Green Channel</p>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Mean:</span>
                          <span className="font-semibold text-gray-900 dark:text-white">{stats.mean.g.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Std Dev:</span>
                          <span className="font-semibold text-gray-900 dark:text-white">{stats.std.g.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Range:</span>
                          <span className="font-semibold text-gray-900 dark:text-white">{stats.min.g} - {stats.max.g}</span>
                        </div>
                      </div>
                    </div>

                    {/* Blue Channel */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                      <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-3">Blue Channel</p>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Mean:</span>
                          <span className="font-semibold text-gray-900 dark:text-white">{stats.mean.b.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Std Dev:</span>
                          <span className="font-semibold text-gray-900 dark:text-white">{stats.std.b.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Range:</span>
                          <span className="font-semibold text-gray-900 dark:text-white">{stats.min.b} - {stats.max.b}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Histograms */}
              {histogram && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center space-x-2">
                    <span>Histograms</span>
                    <div className="group relative">
                      <Info aria-hidden="true" size={16} className="text-gray-600 cursor-help dark:text-gray-400" />
                      <div className="hidden group-hover:block absolute left-0 top-full mt-1 w-64 p-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs rounded shadow-lg z-10">
                        Histograms show the distribution of pixel values across different color channels.
                      </div>
                    </div>
                  </h3>
                  
                  {renderHistogram(histogram.red, '#ef4444', 'Red Channel')}
                  {renderHistogram(histogram.green, '#22c55e', 'Green Channel')}
                  {renderHistogram(histogram.blue, '#3b82f6', 'Blue Channel')}
                  {renderHistogram(histogram.brightness, '#6b7280', 'Brightness (Luminance)')}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded-md hover:bg-gray-50 dark:hover:bg-zinc-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
