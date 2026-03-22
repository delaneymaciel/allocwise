import os
import jwt
from datetime import datetime, timedelta, timezone
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import TypedDict, List
from dotenv import load_dotenv

load_dotenv()

ph = PasswordHasher()
security = HTTPBearer()

ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = int(os.getenv("TOKEN_EXPIRE_HOURS", "8"))


# Tipagem restrita aprovada: Melhora o Type Checker sem quebrar compatibilidade
class TokenPayload(TypedDict):
    sub: str
    permissions: List[str]
    exp: int
    iat: int


def get_env_or_fail(var_name: str, min_length: int = 32) -> str:
    value = os.getenv(var_name)
    if not value or len(value) < min_length:
        raise RuntimeError(f"CRITICAL: {var_name} ausente ou muito curta (min {min_length} chars).")
    return value


SECRET_KEY = get_env_or_fail("SECRET_KEY")
PEPPER = get_env_or_fail("PEPPER", min_length=16)


def get_password_hash(password: str) -> str:
    return ph.hash(password + PEPPER)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return ph.verify(hashed_password, plain_password + PEPPER)
    # Tratamento expandido aprovado: Protege contra hashes corrompidos no banco
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def create_access_token(data: dict) -> str:
    now = datetime.now(timezone.utc)

    to_encode = data.copy()
    to_encode.update({
        "exp": now + timedelta(hours=TOKEN_EXPIRE_HOURS),
        "iat": now
    })

    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(auth: HTTPAuthorizationCredentials = Security(security)) -> TokenPayload:
    try:
        payload = jwt.decode(auth.credentials, SECRET_KEY, algorithms=[ALGORITHM])

        if "sub" not in payload:
            raise HTTPException(status_code=401, detail="Token inválido")

        return payload

    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")


def require_permission(permission_name: str):
    def decorator(token_data: TokenPayload = Depends(get_current_user)):
        permissions = token_data.get("permissions", [])

        if not isinstance(permissions, list):
            raise HTTPException(status_code=401, detail="Token inválido")

        if permission_name not in permissions:
            raise HTTPException(
                status_code=403,
                detail=f"Acesso negado: requer permissão '{permission_name}'"
            )

        return token_data

    return decorator