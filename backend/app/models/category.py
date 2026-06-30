"""Global device category list — shared across all admins and users."""

from datetime import datetime
from typing import Optional

from bson import ObjectId
from pydantic import BaseModel, Field

from app.models.admin import PyObjectId


class CategoryInDB(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    name: str  # canonical display name, e.g. "Wallet"
    slug: str  # lowercase, used for matching/storage on device.category, e.g. "wallet"
    device_type: Optional[str] = None  # "locator" | "sticker" | None (applies to both)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[PyObjectId] = None  # admin who added it (informational only)

    class Config:
        json_encoders = {ObjectId: str}
        populate_by_name = True
        arbitrary_types_allowed = True


class CategoryCreate(BaseModel):
    name: str
    device_type: Optional[str] = None  # "locator" | "sticker" | None


class CategoryPublic(BaseModel):
    id: str
    name: str
    slug: str
    device_type: Optional[str] = None