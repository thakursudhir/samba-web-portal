import os
import shutil
import uuid
import smbclient
from datetime import datetime
from typing import List, Dict, Any, Generator
from smbprotocol.connection import Connection
from smbprotocol.session import Session
from smbprotocol.tree import TreeConnect
from app.config import settings

CONFIGURED_SHARES = [
    {
        "name": "backup",
        "label": "Backup Storage",
        "description": "Users Backup Storage",
        "linux_path": "/srv/samba/backup"
    },
    {
        "name": "itshare",
        "label": "IT Shared Storage",
        "description": "Datamatics IT - Office Shared Storage",
        "linux_path": "/srv/samba/itshare"
    }
]

def sanitize_path(share_name: str, subpath: str) -> str:
    clean_subpath = subpath.strip().replace("/", "\\").lstrip("\\")
    parts = [p for p in clean_subpath.split("\\") if p and p != "."]
    
    safe_parts = []
    for part in parts:
        if part == "..":
            if safe_parts:
                safe_parts.pop()
        else:
            safe_parts.append(part)
            
    relative_path = "\\".join(safe_parts)
    if relative_path:
        return f"\\\\{settings.SMB_SERVER}\\{share_name}\\{relative_path}"
    return f"\\\\{settings.SMB_SERVER}\\{share_name}"

def register_user_session(username: str, password: str) -> None:
    smbclient.register_session(
        server=settings.SMB_SERVER,
        username=username,
        password=password,
        port=settings.SMB_PORT
    )

def check_share_access(username: str, password: str, share_name: str) -> Dict[str, Any]:
    connection = Connection(uuid.uuid4(), settings.SMB_SERVER, settings.SMB_PORT)
    try:
        connection.connect(timeout=5)
        session = Session(connection, username=username, password=password)
        session.connect()
        tree = TreeConnect(session, f"\\\\{settings.SMB_SERVER}\\{share_name}")
        tree.connect()
        tree.disconnect()
        connection.disconnect()
        return {"accessible": True, "share": share_name}
    except Exception:
        try:
            connection.disconnect()
        except Exception:
            pass
        return {"accessible": False, "share": share_name}

def get_user_accessible_shares(username: str, password: str) -> List[Dict[str, Any]]:
    accessible = []
    for share in CONFIGURED_SHARES:
        res = check_share_access(username, password, share["name"])
        if res["accessible"]:
            accessible.append({
                "name": share["name"],
                "label": share["label"],
                "description": share["description"]
            })
    return accessible

def get_storage_usage(share_name: str) -> Dict[str, Any]:
    """Retrieves disk capacity (Total, Used, Free, Percent) for a share."""
    target_share = next((s for s in CONFIGURED_SHARES if s["name"] == share_name), None)
    path = target_share["linux_path"] if target_share and os.path.exists(target_share["linux_path"]) else "/srv/samba"
    try:
        usage = shutil.disk_usage(path)
        return {
            "total": usage.total,
            "used": usage.used,
            "free": usage.free,
            "percent_used": round((usage.used / usage.total) * 100, 1)
        }
    except Exception:
        return {"total": 0, "used": 0, "free": 0, "percent_used": 0}

def list_directory(username: str, password: str, share_name: str, subpath: str = "") -> List[Dict[str, Any]]:
    register_user_session(username, password)
    unc_path = sanitize_path(share_name, subpath)
    entries = []
    for entry in smbclient.scandir(unc_path):
        stat = entry.stat()
        is_dir = entry.is_dir()
        mtime = datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        ext = os.path.splitext(entry.name)[1].lower() if not is_dir else ""
        
        # Identify previewable files
        preview_type = None
        if ext in [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]:
            preview_type = "image"
        elif ext == ".pdf":
            preview_type = "pdf"

        entries.append({
            "name": entry.name,
            "is_dir": is_dir,
            "size": stat.st_size if not is_dir else 0,
            "modified": mtime,
            "preview_type": preview_type,
            "ext": ext
        })
    entries.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
    return entries

def read_file_stream(username: str, password: str, share_name: str, subpath: str, chunk_size: int = 65536) -> Generator[bytes, None, None]:
    register_user_session(username, password)
    unc_path = sanitize_path(share_name, subpath)
    with smbclient.open_file(unc_path, mode="rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            yield chunk

def write_file_stream(username: str, password: str, share_name: str, subpath: str, file_obj) -> None:
    register_user_session(username, password)
    unc_path = sanitize_path(share_name, subpath)
    with smbclient.open_file(unc_path, mode="wb") as f:
        while True:
            chunk = file_obj.read(65536)
            if not chunk:
                break
            f.write(chunk)

def copy_item(username: str, password: str, share_name: str, src_subpath: str, dst_subpath: str) -> None:
    register_user_session(username, password)
    src_unc = sanitize_path(share_name, src_subpath)
    dst_unc = sanitize_path(share_name, dst_subpath)
    
    # Check if directory or file
    with smbclient.open_file(src_unc, mode="rb") as f_src:
        with smbclient.open_file(dst_unc, mode="wb") as f_dst:
            while True:
                chunk = f_src.read(65536)
                if not chunk:
                    break
                f_dst.write(chunk)

def create_directory(username: str, password: str, share_name: str, subpath: str) -> None:
    register_user_session(username, password)
    unc_path = sanitize_path(share_name, subpath)
    smbclient.mkdir(unc_path)

def rename_item(username: str, password: str, share_name: str, old_subpath: str, new_subpath: str) -> None:
    register_user_session(username, password)
    src_unc = sanitize_path(share_name, old_subpath)
    dst_unc = sanitize_path(share_name, new_subpath)
    smbclient.rename(src_unc, dst_unc)

def delete_item(username: str, password: str, share_name: str, subpath: str, is_dir: bool = False) -> None:
    register_user_session(username, password)
    unc_path = sanitize_path(share_name, subpath)
    if is_dir:
        smbclient.rmdir(unc_path)
    else:
        smbclient.remove(unc_path)