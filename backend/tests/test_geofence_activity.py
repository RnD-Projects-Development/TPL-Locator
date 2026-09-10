"""Unit tests for geofence activity detection and zone crossing logic."""
import unittest
import asyncio
from datetime import datetime, timedelta
from bson import ObjectId

from app.services.geofence import (
    point_in_polygon,
    point_in_circle,
    is_point_in_zone_doc,
    detect_admin_zone_events,
)


class MockCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    async def to_list(self, length=100):
        return list(self.docs[:length])

    def __aiter__(self):
        self._iter = iter(self.docs)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration


class MockCollection:
    def __init__(self, docs=None):
        self.docs = docs or []

    def find(self, query=None, *args, **kwargs):
        filtered = self.docs
        if query:
            if "admin_id" in query:
                filtered = [d for d in filtered if d.get("admin_id") == query["admin_id"]]
            if "sn" in query:
                sn_q = query["sn"]
                if isinstance(sn_q, dict) and "$in" in sn_q:
                    filtered = [d for d in filtered if d.get("sn") in sn_q["$in"]]
                elif isinstance(sn_q, str):
                    filtered = [d for d in filtered if d.get("sn") == sn_q]
        return MockCursor(filtered)

    async def find_one(self, query=None, *args, **kwargs):
        filtered = self.docs
        if query:
            if "sn" in query:
                sn_q = query["sn"]
                filtered = [d for d in filtered if d.get("sn") == sn_q]
            if "timestamp" in query:
                ts_q = query["timestamp"]
                if isinstance(ts_q, dict) and "$lt" in ts_q:
                    filtered = [d for d in filtered if d.get("timestamp") < ts_q["$lt"]]
        if not filtered:
            return None
        # sorted by timestamp desc if sort requested
        sorted_docs = sorted(filtered, key=lambda x: x.get("timestamp") or datetime.min, reverse=True)
        return sorted_docs[0]


class MockMongo:
    def __init__(self, zones, locations, devices):
        self.zones = MockCollection(zones)
        self.locations = MockCollection(locations)
        self.devices = MockCollection(devices)


class TestGeofenceActivity(unittest.TestCase):
    def test_point_in_polygon(self):
        # Square polygon: (10, 10) to (20, 20)
        poly = [
            {"lat": 10.0, "lng": 10.0},
            {"lat": 10.0, "lng": 20.0},
            {"lat": 20.0, "lng": 20.0},
            {"lat": 20.0, "lng": 10.0},
        ]
        self.assertTrue(point_in_polygon(15.0, 15.0, poly))
        self.assertFalse(point_in_polygon(5.0, 5.0, poly))
        self.assertFalse(point_in_polygon(25.0, 25.0, poly))

    def test_point_in_circle(self):
        center = {"lat": 24.8607, "lng": 67.0011}
        # Point right at center
        self.assertTrue(point_in_circle(24.8607, 67.0011, center, radius_m=500))
        # Point ~100m away
        self.assertTrue(point_in_circle(24.8610, 67.0015, center, radius_m=500))
        # Point > 5km away
        self.assertFalse(point_in_circle(24.9500, 67.1000, center, radius_m=500))

    def test_is_point_in_zone_doc(self):
        circle_zone = {
            "shape": "circle",
            "center": {"lat": 24.8607, "lng": 67.0011},
            "radius": 1000,
        }
        self.assertTrue(is_point_in_zone_doc(24.8607, 67.0011, circle_zone))
        self.assertFalse(is_point_in_zone_doc(25.0, 68.0, circle_zone))

        poly_zone = {
            "shape": "polygon",
            "coordinates": [
                {"lat": 10.0, "lng": 10.0},
                {"lat": 10.0, "lng": 20.0},
                {"lat": 20.0, "lng": 20.0},
                {"lat": 20.0, "lng": 10.0},
            ]
        }
        self.assertTrue(is_point_in_zone_doc(15.0, 15.0, poly_zone))
        self.assertFalse(is_point_in_zone_doc(2.0, 2.0, poly_zone))

    def test_detect_admin_zone_events_emits_enter_and_exit(self):
        admin_oid = ObjectId()
        zone_oid = ObjectId()

        zones = [
            {
                "_id": zone_oid,
                "admin_id": admin_oid,
                "name": "Headquarters",
                "coordinates": [
                    {"lat": 10.0, "lng": 10.0},
                    {"lat": 10.0, "lng": 20.0},
                    {"lat": 20.0, "lng": 20.0},
                    {"lat": 20.0, "lng": 10.0},
                ]
            }
        ]

        t0 = datetime(2026, 9, 10, 10, 0, 0)
        t1 = datetime(2026, 9, 10, 10, 5, 0)
        t2 = datetime(2026, 9, 10, 10, 10, 0)
        t3 = datetime(2026, 9, 10, 10, 15, 0)

        # Device SN 999: was outside at t0, enters at t1, stays inside at t2, exits at t3
        locations = [
            {"sn": "DEV-999", "lat": 5.0, "lng": 5.0, "timestamp": t0},       # outside (prior)
            {"sn": "DEV-999", "lat": 15.0, "lng": 15.0, "timestamp": t1},   # inside -> ENTER
            {"sn": "DEV-999", "lat": 16.0, "lng": 16.0, "timestamp": t2},   # inside -> no event
            {"sn": "DEV-999", "lat": 25.0, "lng": 25.0, "timestamp": t3},   # outside -> EXIT
        ]

        devices = [
            {"sn": "DEV-999", "name": "Patrol Unit Alpha"}
        ]

        mongo = MockMongo(zones, locations, devices)

        events = asyncio.run(
            detect_admin_zone_events(
                mongo=mongo,
                admin_oid=admin_oid,
                since=datetime(2026, 9, 10, 10, 1, 0),
                end=datetime(2026, 9, 10, 10, 20, 0),
            )
        )

        self.assertEqual(len(events), 2)
        # Sorted newest first: EXIT first, then ENTER
        exit_evt = events[0]
        enter_evt = events[1]

        self.assertEqual(exit_evt["type"], "EXIT")
        self.assertEqual(exit_evt["sn"], "DEV-999")
        self.assertEqual(exit_evt["deviceName"], "Patrol Unit Alpha")
        self.assertEqual(exit_evt["zoneName"], "Headquarters")

        self.assertEqual(enter_evt["type"], "ENTER")
        self.assertEqual(enter_evt["sn"], "DEV-999")
        self.assertEqual(enter_evt["deviceName"], "Patrol Unit Alpha")
        self.assertEqual(enter_evt["zoneName"], "Headquarters")


if __name__ == "__main__":
    unittest.main()
