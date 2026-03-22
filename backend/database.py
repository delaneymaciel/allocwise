import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

# Leitura segura com aviso claro para ambientes Docker
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

if not SQLALCHEMY_DATABASE_URL:
    print("="*60)
    print("🚨 ERRO CRÍTICO DE INFRAESTRUTURA 🚨")
    print("A variável 'DATABASE_URL' não foi encontrada no ambiente.")
    print("Se você está a rodar via Docker, esqueceu-se de injetar o ficheiro .env!")
    print("Use o comando: docker run --env-file .env -p 8000:8000 allocwise-backend")
    print("="*60)
    sys.exit(1)

# Validação de Schema: Previne configuração acidental de SQLite na nuvem
if not SQLALCHEMY_DATABASE_URL.startswith("postgresql"):
    print("CRITICAL: DATABASE_URL deve apontar para PostgreSQL.")
    sys.exit(1)

# Motor exclusivo e otimizado para PostgreSQL com Connection Pool robusto para Nuvem
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=10,          # Conexões simultâneas mantidas abertas
    max_overflow=20,       # Conexões extras permitidas em momentos de pico
    pool_timeout=30,       # Tempo máximo (segundos) esperando conexão livre
    pool_recycle=1800,     # Recicla conexões após 30 min (evita drop silencioso do Postgres)
    pool_pre_ping=True     # Testa a conexão ("ping") antes de cada uso
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        # GOVERNANÇA: Garante a limpeza da sessão caso a rota falhe a meio
        db.rollback()
        raise
    finally:
        db.close()