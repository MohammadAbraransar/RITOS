from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from pwdlib import PasswordHash
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from .config import settings
from .database import get_db
from .models import User

password_hash = PasswordHash.recommended()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

def hash_password(password: str) -> str:
    return password_hash.hash(password)

def verify_password(password: str, hashed: str) -> bool:
    try: return password_hash.verify(password, hashed)
    except Exception: return False

def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user.id, "role": user.role, "iat": int(now.timestamp()),
               "exp": int((now + timedelta(minutes=settings.access_token_minutes)).timestamp())}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    error = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session",
                          headers={"WWW-Authenticate":"Bearer"})
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        user_id = payload.get("sub")
        if not user_id: raise error
    except JWTError: raise error
    user = db.get(User, user_id)
    if not user or not user.active: raise error
    return user

def require_roles(*roles: str):
    def dependency(user: User = Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Your role is not permitted to perform this action")
        return user
    return dependency
