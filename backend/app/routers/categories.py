"""Global device categories — shared list everyone reads, any admin can add/remove from."""

import logging
import re
from datetime import datetime
from typing import Annotated, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.dependencies import get_current_account, get_mongo_service
from app.models.admin import AdminInDB
from app.models.category import CategoryCreate, CategoryPublic
from app.models.user import UserInDB
from app.services.mongodb import MongoService
from bson import ObjectId

router = APIRouter(prefix="/api/categories", tags=["categories"])
logger = logging.getLogger(__name__)


def _slugify(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s


def _to_public(doc: dict) -> CategoryPublic:
    return CategoryPublic(
        id=str(doc["_id"]),
        name=doc.get("name", ""),
        slug=doc.get("slug", ""),
        device_type=doc.get("device_type"),
    )


@router.get("", response_model=List[CategoryPublic])
async def list_categories(
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
    device_type: Optional[str] = None,
):
    """Return the global category list."""
    query: dict = {}
    if device_type in ("locator", "sticker"):
        query = {"$or": [{"device_type": device_type}, {"device_type": None}]}

    docs = await mongo.categories.find(query).sort("name", 1).to_list(None)
    return [_to_public(d) for d in docs]


# ─────────────────────────────────────────────────────────────
# New: Bulk Create Model
# ─────────────────────────────────────────────────────────────
class CategoryCreateBulk(BaseModel):
    categories: List[CategoryCreate]


@router.post("", response_model=List[CategoryPublic], status_code=status.HTTP_201_CREATED)
async def create_categories(
    payload: CategoryCreateBulk,   # Changed to accept list
    current_account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """Add multiple categories at once. Admin-only."""
    if not isinstance(current_account, AdminInDB):
        raise HTTPException(status_code=403, detail="Only admins can add categories")

    if not payload.categories:
        raise HTTPException(status_code=400, detail="No categories provided")

    created = []
    existing_count = 0

    for item in payload.categories:
        name = item.name.strip()
        if not name:
            continue  # skip empty

        slug = _slugify(name)
        if not slug:
            continue

        # Check if already exists
        existing = await mongo.categories.find_one({"slug": slug})
        if existing:
            existing_count += 1
            created.append(_to_public(existing))
            continue

        doc = {
            "name": name,
            "slug": slug,
            "device_type": item.device_type if item.device_type in ("locator", "sticker") else None,
            "created_at": datetime.utcnow(),
            "created_by": current_account.id,
        }

        result = await mongo.categories.insert_one(doc)
        doc["_id"] = result.inserted_id
        created.append(_to_public(doc))

    logger.info(f"Created {len(created) - existing_count} new categories, {existing_count} already existed.")
    return created


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: str,
    current_account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """Remove a category. Admin-only."""
    if not isinstance(current_account, AdminInDB):
        raise HTTPException(status_code=403, detail="Only admins can delete categories")

    try:
        oid = ObjectId(category_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid category id")

    result = await mongo.categories.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return None