def test_update_and_delete_resource(client):
    # 1. Cria um recurso temporário
    res = client.post("/api/resources", json={"name": "João Temporario", "role": "Dev", "squad": "Salesforce"}).json()
    r_id = res["id"]

    # 2. Testa o PUT (Atualização) incluindo a troca de Squad
    resp_put = client.put(f"/api/resources/{r_id}", json={"name": "João Atualizado", "role": "QA", "squad": "Fluig"})
    assert resp_put.status_code == 200
    assert resp_put.json()["name"] == "João Atualizado"
    assert resp_put.json()["squad"] == "Fluig"

    # 3. Testa o PATCH (Inativação / Toggle Status)
    resp_patch = client.patch(f"/api/resources/{r_id}/status")
    assert resp_patch.status_code == 200
    assert resp_patch.json()["is_active"] is False

    # 4. Testa o DELETE
    resp_del = client.delete(f"/api/resources/{r_id}")
    assert resp_del.status_code == 200

    # 5. Garante que o DELETE de um ID inexistente retorna 404
    resp_del_404 = client.delete(f"/api/resources/{r_id}")
    assert resp_del_404.status_code == 404

def test_create_resource(client):
    response = client.post(
        "/api/resources",
        json={
            "name": "Novo Integrante Teste",
            "role": "Desenvolvedor",
            "color_code": "#000000",
            "squad": "Protheus" 
        }
    )
    assert response.status_code == 200
    assert response.json()["squad"] == "Protheus"

# --- NOVOS TESTES DE AUSÊNCIAS (FÉRIAS) ---
def test_crud_absences(client):
    # 1. Cria recurso para atrelar a ausência
    res = client.post("/api/resources", json={"name": "Maria Férias", "role": "QA", "squad": "Fluig"}).json()
    r_id = res["id"]

    # 2. Testa o POST (Criação da Ausência)
    abs_payload = {
        "resource_id": r_id,
        "start_date": "2026-10-01",
        "end_date": "2026-10-10",
        "category": "Folga"
    }
    resp_post = client.post("/api/absences", json=abs_payload)
    assert resp_post.status_code == 200

    # Busca a lista para pegar o ID gerado no banco
    absences = client.get("/api/absences").json()
    created_abs = next(a for a in absences if a["resource_id"] == r_id)
    abs_id = created_abs["id"]

    # 3. Testa o PUT (Atualização da Ausência/Fatiamento)
    resp_put = client.put(f"/api/absences/{abs_id}", json={
        "resource_id": r_id,
        "start_date": "2026-10-02",
        "end_date": "2026-10-10",
        "category": "Suspensão compulsória"
    })
    assert resp_put.status_code == 200

    # 4. Testa o DELETE (Exclusão da Ausência)
    resp_del = client.delete(f"/api/absences/{abs_id}")
    assert resp_del.status_code == 200