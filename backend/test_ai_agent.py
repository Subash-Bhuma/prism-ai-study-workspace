from ai_agent import GLMStudyAgent


def test_curriculum_map_is_normalized_into_stable_columns(monkeypatch):
    agent = GLMStudyAgent()
    agent.api_key = "test-key"
    raw = {
        "topics": [
            {"id": "algebra", "name": "Algebra", "unit": "Unit 1", "exam_weight": 30, "prerequisites": []},
            {"id": "linear", "name": "Linear equations", "unit": "Unit 2", "exam_weight": 70, "prerequisites": ["algebra"]},
            {"id": "bernoulli", "name": "Bernoulli equations", "unit": "Unit 3", "exam_weight": 90, "prerequisites": ["linear"]},
        ],
        "coverage": 75,
        "gaps": ["Exact equations"],
        "summary": "A three-stage pathway.",
    }
    monkeypatch.setattr(agent, "_complete_json", lambda *_args, **_kwargs: raw)

    graph = agent.curriculum_map("Differential equations", "Course source text")

    assert graph is not None
    assert [topic["x"] for topic in graph["topics"]] == [10.0, 50.0, 90.0]
    assert graph["edges"] == [["algebra", "linear"], ["linear", "bernoulli"]]
    assert graph["gaps"] == ["Exact equations"]
