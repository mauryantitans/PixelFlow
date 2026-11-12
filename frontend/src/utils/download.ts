import JSZip from 'jszip';
import { ProcessedResult } from '../types';

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/tiff': 'tif' };

/** "coffee.jpg" + a PNG result -> "coffee-pixelflow.png" (the extension matches the data). */
export const resultFilename = (dataUrl: string, originalName: string | undefined, index: number): string => {
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'image/png';
  const base = (originalName ?? '').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_') || `image-${index + 1}`;
  return `${base}-pixelflow.${EXT[mime] ?? 'png'}`;
};

/**
 * Download a single image from base64 data URL
 */
export const downloadImage = (dataUrl: string, filename: string = 'processed-image.jpg') => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Convert base64 data URL to Blob
 */
const dataURLtoBlob = (dataUrl: string): Blob => {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  
  return new Blob([u8arr], { type: mime });
};

/**
 * Download all processed images as a ZIP file
 */
export const downloadAllAsZip = async (
  results: ProcessedResult[],
  zipFilename: string = 'pixelflow-results.zip',
  /** image id -> original file name, so files are named after their source */
  names: Record<string, string> = {}
) => {
  if (results.length === 0) {
    alert('No results to download');
    return;
  }

  try {
    const zip = new JSZip();
    const folder = zip.folder('processed-images');

    if (!folder) {
      throw new Error('Failed to create ZIP folder');
    }

    // Add each processed image to the ZIP
    const used = new Set<string>();
    results.forEach((result, index) => {
      if (result.processedUrl) {
        const blob = dataURLtoBlob(result.processedUrl);
        let filename = resultFilename(result.processedUrl, names[result.id], index);
        // Two results from images with the same name: keep both.
        for (let n = 2; used.has(filename); n++) filename = filename.replace(/(-\d+)?(\.[^.]+)$/, `-${n}$2`);
        used.add(filename);
        folder.file(filename, blob);
      }
    });

    // Generate ZIP file
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    // Trigger download
    const link = document.createElement('a');
    link.href = URL.createObjectURL(zipBlob);
    link.download = zipFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    return true;
  } catch (error) {
    console.error('Failed to create ZIP:', error);
    alert('Failed to download images as ZIP');
    return false;
  }
};

/**
 * Download all intermediate results as a ZIP file
 */
export const downloadAllIntermediates = async (
  result: ProcessedResult,
  imageName: string = 'image'
) => {
  if (!result.intermediateResults || result.intermediateResults.length === 0) {
    alert('No intermediate results available');
    return;
  }

  try {
    const zip = new JSZip();
    const folder = zip.folder(`${imageName}-steps`);

    if (!folder) {
      throw new Error('Failed to create ZIP folder');
    }

    // Add original image
    if (result.originalUrl) {
      const blob = dataURLtoBlob(result.originalUrl);
      folder.file('00-original.jpg', blob);
    }

    // Add each intermediate step
    result.intermediateResults.forEach((stepUrl, index) => {
      const blob = dataURLtoBlob(stepUrl);
      const filename = `${String(index + 1).padStart(2, '0')}-step-${index + 1}.jpg`;
      folder.file(filename, blob);
    });

    // Generate ZIP file
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    // Trigger download
    const link = document.createElement('a');
    link.href = URL.createObjectURL(zipBlob);
    link.download = `${imageName}-processing-steps.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    return true;
  } catch (error) {
    console.error('Failed to create ZIP:', error);
    alert('Failed to download intermediate results');
    return false;
  }
};

/**
 * Calculate image histogram data from base64 image
 */
export const calculateHistogram = async (dataUrl: string): Promise<{
  red: number[];
  green: number[];
  blue: number[];
  brightness: number[];
}> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Initialize histogram arrays (256 bins for 8-bit channels)
      const red = new Array(256).fill(0);
      const green = new Array(256).fill(0);
      const blue = new Array(256).fill(0);
      const brightness = new Array(256).fill(0);

      // Calculate histograms
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        red[r]++;
        green[g]++;
        blue[b]++;

        // Calculate brightness (luminance)
        const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        brightness[lum]++;
      }

      resolve({ red, green, blue, brightness });
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = dataUrl;
  });
};

/**
 * Calculate image statistics
 */
export const calculateImageStats = async (dataUrl: string): Promise<{
  width: number;
  height: number;
  pixels: number;
  mean: { r: number; g: number; b: number };
  std: { r: number; g: number; b: number };
  min: { r: number; g: number; b: number };
  max: { r: number; g: number; b: number };
}> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const pixels = img.width * img.height;

      let sumR = 0, sumG = 0, sumB = 0;
      let minR = 255, minG = 255, minB = 255;
      let maxR = 0, maxG = 0, maxB = 0;

      // Calculate sums, min, max
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        sumR += r;
        sumG += g;
        sumB += b;

        minR = Math.min(minR, r);
        minG = Math.min(minG, g);
        minB = Math.min(minB, b);

        maxR = Math.max(maxR, r);
        maxG = Math.max(maxG, g);
        maxB = Math.max(maxB, b);
      }

      // Calculate means
      const meanR = sumR / pixels;
      const meanG = sumG / pixels;
      const meanB = sumB / pixels;

      // Calculate standard deviations
      let sumSqR = 0, sumSqG = 0, sumSqB = 0;
      for (let i = 0; i < data.length; i += 4) {
        sumSqR += Math.pow(data[i] - meanR, 2);
        sumSqG += Math.pow(data[i + 1] - meanG, 2);
        sumSqB += Math.pow(data[i + 2] - meanB, 2);
      }

      const stdR = Math.sqrt(sumSqR / pixels);
      const stdG = Math.sqrt(sumSqG / pixels);
      const stdB = Math.sqrt(sumSqB / pixels);

      resolve({
        width: img.width,
        height: img.height,
        pixels,
        mean: { r: meanR, g: meanG, b: meanB },
        std: { r: stdR, g: stdG, b: stdB },
        min: { r: minR, g: minG, b: minB },
        max: { r: maxR, g: maxG, b: maxB },
      });
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = dataUrl;
  });
};
