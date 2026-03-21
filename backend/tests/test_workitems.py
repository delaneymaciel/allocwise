def test_workitem_assignments_and_security(client):
    # 1. ARRANGE: Autenticação e Preparação do Terreno
    login_payload = {"username": "admin", "password": "admin123"}
    response_login = client.post("/login", json=login_payload)
    token = response_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Tenta buscar demandas SEM token (deve ser barrado com 401 Unauthorized)
    resp_unauth = client.get("/api/workitems")
    assert resp_unauth.status_code == 401, "Falha de Segurança: Rota vazou sem token!"

    # Cria dois profissionais para alocarmos depois
    res_dev = client.post("/api/resources", json={"name": "Dev Teste", "role": "Desenvolvedor"}).json()
    res_qa = client.post("/api/resources", json={"name": "QA Teste", "role": "QA"}).json()

    # Faz o upload de um mini-CSV apenas para criar a Demanda de ID 1000
    csv_content = (
        "ID,Work Item Type,Title,State,Area Path,Iteration Path,Assigned To\n"
        "1000,Feature,Demanda de Alocacao,New,SistemaA,Sprint 1,\n"
    ).encode("utf-8")
    client.post("/api/upload", files={"file": ("test.csv", csv_content, "text/csv")}, headers=headers)

    # 2. ACT: O Front-end envia a alocação do modal (Lápis)
    payload_alocacao = {
        "Dev": [res_dev["id"]],
        "QA": [res_qa["id"]],
        "HML": []  # Deixamos HML vazio de propósito para testar
    }
    resp_assign = client.post("/api/workitems/1000/assignments", json=payload_alocacao)
    assert resp_assign.status_code == 200

    # 3. ASSERT: Verifica se a alocação individual funcionou
    resp_get = client.get("/api/workitems/1000/assignments")
    assert resp_get.status_code == 200
    alocacoes = resp_get.json()
    
    assert len(alocacoes) == 2, "Deveria ter salvo exatamente 1 Dev e 1 QA"
    
    # Valida se o banco guardou as fases (quadrantes) corretas
    fases_salvas = [a["phase"] for a in alocacoes]
    assert "Dev" in fases_salvas
    assert "QA" in fases_salvas
    assert "HML" not in fases_salvas

    # 4. ASSERT GLOBAL: Verifica a rota pesada que o dashboard usa para o Filtro
    resp_all = client.get("/api/assignments/all")
    assert resp_all.status_code == 200
    assert len(resp_all.json()) >= 2, "A rota global de alocações falhou em retornar os vínculos"