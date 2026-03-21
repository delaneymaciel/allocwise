def test_holidays_and_absences(client):
    # 1. Verifica Feriados (Devem ter sido criados automaticamente no lifespan)
    resp_holidays = client.get("/api/holidays")
    assert resp_holidays.status_code == 200
    assert len(resp_holidays.json()) > 0, "Os feriados não foram semeados"

    # 2. Cria um recurso para associarmos a ausência
    resp_res = client.post("/api/resources", json={"name": "Funcionário Férias", "role": "Dev"})
    res_id = resp_res.json()["id"]

    # 3. Testa a criação de uma ausência (POST)
    payload = {
        "resource_id": res_id,
        "start_date": "2026-01-10",
        "end_date": "2026-01-20",
        "category": "ferias"
    }
    resp_post_abs = client.post("/api/absences", json=payload)
    assert resp_post_abs.status_code == 200

    # 4. Verifica se a ausência foi salva (GET)
    resp_get_abs = client.get("/api/absences")
    assert resp_get_abs.status_code == 200
    absences = resp_get_abs.json()
    assert len(absences) == 1
    abs_id = absences[0]["id"]

    # 5. Testa a exclusão da ausência (DELETE)
    resp_del = client.delete(f"/api/absences/{abs_id}")
    assert resp_del.status_code == 200
    assert len(client.get("/api/absences").json()) == 0