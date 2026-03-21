import pytest
import sys
import os

# --- ISOLAMENTO ZERO TRUST: Configura chaves de teste ANTES de carregar os módulos ---
os.environ["SECRET_KEY"] = "test_secret_key_com_mais_de_32_caracteres_para_o_pytest"
os.environ["PEPPER"] = "pepper_de_teste_seguro_16ch"

# Injeção de Path para garantir que os módulos locais sejam encontrados
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

import database  # Importa o módulo original
import models

# Banco em memória para velocidade e isolamento total
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# --- O HACK DE ARQUITETURA CONSOLIDADO ---
# Substituímos os componentes do database original pelos de teste
database.engine = engine
database.SessionLocal = TestingSessionLocal

# Agora o import do 'app' é seguro: o auth.py já encontrou as chaves no os.environ
from main import app
from database import get_db

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

# Sobrescreve a dependência de injeção do FastAPI
app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(scope="function")
def client():
    # Cria o schema do banco para cada função de teste
    models.Base.metadata.create_all(bind=engine)
    
    # O bloco 'with' garante a execução do ciclo de vida (lifespan) do app
    with TestClient(app) as test_client:
        yield test_client
        
    # Limpa o banco após o teste
    models.Base.metadata.drop_all(bind=engine)