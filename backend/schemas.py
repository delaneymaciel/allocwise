from pydantic import BaseModel
from typing import Dict, List, Optional

class GroupBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True
    is_superadmin: bool = False

class GroupCreate(GroupBase):
    permissions: Dict[str, List[str]] = {}

class GroupUpdate(GroupBase):
    permissions: Dict[str, List[str]] = {}

class GroupResponse(GroupBase):
    id: int
    is_system: bool
    permissions: Dict[str, List[str]]

    class Config:
        from_attributes = True # Necessário para ler dos objetos SQLAlchemy