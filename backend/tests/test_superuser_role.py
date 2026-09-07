"""Unit coverage for the super user role plumbing.

These exercise the pure helpers only (no DB / HTTP). End-to-end scoping is
verified manually — see the plan's verification section.
"""
import pytest
from bson import ObjectId

from app.models.admin import AdminInDB, SuperUserInDB, AccountInDB
from app.models.user import UserInDB
from app.dependencies import _account_to_model, require_roles, superuser_to_public
from app.routers.devices import _fleet_base_query, _owns_device_doc, _is_fleet_account


def _su(**kw):
    base = {"_id": ObjectId(), "password": "x", "role": "superuser", "name": "SU", "admin_id": ObjectId()}
    base.update(kw)
    return SuperUserInDB(**base)


def test_account_to_model_dispatches_by_role():
    su_doc = AccountInDB(_id=ObjectId(), password="x", role="superuser", name="SU")
    assert isinstance(_account_to_model(su_doc), SuperUserInDB)

    admin_doc = AccountInDB(_id=ObjectId(), email="a@b.com", password="x", role="admin", uid="1")
    assert isinstance(_account_to_model(admin_doc), AdminInDB)

    user_doc = AccountInDB(_id=ObjectId(), password="x", role="user")
    assert isinstance(_account_to_model(user_doc), UserInDB)

    unknown = AccountInDB(_id=ObjectId(), password="x", role="wat")
    assert _account_to_model(unknown) is None


def test_require_roles_rejects_unknown_roles():
    with pytest.raises(ValueError):
        require_roles("admin", "wizard")
    # valid combination builds fine
    assert callable(require_roles("admin", "superuser"))


def test_fleet_base_query_scopes_by_role():
    su = _su()
    assert _fleet_base_query(su) == {"superuser_id": su.id}
    assert _is_fleet_account(su) is True

    admin = AdminInDB(_id=ObjectId(), email="a@b.com", password="x", role="admin", uid="1")
    assert _fleet_base_query(admin) == {"admin_id": admin.id}

    user = UserInDB(_id=ObjectId(), password="x", role="user")
    assert _is_fleet_account(user) is False


def test_owns_device_doc_for_superuser():
    su = _su()
    assert _owns_device_doc(su, {"superuser_id": su.id}) is True
    assert _owns_device_doc(su, {"superuser_id": ObjectId()}) is False
    assert _owns_device_doc(su, {"admin_id": su.id}) is False  # admin_id is irrelevant to a SU


def test_superuser_to_public_shape():
    su = _su(email="su@example.com")
    pub = superuser_to_public(su)
    assert pub["role"] == "superuser"
    assert pub["email"] == "su@example.com"
    assert pub["dashboard_access"] is True
    assert pub["geofence_create_access"] is True
    assert pub["admin_id"] == str(su.admin_id)
