"""Agent 7A: Product identity verification.

Does the evidence show the product (model, variant) that was actually purchased? The answer comes from
the configured vision provider comparing the photos with the store's reference images; without a provider,
reference images or image bytes the status is inconclusive / not_assessable, never assumed verified.
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional
from ..proof_reader import verify_product_identity_and_defect


def summarize_identity(structured: Dict[str, Any], product: Dict[str, Any]) -> Dict[str, Any]:
    """Agent 7A view of a structured visual verification result."""
    status = structured["product_identity_status"]
    sku = product.get("sku")
    findings = {
        "verified": f"Photos match the purchased product ({product.get('name')}, {sku}).",
        "mismatch": f"Photos may show a different product than the purchased {product.get('name')} ({sku}).",
        "inconclusive": "Product identity could not be established from the evidence.",
        "not_assessable": "No inspectable photo to compare with the purchased product.",
        "processing_failed": "Vision provider failed; identity not assessed.",
    }[status]
    return {
        "identity_status": status,
        "purchased_sku": sku,
        "matched_sku": structured.get("matched_sku"),
        "matched_model": structured.get("matched_model"),
        "variant_match": structured.get("variant_match"),
        "identity_similarity": (structured.get("raw_scores") or {}).get("identity_similarity"),
        "model_version": structured.get("model_version"),
        "findings": findings,
    }


def verify_product_identity(evidence_items: List[Any], product: Dict[str, Any],
                            reference_images: Optional[List[Any]] = None) -> Dict[str, Any]:
    structured = verify_product_identity_and_defect(evidence_items, "", product, reference_images=reference_images)
    return summarize_identity(structured, product)
