from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from pydantic import BaseModel, EmailStr, Field
from pydantic_core import core_schema


class PyObjectId(ObjectId):
    """
    Pydantic v2-compatible ObjectId type.
    """

    @classmethod
    def __get_pydantic_core_schema__(cls, source_type, handler):
        return core_schema.no_info_plain_validator_function(cls._validate)

    @classmethod
    def _validate(cls, v):
        if isinstance(v, ObjectId):
            return v
        if isinstance(v, str):
            try:
                return ObjectId(v)
            except Exception as exc:  # pragma: no cover - defensive
                raise ValueError("Invalid ObjectId") from exc
        raise TypeError("ObjectId required")


class AdminInDB(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    email: EmailStr
    password: str
    role: str = "admin"
    uid: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    reg_devices: List[str] = Field(default_factory=list)  # new field

    # Optional cached CityTag token
    citytag_token: Optional[str] = None

    class Config:
        json_encoders = {ObjectId: str}
        populate_by_name = True
        arbitrary_types_allowed = True


class AdminCreate(BaseModel):
    email: EmailStr
    password: str
    uid: str




# ───────────────────────────────────────────────────────
# Unified Account model for single accounts collection
# ───────────────────────────────────────────────────────

class AccountInDB(BaseModel):
    """
    Unified account document: users and admins in a single collection.
    
    role: "user" or "admin" (discriminator field)
    
    User-specific fields: name, admin_id, devices
    Admin-specific fields: uid, reg_devices, citytag_token
    """
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    # None for phone-only user accounts. Admins always have one.
    email: Optional[EmailStr] = None
    password: str
    role: str  # "user" or "admin"
    
    # User fields
    name: Optional[str] = None
    phone: Optional[str] = None
    admin_id: Optional[PyObjectId] = None
    devices: List[PyObjectId] = Field(default_factory=list)
    geofence_access: bool = False
    
    # Admin fields
    uid: Optional[str] = None
    reg_devices: List[str] = Field(default_factory=list)
    citytag_token: Optional[str] = None
    
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {ObjectId: str}
        populate_by_name = True
        arbitrary_types_allowed = True


class AccountCreate(BaseModel):
    email: EmailStr
    password: str
    role: str  # "user" or "admin"
    name: Optional[str] = None
    uid: Optional[str] = None


class AccountPublic(BaseModel):
    id: str
    email: Optional[EmailStr] = None
    role: str
    name: Optional[str] = None
    uid: Optional[str] = None
    devices: List[str] = Field(default_factory=list)
    geofence_access: bool = False


class AdminPublic(BaseModel):
    id: str
    email: EmailStr
    uid: str
    created_at: datetime
    reg_device: str
    reg_devices: List[str]