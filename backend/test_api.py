from fastapi.testclient import TestClient

from main import app, connect, study_agent


def test_demo_flow(monkeypatch):
    monkeypatch.setattr(study_agent, "api_key", "")
    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["ok"] is True

        assert client.get("/api/dashboard").status_code == 401
        login = client.post("/api/auth/demo", json={})
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['token']}"}

        dashboard = client.get("/api/dashboard", headers=headers).json()
        assert dashboard["ai"]["model"] == "glm-4.7-flash"
        assert dashboard["ai"]["active"] is False
        subject_id = dashboard["active_subject_id"]
        assert subject_id

        with connect() as db:
            db.execute("DELETE FROM attempts WHERE subject_id = ?", (subject_id,))
            db.execute("UPDATE subject_state SET problem_index = 0, hint_level = 0 WHERE subject_id = ?", (subject_id,))
            db.commit()

        detail = client.get(f"/api/subjects/{subject_id}", headers=headers)
        assert detail.status_code == 200
        assert len(detail.json()["resources"]) >= 3
        resource_ids = [item["id"] for item in detail.json()["resources"]]

        answer = client.post(
            f"/api/subjects/{subject_id}/ask",
            json={"question": "How do I recognize a Bernoulli equation?", "resource_ids": resource_ids},
            headers=headers,
        )
        assert answer.status_code == 200
        assert answer.json()["citations"]
        assert answer.json()["ai"]["mode"] == "fallback"

        flashcards = client.post(
            f"/api/subjects/{subject_id}/studio/flashcards",
            json={"question": "Create flashcards", "resource_ids": resource_ids},
            headers=headers,
        )
        assert flashcards.status_code == 200
        assert len(flashcards.json()["artifact"]["cards"]) == 6

        practice = client.get(f"/api/subjects/{subject_id}/practice", headers=headers).json()
        problem_id = practice["problem"]["id"]
        response = client.post(
            f"/api/subjects/{subject_id}/practice/{problem_id}/steps",
            json={"latex": "x^2 - 1 = (x - 1)(x + 1)", "confidence": "certain"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["correct"] is True

        hint = client.post(f"/api/subjects/{subject_id}/practice/{problem_id}/hint", headers=headers)
        assert hint.status_code == 200
        assert hint.json()["level"] >= 1
        assert hint.json()["ai"]["mode"] == "fallback"
