#!/usr/bin/env python3
"""RITOS Comprehensive Ticket Test Suite & Scenario Execution Engine.

Designs, raises, and tests tickets across every adjudicative scenario:
  - Case 1: CS-1 Fast-Track Auto-Approve (In-policy, verified, <= INR 5,000, low risk)
  - Case 2: CS-2 Exception / Await Proof (Defective claim lacking photo evidence)
  - Case 3: CS-2 High-Value Escalation (Above INR 5,000 auto limit -> Supervisory review)
  - Case 4: CS-2 Carrier Contradiction (Claim non-delivery vs Signed carrier milestone)
  - Case 5: CS-2 High-Risk / Unauthorized Payment (High risk tier / provider reconciliation)
  - Case 6: CS-3 Policy Denial - Expired Window (Exceeds return policy days)
  - Case 7: CS-3 Policy Denial - Final Sale (Hygiene / 0-day non-returnable)
  - Case 8: CS-3 Duplicate Claim (Prior open/resolved claim for same transaction)
  - Case 9: CS-3 Already Refunded (Ledger exhausted balance)

Runs all 9 specialist agents:
  Agent 1 (Ledger), Agent 5 (Logistics), Agent 3 (Intent/Contradictions), Agent 7 (Evidence),
  Agent 2 (Policy), Agent 4 (Risk), Agent 6 (Decision Arbiter), Agent 9 (Coordinator), Agent 8 (Communication).
"""
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Dict, Any, List

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Ticket, Transaction, User, ReturnPolicy, CarrierShipment
from app.agents import run_ticket_pipeline


def create_test_db():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()

    # Seed Default Return Policies
    session.add_all([
        ReturnPolicy(category="ELECTRONICS", return_window_days=14, policy_summary="14-day return window for electronics.", active=True),
        ReturnPolicy(category="APPAREL", return_window_days=30, policy_summary="30-day return window for unworn apparel with tags.", active=True),
        ReturnPolicy(category="GENERAL", return_window_days=14, policy_summary="Standard 14-day eCommerce return policy.", active=True),
        ReturnPolicy(category="HYGIENE", return_window_days=0, policy_summary="Final sale once unsealed for sanitary standards.", active=True),
    ])

    # Seed Primary Test User
    customer = User(id="cust-riya", email="riya@example.com", full_name="Riya Customer", password_hash="test_hash_123", role="customer", active=True)
    session.add(customer)
    session.commit()
    return session, customer


def build_scenarios(db, customer) -> List[Dict[str, Any]]:
    now = datetime.now(timezone.utc)
    scenarios = []

    # -------------------------------------------------------------------------
    # SCENARIO 1: CS-1 Fast-Track Auto-Approve
    # -------------------------------------------------------------------------
    tx1 = Transaction(id="TXN-101-GEN", customer_id=customer.id, order_id="ORD-101", amount=1499.00,
                      currency="INR", payment_status="SUCCESSFUL", refunded_amount=0)
    db.add(tx1)
    db.commit()
    t1 = Ticket(
        ticket_number="RIT-TC1-FASTTRACK",
        customer_id=customer.id,
        transaction_id="TXN-101-GEN",
        order_id="ORD-101",
        item_name="Ergonomic Lumbar Support Cushion",
        item_category="GENERAL",
        claimed_amount=1499.00,
        currency="INR",
        customer_name="Riya Customer",
        customer_email="riya@example.com",
        purchase_date=now - timedelta(days=3),
        description="I changed my mind about this cushion and no longer need it. It is unused and unopened in the original box.",
        status="TRIAGED",
    )
    scenarios.append({
        "id": "CASE-1",
        "name": "CS-1 Fast-Track Auto-Approval",
        "ticket": t1,
        "expected_desk": "CS_1",
        "expected_bucket": "GENUINE_REFUNDABLE",
        "expected_action": "AUTO_APPROVE",
        "expected_decision": "ELIGIBLE_FOR_AUTHORIZED_REFUND_REVIEW",
        "expected_codes": ["LEDGER_VERIFIED", "POLICY_WITHIN_WINDOW"],
        "description": "Within policy window (3 <= 14d), verified payment, amount under INR 5,000 limit, low risk.",
    })

    # -------------------------------------------------------------------------
    # SCENARIO 2: CS-2 Damaged Item Lacking Photo Evidence
    # -------------------------------------------------------------------------
    tx2 = Transaction(id="TXN-102-DEFECT", customer_id=customer.id, order_id="ORD-102", amount=2499.00,
                      currency="INR", payment_status="SUCCESSFUL", refunded_amount=0)
    db.add(tx2)
    db.commit()
    t2 = Ticket(
        ticket_number="RIT-TC2-AWAITPROOF",
        customer_id=customer.id,
        transaction_id="TXN-102-DEFECT",
        order_id="ORD-102",
        item_name="Sony WH-1000XM4 Wireless Headphones",
        item_category="ELECTRONICS",
        claimed_amount=2499.00,
        currency="INR",
        customer_name="Riya Customer",
        customer_email="riya@example.com",
        purchase_date=now - timedelta(days=4),
        description="The package arrived crushed and the headphone headband is broken and cracked with no sound.",
        status="TRIAGED",
        classification_evidence={"evidence_images": []},
    )
    scenarios.append({
        "id": "CASE-2",
        "name": "CS-2 Defective / Damaged Missing Proof",
        "ticket": t2,
        "expected_desk": "CS_2",
        "expected_bucket": "EXCEPTIONAL_PROOF_NEEDED",
        "expected_action": "AWAIT_PROOF",
        "expected_decision": "HUMAN_REVIEW_REQUIRED",
        "expected_codes": ["EVIDENCE_MISSING"],
        "description": "Defective/damaged claim with 0 photos attached. Pipeline flags missing evidence and moves to AWAIT_PROOF.",
    })

    # -------------------------------------------------------------------------
    # SCENARIO 3: CS-2 High-Value Settlement Above Auto Limit
    # -------------------------------------------------------------------------
    tx3 = Transaction(id="TXN-103-HIGHVAL", customer_id=customer.id, order_id="ORD-103", amount=89900.00,
                      currency="INR", payment_status="SUCCESSFUL", refunded_amount=0)
    db.add(tx3)
    db.commit()
    t3 = Ticket(
        ticket_number="RIT-TC3-HIGHVALUE",
        customer_id=customer.id,
        transaction_id="TXN-103-HIGHVAL",
        order_id="ORD-103",
        item_name="Apple MacBook Air M2",
        item_category="ELECTRONICS",
        claimed_amount=89900.00,
        currency="INR",
        customer_name="Riya Customer",
        customer_email="riya@example.com",
        purchase_date=now - timedelta(days=2),
        description="I am returning the laptop within the 14-day window as I received a work laptop.",
        status="TRIAGED",
    )
    scenarios.append({
        "id": "CASE-3",
        "name": "CS-2 High-Value Settlement (> INR 5,000)",
        "ticket": t3,
        "expected_desk": "CS_2",
        "expected_bucket": "GENUINE_REFUNDABLE",
        "expected_action": "AWAIT_APPROVAL",
        "expected_decision": "HUMAN_REVIEW_REQUIRED",
        "expected_codes": ["RISK_SUPERVISORY_REVIEW"],
        "description": "Legitimate claim within window, but amount INR 89,900 exceeds INR 5,000 threshold. Triggers supervisory review signal.",
    })

    # -------------------------------------------------------------------------
    # SCENARIO 4: CS-2 Carrier Milestone Contradiction
    # -------------------------------------------------------------------------
    tx4 = Transaction(id="TXN-104-CONTRA", customer_id=customer.id, order_id="ORD-104", amount=3200.00,
                      currency="INR", payment_status="SUCCESSFUL", refunded_amount=0)
    db.add(tx4)
    # Carrier shipment showing signed delivery
    shipment4 = CarrierShipment(
        order_id="ORD-104",
        tracking_number="TRK-BLUE-4401",
        carrier_name="BlueDart",
        status="DELIVERED",
        delivered_at=now - timedelta(days=1),
        proof_of_delivery_ref="SIG-CUSTOMER-9821",
    )
    db.add(shipment4)
    db.commit()
    t4 = Ticket(
        ticket_number="RIT-TC4-CONTRADICTION",
        customer_id=customer.id,
        transaction_id="TXN-104-CONTRA",
        order_id="ORD-104",
        item_name="Mechanical Gaming Keyboard",
        item_category="ELECTRONICS",
        claimed_amount=3200.00,
        currency="INR",
        customer_name="Riya Customer",
        customer_email="riya@example.com",
        purchase_date=now - timedelta(days=5),
        description="My package never arrived. I did not receive the delivery at all.",
        status="TRIAGED",
    )
    scenarios.append({
        "id": "CASE-4",
        "name": "CS-2 Carrier Delivery Contradiction",
        "ticket": t4,
        "expected_desk": "CS_2",
        "expected_bucket": "EXCEPTIONAL_PROOF_NEEDED",
        "expected_action": "MANUAL_REVIEW",
        "expected_decision": "HUMAN_REVIEW_REQUIRED",
        "expected_codes": ["CLAIM_CONTRADICTION"],
        "description": "Customer claims ITEM_NOT_RECEIVED, but carrier verified signed delivery proof. Flagged for review.",
    })

    # -------------------------------------------------------------------------
    # SCENARIO 5: CS-2 High-Risk / Unauthorized Payment Report
    # -------------------------------------------------------------------------
    tx5 = Transaction(id="TXN-105-FRAUD", customer_id=customer.id, order_id="ORD-105", amount=4500.00,
                      currency="INR", payment_status="SUCCESSFUL", refunded_amount=0)
    db.add(tx5)
    db.commit()
    t5 = Ticket(
        ticket_number="RIT-TC5-UNAUTHORIZED",
        customer_id=customer.id,
        transaction_id="TXN-105-FRAUD",
        order_id="ORD-105",
        item_name="Premium Smart Watch",
        item_category="ELECTRONICS",
        claimed_amount=4500.00,
        currency="INR",
        customer_name="Riya Customer",
        customer_email="riya@example.com",
        purchase_date=now - timedelta(days=1),
        description="I did not make this purchase. This is an unauthorized payment from my stolen card.",
        status="TRIAGED",
    )
    scenarios.append({
        "id": "CASE-5",
        "name": "CS-2 High-Risk / Unauthorized Payment",
        "ticket": t5,
        "expected_desk": "CS_2",
        "expected_action": "MANUAL_REVIEW",
        "expected_decision": "HUMAN_REVIEW_REQUIRED",
        "expected_codes": ["PAYMENT_ISSUE_RECONCILIATION"],
        "description": "Security flag: Unauthorized payment report must be reconciled with payment gateway, never paid out automatically.",
    })

    # -------------------------------------------------------------------------
    # SCENARIO 6: CS-3 Policy Denial - Expired Window
    # -------------------------------------------------------------------------
    tx6 = Transaction(id="TXN-106-EXPIRED", customer_id=customer.id, order_id="ORD-106", amount=3999.00,
                      currency="INR", payment_status="SUCCESSFUL", refunded_amount=0)
    db.add(tx6)
    db.commit()
    t6 = Ticket(
        ticket_number="RIT-TC6-EXPIREDWINDOW",
        customer_id=customer.id,
        transaction_id="TXN-106-EXPIRED",
        order_id="ORD-106",
        item_name="Wireless Noise Cancelling Earbuds",
        item_category="ELECTRONICS",
        claimed_amount=3999.00,
        currency="INR",
        customer_name="Riya Customer",
        customer_email="riya@example.com",
        purchase_date=now - timedelta(days=45),  # 45 days > 14 day window
        description="I changed my mind and want to return these earbuds because I prefer over-ear headphones.",
        status="TRIAGED",
    )
    scenarios.append({
        "id": "CASE-6",
        "name": "CS-3 Policy Denial - Expired Window",
        "ticket": t6,
        "expected_desk": "CS_3",
        "expected_bucket": "NON_REFUNDABLE",
        "expected_action": "AUTO_REJECT",
        "expected_decision": "REJECTED_BY_POLICY",
        "expected_codes": ["POLICY_WINDOW_EXPIRED"],
        "description": "Purchased 45 days ago, exceeding 14-day return window. Authoritative policy denial.",
    })

    # -------------------------------------------------------------------------
    # SCENARIO 7: CS-3 Policy Denial - Final Sale / Hygiene Non-Returnable
    # -------------------------------------------------------------------------
    tx7 = Transaction(id="TXN-107-HYGIENE", customer_id=customer.id, order_id="ORD-107", amount=899.00,
                      currency="INR", payment_status="SUCCESSFUL", refunded_amount=0)
    db.add(tx7)
    db.commit()
    t7 = Ticket(
        ticket_number="RIT-TC7-FINALSALE",
        customer_id=customer.id,
        transaction_id="TXN-107-HYGIENE",
        order_id="ORD-107",
        item_name="Organic Hydrating Face Serum",
        item_category="HYGIENE",
        claimed_amount=899.00,
        currency="INR",
        customer_name="Riya Customer",
        customer_email="riya@example.com",
        purchase_date=now - timedelta(days=2),
        description="I opened and applied the face serum but disliked the smell. Please refund my money.",
        status="TRIAGED",
    )
    scenarios.append({
        "id": "CASE-7",
        "name": "CS-3 Policy Denial - Final Sale Hygiene",
        "ticket": t7,
        "expected_desk": "CS_3",
        "expected_bucket": "NON_REFUNDABLE",
        "expected_action": "AUTO_REJECT",
        "expected_decision": "REJECTED_BY_POLICY",
        "expected_codes": ["POLICY_FINAL_SALE"],
        "description": "Category HYGIENE has 0-day return window (final sale for sanitary reasons). Non-refundable.",
    })

    # -------------------------------------------------------------------------
    # SCENARIO 8: CS-3 Duplicate Claim Detection
    # -------------------------------------------------------------------------
    tx8 = Transaction(id="TXN-108-DUP", customer_id=customer.id, order_id="ORD-108", amount=1999.00,
                      currency="INR", payment_status="SUCCESSFUL", refunded_amount=0)
    db.add(tx8)
    db.commit()
    # First active ticket
    t8_first = Ticket(
        ticket_number="RIT-TC8-FIRSTCLAIM",
        customer_id=customer.id,
        transaction_id="TXN-108-DUP",
        order_id="ORD-108",
        item_name="Smart Fitness Tracker",
        item_category="ELECTRONICS",
        claimed_amount=1999.00,
        currency="INR",
        customer_name="Riya Customer",
        customer_email="riya@example.com",
        purchase_date=now - timedelta(days=3),
        description="Refund not arrived for my fitness tracker order.",
        status="TRIAGED",
    )
    db.add(t8_first)
    db.commit()
    # Run first ticket
    run_ticket_pipeline(db, t8_first)
    db.commit()

    # Second duplicate ticket for same transaction
    t8_second = Ticket(
        ticket_number="RIT-TC8-SECONDCLAIM",
        customer_id=customer.id,
        transaction_id="TXN-108-DUP",
        order_id="ORD-108",
        item_name="Smart Fitness Tracker",
        item_category="ELECTRONICS",
        claimed_amount=1999.00,
        currency="INR",
        customer_name="Riya Customer",
        customer_email="riya@example.com",
        purchase_date=now - timedelta(days=3),
        description="I am requesting a refund again for my tracker order.",
        status="TRIAGED",
    )
    scenarios.append({
        "id": "CASE-8",
        "name": "CS-3 Duplicate Claim Prevention",
        "ticket": t8_second,
        "expected_desk": "CS_3",
        "expected_bucket": "NON_REFUNDABLE",
        "expected_action": "AUTO_REJECT",
        "expected_decision": "NO_DUPLICATE_REFUND",
        "expected_codes": ["LEDGER_DUPLICATE_CLAIM"],
        "description": "Second ticket submitted for the same transaction & order. Agent 1 detects duplicate, routes to CS-3 rejection.",
    })

    # -------------------------------------------------------------------------
    # SCENARIO 9: CS-3 Already Refunded (Zero Refundable Balance)
    # -------------------------------------------------------------------------
    tx9 = Transaction(id="TXN-109-PAIDOUT", customer_id=customer.id, order_id="ORD-109", amount=2500.00,
                      currency="INR", payment_status="REFUNDED", refunded_amount=2500.00)
    db.add(tx9)
    db.commit()
    t9 = Ticket(
        ticket_number="RIT-TC9-ALREADYREFUNDED",
        customer_id=customer.id,
        transaction_id="TXN-109-PAIDOUT",
        order_id="ORD-109",
        item_name="Bluetooth Soundbar",
        item_category="ELECTRONICS",
        claimed_amount=2500.00,
        currency="INR",
        customer_name="Riya Customer",
        customer_email="riya@example.com",
        purchase_date=now - timedelta(days=5),
        description="Please send refund for my soundbar purchase.",
        status="TRIAGED",
    )
    scenarios.append({
        "id": "CASE-9",
        "name": "CS-3 Already Refunded (Exhausted Balance)",
        "ticket": t9,
        "expected_desk": "CS_3",
        "expected_bucket": "NON_REFUNDABLE",
        "expected_action": "AUTO_REJECT",
        "expected_decision": "NO_DUPLICATE_REFUND",
        "expected_codes": ["LEDGER_ALREADY_REFUNDED"],
        "description": "Transaction has already been fully refunded on ledger (available balance 0). Auto-rejects double payout.",
    })

    return scenarios


def execute_scenarios():
    print("=" * 90)
    print("  RITOS MULTI-AGENT REFUND PIPELINE: END-TO-END SCENARIO VERIFICATION")
    print("=" * 90)

    db, customer = create_test_db()
    scenarios = build_scenarios(db, customer)

    passed_count = 0
    total_count = len(scenarios)

    for sc in scenarios:
        ticket = sc["ticket"]
        db.add(ticket)
        db.commit()
        db.refresh(ticket)

        # Execute the 9-Agent Pipeline
        res = run_ticket_pipeline(db, ticket)
        db.commit()
        db.refresh(ticket)

        # Extract agent execution steps
        evidence = ticket.classification_evidence or {}
        agent_traces = evidence.get("agents", [])
        trace_map = {step.get("agent_id"): step for step in agent_traces}

        # Validate expectations
        actual_desk = ticket.assigned_desk
        actual_bucket = ticket.decision_bucket
        actual_action = res.get("next_action")
        actual_decision = res.get("decision")
        actual_codes = [c for c in (evidence.get("decision", {}).get("reason_codes", []))]

        desk_match = (actual_desk == sc["expected_desk"])
        action_match = (actual_action == sc["expected_action"])
        decision_match = (actual_decision == sc["expected_decision"])
        code_match = all(c in actual_codes for c in sc["expected_codes"])

        passed = desk_match and action_match and decision_match and code_match
        if passed:
            passed_count += 1

        status_badge = "[PASS]" if passed else "[FAIL]"

        print(f"\n{'-' * 90}")
        print(f"[{sc['id']}] {sc['name']}  -->  {status_badge}")
        print(f"{'-' * 90}")
        print(f"Ticket:      {ticket.ticket_number} | Customer: {ticket.customer_name} ({ticket.customer_id})")
        print(f"Item:        {ticket.item_name} ({ticket.item_category}) | Amount: {ticket.currency} {ticket.claimed_amount:,.2f}")
        print(f"Description: \"{ticket.description}\"")
        print(f"Scenario:    {sc['description']}")
        print()
        print("  Specialist Agent Evaluation:")

        # Agent 1 (Ledger)
        a1 = trace_map.get("ledger_ground_truth", {})
        print(f"   • Agent 1 (Ledger):       Status={a1.get('verification_status')} | Balance={a1.get('available_balance')} | Duplicate={a1.get('is_duplicate')}")

        # Agent 5 (Logistics)
        a5 = trace_map.get("logistics_verification", {})
        print(f"   • Agent 5 (Logistics):    Status={a5.get('status')} | Carrier={a5.get('carrier_name', 'N/A')} | Signed={a5.get('signed_delivery')}")

        # Agent 3 (Intent & Contradiction)
        a3 = trace_map.get("claim_analysis", {})
        contra = a3.get("contradictions", [])
        contra_str = f"CONFLICT: {contra[0]}" if contra else "None"
        print(f"   • Agent 3 (Intent):       Reason={a3.get('controlled_reason')} | Contradictions={contra_str}")

        # Agent 7 (Evidence)
        a7 = trace_map.get("evidence_verification", {})
        print(f"   • Agent 7 (Evidence):     Photos={a7.get('images_count')} | Defect={a7.get('defect', {}).get('defect_status')} | Identity={a7.get('identity', {}).get('identity_status')}")

        # Agent 2 (Policy)
        a2 = trace_map.get("policy_enforcement", {})
        print(f"   • Agent 2 (Policy):       Window={a2.get('return_window_days')}d | Reason={a2.get('reason_code')} | Eligible={a2.get('eligible')}")

        # Agent 4 (Risk)
        a4 = trace_map.get("risk_assessment", {})
        print(f"   • Agent 4 (Risk):         Score={a4.get('risk_score')}/100 ({a4.get('risk_tier')}) | Supervisory={a4.get('requires_supervisory_review')}")

        # Agent 6 (Decision Arbiter)
        a6 = trace_map.get("decision_arbiter", {})
        print(f"   • Agent 6 (Arbiter):      Desk={actual_desk} | Bucket={actual_bucket} | Action={actual_action}")
        print(f"                             Decision={actual_decision} | Codes={actual_codes}")

        # Agent 9 (Coordinator)
        checklist = evidence.get("decision", {}).get("reviewer_checklist", [])
        if checklist:
            print(f"   • Agent 9 (Coordinator):  Review Checklist={checklist}")

        # Agent 8 (Communication Draft)
        msg_draft = ticket.customer_message_draft or ""
        first_line = msg_draft.split("\n")[0] if msg_draft else "N/A"
        print(f"   • Agent 8 (Customer Msg): \"{first_line[:80]}...\"")

        print()
        print(f"  Routing Validation:")
        print(f"   - Assigned Desk:   Expected={sc['expected_desk']:<6} | Actual={actual_desk:<6} [{'OK' if desk_match else 'FAIL'}]")
        print(f"   - Next Action:     Expected={sc['expected_action']:<14} | Actual={actual_action:<14} [{'OK' if action_match else 'FAIL'}]")
        print(f"   - Decision:        Expected={sc['expected_decision']:<35} | Actual={actual_decision:<35} [{'OK' if decision_match else 'FAIL'}]")
        print(f"   - Flag Codes:      Expected={sc['expected_codes']} in {actual_codes} [{'OK' if code_match else 'FAIL'}]")

    print("\n" + "=" * 90)
    print(f"  SUMMARY: {passed_count}/{total_count} SCENARIOS PASSED ({(passed_count/total_count)*100:.1f}%)")
    print("=" * 90 + "\n")

    db.close()
    return passed_count == total_count


if __name__ == "__main__":
    success = execute_scenarios()
    sys.exit(0 if success else 1)
