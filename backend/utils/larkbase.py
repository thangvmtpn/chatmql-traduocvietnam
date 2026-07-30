import json
import requests

# Thông tin xác thực (lấy từ Developer Console)
APP_ID = "cli_a7fce281c3b89010"
APP_SECRET = "kwehkc8wuc6YMNodn5MCpftClavAMdpP"

# Lấy Access Token
def get_access_token():
    url = "https://open.larksuite.com/open-apis/auth/v3/app_access_token/internal/"
    payload = {"app_id": APP_ID, "app_secret": APP_SECRET}
    headers = {"Content-Type": "application/json"}
    
    response = requests.post(url, json=payload, headers=headers)
    print(response.text)
    return response.json().get("app_access_token")

def save_data_to_txt(data, file_name="data.txt"):
    try:
        with open(file_name, "w", encoding="utf-8") as file:  # Mở file với UTF-8
            file.write(data)  
        print(f"Data has been written to {file_name}")
    except Exception as e:
        print(f"Error writing to file: {e}")

# # Hàm lấy Access Token từ App ID và App Secret

# Hàm lấy dữ liệu từ bảng biên bản trên Lark Base
def get_all_base_data(app_token, table_id, access_token):
    """Lấy toàn bộ dữ liệu từ bảng Lark Bitable (phân trang)"""
    url = f"https://open.larksuite.com/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    all_records = []
    page_token = None

    while True:
        params = {"page_size": 500}  # Tối đa 500 dòng mỗi lần
        if page_token:
            params["page_token"] = page_token  # Thêm token nếu có

        response = requests.get(url, headers=headers, params=params)
        data = response.json()

        if data.get("code") == 0:
            items = data["data"]["items"]
            all_records.extend(items)  # Lưu vào danh sách tổng

            page_token = data["data"].get("page_token")  # Lấy token trang tiếp theo
            if not page_token:  # Nếu hết dữ liệu thì dừng
                break
        else:
            raise Exception(f"Error: {data.get('msg')}")
    save_data_to_txt(json.dumps(all_records, indent=4, ensure_ascii=False), "data.txt")
    return all_records

get_all_base_data("NXuWbCuxjaqTuUslZXVl13fagxh", "tblKwA8a8x4H23vE", get_access_token())
# Hàm kết nối Google Sheets
