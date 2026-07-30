import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from utils.security import check_token

router = APIRouter()


async def sendByZNS(phone, data, tempId):
    api_key = "1418451931194267012:EY9kwBeBhRB3t3Q3gk7kfHzlQ2QnjM7R"
    token = "Bearer " + api_key
    baseUrl = "https://api.etelecom.vn/v1/shop"
    oaId = "1225934657594830147"

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            response = await client.post(
                url=f"{baseUrl}.Zalo/SendZNS",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"{token}",
                },
                json={
                    "mode": "unknown",
                    "oa_id": oaId,
                    "phone": phone,
                    "sending_mode": "default",
                    "template_data": data,
                    "template_id": tempId,
                    "tracking_id": "text",
                },
            )
            result = response.json()
        except httpx.HTTPError as e:
            result = {"error": str(e)}
        except ValueError:
            result = {"error": "Invalid JSON response"}

    print("📤 ZNS Request result:", result)
    return result


class SendZNSRequest(BaseModel):
    phone: str = "84378676858"
    ten_kh: str
    ma_don_hang: str = ""
    template_id: int = 500248


@router.post("/zns/send")
async def send_zns(payload: SendZNSRequest, user=Depends(check_token)):
    data_send = {
        "ten_kh": payload.ten_kh,
        "ma_don_hang": payload.ma_don_hang,
    }
    result = await sendByZNS(payload.phone, data_send, payload.template_id)
    return result
