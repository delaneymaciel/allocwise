import json
import os
import re
import logging
from contextlib import asynccontextmanager
from datetime import date
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Body
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect
import models, auth, ingestion, database, groups


# 1. Configuração de Observabilidade (Pronto para Nuvem)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 2. Governança de Payload: Impedir corrupção de JSON nas preferências
class UserPreferences(BaseModel):
    ganttStrictDates: bool = True
    ganttShowTeamNames: bool = True
    ganttStatusFilter: List[str] = []
    selectedSystems: List[str] = []
    ganttScrollPosition: Optional[Dict[str, Any]] = None
    vacationsScrollPosition: Optional[Dict[str, Any]] = None

def seed_holidays(db: Session):
    if db.query(models.Holiday).first():
        return
    data_path = os.path.join(os.path.dirname(__file__), "data")
    json_file = os.path.join(data_path, "holidays.json")
    if os.path.exists(json_file):
        with open(json_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            for item in data:
                if isinstance(item['date'], str):
                    item['date'] = date.fromisoformat(item['date'])
            db.bulk_insert_mappings(models.Holiday, data)
            db.commit()

def seed_resources(db: Session):
    if db.query(models.Resource).first():
        return
    data_path = os.path.join(os.path.dirname(__file__), "data")
    json_file = os.path.join(data_path, "resources.json")
    if not os.path.exists(json_file):
        return
    try:
        with open(json_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        db.bulk_insert_mappings(models.Resource, data)
        db.commit()
    except Exception as e:
        logger.error(f"Erro no seed de resources: {str(e)}")
        db.rollback()

@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=database.engine)
    with database.SessionLocal() as db:
        super_group = db.query(models.Group).filter(models.Group.name == "Superadmin").first()
        if not super_group:
            super_group = models.Group(
                name="Superadmin",
                description="Acesso total ao sistema",
                is_active=True,
                is_system=True,
                is_superadmin=True
            )
            db.add(super_group)
            db.commit()
            db.refresh(super_group)

        admin_user = db.query(models.User).filter(models.User.username == "admin").first()
        if not admin_user:
            initial_pwd = os.getenv("ADMIN_INITIAL_PASSWORD", "AllocWise@Provisoria1")
            admin_user = models.User(
                name="Administrador",
                username="admin",
                email="admin@allocwise.com",
                password_hash=auth.get_password_hash(initial_pwd),
                must_change_password=True
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
            
        if super_group not in admin_user.groups:
            admin_user.groups.append(super_group)
            db.commit()

        seed_holidays(db)
        seed_resources(db)
    yield

app = FastAPI(lifespan=lifespan)
app.include_router(groups.router)



raw_origins = os.getenv("FRONTEND_URL", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000")

env_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

origens_permitidas = list(set(["http://localhost:5173", "http://localhost:3000"] + env_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origens_permitidas,
    allow_credentials=True,             
    allow_methods=["*"],                
    allow_headers=["*"],                
)

# BLINDAGEM: Rotas de Recursos agora são Autenticadas e com RBAC
@app.get("/api/resources")
def get_resources(db: Session = Depends(database.get_db), current=Depends(auth.require_permission("op_teams:view"))):
    return db.query(models.Resource).all()

@app.post("/api/resources")
def create_resource(res_data: dict, db: Session = Depends(database.get_db), current=Depends(auth.require_permission("op_teams:create"))):
    if 'name' not in res_data:
        raise HTTPException(status_code=400, detail="name é obrigatório")
    try:
        name_val = res_data.get('name')
        azure_id_val = res_data.get('azure_id') or name_val.lower().replace(" ", ".")
        new_res = models.Resource(
            name=name_val,
            role=res_data.get('role', 'Desenvolvedor'),
            azure_id=azure_id_val,
            color_code=res_data.get('color_code', '#3b82f6'),
            is_active=True,
            squad=res_data.get('squad', 'Salesforce')
        )
        db.add(new_res)
        db.commit()
        db.refresh(new_res)
        return new_res
    except Exception as e:
        db.rollback()
        logger.error("Erro interno ao criar recurso", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro interno ao salvar")

@app.put("/api/resources/{id}")
def update_resource(id: int, res_data: dict, db: Session = Depends(database.get_db), current=Depends(auth.require_permission("op_teams:edit"))):
    res = db.query(models.Resource).filter(models.Resource.id == id).first()
    if not res:
        raise HTTPException(status_code=404, detail="Integrante não encontrado")
    res.name = res_data.get('name', res.name)
    res.role = res_data.get('role', res.role)
    res.color_code = res_data.get('color_code', res.color_code)
    res.squad = res_data.get('squad', res.squad)
    if 'azure_id' in res_data:
        res.azure_id = res_data['azure_id']
    db.commit()
    db.refresh(res)
    return res

@app.patch("/api/resources/{id}/status")
def toggle_resource_status(id: int, db: Session = Depends(database.get_db), current=Depends(auth.require_permission("op_teams:deactivate"))):
    res = db.query(models.Resource).filter(models.Resource.id == id).first()
    if not res:
        raise HTTPException(status_code=404)
    res.is_active = not res.is_active
    db.commit()
    db.refresh(res)
    return res

@app.delete("/api/resources/{id}")
def delete_resource(id: int, db: Session = Depends(database.get_db), current=Depends(auth.require_permission("op_teams:delete"))):
    res = db.query(models.Resource).filter(models.Resource.id == id).first()
    if not res:
        raise HTTPException(status_code=404, detail="Integrante não encontrado")
    try:
        db.delete(res)
        db.commit()
        return {"message": "Removido com sucesso"}
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Erro ao excluir")

@app.get("/api/users")
def list_users(db: Session = Depends(database.get_db), current=Depends(auth.require_permission("admin_users:view"))):
    try:
        users = db.query(models.User).all()
        result = []
        for u in users:
            
            user_groups = []
            try:
                if getattr(u, 'groups', None):
                    user_groups = [{"id": g.id, "name": g.name, "is_superadmin": g.is_superadmin} for g in u.groups]
            except Exception as relation_error:
                logger.warning(f"Falha ao carregar grupos para user {u.id}: {relation_error}")
                
            result.append({
                "id": u.id, 
                "name": u.name or u.username, 
                "username": u.username, 
                "email": u.email,
                "groups": user_groups, 
                "is_active": u.is_active,
                "must_change_password": u.must_change_password
            })
        return result
    except Exception as e:
        logger.error(f"Erro crítico ao listar usuários: {e}", exc_info=True)
        return [] # Devolve lista vazia para não quebrar a UI

@app.post("/api/users")
def create_system_user(data: dict, db: Session = Depends(database.get_db), current=Depends(auth.require_permission("admin_users:create"))):
    try:

        if db.query(models.User).filter(models.User.username == data['username']).first():
            raise HTTPException(status_code=400, detail="Este login já existe no sistema.")

        new_user = models.User(
            name=data.get('name'),
            username=data['username'],
            email=data.get('email'),
            password_hash=auth.get_password_hash(data.get('password', 'Mudar@123')),
            must_change_password=data.get('must_change_password', True)
        )
        
        group_ids = data.get('group_ids', [])
        if group_ids:
            new_user.groups = db.query(models.Group).filter(models.Group.id.in_(group_ids)).all()
            
        db.add(new_user)
        db.commit()
        return {"status": "created"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Erro ao criar usuário: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro interno ao gravar usuário.")

@app.put("/api/users/{id}")
def update_system_user(id: int, data: dict, db: Session = Depends(database.get_db), current=Depends(auth.require_permission("admin_users:edit"))):
    try:
        user = db.query(models.User).filter(models.User.id == id).first()
        if not user: raise HTTPException(status_code=404)
        
        if data.get('password'): 
            user.password_hash = auth.get_password_hash(data['password'])
            
        user.name = data.get('name', user.name)
        user.username = data.get('username', user.username)
        user.email = data.get('email', user.email)
        user.must_change_password = data.get('must_change_password', user.must_change_password)
        
        if 'group_ids' in data:
            user.groups = db.query(models.Group).filter(models.Group.id.in_(data['group_ids'])).all()
            
        db.commit()
        return {"status": "updated"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/api/users/{id}/status")
def toggle_user_status(id: int, db: Session = Depends(database.get_db), current=Depends(auth.require_permission("admin_users:edit"))):
    user = db.query(models.User).filter(models.User.id == id).first()
    if not user: raise HTTPException(status_code=404)
    user.is_active = not user.is_active
    db.commit()
    return {"status": "success"}

@app.delete("/api/users/{id}")
def delete_system_user(id: int, db: Session = Depends(database.get_db), current=Depends(auth.require_permission("admin_users:delete"))):
    db.query(models.User).filter(models.User.id == id).delete()
    db.commit()
    return {"status": "deleted"}

@app.post("/login")
def login(data: dict, db: Session = Depends(database.get_db)):
    username = data.get('username')
    password = data.get('password')
    
    user = db.query(models.User).filter(models.User.username == username).first()
    
    if not user or not auth.verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciais incorretas")
        
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Usuário inativo")

    if user.must_change_password:
        return JSONResponse(status_code=403, content={"requirePasswordChange": True, "userId": user.id})

    perms_set = set()
    is_superadmin = False

    for group in user.groups:
        if not group.is_active:
            continue
        if group.is_superadmin:
            is_superadmin = True
            break
        for p in group.permissions:
            perms_set.add(f"{p.module_id}:{p.action}")

    token = auth.create_access_token({
        "sub": user.username,
        "permissions": list(perms_set),
        "is_superadmin": is_superadmin
    })
    
    return {
        "access_token": token, 
        "token_type": "bearer",
        "user": {"id": user.id, "name": user.name, "is_superadmin": is_superadmin}
    }

@app.post("/api/users/change-initial-password")
def change_initial_password(data: dict, db: Session = Depends(database.get_db)):
    username = data.get("username")
    new_pwd = data.get("newPassword")
    
    user = db.query(models.User).filter(models.User.username == username).first()
    
    if not user:
        logger.error(f"Tentativa de troca de senha: Utilizador '{username}' não encontrado.")
        raise HTTPException(status_code=404, detail="Utilizador não encontrado.")
        
    if not user.must_change_password:
        raise HTTPException(status_code=403, detail="Esta conta já possui senha definida.")
    
    strong_password_regex = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$")
    if not strong_password_regex.match(new_pwd):
        raise HTTPException(status_code=400, detail="A senha não cumpre os requisitos de segurança.")
        
    user.password_hash = auth.get_password_hash(new_pwd)
    user.must_change_password = False
    db.commit()
    return {"status": "success"}

@app.post("/api/upload")
async def upload_csv(
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    current=Depends(auth.require_permission("data_import:import"))
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Arquivo deve ser CSV")
    
    content = await file.read()
    
    try:
        rows, duration = ingestion.process_csv_and_upsert(content)
        return {"message": "Sucesso", "rows": rows, "time": duration}
    except Exception as e:
        logger.error("Falha critica na ingestao do CSV", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro interno na ingestão. Verifique o arquivo e tente novamente.")

@app.get("/api/workitems")
def get_workitems(db: Session = Depends(database.get_db), current=Depends(auth.require_permission("op_workitems:view"))):
    return db.query(models.AzureWorkItem).order_by(
        models.AzureWorkItem.parent_id,
        models.AzureWorkItem.id
    ).all()

@app.patch("/api/workitems/{item_id}/metadata")
def update_workitem_metadata(item_id: int, data: dict, db: Session = Depends(database.get_db), current=Depends(auth.require_permission("op_workitems:edit"))):
    meta = db.query(models.WorkItemMetadata).filter(models.WorkItemMetadata.work_item_id == item_id).first()
    if not meta:
        meta = models.WorkItemMetadata(work_item_id=item_id)
        db.add(meta)
    if 'area' in data: meta.area = data['area']
    if 'diretor' in data: meta.diretor = data['diretor']
    if 'frente' in data: meta.frente = data['frente']
    db.commit()
    db.refresh(meta)
    return meta

@app.get("/api/workitems/{item_id}/assignments")
def get_assignments(item_id: int, db: Session = Depends(database.get_db), current=Depends(auth.require_permission("op_workitems:view"))):
    return db.query(models.ResourceAssignment).filter(
        models.ResourceAssignment.work_item_id == item_id
    ).all()

@app.post("/api/workitems/{item_id}/assignments")
def save_assignments(item_id: int, data: dict, db: Session = Depends(database.get_db), current=Depends(auth.require_permission("op_workitems:edit"))):
    valid_resource_ids = {r.id for r in db.query(models.Resource.id).all()}
    
    db.query(models.ResourceAssignment).filter(
        models.ResourceAssignment.work_item_id == item_id
    ).delete()
    
    for phase, resource_ids in data.items():
        for r_id in resource_ids:
            if r_id in valid_resource_ids:
                db.add(models.ResourceAssignment(
                    work_item_id=item_id,
                    resource_id=r_id,
                    phase=phase
                ))
    db.commit()
    return {"status": "success"}

@app.get("/api/assignments/all")
def get_all_assignments(db: Session = Depends(database.get_db), current=Depends(auth.require_permission("op_workitems:view"))):
    return db.query(models.ResourceAssignment).all()

@app.get("/api/holidays")
def get_holidays(db: Session = Depends(database.get_db), current=Depends(auth.require_permission("op_vacations:view"))):
    return db.query(models.Holiday).order_by(models.Holiday.date).all()

@app.get("/api/absences")
def get_absences(db: Session = Depends(database.get_db), current=Depends(auth.require_permission("op_vacations:view"))):
    return db.query(models.Absence).all()

@app.post("/api/absences")
def create_absence(data: dict, db: Session = Depends(database.get_db), current=Depends(auth.require_permission("op_vacations:create"))):
    new_abs = models.Absence(
        resource_id=data['resource_id'],
        start_date=date.fromisoformat(data['start_date']),
        end_date=date.fromisoformat(data['end_date']),
        category=data.get('category', 'ferias'),
        description=data.get('description', '')
    )
    db.add(new_abs)
    db.commit()
    return {"status": "success"}

@app.delete("/api/absences/{id}")
def delete_absence(id: int, db: Session = Depends(database.get_db), current=Depends(auth.require_permission("op_vacations:delete"))):
    rows = db.query(models.Absence).filter(models.Absence.id == id).delete()
    if rows == 0: raise HTTPException(status_code=404)
    db.commit()
    return {"status": "deleted"}

@app.get("/api/admin/tables")
def get_tables(db: Session = Depends(database.get_db), current=Depends(auth.require_permission("data_db:view"))):
    try:
        inspector = inspect(db.get_bind())
        return inspector.get_table_names()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/query")
def execute_query(data: dict, db: Session = Depends(database.get_db), current=Depends(auth.require_permission("data_db:view"))):
    raw_query = data.get("query", "").strip().lower()
    
    match = re.match(r"^select\s+\*\s+from\s+([a-z0-9_]+)(?:\s+limit\s+\d+)?$", raw_query)
    if not match:
        raise HTTPException(status_code=403, detail="Comando SQL bloqueado. Use apenas: 'select * from [tabela]'")
        
    target_table = match.group(1)
    
    inspector = inspect(db.get_bind())
    valid_tables = inspector.get_table_names()
    
    if target_table not in valid_tables:
        raise HTTPException(status_code=404, detail="Tabela não existe no sistema.")
        
    try:
        safe_query = f"SELECT * FROM {target_table} LIMIT 100"
        result = db.execute(text(safe_query))
        columns = list(result.keys())
        rows = [dict(zip(columns, row)) for row in result.fetchall()]
        return {"columns": columns, "rows": rows}
    except Exception as e:
        logger.error(f"Falha ao executar query segura: {str(e)}")
        raise HTTPException(status_code=400, detail="Falha na leitura da tabela")

@app.get("/api/users/me/preferences")
def get_my_preferences(
    db: Session = Depends(database.get_db),
    token_data: dict = Depends(auth.get_current_user)
):
    username = token_data.get("sub")
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    return user.preferences or {}

@app.put("/api/users/me/preferences")
def update_my_preferences(
    preferences: UserPreferences = Body(...), 
    db: Session = Depends(database.get_db), 
    token_data: dict = Depends(auth.get_current_user)
):
    username = token_data.get("sub")
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
        
    user.preferences = preferences.model_dump()
    db.commit()
    db.refresh(user)
    return user.preferences