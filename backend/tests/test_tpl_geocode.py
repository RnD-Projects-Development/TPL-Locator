from app.services.tpl_geocode import parse_landmark_record


def test_parse_poi_landmark():
    record = {
        "name": "TPL Trakker",
        "address": "Main Korangi Industrial Road, Sector 24",
        "parent": "Sector 24",
        "parent2": "Karachi",
        "type": "POI",
    }
    assert parse_landmark_record(record) == (
        "TPL Trakker — Main Korangi Industrial Road, Sector 24"
    )


def test_parse_street_only_landmark():
    record = {
        "address": "University Road",
        "parent": "Gulshan-e-Iqbal",
        "parent2": "Karachi",
    }
    assert parse_landmark_record(record) == "University Road — Gulshan-e-Iqbal, Karachi"


def test_parse_empty_returns_none():
    assert parse_landmark_record({}) is None
