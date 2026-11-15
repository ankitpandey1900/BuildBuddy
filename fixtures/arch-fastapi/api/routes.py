from fastapi import APIRouter
from services.user_service import get_users

router = APIRouter()

@router.get("/users")
def list_users():
    return get_users()

