import React, { useEffect, useRef, useState } from 'react';

interface DiffViewProps {
  aSrc: string;
  bSrc: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Client-side per-pixel absolute difference of two images, rendered as a red
 * heatmap (brighter = bigger change). B is scaled to A's dimensions so steps
 * that change size (crop/resize) still produce a diff.
 */
const DiffView: React.FC<DiffViewProps> = ({ aSrc, bSrc }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([loadImage(aSrc), loadImage(bSrc)])
      .then(([a, b]) => {
        if (cancelled) return;
        const w = a.naturalWidth;
        const h = a.naturalHeight;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(a, 0, 0, w, h);
        const da = ctx.getImageData(0, 0, w, h).data;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(b, 0, 0, w, h); // scale B to A's size
        const db = ctx.getImageData(0, 0, w, h).data;

        const out = ctx.createImageData(w, h);
        for (let i = 0; i < da.length; i += 4) {
          const mag = Math.min(
            255,
            Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])
          );
          out.data[i] = mag; // red
          out.data[i + 1] = Math.floor(mag * 0.25);
          out.data[i + 2] = Math.floor(mag * 0.1);
          out.data[i + 3] = 255;
        }
        ctx.putImageData(out, 0, 0);
      })
      .catch(() => {
        if (!cancelled) setError('Could not compute diff for these images.');
      });
    return () => {
      cancelled = true;
    };
  }, [aSrc, bSrc]);

  if (error) {
    return <div className="text-sm text-gray-500 dark:text-gray-400">{error}</div>;
  }
  return <canvas ref={canvasRef} role="img" aria-label="Difference heatmap: brighter red means a bigger change between image A and image B" className="max-w-full max-h-full object-contain rounded-lg shadow-lg bg-black" />;
};

export default DiffView;
