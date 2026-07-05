import asyncio
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

# Ensure backend package imports work from backend/.
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from app.dependencies import get_settings
from app.services.citytag import CityTagClient, CityTagError


def dump_json(value: Any) -> str:
    try:
        return json.dumps(value, indent=2, default=str, ensure_ascii=False)
    except Exception:
        return str(value)


def print_header(title: str) -> None:
    print("\n" + "=" * 80)
    print(title)
    print("=" * 80)


async def run(uid: str) -> None:
    settings = get_settings()
    base_url = settings.get("citytag_base_url") or ""
    email = settings.get("citytag_sync_email") or ""
    password = settings.get("citytag_sync_password") or ""

    print_header("CityTag API Runner")
    print(f"CITYTAG_BASE_URL: {base_url}")
    print(f"CITYTAG_SYNC_EMAIL: {email}")
    print(f"UID: {uid}")

    if not base_url or not email or not password:
        print("Missing required CityTag environment values. Please set CITYTAG_BASE_URL, CITYTAG_SYNC_EMAIL, and CITYTAG_SYNC_PASSWORD.")
        return

    client = CityTagClient(base_url)

    try:
        print_header("Login")
        login_data = await client.login(email, password)
        print(dump_json(login_data))
    except CityTagError as exc:
        print(f"CityTag login failed: {exc}")
        return
    except Exception as exc:
        print(f"Unexpected login error: {exc}")
        return

    token = login_data.get("token") if isinstance(login_data, dict) else None
    if not token:
        print("Login succeeded but token was not found in response data.")
        return

    try:
        print_header("Device List (get_all_devices)")
        devices = await client.get_all_devices(uid=uid, token=token, page_size=50, max_pages=20)
        print(f"Total devices returned: {len(devices)}")
        print(dump_json(devices[:10]))
    except CityTagError as exc:
        print(f"CityTag get_all_devices failed: {exc}")
        return
    except Exception as exc:
        print(f"Unexpected get_all_devices error: {exc}")
        return

    if not devices:
        print("No devices returned from CityTag.")
        return

    sample_devices = devices[:5]
    for idx, device in enumerate(sample_devices, start=1):
        sn = device.get("sn") or device.get("SN") or device.get("imei") or device.get("IMEI")
        if not sn:
            print(f"\nDevice #{idx} missing SN, skipping latest/location history.")
            continue

        print_header(f"Device #{idx} latest location (sn={sn})")
        try:
            latest = await client.get_latest_location(uid=uid, token=token, sn=str(sn), page_no=1, page_size=20)
            print(dump_json(latest))
        except CityTagError as exc:
            print(f"CityTag get_latest_location failed for {sn}: {exc}")
        except Exception as exc:
            print(f"Unexpected get_latest_location error for {sn}: {exc}")

    first_sn = sample_devices[0].get("sn") or sample_devices[0].get("SN") or sample_devices[0].get("imei") or sample_devices[0].get("IMEI")
    if first_sn:
        begin = datetime.utcnow() - timedelta(hours=3)
        end = datetime.utcnow()
        print_header(f"Location history for first device (sn={first_sn})")
        try:
            history = await client.get_location_history(
                uid=uid,
                token=token,
                sn=str(first_sn),
                start_time=begin,
                end_time=end,
                page_no=1,
                page_size=500,
            )
            print(f"History points returned: {len(history)}")
            print(dump_json(history[:20]))
        except CityTagError as exc:
            print(f"CityTag get_location_history failed for {first_sn}: {exc}")
        except Exception as exc:
            print(f"Unexpected get_location_history error for {first_sn}: {exc}")
    else:
        print("First device SN was not available, skipping location history.")


def main() -> None:
    uid_arg = sys.argv[1] if len(sys.argv) > 1 else None
    settings = get_settings()
    uid = uid_arg or settings.get("citytag_sync_uid")
    if not uid:
        print("Usage: python run_citytag_api.py <uid>\nOr set CITYTAG_SYNC_UID in your env.")
        return
    asyncio.run(run(uid))


if __name__ == "__main__":
    main()
