from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from pydantic import BaseModel, EmailStr, Field

from app.models.admin import PyObjectId


class UserInDB(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    email: EmailStr
    password: str
    name: Optional[str] = ""
    phone: Optional[str] = None
    admin_id: Optional[PyObjectId] = None
    devices: List[PyObjectId] = Field(default_factory=list)
    role: str = "user"  # user or admin
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_logged_in: Optional[datetime] = None
    last_logged_out: Optional[datetime] = None

    class Config:
        json_encoders = {ObjectId: str}
        populate_by_name = True
        arbitrary_types_allowed = True


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = "user"



class UserPublic(BaseModel):
    id: str
    email: str  # real email or phone when account was created with phone only
    name: Optional[str] = None
    phone: Optional[str] = None
    admin_id: Optional[str] = None
    devices: List[str] = []
