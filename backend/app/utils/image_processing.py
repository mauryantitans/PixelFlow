from PIL import Image, ImageEnhance, ImageFilter, ImageOps
import cv2
import numpy as np
from skimage import filters, exposure, transform, restoration, feature, segmentation, morphology
from scipy import ndimage as ndi
import io
import base64
import time
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
import logging

logger = logging.getLogger(__name__)

class ProcessingResult:
    def __init__(self):
        self.final_image: Optional[Image.Image] = None
        self.intermediate_images: List[Image.Image] = []
        self.step_times: List[float] = []
        self.total_time: float = 0.0
        self.step_details: List[Dict[str, Any]] = []
        # Per-step error (None when the step succeeded). Index-aligned with the
        # pipeline; surfaced to the API in a later phase.
        self.step_errors: List[Any] = []
        # How many leading steps were served from the prefix cache (recompute
        # started after this many). 0 when caching is disabled or a full miss.
        self.cached_prefix_len: int = 0

class ImageProcessor:
    """Handles all image processing operations"""
    
    @staticmethod
    def load_image(file_path: str) -> Image.Image:
        """Load image from file path"""
        try:
            return Image.open(file_path).convert('RGB')
        except Exception as e:
            logger.error(f"Error loading image {file_path}: {e}")
            raise ValueError(f"Could not load image: {e}")
    
    @staticmethod
    def save_image(image: Image.Image, file_path: str, quality: int = 95) -> None:
        """Save image to file path"""
        try:
            image.save(file_path, quality=quality, optimize=True)
        except Exception as e:
            logger.error(f"Error saving image {file_path}: {e}")
            raise ValueError(f"Could not save image: {e}")
    
    @staticmethod
    def image_to_base64(image: Image.Image, format: str = 'JPEG') -> str:
        """Convert PIL Image to base64 string"""
        try:
            # Handle RGBA images by converting to RGB for JPEG
            if image.mode == 'RGBA' and format.upper() == 'JPEG':
                background = Image.new('RGB', image.size, (255, 255, 255))
                background.paste(image, mask=image.split()[-1])
                image = background
            elif image.mode not in ('RGB', 'L'):
                image = image.convert('RGB')
                
            buffer = io.BytesIO()
            image.save(buffer, format=format, quality=95)
            img_str = base64.b64encode(buffer.getvalue()).decode()
            return f"data:image/{format.lower()};base64,{img_str}"
        except Exception as e:
            logger.error(f"Error converting image to base64: {e}")
            raise ValueError(f"Could not convert image to base64: {e}")
    
    @staticmethod
    def create_thumbnail(image: Image.Image, size: Tuple[int, int] = (150, 150)) -> str:
        """Create thumbnail and return as base64"""
        try:
            thumbnail = image.copy()
            
            # Handle RGBA images by converting to RGB
            if thumbnail.mode == 'RGBA':
                background = Image.new('RGB', thumbnail.size, (255, 255, 255))
                background.paste(thumbnail, mask=thumbnail.split()[-1])
                thumbnail = background
            elif thumbnail.mode not in ('RGB', 'L'):
                thumbnail = thumbnail.convert('RGB')
                
            thumbnail.thumbnail(size, Image.Resampling.LANCZOS)
            return ImageProcessor.image_to_base64(thumbnail, 'JPEG')
        except Exception as e:
            logger.error(f"Error creating thumbnail: {e}")
            raise ValueError(f"Could not create thumbnail: {e}")
    
    # Basic Operations
    @staticmethod
    def apply_brightness(image: Image.Image, amount: int) -> Image.Image:
        """Apply brightness adjustment (-100 to 100)"""
        try:
            factor = 1.0 + (amount / 100.0)
            factor = max(0.1, min(factor, 3.0))
            enhancer = ImageEnhance.Brightness(image)
            return enhancer.enhance(factor)
        except Exception as e:
            logger.error(f"Error applying brightness: {e}")
            return image
    
    @staticmethod
    def apply_contrast(image: Image.Image, amount: int) -> Image.Image:
        """Apply contrast adjustment (-100 to 100)"""
        try:
            factor = 1.0 + (amount / 100.0)
            factor = max(0.1, min(factor, 3.0))
            enhancer = ImageEnhance.Contrast(image)
            return enhancer.enhance(factor)
        except Exception as e:
            logger.error(f"Error applying contrast: {e}")
            return image
    
    @staticmethod
    def apply_saturation(image: Image.Image, amount: int) -> Image.Image:
        """Apply saturation adjustment (-100 to 100)"""
        try:
            factor = 1.0 + (amount / 100.0)
            factor = max(0.0, min(factor, 3.0))
            enhancer = ImageEnhance.Color(image)
            return enhancer.enhance(factor)
        except Exception as e:
            logger.error(f"Error applying saturation: {e}")
            return image
    
    @staticmethod
    def _to_uint8(arr: np.ndarray) -> np.ndarray:
        """Convert an operation's output to uint8 safely.

        scikit-image keeps the input dtype for some functions (adjust_gamma and
        rescale_intensity return 0-255 uint8 for uint8 input) and returns 0-1
        floats for others. Multiplying a uint8 result by 255 overflowed and
        wrapped the colours, so convert by dtype and clip.
        """
        if np.issubdtype(arr.dtype, np.floating):
            arr = np.nan_to_num(arr, nan=0.0, posinf=1.0, neginf=0.0)
            return (np.clip(arr, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)
        return np.clip(arr, 0, 255).astype(np.uint8)

    @staticmethod
    def apply_exposure(image: Image.Image, amount: int) -> Image.Image:
        """Apply exposure adjustment (-100 to 100)"""
        try:
            img_array = np.array(image)
            gamma = 1.0 + (amount / 200.0)
            gamma = max(0.3, min(gamma, 2.5))
            corrected = exposure.adjust_gamma(img_array, gamma)
            return Image.fromarray(ImageProcessor._to_uint8(corrected))
        except Exception as e:
            logger.error(f"Error applying exposure: {e}")
            return image
    
    @staticmethod
    def apply_grayscale(image: Image.Image, **kwargs) -> Image.Image:
        """Convert to grayscale"""
        try:
            return ImageOps.grayscale(image).convert('RGB')
        except Exception as e:
            logger.error(f"Error applying grayscale: {e}")
            return image
    
    @staticmethod
    def apply_sepia(image: Image.Image, **kwargs) -> Image.Image:
        """Apply sepia tone effect"""
        try:
            grayscale = ImageOps.grayscale(image)
            sepia = ImageOps.colorize(grayscale, '#704214', '#C0A882')
            return sepia.convert('RGB')
        except Exception as e:
            logger.error(f"Error applying sepia: {e}")
            return image
    
    @staticmethod
    def apply_invert(image: Image.Image, **kwargs) -> Image.Image:
        """Invert image colors"""
        try:
            return ImageOps.invert(image)
        except Exception as e:
            logger.error(f"Error applying invert: {e}")
            return image
    
    @staticmethod
    def apply_solarize(image: Image.Image, **kwargs) -> Image.Image:
        """Apply solarization effect"""
        try:
            return ImageOps.solarize(image, threshold=128)
        except Exception as e:
            logger.error(f"Error applying solarize: {e}")
            return image
    
    @staticmethod
    def apply_posterize(image: Image.Image, **kwargs) -> Image.Image:
        """Apply posterization effect"""
        try:
            return ImageOps.posterize(image, bits=4)
        except Exception as e:
            logger.error(f"Error applying posterize: {e}")
            return image
    
    @staticmethod
    def apply_gaussian_blur(image: Image.Image, radius: int) -> Image.Image:
        """Apply Gaussian blur"""
        try:
            radius = max(0, min(radius, 50))
            if radius == 0:
                return image
            return image.filter(ImageFilter.GaussianBlur(radius=radius))
        except Exception as e:
            logger.error(f"Error applying gaussian blur: {e}")
            return image
    
    @staticmethod
    def apply_sharpen(image: Image.Image, level: str) -> Image.Image:
        """Apply sharpening filter"""
        try:
            if level == 'Low':
                kernel = ImageFilter.Kernel((3, 3), [0, -1, 0, -1, 5, -1, 0, -1, 0])
            elif level == 'Medium':
                kernel = ImageFilter.Kernel((3, 3), [-1, -1, -1, -1, 9, -1, -1, -1, -1])
            else:  # High
                kernel = ImageFilter.Kernel((3, 3), [-2, -2, -2, -2, 17, -2, -2, -2, -2])
            return image.filter(kernel)
        except Exception as e:
            logger.error(f"Error applying sharpen: {e}")
            return image
    
    @staticmethod
    def apply_vignette(image: Image.Image, strength: int) -> Image.Image:
        """Apply vignette effect"""
        try:
            width, height = image.size
            center_x, center_y = width // 2, height // 2
            max_radius = min(center_x, center_y)
            
            mask = Image.new('L', (width, height), 255)
            mask_array = np.array(mask)
            
            for y in range(height):
                for x in range(width):
                    distance = np.sqrt((x - center_x) ** 2 + (y - center_y) ** 2)
                    normalized_distance = min(distance / max_radius, 1.0)
                    
                    vignette_factor = 1.0 - (normalized_distance * (strength / 100.0))
                    vignette_factor = max(0.2, vignette_factor)
                    mask_array[y, x] = int(255 * vignette_factor)
            
            mask = Image.fromarray(mask_array)
            
            r, g, b = image.split()
            r = Image.composite(Image.new('L', image.size, 0), r, mask)
            g = Image.composite(Image.new('L', image.size, 0), g, mask)
            b = Image.composite(Image.new('L', image.size, 0), b, mask)
            
            return Image.merge('RGB', (r, g, b))
        except Exception as e:
            logger.error(f"Error applying vignette: {e}")
            return image
    
    @staticmethod
    def apply_grain(image: Image.Image, **kwargs) -> Image.Image:
        """Add film grain effect"""
        try:
            width, height = image.size
            noise = np.random.randint(0, 50, (height, width, 3), dtype=np.uint8)
            noise_image = Image.fromarray(noise)
            return Image.blend(image, noise_image, alpha=0.1)
        except Exception as e:
            logger.error(f"Error applying grain: {e}")
            return image

    # OpenCV Filtering Operations
    @staticmethod
    def apply_bilateral_filter(image: Image.Image, d: int, sigmaColor: int, sigmaSpace: int) -> Image.Image:
        """Apply bilateral filter"""
        try:
            img_array = np.array(image)
            filtered = cv2.bilateralFilter(img_array, d, sigmaColor, sigmaSpace)
            return Image.fromarray(filtered)
        except Exception as e:
            logger.error(f"Error applying bilateral filter: {e}")
            return image

    @staticmethod
    def apply_median_filter(image: Image.Image, ksize: int) -> Image.Image:
        """Apply median filter"""
        try:
            ksize = ksize if ksize % 2 == 1 else ksize + 1
            img_array = np.array(image)
            filtered = cv2.medianBlur(img_array, ksize)
            return Image.fromarray(filtered)
        except Exception as e:
            logger.error(f"Error applying median filter: {e}")
            return image

    @staticmethod
    def apply_box_filter(image: Image.Image, ksize: int) -> Image.Image:
        """Apply box filter (simple blur)"""
        try:
            img_array = np.array(image)
            filtered = cv2.boxFilter(img_array, -1, (ksize, ksize))
            return Image.fromarray(filtered)
        except Exception as e:
            logger.error(f"Error applying box filter: {e}")
            return image

    @staticmethod
    def apply_non_local_means_denoising(image: Image.Image, h: float, template_window_size: int, search_window_size: int) -> Image.Image:
        """Apply non-local means denoising"""
        try:
            img_array = np.array(image)
            denoised = cv2.fastNlMeansDenoisingColored(img_array, None, h, h, template_window_size, search_window_size)
            return Image.fromarray(denoised)
        except Exception as e:
            logger.error(f"Error applying non-local means denoising: {e}")
            return image

    # OpenCV Morphological Operations
    @staticmethod
    def apply_morphological_opening(image: Image.Image, kernel_size: int, shape: str) -> Image.Image:
        """Apply morphological opening"""
        try:
            img_array = np.array(image)
            
            if shape == 'Rectangle':
                kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
            elif shape == 'Ellipse':
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
            else:  # Cross
                kernel = cv2.getStructuringElement(cv2.MORPH_CROSS, (kernel_size, kernel_size))
            
            opened = cv2.morphologyEx(img_array, cv2.MORPH_OPEN, kernel)
            return Image.fromarray(opened)
        except Exception as e:
            logger.error(f"Error applying morphological opening: {e}")
            return image

    @staticmethod
    def apply_morphological_closing(image: Image.Image, kernel_size: int, shape: str) -> Image.Image:
        """Apply morphological closing"""
        try:
            img_array = np.array(image)
            
            if shape == 'Rectangle':
                kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
            elif shape == 'Ellipse':
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
            else:  # Cross
                kernel = cv2.getStructuringElement(cv2.MORPH_CROSS, (kernel_size, kernel_size))
            
            closed = cv2.morphologyEx(img_array, cv2.MORPH_CLOSE, kernel)
            return Image.fromarray(closed)
        except Exception as e:
            logger.error(f"Error applying morphological closing: {e}")
            return image

    @staticmethod
    def apply_dilate(image: Image.Image, kernel_size: int, shape: str) -> Image.Image:
        """Apply morphological dilation"""
        try:
            img_array = np.array(image)
            
            if shape == 'Rectangle':
                kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
            elif shape == 'Ellipse':
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
            else:  # Cross
                kernel = cv2.getStructuringElement(cv2.MORPH_CROSS, (kernel_size, kernel_size))
            
            dilated = cv2.dilate(img_array, kernel, iterations=1)
            return Image.fromarray(dilated)
        except Exception as e:
            logger.error(f"Error applying dilation: {e}")
            return image

    @staticmethod
    def apply_erode(image: Image.Image, kernel_size: int, shape: str) -> Image.Image:
        """Apply morphological erosion"""
        try:
            img_array = np.array(image)
            
            if shape == 'Rectangle':
                kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
            elif shape == 'Ellipse':
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
            else:  # Cross
                kernel = cv2.getStructuringElement(cv2.MORPH_CROSS, (kernel_size, kernel_size))
            
            eroded = cv2.erode(img_array, kernel, iterations=1)
            return Image.fromarray(eroded)
        except Exception as e:
            logger.error(f"Error applying erosion: {e}")
            return image

    @staticmethod
    def apply_morphological_gradient(image: Image.Image, kernel_size: int, shape: str) -> Image.Image:
        """Apply morphological gradient (dilation - erosion)"""
        try:
            img_array = np.array(image)
            
            if shape == 'Rectangle':
                kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
            elif shape == 'Ellipse':
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
            else:  # Cross
                kernel = cv2.getStructuringElement(cv2.MORPH_CROSS, (kernel_size, kernel_size))
            
            gradient = cv2.morphologyEx(img_array, cv2.MORPH_GRADIENT, kernel)
            return Image.fromarray(gradient)
        except Exception as e:
            logger.error(f"Error applying morphological gradient: {e}")
            return image

    @staticmethod
    def apply_top_hat(image: Image.Image, kernel_size: int, shape: str) -> Image.Image:
        """Apply top hat transform (original - opening)"""
        try:
            img_array = np.array(image)
            
            if shape == 'Rectangle':
                kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
            elif shape == 'Ellipse':
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
            else:  # Cross
                kernel = cv2.getStructuringElement(cv2.MORPH_CROSS, (kernel_size, kernel_size))
            
            tophat = cv2.morphologyEx(img_array, cv2.MORPH_TOPHAT, kernel)
            return Image.fromarray(tophat)
        except Exception as e:
            logger.error(f"Error applying top hat: {e}")
            return image

    @staticmethod
    def apply_black_hat(image: Image.Image, kernel_size: int, shape: str) -> Image.Image:
        """Apply black hat transform (closing - original)"""
        try:
            img_array = np.array(image)
            
            if shape == 'Rectangle':
                kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
            elif shape == 'Ellipse':
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
            else:  # Cross
                kernel = cv2.getStructuringElement(cv2.MORPH_CROSS, (kernel_size, kernel_size))
            
            blackhat = cv2.morphologyEx(img_array, cv2.MORPH_BLACKHAT, kernel)
            return Image.fromarray(blackhat)
        except Exception as e:
            logger.error(f"Error applying black hat: {e}")
            return image

    # OpenCV Edge Detection Operations
    @staticmethod
    def apply_canny_edge_detection(image: Image.Image, threshold1: int, threshold2: int) -> Image.Image:
        """Apply Canny edge detection"""
        try:
            img_array = np.array(image)
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            edges = cv2.Canny(gray, threshold1, threshold2)
            edges_rgb = cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)
            return Image.fromarray(edges_rgb)
        except Exception as e:
            logger.error(f"Error applying Canny edge detection: {e}")
            return image

    @staticmethod
    def apply_sobel_x(image: Image.Image, ksize: int) -> Image.Image:
        """Apply Sobel X edge detection"""
        try:
            img_array = np.array(image)
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            sobel = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=ksize)
            sobel = np.absolute(sobel)
            sobel = np.uint8(sobel)
            sobel_rgb = cv2.cvtColor(sobel, cv2.COLOR_GRAY2RGB)
            return Image.fromarray(sobel_rgb)
        except Exception as e:
            logger.error(f"Error applying Sobel X: {e}")
            return image

    @staticmethod
    def apply_sobel_y(image: Image.Image, ksize: int) -> Image.Image:
        """Apply Sobel Y edge detection"""
        try:
            img_array = np.array(image)
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            sobel = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=ksize)
            sobel = np.absolute(sobel)
            sobel = np.uint8(sobel)
            sobel_rgb = cv2.cvtColor(sobel, cv2.COLOR_GRAY2RGB)
            return Image.fromarray(sobel_rgb)
        except Exception as e:
            logger.error(f"Error applying Sobel Y: {e}")
            return image

    @staticmethod
    def apply_sobel_combined(image: Image.Image, ksize: int) -> Image.Image:
        """Apply combined Sobel edge detection (magnitude)"""
        try:
            img_array = np.array(image)
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            
            sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=ksize)
            sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=ksize)
            
            magnitude = np.sqrt(sobelx**2 + sobely**2)
            magnitude = np.uint8(magnitude)
            magnitude_rgb = cv2.cvtColor(magnitude, cv2.COLOR_GRAY2RGB)
            return Image.fromarray(magnitude_rgb)
        except Exception as e:
            logger.error(f"Error applying combined Sobel: {e}")
            return image

    @staticmethod
    def apply_laplacian(image: Image.Image, ksize: int) -> Image.Image:
        """Apply Laplacian edge detection"""
        try:
            img_array = np.array(image)
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            laplacian = cv2.Laplacian(gray, cv2.CV_64F, ksize=ksize)
            laplacian = np.absolute(laplacian)
            laplacian = np.uint8(laplacian)
            laplacian_rgb = cv2.cvtColor(laplacian, cv2.COLOR_GRAY2RGB)
            return Image.fromarray(laplacian_rgb)
        except Exception as e:
            logger.error(f"Error applying Laplacian: {e}")
            return image

    @staticmethod
    def apply_scharr_x(image: Image.Image, **kwargs) -> Image.Image:
        """Apply Scharr X edge detection"""
        try:
            img_array = np.array(image)
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            scharr = cv2.Scharr(gray, cv2.CV_64F, 1, 0)
            scharr = np.absolute(scharr)
            scharr = np.uint8(scharr)
            scharr_rgb = cv2.cvtColor(scharr, cv2.COLOR_GRAY2RGB)
            return Image.fromarray(scharr_rgb)
        except Exception as e:
            logger.error(f"Error applying Scharr X: {e}")
            return image

    @staticmethod
    def apply_scharr_y(image: Image.Image, **kwargs) -> Image.Image:
        """Apply Scharr Y edge detection"""
        try:
            img_array = np.array(image)
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            scharr = cv2.Scharr(gray, cv2.CV_64F, 0, 1)
            scharr = np.absolute(scharr)
            scharr = np.uint8(scharr)
            scharr_rgb = cv2.cvtColor(scharr, cv2.COLOR_GRAY2RGB)
            return Image.fromarray(scharr_rgb)
        except Exception as e:
            logger.error(f"Error applying Scharr Y: {e}")
            return image

    # OpenCV Color Space Conversions
    @staticmethod
    def apply_rgb_to_hsv(image: Image.Image, **kwargs) -> Image.Image:
        """Convert RGB to HSV color space"""
        try:
            img_array = np.array(image)
            hsv = cv2.cvtColor(img_array, cv2.COLOR_RGB2HSV)
            return Image.fromarray(hsv)
        except Exception as e:
            logger.error(f"Error converting RGB to HSV: {e}")
            return image

    @staticmethod
    def apply_rgb_to_lab(image: Image.Image, **kwargs) -> Image.Image:
        """Convert RGB to LAB color space"""
        try:
            img_array = np.array(image)
            lab = cv2.cvtColor(img_array, cv2.COLOR_RGB2LAB)
            return Image.fromarray(lab)
        except Exception as e:
            logger.error(f"Error converting RGB to LAB: {e}")
            return image

    @staticmethod
    def apply_rgb_to_yuv(image: Image.Image, **kwargs) -> Image.Image:
        """Convert RGB to YUV color space"""
        try:
            img_array = np.array(image)
            yuv = cv2.cvtColor(img_array, cv2.COLOR_RGB2YUV)
            return Image.fromarray(yuv)
        except Exception as e:
            logger.error(f"Error converting RGB to YUV: {e}")
            return image

    # OpenCV Geometric Transformations
    @staticmethod
    def apply_resize(image: Image.Image, scale_factor: float) -> Image.Image:
        """Resize image by scale factor"""
        try:
            img_array = np.array(image)
            height, width = img_array.shape[:2]
            new_width = int(width * scale_factor)
            new_height = int(height * scale_factor)
            
            resized = cv2.resize(img_array, (new_width, new_height), interpolation=cv2.INTER_LINEAR)
            return Image.fromarray(resized)
        except Exception as e:
            logger.error(f"Error resizing image: {e}")
            return image

    @staticmethod
    def apply_rotation(image: Image.Image, angle: float) -> Image.Image:
        """Rotate image by specified angle"""
        try:
            img_array = np.array(image)
            height, width = img_array.shape[:2]
            center = (width // 2, height // 2)
            
            rotation_matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
            rotated = cv2.warpAffine(img_array, rotation_matrix, (width, height))
            return Image.fromarray(rotated)
        except Exception as e:
            logger.error(f"Error rotating image: {e}")
            return image

    @staticmethod
    def apply_flip_horizontal(image: Image.Image, **kwargs) -> Image.Image:
        """Flip image horizontally"""
        try:
            img_array = np.array(image)
            flipped = cv2.flip(img_array, 1)
            return Image.fromarray(flipped)
        except Exception as e:
            logger.error(f"Error flipping image horizontally: {e}")
            return image

    @staticmethod
    def apply_flip_vertical(image: Image.Image, **kwargs) -> Image.Image:
        """Flip image vertically"""
        try:
            img_array = np.array(image)
            flipped = cv2.flip(img_array, 0)
            return Image.fromarray(flipped)
        except Exception as e:
            logger.error(f"Error flipping image vertically: {e}")
            return image

    # OpenCV Feature Detection
    @staticmethod
    def apply_fast_corner_detection(image: Image.Image, threshold: int) -> Image.Image:
        """Apply FAST corner detection"""
        try:
            img_array = np.array(image)
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            
            fast = cv2.FastFeatureDetector_create(threshold=threshold)
            keypoints = fast.detect(gray, None)
            
            result = img_array.copy()
            for kp in keypoints:
                x, y = int(kp.pt[0]), int(kp.pt[1])
                cv2.circle(result, (x, y), 3, (255, 0, 0), -1)
            
            return Image.fromarray(result)
        except Exception as e:
            logger.error(f"Error applying FAST corner detection: {e}")
            return image

    @staticmethod
    def apply_orb_features(image: Image.Image, n_features: int) -> Image.Image:
        """Apply ORB feature detection"""
        try:
            img_array = np.array(image)
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            
            orb = cv2.ORB_create(nfeatures=n_features)
            keypoints = orb.detect(gray, None)
            
            result = cv2.drawKeypoints(img_array, keypoints, None, color=(0, 255, 0))
            return Image.fromarray(result)
        except Exception as e:
            logger.error(f"Error applying ORB features: {e}")
            return image

    # Scikit-Image Enhancement Operations
    @staticmethod
    def apply_histogram_equalization(image: Image.Image, **kwargs) -> Image.Image:
        """Apply histogram equalization"""
        try:
            img_array = np.array(image)
            yuv = cv2.cvtColor(img_array, cv2.COLOR_RGB2YUV)
            yuv[:,:,0] = cv2.equalizeHist(yuv[:,:,0])
            equalized = cv2.cvtColor(yuv, cv2.COLOR_YUV2RGB)
            return Image.fromarray(equalized)
        except Exception as e:
            logger.error(f"Error applying histogram equalization: {e}")
            return image

    @staticmethod
    def apply_adaptive_histogram_equalization(image: Image.Image, clip_limit: int) -> Image.Image:
        """Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)"""
        try:
            img_array = np.array(image)
            lab = cv2.cvtColor(img_array, cv2.COLOR_RGB2LAB)
            clahe = cv2.createCLAHE(clipLimit=float(clip_limit), tileGridSize=(8,8))
            lab[:,:,0] = clahe.apply(lab[:,:,0])
            clahe_img = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)
            return Image.fromarray(clahe_img)
        except Exception as e:
            logger.error(f"Error applying adaptive histogram equalization: {e}")
            return image

    @staticmethod
    def apply_gamma_correction(image: Image.Image, gamma: float) -> Image.Image:
        """Apply gamma correction"""
        try:
            img_array = np.array(image)
            corrected = exposure.adjust_gamma(img_array, gamma)
            return Image.fromarray(ImageProcessor._to_uint8(corrected))
        except Exception as e:
            logger.error(f"Error applying gamma correction: {e}")
            return image

    @staticmethod
    def apply_contrast_stretching(image: Image.Image, in_range: str) -> Image.Image:
        """Apply contrast stretching"""
        try:
            img_array = np.array(image)
            
            if in_range == 'image':
                p2, p98 = np.percentile(img_array, (2, 98))
                stretched = exposure.rescale_intensity(img_array, in_range=(p2, p98))
            else:  # dtype
                stretched = exposure.rescale_intensity(img_array)
                
            return Image.fromarray(ImageProcessor._to_uint8(stretched))
        except Exception as e:
            logger.error(f"Error applying contrast stretching: {e}")
            return image

    @staticmethod
    def apply_adjust_log(image: Image.Image, gain: float) -> Image.Image:
        """Apply logarithmic adjustment"""
        try:
            img_array = np.array(image).astype(np.float32) / 255.0
            adjusted = exposure.adjust_log(img_array, gain=gain)
            return Image.fromarray(ImageProcessor._to_uint8(adjusted))
        except Exception as e:
            logger.error(f"Error applying log adjustment: {e}")
            return image

    @staticmethod
    def apply_adjust_sigmoid(image: Image.Image, cutoff: float, gain: float) -> Image.Image:
        """Apply sigmoid correction"""
        try:
            img_array = np.array(image).astype(np.float32) / 255.0
            adjusted = exposure.adjust_sigmoid(img_array, cutoff=cutoff, gain=gain)
            return Image.fromarray(ImageProcessor._to_uint8(adjusted))
        except Exception as e:
            logger.error(f"Error applying sigmoid adjustment: {e}")
            return image

    # Scikit-Image Restoration Operations
    @staticmethod
    def apply_denoise_wavelet(image: Image.Image, sigma: float) -> Image.Image:
        """Apply wavelet denoising"""
        try:
            img_array = np.array(image)
            img_float = img_array.astype(np.float32) / 255.0
            denoised = restoration.denoise_wavelet(img_float, sigma=sigma, channel_axis=-1)
            return Image.fromarray(ImageProcessor._to_uint8(denoised))
        except Exception as e:
            logger.error(f"Error applying wavelet denoising: {e}")
            return image

    @staticmethod
    def apply_unsharp_mask(image: Image.Image, radius: float, amount: float) -> Image.Image:
        """Apply unsharp mask sharpening"""
        try:
            img_array = np.array(image)
            # Classic unsharp mask: image + amount * (image - gaussian blur).
            # Implemented directly: scikit-image 0.22's filters.unsharp_mask
            # returned wrong values here (amount=0 changed every pixel, a flat
            # grey image came back white).
            img_float = img_array.astype(np.float64) / 255.0
            blurred = cv2.GaussianBlur(img_float, (0, 0), sigmaX=max(float(radius), 0.1))
            sharpened = img_float + float(amount) * (img_float - blurred)
            return Image.fromarray(ImageProcessor._to_uint8(sharpened))
        except Exception as e:
            logger.error(f"Error applying unsharp mask: {e}")
            return image

    # Scikit-Image Segmentation Operations
    @staticmethod
    def apply_threshold_otsu(image: Image.Image, **kwargs) -> Image.Image:
        """Apply Otsu's thresholding"""
        try:
            img_array = np.array(image)
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            
            threshold_value = filters.threshold_otsu(gray)
            binary = gray > threshold_value
            binary_rgb = np.stack([binary, binary, binary], axis=-1).astype(np.uint8) * 255
            
            return Image.fromarray(binary_rgb)
        except Exception as e:
            logger.error(f"Error applying Otsu threshold: {e}")
            return image

    @staticmethod
    def apply_threshold_adaptive(image: Image.Image, block_size: int) -> Image.Image:
        """Apply adaptive thresholding"""
        try:
            img_array = np.array(image)
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            
            if block_size % 2 == 0:
                block_size += 1
                
            adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                           cv2.THRESH_BINARY, block_size, 2)
            adaptive_rgb = cv2.cvtColor(adaptive, cv2.COLOR_GRAY2RGB)
            return Image.fromarray(adaptive_rgb)
        except Exception as e:
            logger.error(f"Error applying adaptive threshold: {e}")
            return image

    @staticmethod
    def apply_watershed(image: Image.Image, **kwargs) -> Image.Image:
        """Apply watershed segmentation"""
        try:
            img_array = np.array(image)
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            
            distance = ndi.distance_transform_edt(gray > filters.threshold_otsu(gray))
            # peak_local_maxima was renamed to peak_local_max; it returns (N, 2) coords.
            coords = feature.peak_local_max(distance, min_distance=20, threshold_abs=0.3 * distance.max())
            
            mask = np.zeros(distance.shape, dtype=bool)
            mask[tuple(coords.T)] = True
            markers, _ = ndi.label(mask)
            
            labels = segmentation.watershed(-distance, markers, mask=gray > filters.threshold_otsu(gray))
            
            colored = np.zeros_like(img_array)
            for label in np.unique(labels):
                if label == 0:
                    continue
                mask = labels == label
                colored[mask] = np.random.randint(0, 255, 3)
                
            return Image.fromarray(colored)
        except Exception as e:
            logger.error(f"Error applying watershed: {e}")
            return image

    @staticmethod
    def apply_slic_superpixels(image: Image.Image, n_segments: int, compactness: float) -> Image.Image:
        """Apply SLIC superpixel segmentation"""
        try:
            img_array = np.array(image).astype(np.float32) / 255.0
            segments = segmentation.slic(img_array, n_segments=n_segments, compactness=compactness)
            segmented = segmentation.mark_boundaries(img_array, segments)
            return Image.fromarray(ImageProcessor._to_uint8(segmented))
        except Exception as e:
            logger.error(f"Error applying SLIC superpixels: {e}")
            return image

    # Scikit-Image Feature Detection
    @staticmethod
    def apply_harris_corner_detection(image: Image.Image, threshold: float) -> Image.Image:
        """Apply Harris corner detection"""
        try:
            img_array = np.array(image)
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            
            corners = feature.corner_harris(gray)
            corner_mask = corners > threshold * corners.max()
            
            result = img_array.copy()
            result[corner_mask] = [255, 0, 0]
            
            return Image.fromarray(result)
        except Exception as e:
            logger.error(f"Error applying Harris corner detection: {e}")
            return image

    # Complete OPERATIONS mapping
    OPERATIONS = {
        # Basic operations
        'Brightness': apply_brightness.__func__,
        'Contrast': apply_contrast.__func__,
        'Saturation': apply_saturation.__func__,
        'Exposure': apply_exposure.__func__,
        'Grayscale': apply_grayscale.__func__,
        'Sepia': apply_sepia.__func__,
        'Invert': apply_invert.__func__,
        'Solarize': apply_solarize.__func__,
        'Posterize': apply_posterize.__func__,
        'Gaussian Blur': apply_gaussian_blur.__func__,
        'Sharpen': apply_sharpen.__func__,
        'Vignette': apply_vignette.__func__,
        'Grain': apply_grain.__func__,
        
        # OpenCV Filtering
        'Bilateral Filter': apply_bilateral_filter.__func__,
        'Median Filter': apply_median_filter.__func__,
        'Box Filter': apply_box_filter.__func__,
        'Non-Local Means Denoising': apply_non_local_means_denoising.__func__,
        
        # OpenCV Morphological Operations
        'Morphological Opening': apply_morphological_opening.__func__,
        'Morphological Closing': apply_morphological_closing.__func__,
        'Dilate': apply_dilate.__func__,
        'Erode': apply_erode.__func__,
        'Morphological Gradient': apply_morphological_gradient.__func__,
        'Top Hat': apply_top_hat.__func__,
        'Black Hat': apply_black_hat.__func__,
        
        # OpenCV Edge Detection
        'Canny Edge Detection': apply_canny_edge_detection.__func__,
        'Sobel X': apply_sobel_x.__func__,
        'Sobel Y': apply_sobel_y.__func__,
        'Sobel Combined': apply_sobel_combined.__func__,
        'Laplacian': apply_laplacian.__func__,
        'Scharr X': apply_scharr_x.__func__,
        'Scharr Y': apply_scharr_y.__func__,
        
        # OpenCV Color Conversions
        'RGB to HSV': apply_rgb_to_hsv.__func__,
        'RGB to LAB': apply_rgb_to_lab.__func__,
        'RGB to YUV': apply_rgb_to_yuv.__func__,
        
        # OpenCV Geometric Transformations
        'Resize': apply_resize.__func__,
        'Rotation': apply_rotation.__func__,
        'Flip Horizontal': apply_flip_horizontal.__func__,
        'Flip Vertical': apply_flip_vertical.__func__,
        
        # OpenCV Feature Detection
        'FAST Corner Detection': apply_fast_corner_detection.__func__,
        'ORB Features': apply_orb_features.__func__,
        
        # Scikit-Image Enhancement
        'Histogram Equalization': apply_histogram_equalization.__func__,
        'Adaptive Histogram Equalization': apply_adaptive_histogram_equalization.__func__,
        'Gamma Correction': apply_gamma_correction.__func__,
        'Contrast Stretching': apply_contrast_stretching.__func__,
        'Adjust Log': apply_adjust_log.__func__,
        'Adjust Sigmoid': apply_adjust_sigmoid.__func__,
        
        # Scikit-Image Restoration
        'Denoise Wavelet': apply_denoise_wavelet.__func__,
        'Unsharp Mask': apply_unsharp_mask.__func__,
        
        # Scikit-Image Segmentation
        'Threshold Otsu': apply_threshold_otsu.__func__,
        'Threshold Adaptive': apply_threshold_adaptive.__func__,
        'Watershed': apply_watershed.__func__,
        'SLIC Superpixels': apply_slic_superpixels.__func__,
        
        # Scikit-Image Feature Detection
        'Harris Corner Detection': apply_harris_corner_detection.__func__,
    }
    
    @classmethod
    def apply_operation(cls, image: Image.Image, operation_name: str, params: Dict[str, Any]) -> Image.Image:
        """Apply a single operation to an image.

        Delegates to the declarative registry/executor, which validates and
        coerces parameters and resolves legacy operation names via aliases.
        On any error the original image is returned unchanged (the executor
        logs a structured StepError).
        """
        from app.processing.executor import execute_step

        result, _error = execute_step(image, {"name": operation_name, "params": params or {}})
        return result
    
    @classmethod
    def apply_pipeline(cls, image_path: str, pipeline: List[Dict[str, Any]]) -> Tuple[Image.Image, List[Image.Image]]:
        """Apply a complete pipeline to an image, returning final result and intermediate steps"""
        try:
            current_image = cls.load_image(image_path)
            intermediate_results = []
            
            for step in pipeline:
                operation_name = step.get('name')
                params = step.get('params', {})
                
                current_image = cls.apply_operation(current_image, operation_name, params)
                intermediate_results.append(current_image.copy())
            
            return current_image, intermediate_results
        except Exception as e:
            logger.error(f"Error applying pipeline: {e}")
            raise ValueError(f"Pipeline processing failed: {e}")

    @classmethod
    def apply_pipeline_with_timing(cls, image_path: str, pipeline: List[Dict[str, Any]]) -> ProcessingResult:
        """Apply a complete pipeline to an image with detailed timing information"""
        result = ProcessingResult()
        pipeline_start_time = time.perf_counter()
        
        try:
            current_image = cls.load_image(image_path)
            
            for step_index, step in enumerate(pipeline):
                operation_name = step.get('name')
                params = step.get('params', {})
                
                # Time individual operation
                step_start_time = time.perf_counter()
                processed_image = cls.apply_operation(current_image, operation_name, params)
                step_end_time = time.perf_counter()
                
                step_duration = step_end_time - step_start_time
                
                # Store results
                current_image = processed_image
                result.intermediate_images.append(current_image.copy())
                result.step_times.append(step_duration)
                result.step_details.append({
                    'name': operation_name,
                    'params': params,
                    'duration': step_duration,
                    'step_index': step_index
                })
            
            pipeline_end_time = time.perf_counter()
            result.final_image = current_image
            result.total_time = pipeline_end_time - pipeline_start_time
            
            return result
            
        except Exception as e:
            logger.error(f"Error applying pipeline with timing: {e}")
            raise ValueError(f"Pipeline processing failed: {e}")
    
    @classmethod
    def apply_pipeline_with_timing_from_image(
        cls,
        image: Image.Image,
        pipeline: List[Dict[str, Any]],
        source_key: Optional[str] = None,
    ) -> ProcessingResult:
        """Apply a pipeline to a PIL Image with timing.

        When ``source_key`` is provided, intermediate outputs are cached by
        cumulative prefix hash so that an edit to step k reuses the cached
        outputs of steps 0..k-1 and only recomputes k..n (incremental preview).
        Without ``source_key`` it recomputes every step (no caching).
        """
        from app.processing.executor import execute_step
        from app.processing.preview_cache import cache as preview_cache, prefix_hashes

        result = ProcessingResult()
        pipeline_start_time = time.perf_counter()

        try:
            n = len(pipeline)
            hashes = prefix_hashes(source_key, pipeline) if source_key else None
            intermediates: List[Optional[Image.Image]] = [None] * n
            current_image = image.copy()
            cached_len = 0

            # Find the longest cached prefix and restore all its intermediates.
            if hashes:
                lc = -1
                restored = None
                for k in range(n - 1, -1, -1):
                    img = preview_cache.get(hashes[k])
                    if img is not None:
                        lc, restored = k, img
                        break
                if lc >= 0:
                    ok = True
                    for i in range(lc):
                        ci = preview_cache.get(hashes[i])
                        if ci is None:
                            ok = False
                            break
                        intermediates[i] = ci
                    if ok:
                        intermediates[lc] = restored
                        current_image = restored.copy()
                        cached_len = lc + 1
                    else:
                        current_image = image.copy()  # inconsistent cache → full recompute

            result.cached_prefix_len = cached_len

            # Record the cached (reused) leading steps — no recompute.
            for i in range(cached_len):
                step = pipeline[i]
                result.intermediate_images.append(intermediates[i])
                result.step_times.append(0.0)
                result.step_errors.append(None)
                result.step_details.append({
                    'name': step.get('name'),
                    'params': step.get('params', {}),
                    'duration': 0.0,
                    'step_index': i,
                })

            # Recompute from the first changed step onward.
            for i in range(cached_len, n):
                step = pipeline[i]
                operation_name = step.get('name')
                params = step.get('params', {})

                step_start_time = time.perf_counter()
                processed_image, step_error = execute_step(
                    current_image,
                    {"name": operation_name, "params": params, "enabled": step.get("enabled", True)},
                )
                step_duration = time.perf_counter() - step_start_time

                current_image = processed_image
                result.intermediate_images.append(current_image.copy())
                result.step_times.append(step_duration)
                result.step_errors.append(step_error)
                result.step_details.append({
                    'name': operation_name,
                    'params': params,
                    'duration': step_duration,
                    'step_index': i,
                })
                if hashes:
                    preview_cache.put(hashes[i], current_image)

            result.final_image = current_image
            result.total_time = time.perf_counter() - pipeline_start_time
            return result

        except Exception as e:
            logger.error(f"Error applying pipeline from image: {e}")
            raise ValueError(f"Pipeline processing failed: {e}")
