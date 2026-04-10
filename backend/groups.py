from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session
from sqlalchemy import insert, delete
from typing import List
from database import get_db
import models, schemas, auth

router = APIRouter(prefix="/api/groups", tags=["Groups RBAC"])

def format_group_response(group: models.Group) -> schemas.GroupResponse:
    perms_dict = {}
    for p in group.permissions:
        if p.module_id not in perms_dict:
            perms_dict[p.module_id] = []
        perms_dict[p.module_id].append(p.action)
    
    return schemas.GroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        is_active=group.is_active,
        is_system=group.is_system,
        is_superadmin=group.is_superadmin,
        permissions=perms_dict
    )

@router.get("", response_model=List[schemas.GroupResponse])
def get_groups(db: Session = Depends(get_db), current=Depends(auth.require_permission("admin_groups:view"))):
    groups = db.query(models.Group).order_by(models.Group.id).all()
    return [format_group_response(g) for g in groups]

@router.post("", response_model=schemas.GroupResponse, status_code=status.HTTP_201_CREATED)
def create_group(
    group_in: schemas.GroupCreate, 
    db: Session = Depends(get_db), 
    current=Depends(auth.require_permission("admin_groups:create"))
):
    db_group = models.Group(
        name=group_in.name,
        description=group_in.description,
        is_active=group_in.is_active,
        is_superadmin=group_in.is_superadmin,
        is_system=False 
    )
    db.add(db_group)
    db.commit()
    db.refresh(db_group)

    for module_id, actions in group_in.permissions.items():
        for action in actions:
            db_perm = models.GroupPermission(group_id=db_group.id, module_id=module_id, action=action)
            db.add(db_perm)
    
    db.commit()
    db.refresh(db_group)
    return format_group_response(db_group)

@router.get("/{group_id}/users")
def get_group_users(group_id: int, db: Session = Depends(get_db), current=Depends(auth.require_permission("admin_groups:view"))):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404)
    return [{"id": u.id, "name": u.name, "username": u.username} for u in group.users]

@router.post("/{group_id}/users", status_code=status.HTTP_204_NO_CONTENT)
def assign_users_to_group(group_id: int, user_ids: List[int] = Body(...), db: Session = Depends(get_db), current=Depends(auth.require_permission("admin_groups:edit"))):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404)
        
    db.execute(delete(models.user_groups).where(models.user_groups.c.group_id == group_id))
    
    if user_ids:
        mappings = [{"user_id": uid, "group_id": group_id} for uid in user_ids]
        db.execute(insert(models.user_groups), mappings)
        
    db.commit()
    return None

@router.put("/{group_id}", response_model=schemas.GroupResponse)
def update_group(
    group_id: int, 
    group_in: schemas.GroupUpdate, 
    db: Session = Depends(get_db),
    current=Depends(auth.require_permission("admin_groups:edit"))
):
    db_group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not db_group:
        raise HTTPException(status_code=404)
    if db_group.is_system:
        raise HTTPException(status_code=403)

    db_group.name = group_in.name
    db_group.description = group_in.description
    db_group.is_active = group_in.is_active
    db_group.is_superadmin = group_in.is_superadmin

    db.query(models.GroupPermission).filter(models.GroupPermission.group_id == group_id).delete()
    
    if not group_in.is_superadmin: 
        for module_id, actions in group_in.permissions.items():
            for action in actions:
                db_perm = models.GroupPermission(group_id=db_group.id, module_id=module_id, action=action)
                db.add(db_perm)

    db.commit()
    db.refresh(db_group)
    return format_group_response(db_group)

@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(group_id: int, db: Session = Depends(get_db), current=Depends(auth.require_permission("admin_groups:delete"))):
    db_group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not db_group:
        raise HTTPException(status_code=404)
    if db_group.is_system:
        raise HTTPException(status_code=403)

    db.delete(db_group)
    db.commit()
    return None