import React from 'react';
import * as LucideReact from 'lucide-react';
import { useDialog } from '../hooks/useDialog';
import { OperationSpecDTO } from '../types';

interface MethodDetailsModalProps {
  isOpen: boolean;
  operationName: string;
  config: OperationSpecDTO | null;
  onClose: () => void;
}

const NUMERIC_TYPES = ['int', 'float', 'odd_kernel', 'angle'];

const MethodDetailsModal: React.FC<MethodDetailsModalProps> = ({
  isOpen,
  operationName,
  config,
  onClose
}) => {
  const dialogRef = useDialog<HTMLDivElement>(isOpen && !!config, onClose);
  if (!isOpen || !config) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="method-details-title"
        tabIndex={-1}
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <LucideReact.Info aria-hidden="true" className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 id="method-details-title" className="text-xl font-bold text-zinc-900 dark:text-white">
              {operationName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close method details"
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-600 dark:text-gray-400"
          >
            <LucideReact.X aria-hidden="true" className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Description */}
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">Description</h3>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              {config.description}
            </p>
          </div>

          {/* Parameters */}
          {config.params && config.params.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Parameters</h3>
              <div className="space-y-4">
                {config.params.map((param, index) => (
                  <div key={index} className="bg-gray-50 dark:bg-zinc-800 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold text-zinc-900 dark:text-white">
                        {param.label}
                      </h4>
                      <span className={`text-xs px-2 py-1 rounded-full font-mono ${
                        NUMERIC_TYPES.includes(param.type) ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' :
                        param.type === 'enum' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200'
                      }`}>
                        {param.type}
                      </span>
                    </div>

                    {param.help && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        {param.help}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Default:</span>
                        <span className="ml-2 font-mono text-zinc-900 dark:text-white">
                          {String(param.default)}
                        </span>
                      </div>

                      {NUMERIC_TYPES.includes(param.type) && param.min !== undefined && (
                        <div>
                          <span className="font-medium text-gray-700 dark:text-gray-300">Range:</span>
                          <span className="ml-2 font-mono text-zinc-900 dark:text-white">
                            {param.min} - {param.max}
                          </span>
                        </div>
                      )}

                      {param.type === 'enum' && param.options && (
                        <div className="col-span-2">
                          <span className="font-medium text-gray-700 dark:text-gray-300">Options:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {param.options.map((option) => (
                              <span
                                key={option.value}
                                className="px-2 py-1 bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-300 rounded text-xs font-mono"
                              >
                                {option.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Additional Technical Info */}
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-3">Technical Information</h3>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <LucideReact.Lightbulb aria-hidden="true" className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-2 text-sm">
                  {getAdditionalInfo(operationName)}
                </div>
              </div>
            </div>
          </div>

          {/* Usage Tips */}
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-3">Usage Tips</h3>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-start gap-3">
                <LucideReact.Zap aria-hidden="true" className="w-5 h-5 text-amber-700 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  {getUsageTips(operationName)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Comprehensive technical information for all operations
const getAdditionalInfo = (operationName: string) => {
  const info: Record<string, React.ReactNode> = {
    // Basic Operations
    'Brightness': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Linear pixel value adjustment using the formula: new_pixel = pixel × (1 + amount/100)</p>
        <p><strong>Technical Details:</strong> Multiplicative brightness adjustment that preserves relative contrast between pixels while shifting overall luminance.</p>
        <p><strong>Performance:</strong> Very fast operation with O(n) complexity where n is the number of pixels.</p>
        <p><strong>Color Space:</strong> Works in RGB space, affecting all three color channels equally.</p>
        <p><strong>Best Use Cases:</strong> Correcting underexposed or overexposed images, adjusting overall image luminance.</p>
      </div>
    ),
    'Contrast': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Enhances the difference between light and dark pixels using ImageEnhance.Contrast with factor = 1 + (amount/100)</p>
        <p><strong>Technical Details:</strong> Multiplies the difference of each pixel from the mean gray level, effectively stretching or compressing the histogram.</p>
        <p><strong>Mathematical Formula:</strong> new_pixel = mean + (pixel - mean) × contrast_factor</p>
        <p><strong>Performance:</strong> Fast linear operation with minimal computational overhead.</p>
        <p><strong>Best Use Cases:</strong> Improving flat or washed-out images, enhancing detail visibility in low-contrast scenes.</p>
      </div>
    ),
    'Gaussian Blur': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Convolves the image with a Gaussian kernel to create smooth, natural-looking blur effects.</p>
        <p><strong>Technical Details:</strong> Uses a 2D Gaussian function G(x,y) = (1/2πσ²)e^(-(x²+y²)/2σ²) where σ is related to the radius parameter.</p>
        <p><strong>Kernel Size:</strong> Automatically determined based on radius. Larger radius creates larger kernels and more blur.</p>
        <p><strong>Performance:</strong> Computational complexity increases quadratically with radius. Use separable filters for optimization.</p>
        <p><strong>Applications:</strong> Noise reduction, artistic effects, background separation, preprocessing for edge detection.</p>
      </div>
    ),
    'Bilateral Filter': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Edge-preserving smoothing filter that combines spatial and intensity information to reduce noise while maintaining sharp edges.</p>
        <p><strong>Technical Details:</strong> Uses two Gaussian functions - one for spatial distance and one for intensity difference. Only averages pixels that are both spatially close and similar in intensity.</p>
        <p><strong>Parameters:</strong> 'd' controls the neighborhood size, sigmaColor controls how dissimilar colors are averaged, sigmaSpace controls the spatial extent.</p>
        <p><strong>Performance:</strong> Computationally intensive O(d²) per pixel. Consider reducing 'd' for faster processing on large images.</p>
        <p><strong>Applications:</strong> Portrait photography, medical imaging, noise reduction while preserving important edges and textures.</p>
      </div>
    ),
    'Canny Edge Detection': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Multi-stage edge detection algorithm consisting of: 1) Gaussian smoothing, 2) Gradient calculation, 3) Non-maximum suppression, 4) Hysteresis thresholding.</p>
        <p><strong>Technical Details:</strong> Uses dual thresholds to identify strong and weak edges. Strong edges above threshold2 are kept, weak edges between threshold1 and threshold2 are kept only if connected to strong edges.</p>
        <p><strong>Output Format:</strong> Binary image where edges are white (255) and non-edges are black (0).</p>
        <p><strong>Threshold Guidelines:</strong> threshold1 should be 2-3 times smaller than threshold2. Typical ratios: 1:2 or 1:3.</p>
        <p><strong>Applications:</strong> Object detection, feature extraction, image segmentation preprocessing, computer vision pipelines.</p>
      </div>
    ),
    'Median Filter': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Non-linear filter that replaces each pixel with the median value of pixels in its neighborhood.</p>
        <p><strong>Technical Details:</strong> Excellent for removing salt-and-pepper noise while preserving edges. Uses a square kernel of size ksize×ksize.</p>
        <p><strong>Edge Preservation:</strong> Unlike linear filters, median filtering preserves step edges while removing impulse noise.</p>
        <p><strong>Performance:</strong> O(k²log(k²)) per pixel where k is kernel size. More expensive than linear filters but highly effective.</p>
        <p><strong>Applications:</strong> Noise removal in digital photography, preprocessing for computer vision, removing outlier pixels.</p>
      </div>
    ),
    'Morphological Opening': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Erosion followed by dilation using the same structuring element. Removes small objects and smooths object boundaries.</p>
        <p><strong>Technical Details:</strong> First shrinks objects (erosion), then expands remaining objects back (dilation). Net effect removes noise and small features.</p>
        <p><strong>Structuring Elements:</strong> Rectangle preserves square features, Ellipse creates circular effects, Cross creates cross-shaped patterns.</p>
        <p><strong>Applications:</strong> Noise removal, object separation, removing small connected components, smoothing object contours.</p>
      </div>
    ),
    'Morphological Closing': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Dilation followed by erosion using the same structuring element. Fills small holes and gaps in objects.</p>
        <p><strong>Technical Details:</strong> First expands objects (dilation), then shrinks them back (erosion). Net effect fills internal holes and connects nearby objects.</p>
        <p><strong>Use Cases:</strong> Filling holes in segmented objects, connecting broken lines, completing object boundaries.</p>
        <p><strong>Complementary Operation:</strong> Dual of morphological opening. While opening removes objects, closing fills gaps.</p>
      </div>
    ),
    'Histogram Equalization': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Redistributes pixel intensities to utilize the full available intensity range, creating uniform histogram distribution.</p>
        <p><strong>Technical Details:</strong> Computes cumulative distribution function (CDF) of pixel intensities and maps original values to achieve uniform distribution.</p>
        <p><strong>Implementation:</strong> Converts to YUV color space, equalizes luminance channel only, then converts back to preserve color information.</p>
        <p><strong>Limitations:</strong> Can cause over-enhancement in already well-contrasted regions. May introduce artifacts in smooth gradients.</p>
        <p><strong>Applications:</strong> Medical imaging, satellite imagery, low-contrast photograph enhancement, preprocessing for computer vision.</p>
      </div>
    ),
    'Adaptive Histogram Equalization': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> CLAHE (Contrast Limited Adaptive Histogram Equalization) applies histogram equalization locally to small regions rather than globally.</p>
        <p><strong>Technical Details:</strong> Divides image into small tiles (8×8), applies histogram equalization to each tile separately, then uses bilinear interpolation to eliminate artificial boundaries.</p>
        <p><strong>Clip Limit:</strong> Prevents over-amplification by clipping the histogram at the specified limit before equalization.</p>
        <p><strong>Advantages:</strong> Avoids over-enhancement issues of global histogram equalization while providing local contrast improvement.</p>
        <p><strong>Applications:</strong> Medical imaging, underwater photography, low-light image enhancement, improving local contrast.</p>
      </div>
    ),
    'Sobel X': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Computes horizontal gradients using the Sobel operator, which is a discrete differentiation operator that combines Gaussian smoothing with differentiation.</p>
        <p><strong>Kernel:</strong> Uses the horizontal Sobel kernel: [[-1,0,1], [-2,0,2], [-1,0,1]] for edge detection in the X (horizontal) direction.</p>
        <p><strong>Technical Details:</strong> Produces strong responses to vertical edges and gradients. Output values represent the rate of change in the horizontal direction.</p>
        <p><strong>Performance:</strong> Fast convolution operation with 3×3 kernel. Separable implementation possible for larger kernels.</p>
        <p><strong>Applications:</strong> Vertical edge detection, gradient analysis, feature extraction, preprocessing for object detection.</p>
      </div>
    ),
    'Sobel Y': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Computes vertical gradients using the Sobel operator for detecting horizontal edges and gradients.</p>
        <p><strong>Kernel:</strong> Uses the vertical Sobel kernel: [[-1,-2,-1], [0,0,0], [1,2,1]] for edge detection in the Y (vertical) direction.</p>
        <p><strong>Technical Details:</strong> Produces strong responses to horizontal edges. Combined with Sobel X, provides complete gradient information.</p>
        <p><strong>Output Interpretation:</strong> Higher values indicate stronger horizontal edges or gradients in the vertical direction.</p>
        <p><strong>Applications:</strong> Horizontal edge detection, texture analysis, gradient field computation, object boundary detection.</p>
      </div>
    ),
    'Sobel Combined': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Combines Sobel X and Sobel Y results using gradient magnitude: magnitude = √(sobelX² + sobelY²)</p>
        <p><strong>Technical Details:</strong> Provides edge strength regardless of orientation. Creates a complete edge map showing all edge directions.</p>
        <p><strong>Mathematical Foundation:</strong> Computes the Euclidean norm of the gradient vector at each pixel.</p>
        <p><strong>Advantages:</strong> Direction-independent edge detection, single output for complete edge information.</p>
        <p><strong>Applications:</strong> General edge detection, feature extraction, image segmentation preprocessing, computer vision pipelines.</p>
      </div>
    ),
    'Laplacian': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Second-order derivative operator that detects regions of rapid intensity change (edges) using the Laplacian kernel.</p>
        <p><strong>Technical Details:</strong> Computes the sum of second partial derivatives (∂²f/∂x² + ∂²f/∂y²). Highly sensitive to noise.</p>
        <p><strong>Kernel Options:</strong> Different kernel sizes provide different sensitivity levels. Larger kernels smooth noise but may miss fine details.</p>
        <p><strong>Zero-Crossing:</strong> Edges appear as zero-crossings in the Laplacian response, making edge localization precise.</p>
        <p><strong>Applications:</strong> Fine edge detection, blob detection, image sharpening, mathematical morphology operations.</p>
      </div>
    ),
    'Gamma Correction': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Non-linear intensity transformation using the power law: output = input^gamma</p>
        <p><strong>Technical Details:</strong> Gamma &lt; 1 brightens the image (expands dark regions), gamma &gt; 1 darkens the image (compresses dark regions).</p>
        <p><strong>Display Correction:</strong> Compensates for non-linear response characteristics of display devices and human visual perception.</p>
        <p><strong>Mathematical Properties:</strong> Preserves black (0) and white (255) levels while redistributing intermediate gray levels.</p>
        <p><strong>Applications:</strong> Monitor calibration, image enhancement, HDR tone mapping, correcting camera response curves.</p>
      </div>
    ),
    'Threshold Otsu': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Automatic threshold selection method that finds the optimal threshold by minimizing intra-class variance (or equivalently, maximizing inter-class variance).</p>
        <p><strong>Technical Details:</strong> Assumes bimodal histogram and finds the threshold that best separates the two peaks. Computes weighted sum of variances for all possible thresholds.</p>
        <p><strong>Optimization:</strong> Uses dynamic programming for efficient computation. Threshold selection is fully automatic with no user parameters.</p>
        <p><strong>Limitations:</strong> Works best with bimodal histograms. May fail with images having uniform intensity or multiple peaks.</p>
        <p><strong>Applications:</strong> Document processing, object segmentation, binary image creation, preprocessing for shape analysis.</p>
      </div>
    ),
    'Watershed': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Segmentation technique that treats the image as a topographic surface where pixel intensities represent elevation levels.</p>
        <p><strong>Technical Details:</strong> Simulates flooding from local minima (markers). Watershed boundaries form where different flood regions meet.</p>
        <p><strong>Implementation:</strong> Uses distance transform to find seed points, then applies marker-based watershed to prevent over-segmentation.</p>
        <p><strong>Over-segmentation:</strong> Raw watershed often creates too many segments. This implementation uses automatic marker detection to control segmentation.</p>
        <p><strong>Applications:</strong> Cell counting in microscopy, object separation, image segmentation, medical image analysis.</p>
      </div>
    ),
    'SLIC Superpixels': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Simple Linear Iterative Clustering that groups pixels into perceptually meaningful superpixels using k-means clustering in 5D space (x, y, L, a, b).</p>
        <p><strong>Technical Details:</strong> Combines spatial proximity with color similarity. Operates in CIELAB color space for perceptually uniform color distances.</p>
        <p><strong>Parameters:</strong> n_segments controls the target number of superpixels, compactness balances color similarity vs spatial proximity.</p>
        <p><strong>Advantages:</strong> Regular superpixel shapes, adjustable compactness, fast computation, good boundary adherence.</p>
        <p><strong>Applications:</strong> Image segmentation preprocessing, reducing computational complexity, object proposal generation, semantic segmentation.</p>
      </div>
    ),
    'Harris Corner Detection': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Detects corner points by analyzing the local structure of gradients using the Harris corner response function.</p>
        <p><strong>Technical Details:</strong> Computes the structure tensor (matrix of gradient products) and analyzes its eigenvalues to determine corner strength.</p>
        <p><strong>Mathematical Foundation:</strong> Corner response R = det(M) - k(trace(M))² where M is the structure tensor and k ≈ 0.04-0.06.</p>
        <p><strong>Threshold:</strong> Points with response above threshold × max_response are considered corners. Lower thresholds detect more corners.</p>
        <p><strong>Applications:</strong> Feature matching, object tracking, camera calibration, image registration, 3D reconstruction.</p>
      </div>
    ),
    'FAST Corner Detection': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Features from Accelerated Segment Test - a high-speed corner detection algorithm that examines a circle of 16 pixels around each candidate point.</p>
        <p><strong>Technical Details:</strong> A point is considered a corner if there exists a set of N contiguous pixels in the circle that are all brighter or darker than the candidate pixel by threshold amount.</p>
        <p><strong>Speed Optimization:</strong> Uses machine learning to optimize the order of pixel tests, making it one of the fastest corner detectors available.</p>
        <p><strong>Threshold Parameter:</strong> Lower values detect more corners but increase false positives. Higher values are more selective.</p>
        <p><strong>Applications:</strong> Real-time computer vision, SLAM systems, video tracking, mobile applications requiring fast feature detection.</p>
      </div>
    ),
    'ORB Features': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Oriented FAST and Rotated BRIEF - combines FAST corner detection with BRIEF descriptor, adding orientation compensation for rotation invariance.</p>
        <p><strong>Technical Details:</strong> First detects corners using FAST, then computes orientation using intensity centroid, finally extracts rotation-invariant BRIEF descriptors.</p>
        <p><strong>Rotation Invariance:</strong> Computes dominant orientation for each keypoint and rotates the BRIEF sampling pattern accordingly.</p>
        <p><strong>Performance:</strong> Fast feature detection and description, suitable for real-time applications. Much faster than SIFT/SURF.</p>
        <p><strong>Applications:</strong> Image matching, object recognition, panorama stitching, visual odometry, augmented reality.</p>
      </div>
    ),
    'Frangi Filter': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Multi-scale vessel enhancement filter that uses eigenvalues of the Hessian matrix to detect tubular structures at multiple scales.</p>
        <p><strong>Technical Details:</strong> Analyzes the second-order structure of the image to identify vessel-like patterns. Uses geometric properties of eigenvalues to distinguish vessels from other structures.</p>
        <p><strong>Scale Space:</strong> Operates across multiple scales to detect vessels of different widths. Each scale corresponds to different vessel diameters.</p>
        <p><strong>Vesselness Measure:</strong> Combines ratios of eigenvalues to create a vesselness probability map.</p>
        <p><strong>Applications:</strong> Medical imaging (blood vessel detection), retinal imaging, angiography, tubular structure enhancement.</p>
      </div>
    ),
    'Denoise Wavelet': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Wavelet-based denoising using soft thresholding in the wavelet domain. Decomposes image into wavelet coefficients, thresholds small coefficients (noise), then reconstructs.</p>
        <p><strong>Technical Details:</strong> Uses BayesShrink method to estimate noise variance and automatically determine threshold. Operates on wavelet coefficients rather than pixel values.</p>
        <p><strong>Wavelet Properties:</strong> Wavelets provide sparse representation of natural images, making noise removal effective while preserving edges and textures.</p>
        <p><strong>Sigma Parameter:</strong> Estimates the standard deviation of noise. Higher values remove more noise but may over-smooth details.</p>
        <p><strong>Applications:</strong> Photograph denoising, medical image processing, satellite imagery, scientific imaging where detail preservation is critical.</p>
      </div>
    ),
    'Unsharp Mask': (
      <div className="text-gray-700 dark:text-gray-300 space-y-2">
        <p><strong>Algorithm:</strong> Sharpening technique that subtracts a blurred (unsharp) version of the image from the original: sharpened = original + amount × (original - blurred)</p>
        <p><strong>Technical Details:</strong> Creates a mask by subtracting a Gaussian-blurred version from the original. This mask highlights high-frequency details.</p>
        <p><strong>Parameters:</strong> Radius controls the size of details to enhance, amount controls the strength of sharpening effect.</p>
        <p><strong>Frequency Domain:</strong> Effectively applies a high-pass filter to enhance edges and fine details without affecting smooth regions.</p>
        <p><strong>Applications:</strong> Photography post-processing, print preparation, detail enhancement, counteracting lens blur.</p>
      </div>
    )
  };

  return info[operationName] || (
    <div className="text-gray-700 dark:text-gray-300 space-y-2">
      <p><strong>Algorithm:</strong> This operation processes the image using {operationName.toLowerCase()} methodology.</p>
      <p><strong>Technical Details:</strong> Applies specialized image processing techniques to transform pixel values according to the operation's mathematical foundation.</p>
      <p><strong>Applications:</strong> Used in computer vision, digital photography, and image analysis workflows where {operationName.toLowerCase()} effects are desired.</p>
    </div>
  );
};

// Comprehensive usage tips for all operations
const getUsageTips = (operationName: string) => {
  const tips: Record<string, React.ReactNode> = {
    'Brightness': (
      <div className="text-gray-700 dark:text-gray-300 space-y-1">
        <p>• Positive values (+1 to +100) brighten the image, negative values (-1 to -100) darken it</p>
        <p>• Use values between -50 to +50 for subtle corrections</p>
        <p>• Extreme values (±80 to ±100) can cause clipping and loss of detail</p>
        <p>• Combine with contrast adjustment for better overall image enhancement</p>
        <p>• Apply before other operations to establish proper base exposure</p>
      </div>
    ),
    'Contrast': (
      <div className="text-gray-700 dark:text-gray-300 space-y-1">
        <p>• Positive values increase contrast (more dramatic), negative values decrease contrast (softer)</p>
        <p>• Start with small adjustments (±10 to ±30) and increase gradually</p>
        <p>• High contrast (+70 to +100) creates dramatic, punchy images but may lose subtle details</p>
        <p>• Low contrast (-30 to -70) creates soft, muted effects suitable for portraits</p>
        <p>• Watch for histogram clipping at extreme values</p>
      </div>
    ),
    'Gaussian Blur': (
      <div className="text-gray-700 dark:text-gray-300 space-y-1">
        <p>• Radius 1-3: Subtle smoothing for noise reduction</p>
        <p>• Radius 5-10: Moderate blur for skin smoothing or background softening</p>
        <p>• Radius 15+: Heavy blur for artistic effects or dramatic background separation</p>
        <p>• Processing time increases significantly with larger radius values</p>
        <p>• Apply before sharpening operations for best results</p>
      </div>
    ),
    'Bilateral Filter': (
      <div className="text-gray-700 dark:text-gray-300 space-y-1">
        <p>• Start with default values (d=9, sigmaColor=75, sigmaSpace=75) and adjust gradually</p>
        <p>• Increase sigmaColor to average more dissimilar colors (stronger smoothing)</p>
        <p>• Increase sigmaSpace to consider larger neighborhoods</p>
        <p>• Reduce 'd' parameter for faster processing on large images</p>
        <p>• Excellent for portrait photography - smooths skin while preserving eye and hair details</p>
      </div>
    ),
    'Canny Edge Detection': (
      <div className="text-gray-700 dark:text-gray-300 space-y-1">
        <p>• Maintain 1:2 or 1:3 ratio between threshold1 and threshold2 (e.g., 100:200)</p>
        <p>• Lower thresholds (50:100) detect more edges including weak ones</p>
        <p>• Higher thresholds (150:300) detect only strong, prominent edges</p>
        <p>• Apply Gaussian blur first if image is very noisy</p>
        <p>• Use the result for object detection, feature extraction, or artistic line art effects</p>
      </div>
    ),
    'Median Filter': (
      <div className="text-gray-700 dark:text-gray-300 space-y-1">
        <p>• Use kernel size 3-5 for light noise removal</p>
        <p>• Kernel size 7-9 for moderate noise (salt-and-pepper)</p>
        <p>• Larger kernels (11+) for heavy noise but will blur fine details</p>
        <p>• Always use odd kernel sizes (3, 5, 7, 9, etc.)</p>
        <p>• More effective than Gaussian blur for impulse noise</p>
      </div>
    ),
    'Morphological Opening': (
      <div className="text-gray-700 dark:text-gray-300 space-y-1">
        <p>• Use small kernel sizes (3-5) for noise removal</p>
        <p>• Rectangle shape preserves angular features</p>
        <p>• Ellipse shape creates smoother, more natural results</p>
        <p>• Cross shape for specific directional cleaning</p>
        <p>• Apply to binary or thresholded images for best results</p>
      </div>
    ),
    'Morphological Closing': (
      <div className="text-gray-700 dark:text-gray-300 space-y-1">
        <p>• Use to fill small holes and gaps in objects</p>
        <p>• Kernel size should match the size of gaps you want to fill</p>
        <p>• Rectangle shape for filling rectangular gaps</p>
        <p>• Ellipse shape for more natural hole filling</p>
        <p>• Often used after opening to clean up segmentation results</p>
      </div>
    ),
    'Histogram Equalization': (
      <div className="text-gray-700 dark:text-gray-300 space-y-1">
        <p>• Works best on low-contrast images with narrow intensity ranges</p>
        <p>• May over-enhance already well-contrasted images</p>
        <p>• Can introduce artifacts in smooth gradients (like sky)</p>
        <p>• Consider using Adaptive Histogram Equalization for better results</p>
        <p>• Apply to individual color channels or luminance only</p>
      </div>
    ),
    'Adaptive Histogram Equalization': (
      <div className="text-gray-700 dark:text-gray-300 space-y-1">
        <p>• Start with clip_limit=3 and adjust based on results</p>
        <p>• Lower clip_limit (1-2) for subtle enhancement</p>
        <p>• Higher clip_limit (5-8) for dramatic contrast improvement</p>
        <p>• More effective than global histogram equalization</p>
        <p>• Excellent for medical images, X-rays, and low-light photography</p>
      </div>
    ),
    'Gamma Correction': (
      <div className="text-gray-700 dark:text-gray-300 space-y-1">
        <p>• Gamma &lt; 1.0 (0.1-0.9) brightens dark regions, reveals shadow details</p>
        <p>• Gamma &gt; 1.0 (1.1-3.0) darkens the image, increases contrast in bright regions</p>
        <p>• Gamma = 1.0 leaves the image unchanged</p>
        <p>• Use values between 0.4-2.5 for most practical applications</p>
        <p>• Essential for monitor calibration and HDR processing</p>
      </div>
    ),
    'Threshold Otsu': (
      <div className="text-gray-700 dark:text-gray-300 space-y-1">
        <p>• Works best with bimodal histograms (clear separation between foreground and background)</p>
        <p>• No parameters to adjust - threshold is automatically calculated</p>
        <p>• Apply to grayscale images or single color channels</p>
        <p>• May fail on images with uniform intensity or multiple intensity peaks</p>
        <p>• Use for document scanning, object segmentation, or binary image creation</p>
      </div>
    ),
    'Watershed': (
      <div className="text-gray-700 dark:text-gray-300 space-y-1">
        <p>• Works best on images with clear object boundaries</p>
        <p>• No parameters - automatically finds markers and applies segmentation</p>
        <p>• Pre-process with noise reduction for better results</p>
        <p>• May over-segment complex images - use for well-defined objects</p>
        <p>• Excellent for counting objects or separating touching items</p>
      </div>
    ),
    'SLIC Superpixels': (
      <div className="text-gray-700 dark:text-gray-300 space-y-1">
        <p>• Start with n_segments=300 and compactness=10 for most images</p>
        <p>• More segments (500-1000) for detailed images, fewer (100-200) for simple images</p>
        <p>• Higher compactness (20-50) creates more regular, square-like superpixels</p>
        <p>• Lower compactness (1-10) creates superpixels that follow image boundaries better</p>
        <p>• Use as preprocessing for advanced segmentation or object recognition</p>
      </div>
    ),
    'Harris Corner Detection': (
      <div className="text-gray-700 dark:text-gray-300 space-y-1">
        <p>• Lower threshold (0.01-0.05) detects more corners including weak ones</p>
        <p>• Higher threshold (0.1-0.3) detects only strong, prominent corners</p>
        <p>• Red dots mark detected corner locations</p>
        <p>• Works best on images with clear geometric features</p>
        <p>• Use for feature matching, object tracking, or geometric analysis</p>
      </div>
    ),
    'FAST Corner Detection': (
      <div className="text-gray-700 dark:text-gray-300 space-y-1">
        <p>• Lower threshold (10-30) detects more corners, may include noise</p>
        <p>• Higher threshold (50-100) detects only strong corners</p>
        <p>• Very fast algorithm suitable for real-time applications</p>
        <p>• Red circles mark detected corner locations</p>
        <p>• Combine with descriptors like BRIEF for feature matching</p>
      </div>
    ),
    'ORB Features': (
      <div className="text-gray-700 dark:text-gray-300 space-y-1">
        <p>• Start with 500 features for most applications</p>
        <p>• More features (800-1000) for complex scenes requiring detailed matching</p>
        <p>• Fewer features (100-300) for simple scenes or performance-critical applications</p>
        <p>• Green keypoints show detected features with orientation</p>
        <p>• Rotation and scale invariant - good for object recognition</p>
      </div>
    )
  };

  return tips[operationName] || (
    <div className="text-gray-700 dark:text-gray-300 space-y-1">
      <p>• Experiment with different parameter values to understand their effects</p>
      <p>• Use live processing mode for real-time feedback while adjusting parameters</p>
      <p>• Combine with other operations for complex image processing workflows</p>
      <p>• Monitor processing time to optimize performance for your use case</p>
    </div>
  );
};
export default MethodDetailsModal;
