#!/usr/bin/env python3
"""
Use aaPanel API to:
1. List files in /www/wwwroot/crm_biz
2. Compress the directory
3. Download the archive
4. Find database info from .env files
"""
import urllib.request
import urllib.parse
import json
import ssl
import http.cookiejar
import sys
import os

# aaPanel config
BASE_URL = "https://160.191.160.53:13984"
PANEL_PATH = "/47cc45b9"
USERNAME = "kt6mzuff"
PASSWORD = "c0893a03"

# Disable SSL verification
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# Cookie jar for session
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(cj),
    urllib.request.HTTPSHandler(context=ctx)
)

def api_call(path, data=None):
    url = BASE_URL + path
    if data:
        data = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=data)
    req.add_header('User-Agent', 'Mozilla/5.0')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    resp = opener.open(req, timeout=30)
    return resp.read().decode('utf-8', errors='ignore')

# Step 1: Login
print(">>> Logging in to aaPanel...")
login_data = {
    'username': USERNAME,
    'password': PASSWORD
}
result = api_call(f"{PANEL_PATH}/login", login_data)
print(f"Login response (first 500 chars): {result[:500]}")

# Check if we got a session
print(f"Cookies: {[c.name for c in cj]}")

# Step 2: Try to get file list
print("\n>>> Listing /www/wwwroot/crm_biz ...")
try:
    list_data = {
        'path': '/www/wwwroot/crm_biz',
        'showRow': 100,
        'page': 1,
        'tojs': '',
        'showHide': 'true'
    }
    result = api_call(f"{PANEL_PATH}/files?action=GetDir", list_data)
    parsed = json.loads(result)
    if 'DIR' in parsed:
        print("Directories:")
        for d in parsed['DIR']:
            print(f"  📁 {d}")
    if 'FILES' in parsed:
        print("Files:")
        for f in parsed['FILES']:
            if isinstance(f, dict):
                print(f"  📄 {f.get('name', f)}")
            elif isinstance(f, list):
                print(f"  📄 {f[0] if f else f}")
            else:
                print(f"  📄 {f}")
    else:
        print(f"Response: {result[:1000]}")
except Exception as e:
    print(f"Error listing files: {e}")
    print(f"Raw response: {result[:1000]}")

# Step 3: Try to read .env file for DB info
print("\n>>> Reading .env for database info...")
for env_path in ['/www/wwwroot/crm_biz/.env', '/www/wwwroot/crm_biz/backend/.env']:
    try:
        env_data = {'path': env_path}
        result = api_call(f"{PANEL_PATH}/files?action=GetFileBody", env_data)
        parsed = json.loads(result)
        if parsed.get('status'):
            print(f"\n=== {env_path} ===")
            print(parsed.get('data', 'no data'))
        else:
            print(f"{env_path}: {parsed.get('msg', 'not found')}")
    except Exception as e:
        print(f"Error reading {env_path}: {e}")

print("\n>>> Done inspecting.")
