import hashlib
import requests
import json
import os
from datetime import datetime, timedelta



# ========================== EXAMPLE USAGE ==========================

    # ================== YOUR CREDENTIALS ==================
APP_KEY = "8FB345B8693CCD008DA43365561C5A1E339A22A4105B6558"
APP_SECRET = "0b8b3d9371dd4febbe7077dc4e65611b"
ACCOUNT = "TPLTrakker"
PASSWORD_MD5 = "7be30165906c98d4baf08e4889642a27"   # lowercase md5
BASE_URL = "https://eu-open.tracksolidpro.com/route/rest" 
TOKEN_FILE = "tracksolid_token.json"

IMEI_FOR_TRACK = "780901807619376"   # Change if needed for history

# ============================================================

def calculate_sign(params: dict, app_secret: str) -> str:
    params = {k: v for k, v in params.items() if k != "sign"}
    sorted_params = sorted(params.items())
    
    sign_str = app_secret
    for key, value in sorted_params:
        sign_str += f"{key}{value}"
    sign_str += app_secret
    
    return hashlib.md5(sign_str.encode('utf-8')).hexdigest().upper()


def api_call(method: str, extra_params: dict, token=None):
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    
    params = {
        "method": method,
        "timestamp": timestamp,
        "app_key": APP_KEY,
        "sign_method": "md5",
        "v": "1.0",
        "format": "json",
        "user_id": ACCOUNT,
        "user_pwd_md5": PASSWORD_MD5,
        "expires_in": "7200"
    }
    if token:
        params["access_token"] = token
    params.update(extra_params)
    
    params["sign"] = calculate_sign(params, APP_SECRET)
    
    response = requests.post(BASE_URL, data=params, timeout=20)
    
    try:
        data = response.json()
        return data
    except:
        print("Raw Response:", response.text)
        return None


def load_token():
    if os.path.exists(TOKEN_FILE):
        try:
            with open(TOKEN_FILE, 'r') as f:
                data = json.load(f)
                return data.get("accessToken"), data.get("refreshToken"), data.get("expires_at")
        except:
            pass
    return None, None, None


def save_token(token_data):
    # Add expiration time (approx 2 hours)
    expires_at = (datetime.utcnow() + timedelta(hours=1.8)).isoformat()
    token_data["expires_at"] = expires_at
    with open(TOKEN_FILE, 'w') as f:
        json.dump(token_data, f, indent=2)
    print("✅ Token saved to file")


def get_valid_token():
    access_token, refresh_token, expires_at = load_token()
    
    if access_token and expires_at:
        # Check if token is still valid
        if datetime.fromisoformat(expires_at) > datetime.utcnow():
            print("✅ Using saved token")
            return access_token
    
    # Re-authenticate
    print("🔑 Getting new access token...")
    token_params = {
        "user_id": ACCOUNT,
        "user_pwd_md5": PASSWORD_MD5,
        "expires_in": "7200"
    }
    
    resp = api_call("jimi.oauth.token.get", token_params)
    
    if resp and resp.get("code") == 0:
        result = resp["result"]
        print("✅ Authentication successful")
        save_token(result)
        return result["accessToken"]
    else:
        print("❌ Authentication failed:", resp)
        exit()


# ====================== MAIN FLOW ======================
if __name__ == "__main__":
    token = get_valid_token()
    
    # 2.1 List all devices of user / sub-account
    # print("\n=== 2.1 Listing all devices ===")
    # list_params = {
    #     "target": ACCOUNT          # Use your main account or sub-account
    # }
    # devices_resp = api_call("jimi.user.device.list", list_params, token)
    # print(json.dumps(devices_resp, indent=2, ensure_ascii=False))
    
    # # Collect all IMEIs for bulk location
    # all_imeis = []
    # if devices_resp and devices_resp.get("code") == 0 and devices_resp.get("result"):
    #     all_imeis = [dev["imei"] for dev in devices_resp["result"]]
    #     print(f"Found {len(all_imeis)} devices")
    
    # # 3.2 Get current location of all devices
    # print("\n=== 3.2 Getting current location of all devices ===")
    # if all_imeis:
    #     location_params = {
    #         "imeis": ",".join(all_imeis[:100])   # max 100 per call
    #     }
    #     loc_resp = api_call("jimi.device.location.get", location_params, token)
    #     print(json.dumps(loc_resp, indent=2, ensure_ascii=False))
    
    # 3.5 Get track data history (for specific IMEI)
    print(f"\n=== 3.5 Getting track history for IMEI: {IMEI_FOR_TRACK} ===")
    # Hardcoded date: 13 May 2026 full day (00:00:00 to 23:59:59)
    start_time = datetime(2026, 6, 30, 0, 0, 0)
    end_time = datetime(2026, 6, 30, 23, 59, 59)
    
    track_params = {
        "imei": IMEI_FOR_TRACK,
        "begin_time": start_time.strftime("%Y-%m-%d %H:%M:%S"),
        "end_time": end_time.strftime("%Y-%m-%d %H:%M:%S"),
        # "map_type": null   # optional
    }
    track_resp = api_call("jimi.device.track.list", track_params, token)
    print(json.dumps(track_resp, indent=2, ensure_ascii=False))
    
    # # 3.8 Get location of TAG device
    # print("\n=== 3.8 Getting TAG device location ===")
    # tag_params = {
    #     "imei": IMEI_FOR_TRACK   # Replace with your TAG IMEI if different
    # }
    # tag_resp = api_call("jimi.device.location.getTagMsg", tag_params, token)   # Most common method
    # print(json.dumps(tag_resp, indent=2, ensure_ascii=False))
    
    print("\n🎉 All operations completed!")