from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from app.routes.auth_routes import router as auth_router
from app.routes.share_routes import router as share_router
from app.routes.file_routes import router as file_router

app = FastAPI(title="Samba Web Portal", docs_url=None, redoc_url=None)

# Register API Routers
app.include_router(auth_router)
app.include_router(share_router)
app.include_router(file_router)

# Mount Static Assets
frontend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../frontend"))
app.mount("/static", StaticFiles(directory=frontend_path), name="static")

@app.get("/")
def serve_index():
    return FileResponse(os.path.join(frontend_path, "index.html"))
