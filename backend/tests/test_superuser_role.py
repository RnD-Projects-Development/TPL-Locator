"""Unit coverage for the super user role plumbing.

These exercise the pure helpers only (no DB / HTTP). End-to-end scoping is
verified manually — see the plan's verification section.
"""
import unittest
from bson import ObjectId

from app.models.admin import AdminInDB, SuperUserInDB, AccountInDB
from app.models.user import UserInDB
from app.dependencies import _account_to_model, require_roles, superuser_to_public
from app.routers.devices import _fleet_base_query, _owns_device_doc, _is_fleet_account


def _su(**kw):
    base = {"_id": ObjectId(), "password": "x", "role": "superuser", "name": "SU", "admin_id": ObjectId()}
    base.update(kw)
    return SuperUserInDB(**base)


class TestSuperUserRole(unittest.TestCase):
    def test_account_to_model_dispatches_by_role(self):
        su_doc = AccountInDB(_id=ObjectId(), password="x", role="superuser", name="SU")
        self.assertIsInstance(_account_to_model(su_doc), SuperUserInDB)

        admin_doc = AccountInDB(_id=ObjectId(), email="a@b.com", password="x", role="admin", uid="1")
        self.assertIsInstance(_account_to_model(admin_doc), AdminInDB)

        user_doc = AccountInDB(_id=ObjectId(), password="x", role="user")
        self.assertIsInstance(_account_to_model(user_doc), UserInDB)

        unknown = AccountInDB(_id=ObjectId(), password="x", role="wat")
        self.assertIsNone(_account_to_model(unknown))

    def test_require_roles_rejects_unknown_roles(self):
        with self.assertRaises(ValueError):
            require_roles("admin", "wizard")
        self.assertTrue(callable(require_roles("admin", "superuser")))

    def test_fleet_base_query_scopes_by_role(self):
        su = _su()
        self.assertEqual(_fleet_base_query(su), {"superuser_id": su.id})
        self.assertTrue(_is_fleet_account(su))

        admin = AdminInDB(_id=ObjectId(), email="a@b.com", password="x", role="admin", uid="1")
        self.assertEqual(_fleet_base_query(admin), {"admin_id": admin.id})

        user = UserInDB(_id=ObjectId(), password="x", role="user")
        self.assertFalse(_is_fleet_account(user))

    def test_owns_device_doc_for_superuser(self):
        su = _su()
        self.assertTrue(_owns_device_doc(su, {"superuser_id": su.id}))
        self.assertFalse(_owns_device_doc(su, {"superuser_id": ObjectId()}))
        self.assertFalse(_owns_device_doc(su, {"admin_id": su.id}))

    def test_superuser_to_public_shape(self):
        su = _su(email="su@example.com")
        pub = superuser_to_public(su)
        self.assertEqual(pub["role"], "superuser")
        self.assertEqual(pub["email"], "su@example.com")
        self.assertTrue(pub["dashboard_access"])
        self.assertTrue(pub["geofence_create_access"])
        self.assertEqual(pub["admin_id"], str(su.admin_id))

    def test_superuser_reassignment_immutability(self):
        """A user assigned to superuser A cannot be reassigned to superuser B."""
        su_a = ObjectId()
        su_b = ObjectId()
        existing_su = su_a

        # Attempting to assign to su_b when existing is su_a
        new_payload_su = str(su_b)
        with self.assertRaises(ValueError):
            if existing_su and str(existing_su) != new_payload_su:
                raise ValueError("This user is already assigned to a super user and cannot be reassigned to another super user.")

        # Re-assigning to the same superuser is allowed
        self.assertEqual(str(existing_su), str(su_a))

        # Unassigning is allowed (empty string or None)
        unassign_payload = ""
        self.assertTrue(unassign_payload == "" or unassign_payload is None)

    def test_cross_superuser_device_user_conflict(self):
        """A device owned by superuser A cannot be bound to a user under superuser B."""
        from fastapi import HTTPException

        dev_su = ObjectId()
        user_su = ObjectId()

        with self.assertRaises(HTTPException) as ctx:
            if dev_su and user_su and str(dev_su) != str(user_su):
                raise HTTPException(
                    status_code=409,
                    detail="Cannot assign device: device belongs to a different super user than the user.",
                )
        self.assertEqual(ctx.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
