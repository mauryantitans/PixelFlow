"""
Step executor — validate + coerce a pipeline step's parameters against the
operation's declared spec, then run the callable.

Replaces the previous silent no-op behavior: an unknown operation or an invalid
parameter now produces a structured StepError (the image passes through
unchanged so one bad step never aborts the whole pipeline), instead of being
swallowed and masked.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from PIL import Image

from .param_specs import ParamError
from .registry import registry

logger = logging.getLogger(__name__)


@dataclass
class ParamErrorDetail:
    param: str
    message: str


@dataclass
class StepError:
    op: str
    kind: str  # "unknown_operation" | "invalid_params" | "execution_error"
    message: str
    param_errors: list[ParamErrorDetail] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "op": self.op,
            "kind": self.kind,
            "message": self.message,
            "param_errors": [
                {"param": pe.param, "message": pe.message} for pe in self.param_errors
            ],
        }


def build_kwargs(spec, raw_params: dict[str, Any], width: int, height: int):
    """
    Validate + coerce each declared param (filling defaults), then materialize
    coordinate params to pixels. Returns (kwargs, param_errors).
    """
    kwargs: dict[str, Any] = {}
    errors: list[ParamErrorDetail] = []

    for p in spec.params:
        raw = raw_params.get(p.name, p.default)

        # An unset interactive param (e.g. no seed clicked yet) is "pending",
        # not an error — skip it and let the callable use its own default.
        if raw is None and p.needs_image:
            continue
        if raw is None and p.default is None:
            continue

        try:
            coerced = p.coerce(raw)
            if p.needs_image:
                coerced = p.to_pixels(coerced, width, height)
            kwargs[p.name] = coerced
        except ParamError as exc:
            errors.append(ParamErrorDetail(exc.param, exc.message))

    return kwargs, errors


def execute_step(image: Image.Image, step: dict[str, Any]) -> tuple[Image.Image, StepError | None]:
    """
    Execute a single {name, params} step.

    Returns (result_image, error). On any error the original image is returned
    unchanged and a StepError describes what went wrong.
    """
    name = step.get("name")
    raw_params = step.get("params") or {}

    # A step switched off in the UI passes the image through untouched.
    if step.get("enabled") is False:
        return image, None

    spec = registry.resolve(name)
    if spec is None:
        logger.warning("Unknown operation: %r", name)
        return image, StepError(
            op=str(name), kind="unknown_operation", message=f"Unknown operation: {name!r}"
        )

    width, height = image.size
    kwargs, param_errors = build_kwargs(spec, raw_params, width, height)
    if param_errors:
        msg = "; ".join(f"{e.param}: {e.message}" for e in param_errors)
        logger.warning("Invalid params for %s: %s", spec.id, msg)
        return image, StepError(
            op=spec.id, kind="invalid_params", message=msg, param_errors=param_errors
        )

    try:
        result = spec.fn(image, **kwargs)
        return result, None
    except Exception as exc:  # operation bodies are third-party-ish; stay resilient
        logger.error("Error applying operation %s: %s", spec.id, exc)
        return image, StepError(op=spec.id, kind="execution_error", message=str(exc))
