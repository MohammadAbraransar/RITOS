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
