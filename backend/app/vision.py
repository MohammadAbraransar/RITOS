"""Semantic vision providers for product identity and defect assessment (Agent 7A / 7B).

Configured with VISION_PROVIDER:
- "none" (default): no semantic assessment. Photo claims are reported inconclusive and go to human review.
- "clip": a local, free OpenCLIP model on CPU. Install with `pip install open_clip_torch torch`.

Scores are raw cosine similarities / softmax shares from an uncalibrated model. They are stored with the
model version and thresholds so routing from a persisted assessment is reproducible, but they are never
presented as probabilities of truth (spec sections 4.C, 4.D and 11).
"""
from __future__ import annotations
import io
import logging
import threading
from typing import Any, Dict, List, Optional, Protocol

from PIL import Image

from .config import settings

logger = logging.getLogger("ritos.vision")


class VisionProvider(Protocol):
    def assess(self, images: List[Image.Image], product: Dict[str, Any], claimed_defect: str,
               reference_images: List[Any]) -> Dict[str, Any]:
        """Return identity_status, defect_status, raw_scores, observed_defects, model_version."""


def _load_reference(ref: Any) -> Optional[Image.Image]:
    """Reference images may be PIL images, bytes, or local file paths. URLs are fetched by the caller."""
    try:
        if isinstance(ref, Image.Image):
            return ref
        if isinstance(ref, (bytes, bytearray)):
            return Image.open(io.BytesIO(ref)).convert("RGB")
        if isinstance(ref, str) and ref:
            return Image.open(ref).convert("RGB")
    except Exception as exc:
        logger.info("Reference image could not be loaded (%s): %s", str(ref)[:80], exc)
    return None


class ClipVisionProvider:
    """Zero-shot CLIP: identity by similarity to the store's reference photos, defect by text-image prompts."""

    def __init__(self, model_name: str, pretrained: str):
        import open_clip  # optional dependency
        import torch
        self.torch = torch
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(model_name, pretrained=pretrained)
        self.model.eval()
        self.tokenizer = open_clip.get_tokenizer(model_name)
        self.version = f"open_clip/{model_name}/{pretrained}"

    def _embed_images(self, images: List[Image.Image]):
        batch = self.torch.stack([self.preprocess(img.convert("RGB")) for img in images])
        with self.torch.no_grad():
            feats = self.model.encode_image(batch)
        return feats / feats.norm(dim=-1, keepdim=True)

    def _embed_texts(self, texts: List[str]):
        with self.torch.no_grad():
            feats = self.model.encode_text(self.tokenizer(texts))
        return feats / feats.norm(dim=-1, keepdim=True)

    def assess(self, images, product, claimed_defect, reference_images):
        photos = self._embed_images(images)
        name = (product.get("name") or product.get("model") or "product").strip()
        scores: Dict[str, Any] = {"thresholds": {
            "identity_match": settings.vision_identity_match_threshold,
            "identity_mismatch": settings.vision_identity_mismatch_threshold,
            "defect_margin": settings.vision_defect_margin}}

        # --- 7A product identity: best photo-to-reference cosine similarity ---
        refs = [r for r in (_load_reference(x) for x in reference_images) if r is not None]
        if refs:
            sim = (photos @ self._embed_images(refs).T).max().item()
            scores["identity_similarity"] = round(sim, 4)
            if sim >= settings.vision_identity_match_threshold:
                identity = "verified"
            elif sim <= settings.vision_identity_mismatch_threshold:
                identity = "mismatch"
            else:
                identity = "inconclusive"
        else:
            identity = "inconclusive"  # cannot establish model identity without reference images
            scores["identity_similarity"] = None

        # --- 7B defect: claimed-defect prompt vs intact-product prompt ---
        defect_status, observed = "inconclusive", []
        if claimed_defect:
            claim = claimed_defect[:120]
            prompts = [f"a close-up photo showing {claim} on a {name}",
                       f"a photo of an undamaged {name} in perfect condition"]
            logits = (self.model.logit_scale.exp() * photos @ self._embed_texts(prompts).T).softmax(dim=-1)
            share = logits[:, 0].max().item()  # strongest photo for the claimed defect
            scores["defect_prompt_share"] = round(share, 4)
            if share >= 0.5 + settings.vision_defect_margin:
                defect_status, observed = "verified", [claim]
            elif share <= 0.5 - settings.vision_defect_margin:
                defect_status = "mismatch"
        return {"identity_status": identity, "defect_status": defect_status, "observed_defects": observed,
                "variant_match": None, "defect_location": None, "raw_scores": scores, "model_version": self.version}


_provider: Optional[VisionProvider] = None
_provider_error: Optional[str] = None
_lock = threading.Lock()


def get_vision_provider() -> Optional[VisionProvider]:
    """Configured provider, loaded once. Returns None when disabled or unavailable (never a fake provider)."""
    global _provider, _provider_error
    name = (settings.vision_provider or "none").lower()
    if name == "none":
        return None
    with _lock:
        if _provider is None and _provider_error is None:
            try:
                if name == "clip":
                    _provider = ClipVisionProvider(settings.vision_model_name, settings.vision_model_pretrained)
                else:
                    _provider_error = f"Unknown VISION_PROVIDER '{name}'"
            except Exception as exc:
                _provider_error = f"{type(exc).__name__}: {exc}"
                logger.warning("Vision provider '%s' unavailable: %s", name, _provider_error)
    return _provider


def vision_status() -> Dict[str, Any]:
    """For the readiness endpoint: implemented / configured / unavailable, with setup instructions."""
    name = (settings.vision_provider or "none").lower()
    if name == "none":
        return {"provider": "none", "status": "NOT_CONFIGURED",
                "detail": "Set VISION_PROVIDER=clip and `pip install open_clip_torch torch` for local semantic checks."}
    provider = get_vision_provider()
    if provider is None:
        return {"provider": name, "status": "UNAVAILABLE", "detail": _provider_error}
    return {"provider": name, "status": "READY", "model_version": getattr(provider, "version", None)}
