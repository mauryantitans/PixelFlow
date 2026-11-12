from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import datetime

# User schemas
class UserBase(BaseModel):
    email: EmailStr
    username: str
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str = Field(..., min_length=8)

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = Field(None, min_length=8)

class UserResponse(UserBase):
    id: int
    is_active: bool
    is_admin: bool
    email_verified: bool = False
    created_at: datetime
    
    class Config:
        from_attributes = True

# Authentication schemas
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    user_id: Optional[int] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

# Password reset / email verification
class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=1, max_length=4096)
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _password_policy(cls, value: str) -> str:
        from ..utils.security import password_policy_error

        problem = password_policy_error(value)
        if problem:
            raise ValueError(problem)
        return value

class VerifyEmailRequest(BaseModel):
    token: str = Field(..., min_length=1, max_length=4096)

# Pipeline schemas
class PipelineBase(BaseModel):
    name: str
    description: Optional[str] = None
    pipeline_data: List[dict]
    is_public: bool = False
    category: Optional[str] = None
    tags: Optional[List[str]] = None

class PipelineCreate(PipelineBase):
    thumbnail_data: Optional[str] = None

class PipelineUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    pipeline_data: Optional[List[dict]] = None
    is_public: Optional[bool] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    thumbnail_data: Optional[str] = None

class PipelineResponse(PipelineBase):
    id: int
    user_id: int
    is_template: bool
    usage_count: int
    created_at: datetime
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class PipelineListResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    category: Optional[str]
    tags: Optional[List[str]]
    is_public: bool
    usage_count: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# Processing history schemas
class ProcessingHistoryCreate(BaseModel):
    pipeline_id: Optional[int] = None
    image_count: int
    pipeline_data: List[dict]
    total_processing_time: float
    average_time_per_image: float
    step_timings: Optional[List[dict]] = None
    session_id: Optional[str] = None
    success: bool = True
    error_message: Optional[str] = None

class ProcessingHistoryResponse(ProcessingHistoryCreate):
    id: int
    user_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# API Key schemas
class APIKeyCreate(BaseModel):
    key_name: str
    expires_at: Optional[datetime] = None

class APIKeyResponse(BaseModel):
    id: int
    key_name: str
    key_prefix: str
    is_active: bool
    last_used_at: Optional[datetime]
    expires_at: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True

class APIKeyWithToken(APIKeyResponse):
    api_key: str  # Full key, only returned on creation

# Admin PIN schemas
class PinRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=6, pattern=r"^\d{4,6}$")
    # Required to change an existing PIN.
    current_pin: Optional[str] = Field(None, min_length=4, max_length=6)
