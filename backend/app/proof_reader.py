"""RITOS visual evidence engine (Agent 7 support): file safety, image quality and honest verification results.

What this module measures itself (deterministic, reproducible):
- File signature (magic bytes), size and pixel limits (decompression-bomb guard), SHA-256 hash
- Image-quality signals: resolution, sharpness (Laplacian variance), exposure, contrast/blankness
- A 64-bit difference hash for near-duplicate photo detection
- Presence of EXIF metadata (absence is NOT treated as tampering)

What it does NOT decide on its own:
- Whether a photo shows the purchased product, or the claimed defect. Those need a semantic vision
  provider (see vision.py). Without one, or without image bytes, the result is "inconclusive" or
  "not_assessable" and the claim is routed to human review. Classical signals never become a verdict.

Verification states (spec section 4.D): verified | mismatch | inconclusive | not_assessable | processing_failed
"""
from __future__ import annotations
import base64
import binascii
import hashlib
import io
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image, ImageFilter, ImageStat, UnidentifiedImageError

from .config import settings

Image.MAX_IMAGE_PIXELS = settings.vision_max_pixels
PIPELINE_VERSION = "ritos-evidence-quality-1.0"

MAGIC_SIGNATURES = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"GIF87a": "image/gif",
    b"GIF89a": "image/gif",
    b"RIFF": "image/webp",  # confirmed by "WEBP" at bytes 8-12
}

VERIFIED, MISMATCH, INCONCLUSIVE, NOT_ASSESSABLE, PROCESSING_FAILED = (
    "verified", "mismatch", "inconclusive", "not_assessable", "processing_failed")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def validate_image_file_signature(raw_bytes: bytes) -> Tuple[bool, str]:
    """Check the real file type from its magic bytes (never trust the filename or declared MIME)."""
    if not raw_bytes:
        return False, "EMPTY_BYTES"
    for sig, mime in MAGIC_SIGNATURES.items():
        if raw_bytes.startswith(sig):
            if mime == "image/webp" and raw_bytes[8:12] != b"WEBP":
                continue
            return True, mime
    return False, "UNSUPPORTED_FORMAT"


def load_image_bytes(raw: bytes) -> Tuple[Optional[Image.Image], Dict[str, Any]]:
    """Validate and decode image bytes. Returns (image or None, facts). Never raises on bad input."""
    facts: Dict[str, Any] = {"sha256": hashlib.sha256(raw).hexdigest() if raw else None, "size_bytes": len(raw or b"")}
    if len(raw or b"") > settings.vision_max_bytes:
        facts["error"] = "FILE_TOO_LARGE"
        return None, facts
    ok, mime = validate_image_file_signature(raw)
    facts["mime"] = mime if ok else None
    if not ok:
        facts["error"] = "INVALID_FILE_SIGNATURE"
        return None, facts
    try:
        probe = Image.open(io.BytesIO(raw))
        w, h = probe.size
        if w * h > settings.vision_max_pixels:
            facts["error"] = "PIXEL_LIMIT_EXCEEDED"
            return None, facts
        probe.verify()  # structural check; the image must be reopened after verify()
        image = Image.open(io.BytesIO(raw))
        image.load()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        facts["error"] = "PIXEL_LIMIT_EXCEEDED"
        return None, facts
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        facts["error"] = "CORRUPT_IMAGE"
        return None, facts
    return image, facts


def decode_image_data(item: Any) -> Tuple[Optional[Image.Image], str, Optional[str]]:
    """Decode evidence given as bytes, a base64 data URL, raw base64, or {"data": ...}.

    Returns (image, source_type, sha256). A bare filename or URL is only a reference: RITOS cannot see the
    picture, so it returns (None, "REFERENCE_ONLY", None). Image bytes must be fetched first (see shopflow.py).
    """
    if not item:
        return None, "EMPTY", None
    if isinstance(item, dict):
        if item.get("data"):
            return decode_image_data(item["data"])
        return None, "REFERENCE_ONLY", None
    if isinstance(item, (bytes, bytearray)):
        image, facts = load_image_bytes(bytes(item))
        return image, ("RAW_BYTES" if image else facts.get("error", "INVALID")), facts.get("sha256")

    text = str(item).strip()
    payload = None
    source = "RAW_BASE64"
    if text.startswith("data:") and ";base64," in text:
        payload, source = text.split(";base64,", 1)[1], "BASE64_DATA_URL"
    elif len(text) > 200 and not text.lower().startswith(("http://", "https://")):
        payload = text
    if payload is None:
        return None, "REFERENCE_ONLY", None
    try:
        raw = base64.b64decode(payload, validate=False)
    except (binascii.Error, ValueError):
        return None, "CORRUPT_BASE64", None
    image, facts = load_image_bytes(raw)
    return image, (source if image else facts.get("error", "INVALID")), facts.get("sha256")


def assess_image_quality(image: Image.Image) -> Dict[str, Any]:
    """Measure whether an image is good enough to inspect. These are facts about the image, not verdicts."""
    gray = image.convert("L")
    w, h = gray.size
    stat = ImageStat.Stat(gray)
    brightness, contrast = stat.mean[0], stat.stddev[0]
    # Laplacian variance (sharpness); offset keeps negative responses inside the 0..255 range
    lap = gray.filter(ImageFilter.Kernel((3, 3), [0, 1, 0, 1, -4, 1, 0, 1, 0], scale=1, offset=128))
    blur_variance = ImageStat.Stat(lap).stddev[0] ** 2

    issues = []
    if min(w, h) < settings.vision_min_side_px:
        issues.append("RESOLUTION_TOO_LOW")
    if contrast < settings.vision_min_contrast:
        issues.append("BLANK_OR_UNIFORM_IMAGE")
    if blur_variance < settings.vision_min_blur_variance:
        issues.append("TOO_BLURRY")
    if brightness < settings.vision_min_brightness:
        issues.append("TOO_DARK")
    elif brightness > settings.vision_max_brightness:
        issues.append("OVEREXPOSED")
    return {
        "width": w, "height": h,
        "brightness": round(brightness, 1), "contrast": round(contrast, 1),
        "blur_variance": round(blur_variance, 1),
        "issues": issues,
        "assessable": not issues,
    }


def difference_hash(image: Image.Image) -> str:
    """64-bit dHash for near-duplicate detection (robust to resizing and recompression)."""
    small = image.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    px = list(small.getdata())
    bits = 0
    for row in range(8):
        for col in range(8):
            bits = (bits << 1) | (1 if px[row * 9 + col] > px[row * 9 + col + 1] else 0)
    return f"{bits:016x}"


def hamming_distance(hash_a: str, hash_b: str) -> int:
    return bin(int(hash_a, 16) ^ int(hash_b, 16)).count("1")


def metadata_facts(image: Image.Image) -> Dict[str, Any]:
    """Record provenance facts only. Missing EXIF is common (messaging apps strip it) and is not tampering."""
    try:
        exif = image.getexif()
        has_exif = bool(exif)
        software = str(exif.get(0x0131, ""))[:60] if exif else ""
    except Exception:
        has_exif, software = False, ""
    flags = []
    if software and any(tool in software.lower() for tool in ("photoshop", "gimp", "lightroom", "snapseed", "picsart")):
        flags.append("EDITING_SOFTWARE_TAG")  # a signal needing corroboration, never proof of fraud
    return {"format": image.format, "has_exif": has_exif, "software_tag": software or None, "provenance_flags": flags}


def inspect_evidence_item(item: Any) -> Dict[str, Any]:
    """Inspect one evidence item and report only measured facts."""
    image, source, sha256 = decode_image_data(item)
    if image is None:
        if source == "REFERENCE_ONLY":
            return {"source": source, "reference": str(item)[:120], "has_image": False, "assessable": False,
                    "issues": ["IMAGE_BYTES_NOT_AVAILABLE"]}
        return {"source": source, "has_image": False, "assessable": False, "sha256": sha256, "issues": [source]}
    quality = assess_image_quality(image)
    return {
        "source": source, "has_image": True, "sha256": sha256,
        "dhash": difference_hash(image),
        "quality": quality, "metadata": metadata_facts(image),
        "assessable": quality["assessable"], "issues": quality["issues"],
        "_image": image,  # in-memory only; stripped before persistence
    }


def _public(inspection: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in inspection.items() if not k.startswith("_")}


def verify_product_identity_and_defect(
    evidence_items: List[Any],
    claimed_defect: str,
    purchased_product: Optional[Dict[str, Any]] = None,
    claim_description: str = "",
    reference_images: Optional[List[Any]] = None,
) -> Dict[str, Any]:
    """Structured visual verification result (spec 4.D).

    Identity and defect verdicts come only from the configured semantic vision provider.
    Every unresolved state carries a concrete next step for the customer or reviewer.
    """
    from .vision import get_vision_provider  # local import: optional heavy dependency

    product = purchased_product or {}
    claim = (claimed_defect or claim_description or "").strip()
    base = {
        "matched_sku": None, "matched_model": None, "variant_match": None,
        "claimed_defect": claim or "UNSPECIFIED",
        "observed_defects": [], "defect_location": None, "defect_evidence_refs": [],
        "contradictions": [], "tamper_indicators": [],
        "identity_confidence": None, "confidence": None, "raw_scores": {},
        "pipeline_version": PIPELINE_VERSION, "model_version": None,
        "processing_timestamp": _now(),
    }

    if not evidence_items:
        return {**base, "product_identity_status": NOT_ASSESSABLE, "defect_status": NOT_ASSESSABLE,
                "verification_status": NOT_ASSESSABLE,
                "evidence_quality": {"images_count": 0, "assessable_count": 0, "sufficiency": "NO_EVIDENCE"},
                "recommended_next_step": "Ask the customer for a full photo of the product and a close-up of the claimed defect."}

    inspections = [inspect_evidence_item(item) for item in evidence_items]
    usable = [i for i in inspections if i.get("assessable")]
    base["defect_evidence_refs"] = [i.get("sha256") or i.get("reference") for i in inspections]
    base["tamper_indicators"] = sorted({f for i in inspections for f in (i.get("metadata") or {}).get("provenance_flags", [])})
    quality_summary = {
        "images_count": len(inspections),
        "assessable_count": len(usable),
        "issues": sorted({issue for i in inspections for issue in i.get("issues", [])}),
        "inspections": [_public(i) for i in inspections],
    }

    if not usable:
        no_bytes = all("IMAGE_BYTES_NOT_AVAILABLE" in i.get("issues", []) for i in inspections)
        step = ("Evidence images are not available to RITOS; a reviewer must open them in the store, or the store must send the image bytes."
                if no_bytes else
                "Photos cannot be inspected (" + ", ".join(quality_summary["issues"]) + "); ask for a sharper, well-lit close-up of the defect.")
        return {**base, "product_identity_status": NOT_ASSESSABLE, "defect_status": NOT_ASSESSABLE,
                "verification_status": NOT_ASSESSABLE,
                "evidence_quality": {**quality_summary, "sufficiency": "NOT_ASSESSABLE"},
                "recommended_next_step": step}

    provider = get_vision_provider()
    if provider is None:
        return {**base, "product_identity_status": INCONCLUSIVE, "defect_status": INCONCLUSIVE,
                "verification_status": INCONCLUSIVE,
                "evidence_quality": {**quality_summary, "sufficiency": "AWAITING_REVIEW"},
                "recommended_next_step": "No semantic vision provider is configured; a reviewer must compare the photos with the purchased product and the claimed defect."}

    try:
        result = provider.assess(
            images=[i["_image"] for i in usable],
            product=product,
            claimed_defect=claim,
            reference_images=reference_images or [],
        )
    except Exception as exc:  # provider outage must never become a verdict
        return {**base, "product_identity_status": PROCESSING_FAILED, "defect_status": PROCESSING_FAILED,
                "verification_status": PROCESSING_FAILED,
                "evidence_quality": {**quality_summary, "sufficiency": "AWAITING_REVIEW"},
                "provider_error": f"{type(exc).__name__}: {exc}"[:300],
                "recommended_next_step": "Vision provider failed; route to manual evidence review."}

    identity, defect = result["identity_status"], result["defect_status"]
    if identity == MISMATCH:
        overall, step = MISMATCH, "Photo may show a different product or variant; ask the customer to confirm the item and photograph its label or model number."
    elif identity == VERIFIED and defect == VERIFIED:
        overall, step = VERIFIED, "Evidence supports the claimed defect on the purchased product; continue with policy and ledger checks."
    elif identity == VERIFIED and defect == MISMATCH:
        overall, step = INCONCLUSIVE, "The claimed defect is not visible in the photos; ask for a close-up of the exact area."
    else:
        overall, step = INCONCLUSIVE, "Evidence is not conclusive; route to a reviewer with the photos and the reference images."
    return {
        **base,
        "product_identity_status": identity,
        "defect_status": defect,
        "verification_status": overall,
        "matched_sku": product.get("sku") if identity == VERIFIED else None,
        "matched_model": (product.get("model") or product.get("name")) if identity == VERIFIED else None,
        "variant_match": result.get("variant_match"),
        "observed_defects": result.get("observed_defects", []),
        "defect_location": result.get("defect_location"),
        "identity_confidence": None,  # uncalibrated: raw scores only
        "raw_scores": result.get("raw_scores", {}),
        "model_version": result.get("model_version"),
        "evidence_quality": {**quality_summary, "sufficiency": "SUFFICIENT" if overall == VERIFIED else "AWAITING_REVIEW"},
        "recommended_next_step": step,
    }


def run_proof_reading_pipeline(evidence_images: List[Any], claim_description: str = "",
                               purchased_product: Optional[Dict[str, Any]] = None,
                               reference_images: Optional[List[Any]] = None) -> Dict[str, Any]:
    """Pipeline-facing summary. `damage_detected` is True only when the defect was actually verified."""
    structured = verify_product_identity_and_defect(
        evidence_items=evidence_images, claimed_defect=claim_description,
        purchased_product=purchased_product, reference_images=reference_images,
    )
    status = structured["verification_status"]
    count = structured["evidence_quality"]["images_count"]
    if not count:
        summary = "No photo evidence attached by the customer."
    elif status == VERIFIED:
        summary = f"Vision check: claimed defect observed on the purchased product ({', '.join(structured['observed_defects']) or 'defect confirmed'})."
    else:
        summary = f"{count} evidence item(s): {status.replace('_', ' ')}. {structured['recommended_next_step']}"
    return {
        "images_count": count,
        "images_analyzed": [str(x)[:60] for x in (evidence_images or [])],
        "has_visual_proof": structured["evidence_quality"].get("assessable_count", 0) > 0,
        "damage_detected": status == VERIFIED,
        "detected_features": structured["observed_defects"],
        "visual_confidence": None,  # no calibrated confidence exists; see structured_verification.raw_scores
        "verdict": status.upper(),
        "proof_reading_summary": summary,
        "structured_verification": structured,
    }
