"""Developer Integrations console endpoints: read-only, role-guarded, and never reveal a credential."""
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.database import SessionLocal
from app.models import InboundEvent

client = TestClient(app)


def _h(email):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "ChangeMe123!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_console_is_for_management_and_auditors_only():
    for path in ("/api/v1/integrations/overview", "/api/v1/integrations/events", "/api/v1/integrations/mcp"):
        for email in ("admin@ritos.local", "lead@ritos.local", "audit@ritos.local"):
            assert client.get(path, headers=_h(email)).status_code == 200, (path, email)
        for email in ("cs1@ritos.local", "finance@ritos.local", "customer@ritos.local"):
            assert client.get(path, headers=_h(email)).status_code == 403, (path, email)
        assert client.get(path).status_code == 401


def test_overview_reports_credentials_without_their_values():
    body = client.get("/api/v1/integrations/overview", headers=_h("admin@ritos.local"))
    text = body.text
    data = body.json()
    assert data["credentials"]["store_api_key"]["configured"] is True
    assert settings.ritos_api_key not in text
    if settings.ecommerce_webhook_secret:
        assert settings.ecommerce_webhook_secret not in text
    assert set(data["deliveries"]) == {"sent", "pending", "failed"}
    assert data["payments"]["live"] is False


def test_mcp_is_reported_as_not_supported_rather_than_faked():
    data = client.get("/api/v1/integrations/mcp", headers=_h("admin@ritos.local")).json()
    assert data["supported"] is False and data["servers"] == [] and data["reason"]
    overview = client.get("/api/v1/integrations/overview", headers=_h("admin@ritos.local")).json()
    assert overview["mcp"]["supported"] is False and overview["mcp"]["servers"] == 0


def test_inbound_events_are_listed_newest_first():
    eid = f"EVT-CONSOLE-{uuid4().hex[:6]}"
    with SessionLocal() as db:
        db.add(InboundEvent(id=eid, source="SHOPFLOW", event_type="refund.ticket.created", external_ticket_id="RIT-2026-009999",
                            result={"status": "PROCESSED"}))
        db.commit()
    rows = client.get("/api/v1/integrations/events", headers=_h("lead@ritos.local")).json()
    row = next(r for r in rows if r["id"] == eid)
    assert (row["store_ticket"], row["outcome"], row["event_type"]) == ("RIT-2026-009999", "PROCESSED", "refund.ticket.created")
    assert rows[0]["received_at"] >= rows[-1]["received_at"]
