from httpx import AsyncClient

from tests.conftest import LoginAs


async def test_metrics_label_requests_by_handler(client: AsyncClient, login_as: LoginAs) -> None:
    headers = await login_as("analyst")
    await client.get("/api/v1/attractions/orbit-9", headers=headers)
    await client.get("/api/v1/attractions/glacier-run", headers=headers)

    body = (await client.get("/metrics")).text
    assert "afterhours_http_request_duration_seconds_bucket" in body
    # Both requests share one series keyed by the endpoint, not the raw path.
    assert 'handler="get_attraction"' in body
    assert "orbit-9" not in body and "glacier-run" not in body


async def test_metrics_count_published_events(client: AsyncClient, login_as: LoginAs) -> None:
    ops = await login_as("ops_manager")
    await client.post("/api/v1/attractions/orbit-9/status", json={"status": "closed"}, headers=ops)
    body = (await client.get("/metrics")).text
    assert 'afterhours_events_published_total{type="attraction.status_changed"}' in body


async def test_metrics_not_in_api_schema(client: AsyncClient) -> None:
    schema = (await client.get("/openapi.json")).json()
    assert "/metrics" not in schema["paths"]
