import pytest
from unittest.mock import patch
from main import seed_holidays
from database import SessionLocal
from auth import create_access_token

def test_security_and_auth_coverage(client):
    # Token Inválido (Cobre auth.py)
    headers = {"Authorization": "Bearer token.errado"}
    assert client.get("/api/workitems", headers=headers).status_code == 401

    # Permissão Insuficiente (Cobre auth.py 49)
    token = create_access_token({"sub": "user", "permissions": []})
    resp = client.post("/api/upload", headers={"Authorization": f"Bearer {token}"}, 
                       files={"file": ("t.csv", b"ID\n1", "text/csv")})
    assert resp.status_code == 403

def test_resource_not_found_scenarios(client):
    # IDs inexistentes (Cobre main.py 112-115)
    assert client.put("/api/resources/9999", json={"name": "404"}).status_code == 404
    assert client.patch("/api/resources/9999/status").status_code == 404

def test_database_rollback_on_create(client):
    # Força erro no commit no POST (Cobre main.py 91)
    with patch("sqlalchemy.orm.Session.commit", side_effect=Exception("DB Error")):
        resp = client.post("/api/resources", json={"name": "Erro Teste"})
        assert resp.status_code == 500

def test_database_rollback_on_delete(client):
    # Primeiro criamos o recurso com commit normal para evitar session pollution
    res = client.post("/api/resources", json={"name": "Para Deletar"}).json()
    r_id = res["id"]

    # Agora forçamos erro apenas no momento de deletar (Cobre main.py 152-154)
    with patch("sqlalchemy.orm.Session.commit", side_effect=Exception("DB Error")):
        resp = client.delete(f"/api/resources/{r_id}")
        assert resp.status_code == 500

def test_ingestion_multi_column_titles(client):
    # Cobre a mesclagem de colunas Title 1, Title 2 (Cobre ingestion.py 26)
    token = client.post("/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    csv_data = b"ID;Title 1;Title 2;Work Item Type\n5000;Parte A;Parte B;Feature"
    resp = client.post("/api/upload", headers={"Authorization": f"Bearer {token}"}, 
                       files={"file": ("multi.csv", csv_data, "text/csv")})
    assert resp.status_code == 200
    assert resp.json()["rows"] == 1

def test_ingestion_empty_and_junk(client):
    token = client.post("/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    # CSV Vazio e CSV sem colunas mapeáveis (Cobre ingestion.py 63 e escapes)
    client.post("/api/upload", headers={"Authorization": f"Bearer {token}"}, files={"file": ("e.csv", b"", "text/csv")})
    junk = b"A,B\n1,2"
    client.post("/api/upload", headers={"Authorization": f"Bearer {token}"}, files={"file": ("j.csv", junk, "text/csv")})

def test_idempotent_seeds(client):
    # Cobre o retorno antecipado do seed (Cobre main.py 11)
    with SessionLocal() as db:
        seed_holidays(db)


def test_ingestion_complex_titles_and_cleanup(client):
    """Cobre a mesclagem de títulos e o DROP TABLE final (ingestion.py: 26, 63)"""
    token = client.post("/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # CSV com múltiplas colunas de Title para forçar a linha 26
    csv_data = (
        "ID;Title 1;Title 2;Work Item Type;Area Path\n"
        "9000;Parte A;Parte B;Feature;Squad IA\n"
    ).encode("utf-8")

    resp = client.post("/api/upload", headers=headers, files={"file": ("complex.csv", csv_data, "text/csv")})
    assert resp.status_code == 200
    assert resp.json()["rows"] == 1

def test_database_error_print_coverage(client):
    """Força o log de erro no console para cobrir a linha 91 do main.py"""
    # Simulamos uma falha catastrófica no banco de dados durante a adição
    with patch("sqlalchemy.orm.Session.add", side_effect=Exception("Simulated Crash")):
        resp = client.post("/api/resources", json={"name": "Crash Test"})
        assert resp.status_code == 500        