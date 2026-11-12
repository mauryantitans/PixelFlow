"""
Updated processing routes that handle both filesystem and database image storage
"""

import asyncio
import logging
import uuid
import io
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from PIL import Image as PILImage

from ...models import ProcessRequest, LiveProcessRequest, ProcessResponse, LiveProcessResponse
from ...core.database import get_db
from ...models.db_models import UploadedImage, User
from ...utils.auth import get_current_user_optional
from ...utils.session_db import SessionOwnershipError, touch_session
from ...utils.image_processing import ImageProcessor
from ...processing.registry import registry
from ...storage import ObjectNotFound, StorageError
from ...storage.images import read_image_bytes

logger = logging.getLogger(__name__)
router = APIRouter()


def _flatten_to_rgb(img: PILImage.Image) -> PILImage.Image:
    """Composite any alpha channel onto white and return an RGB image.

    Image-processing operations assume 3-channel RGB; stored originals may now
    be RGBA (transparency is preserved on upload), so flatten before processing.
    """
    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
        rgba = img.convert('RGBA')
        background = PILImage.new('RGB', rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.split()[-1])
        return background
    if img.mode != 'RGB':
        return img.convert('RGB')
    return img


def load_image_from_db(image_id: str, db: Session, current_user: Optional[User] = None) -> PILImage.Image:
    """Load an uploaded image (bytes from the row or object storage) as an RGB PIL image.

    Same ownership rule as GET /images/image/{id}: a user-owned image can only
    be processed by its owner or an admin (processing with an empty pipeline
    returns the original, so without this check any image id was readable).
    """
    uploaded_img = db.query(UploadedImage).filter(UploadedImage.id == image_id).first()
    if not uploaded_img:
        raise HTTPException(status_code=404, detail=f"Image {image_id} not found in database")
    if uploaded_img.user_id is not None:
        if current_user is None:
            # owner's access cookie expired: 401 so the client refreshes and retries
            raise HTTPException(
                status_code=401,
                detail={"error": "sign_in_required", "message": "Your sign-in has expired. Please sign in again."},
                headers={"WWW-Authenticate": "Bearer"},
            )
        if current_user.id != uploaded_img.user_id and not current_user.is_admin:
            raise HTTPException(status_code=403, detail="Not authorized to process this image")

    # Stored originals may be RGBA (transparent PNGs are preserved on upload), but
    # the processing operations expect 3-channel RGB, so flatten alpha onto white.
    try:
        data = read_image_bytes(uploaded_img)
    except ObjectNotFound:
        raise HTTPException(status_code=404, detail=f"Image {image_id} data is missing from storage")
    except StorageError as e:
        logger.error(f"Could not read image {image_id} from storage: {e}")
        raise HTTPException(status_code=503, detail=f"Image storage is unavailable: {e}")
    img = PILImage.open(io.BytesIO(data))
    return _flatten_to_rgb(img)


async def process_single_image_pipeline(
    image: PILImage.Image,
    pipeline: List[dict],
    session_id: str,
    save_intermediates: bool = False,
    source_key: str | None = None,
) -> dict:
    """Process a PIL Image through the pipeline with timing"""
    try:
        # Process the image with timing (prefix-cached when source_key is given)
        processing_result = ImageProcessor.apply_pipeline_with_timing_from_image(
            image, pipeline, source_key=source_key
        )
        
        result = {
            "final_result": ImageProcessor.image_to_base64(processing_result.final_image),
            "total_time": processing_result.total_time,
            "step_timings": [
                {
                    "step_name": detail["name"],
                    "duration": detail["duration"],
                    "step_index": detail["step_index"]
                }
                for detail in processing_result.step_details
            ],
            # Per-step validation/execution errors (None when the step succeeded),
            # index-aligned with the pipeline. Frontends that don't know the field
            # simply ignore it.
            "step_errors": [
                err.to_dict() if err else None
                for err in processing_result.step_errors
            ],
        }
        
        # Include intermediate results
        if save_intermediates and processing_result.intermediate_images:
            intermediate_base64_list = []
            
            for img in processing_result.intermediate_images:
                intermediate_base64_list.append(ImageProcessor.image_to_base64(img))
            
            result["intermediate_results"] = intermediate_base64_list
        
        return result
        
    except Exception as e:
        logger.error(f"Error processing image pipeline: {e}")
        raise


def _record_activity(db: Session, session_id: str, current_user: Optional[User]) -> None:
    """Processing counts as session activity (sliding expiry); never fails the request."""
    try:
        touch_session(db, session_id, current_user.id if current_user else None)
    except SessionOwnershipError:
        pass  # image ownership is checked per image; don't block on the session
    except Exception:
        db.rollback()
        logger.exception("Could not record session activity")


@router.post("/process", response_model=ProcessResponse)
async def process_images(
    request: ProcessRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Process multiple images through the pipeline (batch mode)"""
    try:
        if not request.image_ids:
            raise HTTPException(status_code=400, detail="No images provided")
        
        if not request.pipeline:
            raise HTTPException(status_code=400, detail="No pipeline operations provided")
        
        logger.info(f"Batch processing {len(request.image_ids)} images with {len(request.pipeline)} operations")
        _record_activity(db, request.session_id, current_user)
        
        processed_results = []
        all_intermediate_results = []
        all_step_timings = []
        all_step_errors = []
        total_batch_time = 0.0
        
        first_client_error: Optional[HTTPException] = None
        # Process each image
        for image_id in request.image_ids:
            try:
                # Load image from database or filesystem
                image = load_image_from_db(image_id, db, current_user)
                
                # Process the image
                result = await process_single_image_pipeline(
                    image,
                    [step.dict() for step in request.pipeline],
                    request.session_id,
                    save_intermediates=True,
                    source_key=f"{request.session_id}|{image_id}",
                )
                
                processed_results.append(result["final_result"])
                total_batch_time += result.get("total_time", 0)
                
                if "intermediate_results" in result:
                    all_intermediate_results.append(result["intermediate_results"])
                
                # Collect step timings
                if "step_timings" in result:
                    all_step_timings.extend(result["step_timings"])

                # Per-image step errors (aligned with processed_images order)
                all_step_errors.append(result.get("step_errors"))

            except HTTPException as e:
                # e.g. 403 (not your image) / 404 (deleted): report it if nothing succeeds
                first_client_error = first_client_error or e
                logger.warning(f"Skipped image {image_id}: {e.detail}")
                continue
            except Exception as e:
                logger.error(f"Failed to process image {image_id}: {e}")
                continue

        if not processed_results:
            if first_client_error is not None:
                raise first_client_error
            raise HTTPException(status_code=500, detail="Failed to process any images")
        
        logger.info(f"Successfully processed {len(processed_results)} images in {total_batch_time:.3f}s")
        
        return ProcessResponse(
            success=True,
            processed_images=processed_results,
            intermediate_results=all_intermediate_results if all_intermediate_results else None,
            total_time=total_batch_time,
            step_timings=all_step_timings,
            step_errors=all_step_errors if any(all_step_errors) else None,
            message=f"Successfully processed {len(processed_results)} image(s)"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in batch processing: {e}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@router.post("/process-live", response_model=LiveProcessResponse)
async def process_live(
    request: LiveProcessRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Process a single image through pipeline with all intermediate steps (live mode)"""
    _record_activity(db, request.session_id, current_user)
    try:
        if not request.pipeline:
            # If no pipeline, return original image
            image = load_image_from_db(request.image_id, db, current_user)
            original_base64 = ImageProcessor.image_to_base64(image)
            
            return LiveProcessResponse(
                success=True,
                results=[original_base64],
                total_time=0.0,
                step_timings=[],
                message="No operations applied - returning original image"
            )
        
        logger.info(f"Live processing image {request.image_id} with {len(request.pipeline)} operations")
        
        # Load image from database or filesystem
        image = load_image_from_db(request.image_id, db, current_user)
        
        # Process with intermediate results and timing (prefix-cached)
        result = await process_single_image_pipeline(
            image,
            [step.dict() for step in request.pipeline],
            request.session_id,
            save_intermediates=True,
            source_key=f"{request.session_id}|{request.image_id}",
        )
        
        # Prepare results - all intermediate steps plus final
        results = []
        if "intermediate_results" in result:
            results.extend(result["intermediate_results"])
        else:
            # If no intermediates, just return the final result
            results.append(result["final_result"])
        
        logger.info(f"Live processing completed with {len(results)} result steps in {result.get('total_time', 0):.3f}s")
        
        return LiveProcessResponse(
            success=True,
            results=results,
            total_time=result.get("total_time", 0),
            step_timings=result.get("step_timings", []),
            step_errors=result.get("step_errors"),
            message=f"Live processing completed with {len(results)} steps"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in live processing: {e}")
        raise HTTPException(status_code=500, detail=f"Live processing failed: {str(e)}")


@router.get("/operations")
async def get_available_operations():
    """Get available operations with full, typed parameter schemas.

    Returns the registry's grouped schema (`categories[]` → `subcategories[]` →
    `operations[]` with typed `params`) for schema-driven frontend rendering,
    plus a flat legacy `operations` list of display labels for backward
    compatibility with older clients.
    """
    try:
        schema = registry.to_schema()
        legacy_labels = [
            op["label"]
            for cat in schema["categories"]
            for sub in cat["subcategories"]
            for op in sub["operations"]
        ]

        return JSONResponse(content={
            "success": True,
            "version": schema["version"],
            "categories": schema["categories"],
            # Legacy fields (kept for one release for backward compatibility):
            "operations": legacy_labels,
            "total_count": len(legacy_labels),
        })

    except Exception as e:
        logger.error(f"Error getting operations: {e}")
        raise HTTPException(status_code=500, detail="Failed to get available operations")


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return JSONResponse(content={
        "success": True,
        "message": "Processing service is healthy",
    })
