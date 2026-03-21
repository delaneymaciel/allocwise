def test_login_failures(client):
    # 1. Tenta logar com um usuário que não existe
    resp_no_user = client.post("/login", json={"username": "hacker", "password": "123"})
    assert resp_no_user.status_code == 401
    assert resp_no_user.json()["detail"] == "Credenciais incorretas"

    # 2. Tenta logar com o admin real, mas senha errada
    resp_wrong_pass = client.post("/login", json={"username": "admin", "password": "senha_errada"})
    assert resp_wrong_pass.status_code == 401