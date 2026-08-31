import mimetypes
import urllib.parse
from fastapi import APIRouter, Request, HTTPException, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.auth import get_session
from app.config import settings
from app.utils.logger import log_event
from app.smb_client import (
    list_directory,
    read_file_stream,
    write_file_stream,
    create_directory,
    rename_item,
    delete_item,
    copy_item,
    get_storage_usage
)

router = APIRouter(prefix="/api/files", tags=["files"])

def get_auth_user(request: Request):
    session_id = request.cookies.get(settings.SESSION_COOKIE_NAME)
    session_data = get_session(session_id)
    if not session_data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return session_data

class FolderCreateRequest(BaseModel):
    share: str
    path: str
    folder_name: str

class RenameRequest(BaseModel):
    share: str
    old_path: str
    new_name: str

class CopyRequest(BaseModel):
    share: str
    src_path: str
    new_name: str

class DeleteRequest(BaseModel):
    share: str
    path: str
    is_dir: bool = False

@router.get("/browse")
def browse(request: Request, share: str, path: str = ""):
    user = get_auth_user(request)
    try:
        items = list_directory(user["username"], user["password"], share, path)
        storage = get_storage_usage(share)
        return {
            "share": share,
            "path": path,
            "items": items,
            "storage": storage
        }
    except Exception as e:
        log_event(user["username"], "BROWSE", f"{share}/{path}", status="DENIED", details=str(e))
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Access denied: {str(e)}")

@router.get("/preview")
def preview(request: Request, share: str, path: str):
    """Streams file for inline browser viewing (PDF/Images)."""
    user = get_auth_user(request)
    filename = path.replace("\\", "/").split("/")[-1]
    mime_type, _ = mimetypes.guess_type(filename)
    if not mime_type:
        mime_type = "application/octet-stream"

    try:
        stream = read_file_stream(user["username"], user["password"], share, path)
        encoded_filename = urllib.parse.quote(filename)
        return StreamingResponse(
            stream,
            media_type=mime_type,
            headers={"Content-Disposition": f"inline; filename*=UTF-8''{encoded_filename}"}
        )
    except Exception as e:
        log_event(user["username"], "PREVIEW", f"{share}/{path}", status="DENIED", details=str(e))
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Preview failed: {str(e)}")

@router.get("/download")
def download(request: Request, share: str, path: str):
    user = get_auth_user(request)
    filename = path.replace("\\", "/").split("/")[-1]
    encoded_filename = urllib.parse.quote(filename)
    try:
        stream = read_file_stream(user["username"], user["password"], share, path)
        log_event(user["username"], "DOWNLOAD", f"{share}/{path}", status="SUCCESS")
        return StreamingResponse(
            stream,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"}
        )
    except Exception as e:
        log_event(user["username"], "DOWNLOAD", f"{share}/{path}", status="DENIED", details=str(e))
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Download failed: {str(e)}")

@router.post("/upload")
async def upload(
    request: Request,
    share: str = Form(...),
    path: str = Form(""),
    file: UploadFile = File(...)
):
    user = get_auth_user(request)
    target_subpath = f"{path}/{file.filename}".strip("/")
    try:
        write_file_stream(user["username"], user["password"], share, target_subpath, file.file)
        log_event(user["username"], "UPLOAD", f"{share}/{target_subpath}", status="SUCCESS")
        return {"status": "success", "filename": file.filename}
    except Exception as e:
        log_event(user["username"], "UPLOAD", f"{share}/{target_subpath}", status="DENIED", details=str(e))
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Upload rejected by Samba: {str(e)}")

@router.post("/mkdir")
def mkdir(request: Request, body: FolderCreateRequest):
    user = get_auth_user(request)
    target_path = f"{body.path}/{body.folder_name}".strip("/")
    try:
        create_directory(user["username"], user["password"], body.share, target_path)
        log_event(user["username"], "MKDIR", f"{body.share}/{target_path}", status="SUCCESS")
        return {"status": "success", "path": target_path}
    except Exception as e:
        log_event(user["username"], "MKDIR", f"{body.share}/{target_path}", status="DENIED", details=str(e))
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Create folder failed: {str(e)}")

@router.post("/rename")
def rename(request: Request, body: RenameRequest):
    user = get_auth_user(request)
    parent_path = "/".join(body.old_path.replace("\\", "/").rstrip("/").split("/")[:-1])
    new_path = f"{parent_path}/{body.new_name}".strip("/") if parent_path else body.new_name
    try:
        rename_item(user["username"], user["password"], body.share, body.old_path, new_path)
        log_event(user["username"], "RENAME", f"{body.share}/{body.old_path} -> {new_path}", status="SUCCESS")
        return {"status": "success", "new_path": new_path}
    except Exception as e:
        log_event(user["username"], "RENAME", f"{body.share}/{body.old_path}", status="DENIED", details=str(e))
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Rename failed: {str(e)}")

@router.post("/copy")
def copy(request: Request, body: CopyRequest):
    user = get_auth_user(request)
    parent_path = "/".join(body.src_path.replace("\\", "/").rstrip("/").split("/")[:-1])
    dst_path = f"{parent_path}/{body.new_name}".strip("/") if parent_path else body.new_name
    try:
        copy_item(user["username"], user["password"], body.share, body.src_path, dst_path)
        log_event(user["username"], "COPY", f"{body.share}/{body.src_path} -> {dst_path}", status="SUCCESS")
        return {"status": "success", "new_path": dst_path}
    except Exception as e:
        log_event(user["username"], "COPY", f"{body.share}/{body.src_path}", status="DENIED", details=str(e))
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Copy failed: {str(e)}")

@router.post("/delete")
def delete(request: Request, body: DeleteRequest):
    user = get_auth_user(request)
    try:
        delete_item(user["username"], user["password"], body.share, body.path, body.is_dir)
        log_event(user["username"], "DELETE", f"{body.share}/{body.path}", status="SUCCESS")
        return {"status": "success", "deleted": body.path}
    except Exception as e:
        log_event(user["username"], "DELETE", f"{body.share}/{body.path}", status="DENIED", details=str(e))
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Delete failed: {str(e)}")