"""Global device categories — shared list everyone reads, any admin can add/remove from."""

import logging
import re
from datetime import datetime
from typing import Annotated, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.dependencies import get_current_account, get_mongo_service
from app.models.admin import AdminInDB, SuperUserInDB
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


def _scope_clause_for(account) -> Optional[dict]:
    """Which categories this account may see.

    - Admin: everything (returns None → no scope filter).
    - Super user: global categories + its own.
    - User: global categories + those owned by its super user.
    App users (no super user) see global-only — identical to the old behaviour.
    """
    if isinstance(account, AdminInDB):
        return None
    if isinstance(account, SuperUserInDB):
        return {"$or": [{"superuser_id": None}, {"superuser_id": ObjectId(str(account.id))}]}
    su_id = getattr(account, "superuser_id", None)
    if su_id:
        return {"$or": [{"superuser_id": None}, {"superuser_id": ObjectId(str(su_id))}]}
    return {"superuser_id": None}


@router.get("", response_model=List[CategoryPublic])
async def list_categories(
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
    device_type: Optional[str] = None,
):
    """Return the category list visible to the caller."""
    clauses: list[dict] = []
    if device_type in ("locator", "sticker"):
        clauses.append({"$or": [{"device_type": device_type}, {"device_type": None}]})
    scope = _scope_clause_for(account)
    if scope:
        clauses.append(scope)

    query: dict = {"$and": clauses} if clauses else {}
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
    """Add multiple categories at once. Admins and super users only.

    A super user's categories are private to its own slice (users + devices);
    an admin's categories are global.
    """
    is_admin = isinstance(current_account, AdminInDB)
    is_su = isinstance(current_account, SuperUserInDB)
    if not (is_admin or is_su):
        raise HTTPException(status_code=403, detail="Only admins or super users can add categories")

    if not payload.categories:
        raise HTTPException(status_code=400, detail="No categories provided")

    su_oid = ObjectId(str(current_account.id)) if is_su else None
    created = []
    existing_count = 0

    for item in payload.categories:
        name = item.name.strip()
        if not name:
            continue  # skip empty

        slug = _slugify(name)
        if not slug:
            continue

        # Check if already visible to this actor (global, or this super user's own)
        dedupe = {"slug": slug}
        if is_su:
            dedupe = {"slug": slug, "$or": [{"superuser_id": None}, {"superuser_id": su_oid}]}
        existing = await mongo.categories.find_one(dedupe)
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
            "superuser_id": su_oid,
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
    """Remove a category. Admins delete any; super users delete only their own."""
    is_admin = isinstance(current_account, AdminInDB)
    is_su = isinstance(current_account, SuperUserInDB)
    if not (is_admin or is_su):
        raise HTTPException(status_code=403, detail="Only admins or super users can delete categories")

    try:
        oid = ObjectId(category_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid category id")

    query: dict = {"_id": oid}
    if is_su:
        query["superuser_id"] = ObjectId(str(current_account.id))

    result = await mongo.categories.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return None