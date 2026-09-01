from pydantic import BaseModel

class Settings(BaseModel):
    APP_NAME: str = "Datamatics IT File Share Portal"
    SMB_SERVER: str = "127.0.0.1"
    SMB_PORT: int = 445
    SECRET_KEY: str = "samba-internal-portal-secure-key-2026-dx"
    SESSION_COOKIE_NAME: str = "samba_session"
    SESSION_MAX_AGE: int = 3600 * 8  # 8 hours

settings = Settings()
