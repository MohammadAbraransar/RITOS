"""Agent 5: Carrier and logistics verification.

Sources, in order, each labelled in the result:
1. CARRIER: a `carrier_shipments` record written by a configured carrier integration
2. STORE_ORDER_RECORD: the store's own delivery status/date (useful, but not carrier proof of delivery)
3. none: logistics unavailable

No carrier API is configured in this deployment, so `carrier_integration` is reported as NOT_CONFIGURED and a
delivery is never described as carrier-verified unless a carrier record exists.
"""
from __future__ import annotations
from typing import Any, Dict, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import CarrierShipment


def verify_shipment_logistics(db: Session, order_id: Optional[str], store_facts: Optional[Dict[str, Any]] = None,
                              carrier_tracking_number: Optional[str] = None) -> Dict[str, Any]:
    shipment = None
    if carrier_tracking_number:
        shipment = db.scalar(select(CarrierShipment).where(CarrierShipment.tracking_number == carrier_tracking_number))
    elif order_id:
        shipment = db.scalar(select(CarrierShipment).where(CarrierShipment.order_id == order_id))

    if shipment:
        exceptions = [evt for evt in (shipment.carrier_events or [])
                      if any(word in str(evt).lower() for word in ("damage", "exception", "lost"))]
        return {
            "source": "CARRIER",
            "carrier_integration": "RECORDED",
            "status": shipment.status,
            "delivered": shipment.status == "DELIVERED",
            "signed_delivery": bool(shipment.proof_of_delivery_ref),
            "delivered_at": shipment.delivered_at.isoformat() if shipment.delivered_at else None,
            "carrier_name": shipment.carrier_name,
            "tracking_number": shipment.tracking_number,
            "carrier_exceptions": exceptions,
            "findings": f"{shipment.carrier_name} #{shipment.tracking_number}: {shipment.status}"
                        + (" with signed proof of delivery." if shipment.proof_of_delivery_ref else "."),
        }

    facts = store_facts or {}
    if facts.get("delivery_status"):
        return {
            "source": "STORE_ORDER_RECORD",
            "carrier_integration": "NOT_CONFIGURED",
            "status": facts["delivery_status"],
            "delivered": facts["delivery_status"] == "DELIVERED",
            "signed_delivery": False,  # the store record is not a carrier proof of delivery
            "delivered_at": facts.get("delivered_at"),
            "carrier_exceptions": [],
            "findings": f"Store order record says {facts['delivery_status']}; no carrier integration is configured to confirm it.",
        }
    return {
        "source": "none",
        "carrier_integration": "NOT_CONFIGURED",
        "status": "UNAVAILABLE",
        "delivered": None,
        "signed_delivery": False,
        "delivered_at": None,
        "carrier_exceptions": [],
        "findings": "No carrier or store delivery record is available for this order.",
    }
