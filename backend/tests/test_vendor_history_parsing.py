from app.services.zoqin_history import _extract_zoqin_blocks, _extract_zoqin_reports


def test_extract_zoqin_blocks_handles_nested_results():
    payload = {"data": {"results": [{"sn": "ABC123", "reports": [{"latitude": 24.0, "longitude": 67.0}]}]}}
    blocks = _extract_zoqin_blocks(payload)
    assert len(blocks) == 1
    assert blocks[0]["sn"] == "ABC123"


def test_extract_zoqin_reports_handles_nested_payloads():
    block = {"data": {"list": [{"latitude": 24.0, "longitude": 67.0}]}}
    reports = _extract_zoqin_reports(block)
    assert len(reports) == 1
    assert reports[0]["latitude"] == 24.0
