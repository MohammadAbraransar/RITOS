from app.services import classify, calculate_priority, refund_key

def test_unauthorized_payment_is_urgent():
    result=classify("I did not make this payment and want help")
    assert result["category"]=="UNAUTHORIZED_PAYMENT"
    assert calculate_priority(result["category"],"I did not make this payment")=="P1"

def test_refund_not_received():
    assert classify("My refund has not arrived after three days")["category"]=="REFUND_NOT_RECEIVED"

def test_duplicate_payment_distinct_category():
    assert classify("I was charged twice for the same order")["category"]=="DUPLICATE_PAYMENT"

def test_refund_key_stable():
    assert refund_key("ticket-1","100.00","INR")==refund_key("ticket-1",100,"INR")

def test_agent_registry_is_eight_specialists_plus_orchestrator():
    from app.agents import AGENTS, ORCHESTRATOR
    assert len(AGENTS) == 8
    assert ORCHESTRATOR["id"] == "central_orchestrator"
    assert len({agent["id"] for agent in AGENTS}) == 8


def test_three_bucket_evaluation_genuine():
    from datetime import datetime, timezone, timedelta
    from app.services import evaluate_three_buckets

    now = datetime.now(timezone.utc)
    recent_date = now - timedelta(days=2)
    res = evaluate_three_buckets(
        verification_status="VERIFIED",
        category="WRONG_ITEM",
        description="The package contained a different color phone case.",
        item_category="ELECTRONICS",
        purchase_date=recent_date,
        claimed_amount=1500.0,
        tx_amount=1500.0,
    )
    assert res["decision_bucket"] == "GENUINE_REFUNDABLE"
    assert res["assigned_desk"] == "CS_1"
    assert res["eligible"] is True
    assert res["proof_required"] is None


def test_three_bucket_evaluation_exception():
    from datetime import datetime, timezone, timedelta
    from app.services import evaluate_three_buckets

    now = datetime.now(timezone.utc)
    recent_date = now - timedelta(days=2)
    res = evaluate_three_buckets(
        verification_status="VERIFIED",
        category="DAMAGED_PRODUCT",
        description="Screen is damaged and broken upon delivery.",
        item_category="ELECTRONICS",
        purchase_date=recent_date,
        claimed_amount=2500.0,
        tx_amount=2500.0,
    )
    assert res["decision_bucket"] == "EXCEPTIONAL_PROOF_NEEDED"
    assert res["assigned_desk"] == "CS_2"
    assert "photo_of_item" in res["proof_required"].lower()


def test_three_bucket_evaluation_ineligible():
    from datetime import datetime, timezone, timedelta
    from app.services import evaluate_three_buckets

    now = datetime.now(timezone.utc)
    old_date = now - timedelta(days=30)
    res = evaluate_three_buckets(
        verification_status="VERIFIED",
        category="ITEM_NOT_RECEIVED",
        description="I changed my mind after 30 days.",
        item_category="ELECTRONICS",
        purchase_date=old_date,
        claimed_amount=1500.0,
        tx_amount=1500.0,
    )
    assert res["decision_bucket"] == "NON_REFUNDABLE"
    assert res["assigned_desk"] == "CS_3"
    assert res["eligible"] is False
    assert "past the 7-day return policy" in res["policy_reason"]

