from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from pydantic import BaseModel, EmailStr, Field

from app.models.admin import PyObjectId


class UserInDB(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    email: Optional[EmailStr] = None  # None for phone-only signups
    password: str
    name: Optional[str] = ""
    phone: Optional[str] = None
    admin_id: Optional[PyObjectId] = None
    devices: List[PyObjectId] = Field(default_factory=list)
    role: str = "user"  # user or admin
    geofence_access: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_logged_in: Optional[datetime] = None
    last_logged_out: Optional[datetime] = None

    class Config:
        json_encoders = {ObjectId: str}
        populate_by_name = True
        arbitrary_types_allowed = True


class UserCreate(BaseModel):
    email: Optional[EmailStr] = None
    password: str
    name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = "user"
    geofence_access: Optional[bool] = None



class UserPublic(BaseModel):
    id: str
    email: Optional[str] = None  # None for phone-only accounts
    name: Optional[str] = None
    phone: Optional[str] = None
    admin_id: Optional[str] = None
    devices: List[str] = []
    geofence_access: bool = False
