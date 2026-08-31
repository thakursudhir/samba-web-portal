import uuid
from typing import Optional, Dict
from smbprotocol.connection import Connection
from smbprotocol.session import Session
from smbprotocol.exceptions import SMBResponseException
from app.config import settings

_ACTIVE_SESSIONS: Dict[str, dict] = {}

def verify_samba_credentials(username: str, password: str) -> bool:
    connection = Connection(uuid.uuid4(), settings.SMB_SERVER, settings.SMB_PORT)
    try:
        connection.connect(timeout=5)
        session = Session(connection, username=username, password=password)
        session.connect()
        connection.disconnect()
        return True
    except SMBResponseException:
        try:
            connection.disconnect()
        except Exception:
            pass
        return False
    except Exception:
        try:
            connection.disconnect()
        except Exception:
            pass
        return False

def create_session(username: str, password: str) -> str:
    session_id = uuid.uuid4().hex
    _ACTIVE_SESSIONS[session_id] = {
        "username": username,
        "password": password
    }
    return session_id

def get_session(session_id: Optional[str]) -> Optional[dict]:
    if not session_id:
        return None
    return _ACTIVE_SESSIONS.get(session_id)

def destroy_session(session_id: Optional[str]) -> None:
    if session_id and session_id in _ACTIVE_SESSIONS:
        del _ACTIVE_SESSIONS[session_id]
