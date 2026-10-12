"""Agent 7B: Defect-specific evidence verification.

Does the evidence show the defect the customer claims (e.g. loose stitching on the handle)? Only the
configured vision provider can say "verified"; quality problems or missing bytes make it not_assessable,
and everything else stays inconclusive for a human reviewer.
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional
from ..proof_reader import verify_product_identity_and_defect


def summarize_defect(structured: Dict[str, Any]) -> Dict[str, Any]:
    """Agent 7B view of a structured visual verification result."""
    status = structured["defect_status"]
    claim = structured["claimed_defect"]
    findings = {
        "verified": f"Claimed defect ({claim}) is visible in the evidence.",
        "mismatch": f"Claimed defect ({claim}) is not visible in the evidence.",
        "inconclusive": f"Evidence neither confirms nor rules out the claimed defect ({claim}).",
        "not_assessable": "Evidence cannot be inspected: " + ", ".join(structured["evidence_quality"].get("issues", []) or ["no photos"]) + ".",
        "processing_failed": "Vision provider failed; defect not assessed.",
    }[status]
    return {
        "defect_status": status,
        "claimed_defect": claim,
        "observed_defects": structured.get("observed_defects", []),
        "defect_location": structured.get("defect_location"),
        "evidence_refs": structured.get("defect_evidence_refs", []),
        "evidence_quality": {k: v for k, v in structured["evidence_quality"].items() if k != "inspections"},
        "defect_prompt_share": (structured.get("raw_scores") or {}).get("defect_prompt_share"),
        "recommended_next_step": structured["recommended_next_step"],
        "findings": findings,
    }


def verify_claimed_defect(evidence_items: List[Any], claimed_defect: str, product: Dict[str, Any],
                          reference_images: Optional[List[Any]] = None) -> Dict[str, Any]:
    structured = verify_product_identity_and_defect(evidence_items, claimed_defect, product, reference_images=reference_images)
    return summarize_defect(structured)
