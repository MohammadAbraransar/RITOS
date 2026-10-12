"""Private evidence storage and lifecycle (spec section 5).

Files are validated by magic bytes and pixel limits, stored once under their SHA-256 in a private directory
(never a public URL), and tracked as EvidenceFile rows:

    UPLOADED -> VALIDATED -> IDENTITY_CHECKED -> DEFECT_CHECKED -> ADJUDICATED
    alternatives: REJECTED (bad file), INCONCLUSIVE, AWAITING_CUSTOMER, AWAITING_REVIEW, PROCESSING_FAILED

A near-duplicate of a photo already used on another claim is recorded as a risk signal for review
(not as proof of fraud).
"""
from __future__ import annotations
import os
from pathlib import Path
from typing import Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .models import EvidenceFile, EvidenceLifecycle, Ticket
from .proof_reader import assess_image_quality, difference_hash, hamming_distance, load_image_bytes

EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp"}


def _root() -> Path:
    root = Path(settings.evidence_dir)
    if not root.is_absolute():
        root = Path(__file__).resolve().parent.parent / root
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_name(name: str) -> str:
    return "".join(c for c in os.path.basename(name or "evidence") if c.isalnum() or c in "._-")[:120] or "evidence"


def save_evidence(db: Session, ticket: Ticket, raw: bytes, file_name: str, source: str) -> EvidenceFile:
    """Validate and store one evidence file for a ticket. Idempotent per (ticket, sha256)."""
    image, facts = load_image_bytes(raw)
    sha = facts.get("sha256") or ""
    if sha:
        existing = db.scalar(select(EvidenceFile).where(EvidenceFile.ticket_id == ticket.id, EvidenceFile.sha256_hash == sha))
        if existing:
            return existing

    if image is None:
        row = EvidenceFile(ticket_id=ticket.id, file_name=_safe_name(file_name), file_type=facts.get("mime") or "unknown",
                           file_size_bytes=facts.get("size_bytes", 0), sha256_hash=sha, storage_path="",
                           lifecycle_status=EvidenceLifecycle.REJECTED.value,
                           verification_result={"source": source, "error": facts.get("error")})
        db.add(row)
        db.flush()
        return row

    path = _root() / sha[:2] / f"{sha}{EXTENSIONS.get(facts['mime'], '.bin')}"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)

    dhash = difference_hash(image)
    duplicates = []
    for other in db.scalars(select(EvidenceFile).where(EvidenceFile.ticket_id != ticket.id,
                                                       EvidenceFile.lifecycle_status != EvidenceLifecycle.REJECTED.value)):
        other_hash = (other.verification_result or {}).get("dhash")
        if other_hash and hamming_distance(dhash, other_hash) <= settings.vision_duplicate_max_distance:
            duplicates.append({"evidence_id": other.id, "ticket_id": other.ticket_id,
                               "distance": hamming_distance(dhash, other_hash)})

    row = EvidenceFile(ticket_id=ticket.id, file_name=_safe_name(file_name), file_type=facts["mime"],
                       file_size_bytes=facts["size_bytes"], sha256_hash=sha,
                       storage_path=str(path.relative_to(_root())),
                       lifecycle_status=EvidenceLifecycle.VALIDATED.value,
                       verification_result={"source": source, "dhash": dhash, "quality": assess_image_quality(image),
                                            "near_duplicates": duplicates},
                       tamper_flags=["NEAR_DUPLICATE_OF_OTHER_CLAIM"] if duplicates else [])
    db.add(row)
    db.flush()
    return row


def ticket_evidence(db: Session, ticket: Ticket) -> List[EvidenceFile]:
    return list(db.scalars(select(EvidenceFile).where(EvidenceFile.ticket_id == ticket.id).order_by(EvidenceFile.created_at)))


def read_bytes(row: EvidenceFile) -> Optional[bytes]:
    if not row.storage_path:
        return None
    path = _root() / row.storage_path
    return path.read_bytes() if path.exists() else None


def set_lifecycle(rows: List[EvidenceFile], status: str, result: Optional[Dict] = None) -> None:
    for row in rows:
        if row.lifecycle_status == EvidenceLifecycle.REJECTED.value:
            continue
        row.lifecycle_status = status
        if result is not None:
            row.verification_result = {**(row.verification_result or {}), "assessment": result}
