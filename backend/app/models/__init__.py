from pydantic import BaseModel, Field, validator
from typing import List, Dict, Any, Optional, Union
from pathlib import Path
import uuid

class ImageData(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    file_path: str
    thumbnail_path: Optional[str] = None
    session_id: str
    size_bytes: int
    width: int
    height: int
    format: str

class OperationParam(BaseModel):
    name: str
    value: Union[int, float, str, bool]

# A parameter value may be a scalar, or a nested structure for richer input
# types (e.g. a point {x, y}, a rect {x, y, w, h}, or a list of points).
# Per-operation validation/coercion happens in app.processing.executor.
ParamValue = Union[int, float, str, bool, None, List[Any], Dict[str, Any]]


class PipelineStep(BaseModel):
    name: str  # operation id or legacy display label (resolved via aliases)
    params: Dict[str, ParamValue] = Field(default_factory=dict)
    enabled: bool = True  # False = skipped (passes the image through)

class ProcessingTiming(BaseModel):
    step_name: str
    duration: float  # in seconds
    step_index: int

class ProcessRequest(BaseModel):
    image_ids: List[str]
    pipeline: List[PipelineStep]
    session_id: str

class LiveProcessRequest(BaseModel):
    image_id: str
    pipeline: List[PipelineStep]
    session_id: str

class ProcessResponse(BaseModel):
    success: bool
    processed_images: List[str] = Field(default_factory=list)
    intermediate_results: Optional[List[List[str]]] = None
    total_time: float = 0.0
    step_timings: List[ProcessingTiming] = Field(default_factory=list)
    # Per-image list of per-step errors (None where a step succeeded). Optional
    # and additive — older clients ignore it.
    step_errors: Optional[List[Any]] = None
    message: str = "Processing completed successfully"

class LiveProcessResponse(BaseModel):
    success: bool
    results: List[str] = Field(default_factory=list)  # Base64 encoded images for each step
    total_time: float = 0.0
    step_timings: List[ProcessingTiming] = Field(default_factory=list)
    # Per-step errors (None where the step succeeded), index-aligned with the pipeline.
    step_errors: Optional[List[Optional[Dict[str, Any]]]] = None
    message: str = "Live processing completed successfully"

class UploadResponse(BaseModel):
    success: bool
    image: Optional[ImageData] = None
    thumbnail: Optional[str] = None  # Base64 encoded thumbnail for UI
    message: str = "Upload successful"

class SessionCleanupRequest(BaseModel):
    session_id: str

class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    message: str
