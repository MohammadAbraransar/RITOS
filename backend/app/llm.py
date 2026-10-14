"""Optional LLM assist layer (Groq first, Gemini as fallback, deterministic rules if both fail).

The LLM advises; it never routes a ticket or moves money. Every call:
- sends text with personal data removed (names, emails, phone and card numbers),
- asks for JSON only and validates it against the caller's checks (anything else is discarded),
- has a timeout, and falls through to the next provider, then to the caller's rule-based result,
- is recorded (provider, model, prompt version, latency, whether a fallback was used) for the audit trail.

Both providers expose an OpenAI-compatible chat API, so one client serves them. Providers, models, URLs and
limits are settings (LLM_PROVIDER, LLM_FALLBACK_PROVIDER, GROQ_*, GEMINI_*, LLM_*).
"""
from __future__ import annotations
import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterable, List, Optional

import httpx

from .config import settings

logger = logging.getLogger("ritos.llm")


@dataclass
class LLMResult:
    ok: bool
    data: Optional[Dict[str, Any]] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    prompt_version: str = ""
    latency_ms: int = 0
    attempts: List[Dict[str, Any]] = field(default_factory=list)

    def audit(self) -> Dict[str, Any]:
        """Compact record stored with the agent's step output."""
        return {"used": self.ok, "provider": self.provider, "model": self.model, "prompt_version": self.prompt_version,
                "latency_ms": self.latency_ms, "fallback_used": len(self.attempts) > 1 or not self.ok,
                "attempts": self.attempts}


def _providers() -> List[Dict[str, Any]]:
    """Configured providers in the order to try them; a provider without a key is skipped."""
    table = {
        "groq": {"key": settings.groq_api_key, "base_url": settings.groq_base_url, "model": settings.groq_model},
        "gemini": {"key": settings.gemini_api_key, "base_url": settings.gemini_base_url, "model": settings.gemini_model},
    }
    order = [settings.llm_provider, settings.llm_fallback_provider]
    out = []
    for name in order:
        name = (name or "none").strip().lower()
        if name in table and table[name]["key"] and name not in [p["name"] for p in out]:
            out.append({"name": name, **table[name]})
    return out


def enabled() -> bool:
    return bool(_providers())


# --- personal data removal -------------------------------------------------------------------------------------
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_CARD = re.compile(r"\b(?:\d[ -]?){13,19}\b")
_PHONE = re.compile(r"(?<!\w)\+?\d[\d\s().-]{7,}\d")


def redact(text: str, known_values: Iterable[Optional[str]] = ()) -> str:
    """Remove personal data before text leaves RITOS. Known values (e.g. the customer's name) are removed too."""
    if not settings.llm_redact_pii:
        return text or ""
    out = _EMAIL.sub("[email]", text or "")
    out = _CARD.sub("[card]", out)
    out = _PHONE.sub("[phone]", out)
    for value in known_values:
        for part in {value, *(str(value or "").split())}:
            if part and len(part) > 2:
                out = re.sub(re.escape(part), "[name]", out, flags=re.IGNORECASE)
    return out


_THINK = re.compile(r"<think>.*?</think>", re.DOTALL)


def _parse_json(content: str) -> Dict[str, Any]:
    content = _THINK.sub("", content or "").strip()
    if content.startswith("```"):
        content = content.strip("`").split("\n", 1)[-1].rsplit("```", 1)[0]
    start, end = content.find("{"), content.rfind("}")
    if start < 0 or end < start:
        raise ValueError("no JSON object in reply")
    return json.loads(content[start:end + 1])


def complete_json(system: str, user: str, validate: Callable[[Dict[str, Any]], Dict[str, Any]],
                  prompt_version: str) -> LLMResult:
    """Ask each configured provider in turn for a JSON reply that passes `validate` (which raises ValueError)."""
    result = LLMResult(ok=False, prompt_version=prompt_version)
    for p in _providers():
        started = time.perf_counter()
        attempt = {"provider": p["name"], "model": p["model"]}
        try:
            resp = httpx.post(
                f"{p['base_url'].rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {p['key']}"},
                timeout=settings.llm_timeout_seconds,
                json={"model": p["model"], "temperature": settings.llm_temperature,
                      "max_tokens": settings.llm_max_output_tokens, "response_format": {"type": "json_object"},
                      "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]},
            )
            if resp.status_code != 200:
                raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:160]}")
            data = validate(_parse_json(resp.json()["choices"][0]["message"]["content"]))
            attempt.update(outcome="ok", latency_ms=int((time.perf_counter() - started) * 1000))
            result.attempts.append(attempt)
            result.ok, result.data, result.provider, result.model = True, data, p["name"], p["model"]
            result.latency_ms = attempt["latency_ms"]
            return result
        except Exception as exc:  # any failure: try the next provider, then the caller's rules
            attempt.update(outcome="failed", error=f"{type(exc).__name__}: {str(exc)[:160]}",
                           latency_ms=int((time.perf_counter() - started) * 1000))
            result.attempts.append(attempt)
            logger.info("LLM %s/%s failed: %s", p["name"], p["model"], attempt["error"])
    result.latency_ms = sum(a["latency_ms"] for a in result.attempts)
    return result
