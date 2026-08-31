import logging
import os

LOG_DIR = "/var/log/samba-web-portal"
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "portal_activity.log")

logger = logging.getLogger("samba_audit")
logger.setLevel(logging.INFO)

if not logger.handlers:
    fh = logging.FileHandler(LOG_FILE)
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
    fh.setFormatter(formatter)
    logger.addHandler(fh)

def log_event(username: str, action: str, target: str, status: str = "SUCCESS", details: str = ""):
    """
    Safely logs portal actions. Never accepts or records passwords or session keys.
    Format: YYYY-MM-DD HH:MM:SS INFO [username] [ACTION] [target] [STATUS] [details]
    """
    msg = f"USER={username} ACTION={action} TARGET={target} STATUS={status}"
    if details:
        msg += f" DETAILS={details}"
    logger.info(msg)
