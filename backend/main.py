import json
import os
import re
from contextlib import asynccontextmanager
from datetime import date
from typing import Dict, Any
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Body
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
import models, auth, ingestion, database

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
    except Exception:
        db.rollback()

@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=database.engine)
    with database.SessionLocal() as db:
        if not db.query(models.Role).first():
            admin_role = models.Role(name="Administrador")
            gerente_role = models.Role(name="Gerente")
            visualizador_role = models.Role(name="Visualizador")
            p1 = models.Permission(name="csv:importar")
            p2 = models.Permission(name="usuarios:ler")
            admin_role.permissions = [p1, p2]
            
            # BLINDAGEM 1: Senha em variável de ambiente e Zero Trust ativado para o Admin
            initial_pwd = os.getenv("ADMIN_INITIAL_PASSWORD", "AllocWise@Provisoria1")
            admin_user = models.User(
                name="Administrador",
                username="admin",
                email="admin@allocwise.com",
                password_hash=auth.get_password_hash(initial_pwd),
                role=admin_role,
                must_change_password=True # O Admin também é forçado a criar senha forte no 1º login
            )
            db.add_all([admin_role, gerente_role, visualizador_role, admin_user])
            db.commit()
        seed_holidays(db)
        seed_resources(db)
    yield

app = FastAPI(lifespan=lifespan)

# BLINDAGEM 2: CORS Restrito
# Lê do .env as URLs permitidas, se não existir, limita apenas ao localhost do Vite
origins = os.getenv("FRONTEND_URL", "http://localhost:5173,http://127.0.0.1:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True, # Importante habilitar para transações seguras
)

@app.get("/api/resources")
def get_resources(db: Session = Depends(database.get_db)):
    return db.query(models.Resource).all()

@app.post("/api/resources")
def create_resource(res_data: dict, db: Session = Depends(database.get_db)):
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
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Erro interno ao salvar")

@app.put("/api/resources/{id}")
def update_resource(id: int, res_data: dict, db: Session = Depends(database.get_db)):
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
def toggle_resource_status(id: int, db: Session = Depends(database.get_db)):
    res = db.query(models.Resource).filter(models.Resource.id == id).first()
    if not res:
        raise HTTPException(status_code=404)
    res.is_active = not res.is_active
    db.commit()
    db.refresh(res)
    return res

@app.delete("/api/resources/{id}")
def delete_resource(id: int, db: Session = Depends(database.get_db)):
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
def list_users(db: Session = Depends(database.get_db), current=Depends(auth.require_permission("usuarios:ler"))):
    users = db.query(models.User).all()
    return [{
        "id": u.id, 
        "name": u.name or u.username, 
        "username": u.username, 
        "email": u.email,
        "role": u.role.name if u.role else "Visualizador", 
        "is_active": u.is_active,
        "must_change_password": u.must_change_password
    } for u in users]

@app.post("/api/users")
def create_system_user(data: dict, db: Session = Depends(database.get_db), current=Depends(auth.require_permission("usuarios:ler"))):
    role = db.query(models.Role).filter(models.Role.name == data.get('role', 'Visualizador')).first()
    new_user = models.User(
        name=data.get('name'),
        username=data['username'],
        email=data.get('email'),
        password_hash=auth.get_password_hash(data.get('password', 'Mudar@123')),
        role=role,
        must_change_password=data.get('must_change_password', True)
    )
    db.add(new_user)
    db.commit()
    return {"status": "created"}

@app.put("/api/users/{id}")
def update_system_user(id: int, data: dict, db: Session = Depends(database.get_db), current=Depends(auth.require_permission("usuarios:ler"))):
    user = db.query(models.User).filter(models.User.id == id).first()
    if not user: raise HTTPException(status_code=404)
    
    if data.get('password'): 
        user.password_hash = auth.get_password_hash(data['password'])
        
    user.name = data.get('name', user.name)
    user.username = data.get('username', user.username)
    user.email = data.get('email', user.email)
    user.must_change_password = data.get('must_change_password', user.must_change_password)
    
    if 'role' in data:
        user.role = db.query(models.Role).filter(models.Role.name == data['role']).first()
        
    db.commit()
    return {"status": "updated"}

@app.patch("/api/users/{id}/status")
def toggle_user_status(id: int, db: Session = Depends(database.get_db), current=Depends(auth.require_permission("usuarios:ler"))):
    user = db.query(models.User).filter(models.User.id == id).first()
    if not user: raise HTTPException(status_code=404)
    user.is_active = not user.is_active
    db.commit()
    return {"status": "success"}

@app.delete("/api/users/{id}")
def delete_system_user(id: int, db: Session = Depends(database.get_db), current=Depends(auth.require_permission("usuarios:ler"))):
    db.query(models.User).filter(models.User.id == id).delete()
    db.commit()
    return {"status": "deleted"}

@app.post("/login")
def login(data: dict, db: Session = Depends(database.get_db)):
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        raise HTTPException(status_code=400, detail="username e password são obrigatórios")
        
    user = db.query(models.User).filter(models.User.username == username).first()
    
    if not user or not auth.verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciais incorretas")
        
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Usuário inativo.")

    if user.must_change_password:
        return JSONResponse(
            status_code=403, 
            content={"requirePasswordChange": True, "userId": user.id, "error": "Troca de senha obrigatória."}
        )

    permissions = [p.name for p in user.role.permissions] if user.role else []
    token = auth.create_access_token({
        "sub": user.username,
        "permissions": permissions
    })
    return {
        "access_token": token, 
        "token_type": "bearer",
        "user": {"id": user.id, "name": user.name or user.username, "role": user.role.name if user.role else "User"}
    }

@app.post("/api/users/change-initial-password")
def change_initial_password(data: dict, db: Session = Depends(database.get_db)):
    user_id = data.get("userId")
    new_pwd = data.get("newPassword")
    
    strong_password_regex = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$")
    if not strong_password_regex.match(new_pwd):
        raise HTTPException(status_code=400, detail="A senha não cumpre os requisitos de segurança.")
        
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user: raise HTTPException(status_code=404)
    
    user.password_hash = auth.get_password_hash(new_pwd)
    user.must_change_password = False
    db.commit()
    return {"status": "success"}

@app.post("/api/upload")
async def upload_csv(
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    user=Depends(auth.require_permission("csv:importar"))
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Arquivo deve ser CSV")
    content = await file.read()
    if len(content) > 10_000_000:
        raise HTTPException(status_code=400, detail="Arquivo muito grande")
    try:
        db.query(models.AzureWorkItem).delete()
        db.commit() 
        rows, duration = ingestion.process_csv_and_upsert(content)
        return {"message": "Sucesso", "rows": rows, "time": duration}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Falha ao processar a importação do CSV.")

@app.get("/api/workitems")
def get_workitems(db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    return db.query(models.AzureWorkItem).order_by(
        models.AzureWorkItem.ParentId,
        models.AzureWorkItem.Id
    ).all()

@app.patch("/api/workitems/{item_id}/metadata")
def update_workitem_metadata(item_id: int, data: dict, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
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
def get_assignments(item_id: int, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    return db.query(models.ResourceAssignment).filter(
        models.ResourceAssignment.work_item_id == item_id
    ).all()

@app.post("/api/workitems/{item_id}/assignments")
def save_assignments(item_id: int, data: dict, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    db.query(models.ResourceAssignment).filter(
        models.ResourceAssignment.work_item_id == item_id
    ).delete()
    for phase, resource_ids in data.items():
        for r_id in resource_ids:
            db.add(models.ResourceAssignment(
                work_item_id=item_id,
                resource_id=r_id,
                phase=phase
            ))
    db.commit()
    return {"status": "success"}

@app.get("/api/assignments/all")
def get_all_assignments(db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    return db.query(models.ResourceAssignment).all()

@app.get("/api/holidays")
def get_holidays(db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    return db.query(models.Holiday).order_by(models.Holiday.date).all()

@app.get("/api/absences")
def get_absences(db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    return db.query(models.Absence).all()

@app.post("/api/absences")
def create_absence(data: dict, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
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
def delete_absence(id: int, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    rows = db.query(models.Absence).filter(models.Absence.id == id).delete()
    if rows == 0: raise HTTPException(status_code=404)
    db.commit()
    return {"status": "deleted"}

@app.get("/api/admin/tables")
def get_tables(db: Session = Depends(database.get_db), current=Depends(auth.require_permission("usuarios:ler"))):
    try:
        query = text("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        result = db.execute(query).fetchall()
        return [row[0] for row in result]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# BLINDAGEM 3: Rota protegida com require_permission 
@app.post("/api/admin/query")
def execute_query(data: dict, db: Session = Depends(database.get_db), current=Depends(auth.require_permission("usuarios:ler"))):
    sql = data.get("query", "").strip().lower()
    if not sql.startswith("select") or ";" in sql:
        raise HTTPException(status_code=403, detail="Apenas SELECT simples permitido")
    try:
        result = db.execute(text(sql))
        columns = list(result.keys())
        rows = [dict(zip(columns, row)) for row in result.fetchall()]
        return {"columns": columns, "rows": rows}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

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
    preferences: Dict[str, Any] = Body(...), 
    db: Session = Depends(database.get_db), 
    token_data: dict = Depends(auth.get_current_user)
):
    username = token_data.get("sub")
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    user.preferences = preferences
    db.commit()
    db.refresh(user)
    return user.preferences