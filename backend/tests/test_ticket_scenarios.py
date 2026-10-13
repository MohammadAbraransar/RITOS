"""Pytest suite for RITOS multi-agent ticket scenarios.

Validates that tickets across all 9 adjudicative business cases execute through
the 9 specialist agents and are flagged and routed with 100% precision:
  1. CS-1 Fast-Track Auto-Approve (In-policy, verified, <= INR 5,000, low risk)
  2. CS-2 Exception / Await Proof (Defective claim lacking photo evidence)
  3. CS-2 High-Value Escalation (Above INR 5,000 auto limit -> Supervisory review)
  4. CS-2 Carrier Contradiction (Claim non-delivery vs Signed carrier milestone)
  5. CS-2 High-Risk / Unauthorized Payment (Security flag / provider reconciliation)
  6. CS-3 Policy Denial - Expired Window (Exceeds return policy days)
  7. CS-3 Policy Denial - Final Sale (Hygiene / 0-day non-returnable)
  8. CS-3 Duplicate Claim (Prior claim for same transaction)
  9. CS-3 Already Refunded (Ledger exhausted balance)
"""
import pytest
from run_ticket_scenarios import create_test_db, build_scenarios
from app.agents import run_ticket_pipeline


@pytest.fixture
def env():
    db, customer = create_test_db()
    scenarios = build_scenarios(db, customer)
    yield db, scenarios
    db.close()


@pytest.mark.parametrize("idx", list(range(9)))
def test_ticket_adjudication_scenario(env, idx):
    db, scenarios = env
    sc = scenarios[idx]
    ticket = sc["ticket"]

    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    result = run_ticket_pipeline(db, ticket)
    db.commit()
    db.refresh(ticket)

    evidence = ticket.classification_evidence or {}
    actual_codes = evidence.get("decision", {}).get("reason_codes", [])

    # Desk validation
    assert ticket.assigned_desk == sc["expected_desk"], (
        f"{sc['id']} Desk mismatch: expected {sc['expected_desk']}, got {ticket.assigned_desk}"
    )

    # Next action validation
    assert result.get("next_action") == sc["expected_action"], (
        f"{sc['id']} Action mismatch: expected {sc['expected_action']}, got {result.get('next_action')}"
    )

    # Decision validation
    assert result.get("decision") == sc["expected_decision"], (
        f"{sc['id']} Decision mismatch: expected {sc['expected_decision']}, got {result.get('decision')}"
    )

    # Reason codes validation
    for expected_code in sc["expected_codes"]:
        assert expected_code in actual_codes, (
            f"{sc['id']} Expected flag code {expected_code} not found in {actual_codes}"
        )
