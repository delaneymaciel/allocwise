import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./azure_data.db")

# Detecta se é SQLite
is_sqlite = DATABASE_URL.startswith("sqlite")

# Configuração de conexão específica por tipo de banco
connect_args = {"check_same_thread": False} if is_sqlite else {}

# Engine mais resiliente
engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,          # evita conexões mortas
    pool_size=5,                 # tamanho base do pool
    max_overflow=10,             # conexões extras temporárias
    echo=os.getenv("DB_ECHO", "false").lower() == "true"  # debug opcional
)

# Sessão do banco
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# Base dos models
Base = declarative_base()


# Dependency para FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()