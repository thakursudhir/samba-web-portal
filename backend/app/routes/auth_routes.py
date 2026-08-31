from fastapi import APIRouter, Response, Request, HTTPException, status
from pydantic import BaseModel
from app.auth import verify_samba_credentials, create_session, get_session, destroy_session
from app.config import settings
from app.utils.logger import log_event

router = APIRouter(prefix="/api/auth", tags=["auth"])

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
def login(creds: LoginRequest, response: Response):
    if not verify_samba_credentials(creds.username, creds.password):
        log_event(creds.username, "LOGIN", "PORTAL", status="FAILED", details="Invalid credentials")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Samba username or password."
        )
    
    session_id = create_session(creds.username, creds.password)
    log_event(creds.username, "LOGIN", "PORTAL", status="SUCCESS")
    
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=session_id,
        httponly=True,
        samesite="lax",
        max_age=settings.SESSION_MAX_AGE,
        secure=False
    )
    return {"status": "success", "username": creds.username}

@router.post("/logout")
def logout(request: Request, response: Response):
    session_id = request.cookies.get(settings.SESSION_COOKIE_NAME)
    session_data = get_session(session_id)
    if session_data:
        log_event(session_data["username"], "LOGOUT", "PORTAL", status="SUCCESS")
    destroy_session(session_id)
    response.delete_cookie(settings.SESSION_COOKIE_NAME)
    return {"status": "success", "message": "Logged out successfully."}

@router.get("/me")
def get_current_user(request: Request):
    session_id = request.cookies.get(settings.SESSION_COOKIE_NAME)
    session_data = get_session(session_id)
    if not session_data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return {"username": session_data["username"]}
