from fastapi import APIRouter, Depends
from model.roles import get_all_roles
from utils.security import check_token

router = APIRouter()

@router.get("/roles")
async def get_roles(payload_token: str = Depends(check_token)):
    roles = await get_all_roles()
    return {"roles": roles}