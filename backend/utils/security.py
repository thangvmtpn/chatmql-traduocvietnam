import os
import re
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from jose import ExpiredSignatureError, jwt, JWTError
from fastapi import HTTPException, Security, Depends
from fastapi.security import OAuth2PasswordBearer

# Load biến môi trường
load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES"))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

# Tạo JWT token
async def create_access_token(data: dict, expires_delta: timedelta):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# Middleware kiểm tra token
async def check_token(token: str = Security(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        exp = payload.get("exp")
        current_ts = datetime.now(timezone.utc).timestamp()  # ✅ Cùng UTC

        # print(f"Token exp: {exp}, Current time: {current_ts}")

        # So sánh hết hạn
        if exp is None or current_ts > exp:
            raise HTTPException(status_code=401, detail="Token đã hết hạn")

        username: str = payload.get("user_id")
        if username is None:
            raise HTTPException(status_code=401, detail="Token không hợp lệ")

        return payload

    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token đã hết hạn")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token không hợp lệ")

async def decode_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

# kết nối gg sheet
async def get_google_sheet(sheet_url):
    scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    path = "traf-452002-f2de6789897f.json"
    keyapi = ServiceAccountCredentials.from_json_keyfile_name(path, scope)
    client = gspread.authorize(keyapi)
    # sheet = client.open(sheet_name).sheet1
    match = re.search(r"/d/([a-zA-Z0-9-_]+)", sheet_url)
    if match:
        sheet_id = match.group(1)
        print(f"✅ Sheet ID hợp lệ: {sheet_id}")
    else:
        print("❌ URL không hợp lệ!")
    
    sheets = client.open_by_key(sheet_id).worksheets()
    sheet = sheets[0]
    return sheet
