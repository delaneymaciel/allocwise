def test_upload_csv_with_auth(client):
    # 1. ARRANGE: Login para obter o Token JWT
    # Usamos o admin que foi semeado automaticamente no lifespan do main.py
    login_payload = {
        "username": "admin",
        "password": "admin123"
    }
    response_login = client.post("/login", json=login_payload)
    
    assert response_login.status_code == 200, "Falha ao autenticar o admin"
    token = response_login.json()["access_token"]
    
    # Monta o cabeçalho de autorização com o JWT
    headers = {
        "Authorization": f"Bearer {token}"
    }

    # Monta um CSV falso (Mock) em memória simulando o padrão do Azure
    csv_content = (
        "ID,Work Item Type,Title,State,Area Path,Iteration Path,Assigned To\n"
        "99991,Feature,Criar tela de Login,New,SistemaA,Sprint 1,Augusto Moura\n"
        "99992,Bug,Erro no botão,Active,SistemaA,Sprint 1,Stefany\n"
    ).encode("utf-8")

    # 2. ACT: Simula o upload do multipart/form-data
    response_upload = client.post(
        "/api/upload",
        files={"file": ("export_azure.csv", csv_content, "text/csv")},
        headers=headers
    )

    # 3. ASSERT: Verifica se o backend engoliu o CSV e devolveu sucesso
    assert response_upload.status_code == 200
    data = response_upload.json()
    assert data["message"] == "Sucesso"
    
    # 4. ASSERT SECUNDÁRIO: Bate na rota de workitems e vê se os dados estão lá
    response_items = client.get("/api/workitems", headers=headers)
    assert response_items.status_code == 200
    items = response_items.json()
    assert len(items) >= 2
    assert any(item["Title"] == "Criar tela de Login" for item in items)