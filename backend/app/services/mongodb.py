from datetime import datetime, timezone, timedelta
from typing import Any, List, Optional
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from bson import ObjectId
from pymongo import ReturnDocument
import logging
import re
import certifi

from app.auth_utils import hash_password
from app.models.admin import AdminInDB, AdminCreate
from app.models.device import DeviceInDB
from app.services.geocode import reverse_geocode



import os

# choose database name via environment, default to development db
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "citytag_development")
logger = logging.getLogger(__name__)

# Sentinel: omit batteryStatus from $set (legacy callers). Any other value includes the field (None = BSON null).
_BATTERY_STATUS_OMIT = object()


class MongoService:
    def __init__(self, uri: str):
        self._client = AsyncIOMotorClient(
            uri
        )

    @property
    def client(self) -> AsyncIOMotorClient:
        return self._client

    @property
    def db(self) -> AsyncIOMotorDatabase:
        return self._client[MONGO_DB_NAME]

    @property
    def accounts(self):
        """Unified collection for users and admins with role discriminator."""
        return self.db["accounts"]

    @property
    def devices(self):
        return self.db["devices"]

    @property
    def locations(self):
        return self.db["locations"]

    @property
    def playback_locations(self):
        return self.db["locations"]

    @property
    def zones(self):
        return self.db["zones"]

    @property
    def categories(self):
        return self.db["categories"]

    async def get_account_by_email(self, email: str, role: Optional[str] = None):
        """Get account by email. If role is specified, filter by role."""
        from app.models.admin import AccountInDB
        query = {"email": email.strip().lower()}
        if role:
            query["role"] = role
        doc = await self.accounts.find_one(query)
        if not doc:
            return None
        return AccountInDB(**doc)

    async def get_account_by_id(self, account_id: str, role: Optional[str] = None):
        """Get account by ID. If role is specified, filter by role."""
        try:
            oid = ObjectId(account_id)
        except Exception:
            return None
        from app.models.admin import AccountInDB
        query = {"_id": oid}
        if role:
            query["role"] = role
        doc = await self.accounts.find_one(query)
        if not doc:
            return None
        return AccountInDB(**doc)

    async def get_admin_by_email(self, email: str) -> Optional[AdminInDB]:
        """Get admin account by email."""
        account = await self.get_account_by_email(email, role="admin")
        if not account:
            return None
        return AdminInDB(**account.dict())

    async def get_admin_by_phone(self, phone: str) -> Optional[AdminInDB]:
        """Get admin account by normalized phone (03XXXXXXXXX)."""
        doc = await self.accounts.find_one({"phone": phone.strip(), "role": "admin"})
        if not doc:
            return None
        from app.models.admin import AccountInDB
        account = AccountInDB(**doc)
        return AdminInDB(**account.dict())

    async def get_user_by_email(self, email: str):
        """Get user account by email."""
        account = await self.get_account_by_email(email, role="user")
        if not account:
            return None
        from app.models.user import UserInDB
        return UserInDB(**account.dict())

    async def get_user_by_id(self, user_id: str):
        """Get user account by ID."""
        from app.models.user import UserInDB
        account = await self.get_account_by_id(user_id, role="user")
        if not account:
            return None
        return UserInDB(**account.dict())


    async def get_user_by_phone(self, phone: str) -> Optional['UserInDB']:
        doc = await self.accounts.find_one({"phone": phone.strip(), "role": "user"})
        if not doc:
            return None
        from app.models.user import UserInDB
        return UserInDB(**doc)

    async def create_user(self, email: Optional[str], password: str, name: Optional[str] = None, phone: Optional[str] = None) -> 'UserInDB':

        from app.models.user import UserInDB
        payload = {
            **({"email": email.strip().lower()} if email else {}),
            "password": hash_password(password),
            "name": name or "",
            "phone": phone or None,
            "admin_id": None,
            "devices": [],
            "role": "user",  # Always "user" for this method
            "created_at": datetime.now(timezone.utc),
        }
        result = await self.accounts.insert_one(payload)
        created = await self.accounts.find_one({"_id": result.inserted_id})
        from app.models.admin import AccountInDB
        account = AccountInDB(**created)
        return UserInDB(**account.dict())

    async def update_user_admin(self, user_id: str, admin_id: str):
        await self.accounts.update_one(
            {"_id": ObjectId(user_id), "role": "user"},
            {"$set": {"admin_id": ObjectId(admin_id)}}
        )

    async def delete_user(self, user_id: str) -> bool:
        """Unassign all devices from this user, then delete the user. Returns True if deleted."""
        try:
            oid = ObjectId(user_id)
        except Exception:
            return False
        await self.devices.update_many(
            {"user_id": oid},
            {"$set": {"user_id": None, "bound_at": None}, "$unset": {"name": "", "client": ""}},
        )
        result = await self.accounts.delete_one({"_id": oid, "role": "user"})
        return result.deleted_count == 1

    # ---------- device methods ----------
    async def count_devices_by_admin(self, admin_id: str) -> int:
        """Return the number of devices owned by this admin."""
        try:
            oid = ObjectId(admin_id)
        except Exception:
            return 0
        return await self.devices.count_documents({"admin_id": oid})

    async def create_device(
        self,
        sn: str,
        admin_id: str,
        name: Optional[str] = None,
        client: Optional[str] = None,
        category: Optional[str] = None,
    ):
        payload = {
            "sn": sn,
            "admin_id": ObjectId(admin_id),
            "name": name or "",
        }
        if client is not None:
            payload["client"] = client.strip() if client else None
        if category is not None:
            payload["category"] = category.strip() if category else None
        result = await self.devices.insert_one(payload)
        doc = await self.devices.find_one({"_id": result.inserted_id})
        return DeviceInDB(**doc)

    async def get_device_by_sn(self, sn: str):
        doc = await self.devices.find_one({"sn": sn})
        if not doc:
            return None
        return DeviceInDB(**doc)

    async def is_device_name_taken(
        self,
        admin_id: str,
        name: str,
        exclude_sn: Optional[str] = None,
    ) -> bool:
        """
        Return True if another device under the same admin already uses `name`
        (case-insensitive, trimmed). Empty names are never considered taken.
        Used to enforce unique device names at creation/binding time.
        """
        name = (name or "").strip()
        if not name:
            return False
        try:
            oid = ObjectId(admin_id)
        except Exception:
            return False
        query: dict[str, Any] = {
            "admin_id": oid,
            "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"},
        }
        if exclude_sn:
            query["sn"] = {"$ne": exclude_sn}
        return await self.devices.find_one(query, {"_id": 1}) is not None

    async def get_authorized_device_sns(self, account, sns: List[str]) -> List[str]:
        """Return the subset of SNs the account can access."""
        if not sns:
            return []

        query = {"sn": {"$in": sns}}
        if isinstance(account, AdminInDB):
            cursor = self.devices.find(query, {"sn": 1, "_id": 0})
        else:
            from app.models.user import UserInDB

            if not isinstance(account, UserInDB):
                return []
            query["user_id"] = account.id
            cursor = self.devices.find(query, {"sn": 1, "_id": 0})

        return [doc["sn"] async for doc in cursor if doc.get("sn")]

    async def get_latest_locations_by_sns(self, sns: List[str]) -> dict[str, dict]:
        """Fetch the latest location doc for each serial number in one aggregation."""
        if not sns:
            return {}

        pipeline = [
            {"$match": {"sn": {"$in": sns}}},
            {"$sort": {"sn": 1, "timestamp": -1}},
            {"$group": {"_id": "$sn", "latest": {"$first": "$$ROOT"}}},
        ]

        latest_by_sn: dict[str, dict] = {}
        async for row in self.locations.aggregate(pipeline):
            latest = row.get("latest") or {}
            if latest.get("_id") is not None:
                latest["_id"] = str(latest["_id"])
            latest_by_sn[str(row["_id"])] = latest
        return latest_by_sn

    async def get_playback_points_by_sns(
        self,
        sns: List[str],
        start_time: datetime,
        end_time: datetime,
    ) -> dict[str, list[dict]]:
        """Fetch playback points for multiple SNs with a single query."""
        if not sns:
            return {}

        cursor = self.playback_locations.find(
            {"sn": {"$in": sns}, "timestamp": {"$gte": start_time, "$lte": end_time}},
            {"sn": 1, "lat": 1, "lng": 1, "timestamp": 1, "speed": 1, "accuracy": 1, "landmark": 1},
            sort=[("sn", 1), ("timestamp", 1)],
        )

        points_by_sn: dict[str, list[dict]] = {}
        async for doc in cursor:
            sn = doc.get("sn")
            if not sn:
                continue
            if doc.get("_id") is not None:
                doc["_id"] = str(doc["_id"])
            points_by_sn.setdefault(sn, []).append(doc)
        return points_by_sn

    async def assign_device_to_user(self, sn: str, user_id: str):
        device_doc = await self.devices.find_one({"sn": sn})
        if not device_doc:
            return None
        if device_doc.get("user_id"):
            return None  # already assigned
        await self.devices.update_one(
            {"sn": sn},
            {"$set": {"user_id": ObjectId(user_id), "bound_at": datetime.now(timezone.utc)}},
        )
        await self.accounts.update_one(
            {"_id": ObjectId(user_id), "role": "user"},
            {"$push": {"devices": device_doc["_id"]}}
        )
        updated = await self.devices.find_one({"sn": sn})
        return DeviceInDB(**updated)

    async def unassign_device(self, sn: str):
        device_doc = await self.devices.find_one({"sn": sn})
        if not device_doc or not device_doc.get("user_id"):
            return None
        user_id = device_doc["user_id"]
        # Unbinding wipes the binding metadata so the device reverts to its vendor
        # label (e.g. "TPL Locator") instead of keeping the previous owner's custom
        # name/client. Mirrors _clear_binding() in admin_devices.py.
        await self.devices.update_one(
            {"sn": sn},
            {"$set": {"user_id": None, "bound_at": None}, "$unset": {"name": "", "client": ""}},
        )
        await self.accounts.update_one(
            {"_id": user_id, "role": "user"},
            {"$pull": {"devices": device_doc["_id"]}}
        )
        return True

    async def update_device(self, sn: str, name: Optional[str] = None, client: Optional[str] = None, region: Optional[str] = None, category: Optional[str] = None):
        update_fields = {}
        if name is not None:
            update_fields["name"] = name.strip() if name else ""
        if client is not None:
            update_fields["client"] = client.strip() if client else None
        if region is not None:
            update_fields["region"] = region.strip() if region else None
        if category is not None:
            update_fields["category"] = category.strip() if category else None
        if update_fields:
            await self.devices.update_one({"sn": sn}, {"$set": update_fields})
        updated = await self.devices.find_one({"sn": sn})
        return DeviceInDB(**updated) if updated else None

    async def get_admin_by_id(self, admin_id: str) -> Optional[AdminInDB]:
        account = await self.get_account_by_id(admin_id, role="admin")
        if not account:
            return None
        return AdminInDB(**account.dict())

    async def create_or_update_admin(
        self,
        data: AdminCreate,
        citytag_token: Optional[str] = None,
        reg_devices: Optional[List[str]] = None,
    ) -> AdminInDB:
        # Check if email already exists as a user
        existing_user = await self.get_account_by_email(data.email, role="user")
        if existing_user:
            raise ValueError("Email already registered as user")
            
        existing = await self.get_account_by_email(data.email, role="admin")
        from app.models.admin import AccountInDB
        
        payload = {
            "email": data.email.strip().lower(),
            "password": hash_password(data.password),
            "uid": data.uid,
            "role": "admin",
        }
        if citytag_token is not None:
            payload["citytag_token"] = citytag_token
        if reg_devices is not None:
            payload["reg_devices"] = reg_devices

        if existing:
            await self.accounts.update_one(
                {"_id": existing.id},
                {"$set": payload},
            )
            updated = await self.accounts.find_one({"_id": existing.id})
            account = AccountInDB(**updated)
            return AdminInDB(**account.dict())

        result = await self.accounts.insert_one(payload)
        created = await self.accounts.find_one({"_id": result.inserted_id})
        account = AccountInDB(**created)
        return AdminInDB(**account.dict())

    async def update_admin_token(self, admin_id: str, token: str) -> None:
        await self.accounts.update_one(
            {"_id": ObjectId(admin_id), "role": "admin"},
            {"$set": {"citytag_token": token}},
        )

    async def upsert_location_from_citytag(
        self,
        history_item: dict,
        uid: str,
        sn: Optional[str] = None,
        battery_status: Any = _BATTERY_STATUS_OMIT,
        *,
        time_adjust_hours: float = -3.0,
    ) -> bool:
        ts_raw = (
            history_item.get("timestamp")
            or history_item.get("datePublished")
            or history_item.get("gpstime")
            or history_item.get("time")
        )
        timestamp = self._parse_citytag_timestamp(ts_raw)
        # Per-vendor wall-clock adjustment before persist (CityTag/Zoqin default -3h, TrackSolid +5h).
        if timestamp is not None:
            timestamp = timestamp + timedelta(hours=time_adjust_hours)

        doc = {
            "uid": uid,
            "sn": sn or history_item.get("sn"),
            "timestamp": timestamp,
            "lat": float(history_item.get("lat") or history_item.get("latitude") or 0),
            "lng": float(history_item.get("lng") or history_item.get("lon") or history_item.get("long") or history_item.get("longitude") or 0),
        }
        if battery_status is not _BATTERY_STATUS_OMIT:
            doc["batteryStatus"] = battery_status

        if doc["lat"] == 0 or doc["lng"] == 0 or not doc["sn"]:
            return False

        landmark = await reverse_geocode(doc["lat"], doc["lng"])
        if landmark:
            doc["landmark"] = landmark

        query = {
            "uid": doc["uid"],
            "sn": doc["sn"],
            "timestamp": doc["timestamp"],
        }

        result = await self.playback_locations.update_one(
            query,
            {"$set": doc},
            upsert=True
        )

        return bool(result.upserted_id or result.modified_count > 0)

    async def upsert_latest_location(
        self,
        *,
        uid: Optional[str] = None,
        sn: str,
        timestamp_raw=None,
        lat: float | None = None,
        lng: float | None = None,
        battery_status: Any = _BATTERY_STATUS_OMIT,
        time_adjust_hours: float = 0.0,
        vendor: Optional[str] = None,
    ) -> bool:
        """
        Upsert the latest location for a device into the `latestLocation` collection.

        Stores document with keys: `sn`, `timestamps` (datetime), `batteryStatus`, `lat`, `long`, `landmark`.
        """
        # Parse and adjust timestamp
        timestamp = self._parse_citytag_timestamp(timestamp_raw)
        if timestamp is not None:
            timestamp = timestamp + timedelta(hours=time_adjust_hours)

        if lat is None:
            lat = None
        if lng is None:
            lng = None

        if not sn:
            return False

        # Build document
        doc: dict = {
            "sn": sn,
            "timestamps": timestamp,
        }
        if vendor:
            doc["vendor"] = str(vendor).strip().lower()
        if battery_status is not _BATTERY_STATUS_OMIT:
            doc["batteryStatus"] = battery_status
        if lat is not None:
            doc["lat"] = float(lat)
        if lng is not None:
            doc["long"] = float(lng)

        # Skip if no coordinates
        if (doc.get("lat") is None or doc.get("long") is None) and doc.get("timestamps") is None:
            return False

        landmark = None
        try:
            if doc.get("lat") is not None and doc.get("long") is not None:
                landmark = await reverse_geocode(doc["lat"], doc["long"])
        except Exception:
            landmark = None
        if landmark:
            doc["landmark"] = landmark

        # Use find_one_and_update to get the updated document, then remove any duplicate docs.
        updated = await self.db["latestLocation"].find_one_and_update(
            {"sn": sn},
            {"$set": doc},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )

        if not updated:
            return False

        # Remove any duplicate documents with same sn but different _id (cleanup from previous states).
        try:
            await self.db["latestLocation"].delete_many({"sn": sn, "_id": {"$ne": updated["_id"]}})
        except Exception:
            # Non-fatal: if cleanup fails, leave as-is but return success.
            logger.exception("latestLocation duplicate cleanup failed for sn=%s", sn)

        return True

    async def upsert_device_from_citytag(
        self,
        *,
        admin_id: str,
        citytag_device: dict,
    ) -> None:
        """
        Persist CityTag device metadata into Mongo so /api/devices can be Mongo-backed only.

        We intentionally DO NOT overwrite binding fields controlled by our own APIs:
        - user_id
        - bound_at
        """
        try:
            sn = citytag_device.get("sn") or citytag_device.get("deviceSn") or citytag_device.get("deviceSN") \
                or citytag_device.get("serial") or citytag_device.get("serialNumber") \
                or citytag_device.get("imei") or citytag_device.get("device_no") \
                or citytag_device.get("deviceNo")
            if not sn:
                return
            sn = str(sn)

            existing = await self.devices.find_one({"sn": sn})
            is_bound = bool(existing and existing.get("user_id"))

            label = (
                citytag_device.get("assigned_name")
                or citytag_device.get("name")
                or citytag_device.get("deviceName")
                or sn
            )

            fields: dict = {}

            # Always store some raw metadata when present (safe, non-binding).
            if citytag_device.get("mac") is not None:
                fields["mac"] = citytag_device.get("mac")
            if label:
                # Used by the frontend when `name` is empty/stale.
                fields["assigned_name"] = label
            if citytag_device.get("client") is not None:
                # Only stamp client for unbound devices; binding operations control it for bound devices.
                if not is_bound and not (existing and existing.get("client")):
                    fields["client"] = citytag_device.get("client")
            local_only_val = citytag_device.get("local_only")
            if local_only_val is None:
                local_only_val = citytag_device.get("localOnly")
            if local_only_val is not None:
                fields["local_only"] = bool(local_only_val)

            datapoint_val = citytag_device.get("datapoint_count")
            if datapoint_val is None:
                datapoint_val = citytag_device.get("datapointCount")
            if datapoint_val is not None:
                fields["datapoint_count"] = datapoint_val

            last_seen_val = citytag_device.get("last_seen")
            if last_seen_val is None:
                last_seen_val = citytag_device.get("lastSeen")
            if last_seen_val is not None:
                fields["last_seen"] = last_seen_val

            first_seen_val = citytag_device.get("first_seen")
            if first_seen_val is None:
                first_seen_val = citytag_device.get("firstSeen")
            if first_seen_val is not None:
                fields["first_seen"] = first_seen_val
            if citytag_device.get("region") is not None and not is_bound:
                # Region is editable by admin; only set for unbound devices to reduce surprise.
                fields["region"] = citytag_device.get("region")

            # For unbound devices, keep Mongo "name" aligned with CityTag label so admin tables look good.
            if not is_bound:
                if not existing or not existing.get("name"):
                    fields["name"] = label

            # Ensure admin_id exists on the device doc.
            admin_oid = ObjectId(admin_id) if admin_id else None
            if admin_oid and (not existing or not existing.get("admin_id")):
                fields["admin_id"] = admin_oid

            if not existing:
                # Create base doc first so _id exists for local_id display.
                await self.create_device(sn, admin_id, name=(label if label else sn))

            if fields:
                await self.devices.update_one({"sn": sn}, {"$set": fields}, upsert=False)
        except Exception:
            # Keep sync resilient: ignore per-device metadata issues, but log for debugging.
            logger.exception("upsert_device_from_citytag failed admin_id=%s", admin_id)
            return

    def _parse_citytag_timestamp(self, value) -> datetime:
        """
        Stores timestamps as-is (wall-clock time, no timezone conversion).

        CityTag returns PKT times without a tz suffix e.g. "2025-02-24T10:30:00".
        We store exactly that value so it matches what the frontend date pickers
        send — the picker value "10:30" is appended with Z and sent as 10:30Z,
        which MongoDB sees as 10:30, matching the stored 10:30 directly.

        Epoch integers are converted from UTC epoch to a naive datetime via
        utcfromtimestamp so they're also stored in wall-clock UTC terms.
        """
        if isinstance(value, (int, float)):
            # Millisecond epoch
            if value > 1e10:
                return datetime.utcfromtimestamp(value / 1000)
            return datetime.utcfromtimestamp(value)

        if isinstance(value, str):
            try:
                dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
                # Strip any tz info and store the wall-clock value as-is
                return dt.replace(tzinfo=None)
            except Exception:
                pass

        if isinstance(value, datetime):
            # Strip tz and store wall-clock value directly
            return value.replace(tzinfo=None)

        return datetime.utcnow()  # fallback