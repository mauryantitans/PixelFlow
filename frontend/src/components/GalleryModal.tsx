import React, { useEffect, useRef } from 'react';
import * as LucideReact from 'lucide-react';
import { useDialog } from '../hooks/useDialog';
import { ImageData } from '../types';
import { MasonryUtils } from '../utils/index';

interface GalleryModalProps {
  isOpen: boolean;
  images: ImageData[];
  onClose: () => void;
  onImageSelect: (imageId: string) => void;
  onImageRemove: (imageId: string) => void;
  onDeleteSelected: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onImageView: (imageIndex: number) => void;
}

const GalleryModal: React.FC<GalleryModalProps> = ({
  isOpen,
  images,
  onClose,
  onImageSelect,
  onImageRemove,
  onDeleteSelected,
  onSelectAll,
  onDeselectAll,
  onImageView
}) => {
  const gridRef = useRef<HTMLDivElement>(null);

  // Apply masonry layout when images change
  useEffect(() => {
    if (isOpen && gridRef.current && images.length > 0) {
      // Small delay to ensure modal is fully rendered
      const timeoutId = setTimeout(() => {
        if (gridRef.current) {
          const thumbs = Array.from(gridRef.current.querySelectorAll('.gallery-thumb')) as HTMLElement[];
          
          let loadedCount = 0;
          const totalImages = thumbs.length;

          const onImageLoad = () => {
            loadedCount++;
            if (loadedCount === totalImages && gridRef.current) {
              MasonryUtils.applyLayout(gridRef.current, thumbs, 120, 16);
            }
          };

          thumbs.forEach((thumb) => {
            const img = thumb.querySelector('img');
            if (img) {
              if (img.complete && img.naturalWidth > 0) {
                onImageLoad();
              } else {
                img.addEventListener('load', onImageLoad);
                img.addEventListener('error', onImageLoad); // Handle failed loads
              }
            }
          });
        }
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [isOpen, images]);

  // Escape, focus trap and focus return are handled by useDialog.

  const dialogRef = useDialog<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  const selectedCount = images.filter(img => img.selected).length;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-8">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gallery-title"
        tabIndex={-1}
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-4xl h-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-zinc-700 flex-shrink-0">
          <h2 id="gallery-title" className="text-xl font-bold text-zinc-900 dark:text-white">
            Image Gallery ({images.length})
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={onSelectAll} className="btn-sm">Select All</button>
            <button onClick={onDeselectAll} className="btn-sm">Deselect All</button>
            {selectedCount > 0 && (
              <button 
                onClick={onDeleteSelected}
                className="btn-sm bg-red-600 hover:bg-red-700 text-white flex items-center gap-1"
              >
                <LucideReact.Trash2 aria-hidden="true" className="w-4 h-4" />
                Delete Selected ({selectedCount})
              </button>
            )}
            <div className="text-sm text-gray-600 dark:text-gray-400 px-2" role="status">
              {selectedCount} selected
            </div>
            <button type="button" onClick={onClose} aria-label="Close gallery" className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700">
              <LucideReact.X aria-hidden="true" className="w-6 h-6 text-zinc-800 dark:text-white" />
            </button>
          </div>
        </div>

        {/* Scrollable Content with Masonry */}
        <div className="flex-1 min-h-0">
          {images.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-600 dark:text-gray-400">
                <LucideReact.Image aria-hidden="true" className="w-16 h-16 mx-auto mb-4" />
                <p className="font-semibold text-lg mb-2">No images uploaded</p>
                <p className="text-sm">Upload some images to get started</p>
              </div>
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              <div 
                ref={gridRef}
                role="list"
                aria-label="Uploaded images. Press a thumbnail to select or deselect it."
                className="relative p-6"
                style={{ minHeight: '400px' }}
              >
                {images.map((image, index) => (
                  <div
                    key={image.id}
                    role="listitem"
                    className={`gallery-thumb absolute rounded-md overflow-hidden bg-white dark:bg-zinc-800 shadow-sm transition-shadow duration-200 group ${
                        image.selected ? 'selected' : ''
                    }`}
                    data-id={image.id}
                    data-image-index={index}
                    style={{ width: '120px' }}
                  >
                    {/* The whole thumbnail is a real toggle button, so it can be
                        selected with Tab + Enter/Space (it was a clickable div). */}
                    <button
                      type="button"
                      onClick={() => onImageSelect(image.id)}
                      aria-pressed={!!image.selected}
                      aria-label={`${image.filename}, ${image.width} × ${image.height}`}
                      className="block w-full text-left cursor-pointer"
                    >
                      <span className="relative block">
                        <img
                          src={image.thumbnailDataUrl || image.dataUrl}
                          alt=""
                          className="w-full h-auto block"
                          loading="lazy"
                        />

                        {/* Selection Border */}
                        {image.selected && (
                          <span className="absolute inset-0 border-4 border-blue-500 rounded-md pointer-events-none"></span>
                        )}

                        {/* Selection Indicator */}
                        <span className={`absolute top-1 right-1 bg-blue-600 rounded-full p-1 transition-opacity z-10 ${
                          image.selected ? 'opacity-100' : 'opacity-0'
                        }`}>
                          <LucideReact.Check aria-hidden="true" className="w-3 h-3 text-white" />
                        </span>
                      </span>

                      {/* Image Info */}
                      <span className="block p-2">
                        <span className="block text-xs text-gray-600 dark:text-gray-400 truncate" title={image.filename}>
                          {image.filename}
                        </span>
                        <span className="block text-xs text-gray-600 dark:text-gray-400">
                          {image.width} × {image.height}
                        </span>
                      </span>
                    </button>

                    {/* Hover / focus controls */}
                    <div className="absolute top-1 left-1 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 z-20">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onImageView(index);
                        }}
                        className="p-1 bg-blue-700 text-white rounded hover:bg-blue-800 shadow-lg"
                        title="View full size"
                        aria-label={`View full size: ${image.filename}`}
                      >
                        <LucideReact.ZoomIn aria-hidden="true" className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onImageRemove(image.id);
                        }}
                        className="p-1 bg-red-700 text-white rounded hover:bg-red-800 shadow-lg"
                        title="Delete image"
                        aria-label={`Delete image: ${image.filename}`}
                      >
                        <LucideReact.Trash2 aria-hidden="true" className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


export default GalleryModal;
