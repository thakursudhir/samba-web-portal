from fastapi import APIRouter, Request, HTTPException, status
from app.auth import get_session
from app.config import settings
from app.smb_client import get_user_accessible_shares

router = APIRouter(prefix="/api/shares", tags=["shares"])

@router.get("/")
def list_accessible_shares(request: Request):
    session_id = request.cookies.get(settings.SESSION_COOKIE_NAME)
    session_data = get_session(session_id)
    if not session_data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    shares = get_user_accessible_shares(session_data["username"], session_data["password"])
    return {
        "username": session_data["username"],
        "shares": shares
    }
