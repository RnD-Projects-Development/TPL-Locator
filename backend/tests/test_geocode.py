from app.services.geocode import inside_pakistan, reverse_geocode


def test_inside_pakistan():
    assert inside_pakistan(24.86, 67.01) is True
    assert inside_pakistan(40.71, -74.01) is False


async def test_reverse_geocode_skips_null_island():
    assert await reverse_geocode(0.0, 0.0) is None
