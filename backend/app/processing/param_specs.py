"""
Declarative parameter specifications.

Each operation declares an ordered list of ParamSpec objects. A ParamSpec:
  * describes the control the frontend should render (`schema()`),
  * validates + coerces an incoming raw value into the form the operation
    callable expects (`coerce()`),
  * for image-coordinate types, exposes `needs_image` + `to_pixels()` so the
    executor can convert normalized [0..1] values to pixels against the live
    image size.

Coordinate types store/transport NORMALIZED values; scalar/enum/bool/color/
kernel values are fully materialized by `coerce()`.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from . import coords


class ParamError(ValueError):
    """Raised when a raw parameter value fails validation/coercion."""

    def __init__(self, param: str, message: str):
        self.param = param
        self.message = message
        super().__init__(f"{param}: {message}")


@dataclass
class ParamSpec:
    name: str
    label: str
    default: Any = None
    help: str = ""
    advanced: bool = False
    #: Coordinate params need the image size to materialize to pixels.
    needs_image: bool = field(default=False, init=False)
    #: The ParamType string surfaced in the API schema.
    kind: str = field(default="", init=False)

    def schema(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "label": self.label,
            "type": self.kind,
            "default": self.default,
            "help": self.help,
            "advanced": self.advanced,
        }

    def coerce(self, value: Any) -> Any:  # pragma: no cover - overridden
        raise NotImplementedError

    def to_pixels(self, value: Any, width: int, height: int) -> Any:
        """Convert a coerced (normalized) value to pixels. Default: identity."""
        return value


@dataclass
class IntParam(ParamSpec):
    min: int = 0
    max: int = 100
    step: int = 1
    kind: str = field(default="int", init=False)

    def schema(self) -> dict[str, Any]:
        return {**super().schema(), "min": self.min, "max": self.max, "step": self.step}

    def coerce(self, value: Any) -> int:
        try:
            v = int(round(float(value)))
        except (TypeError, ValueError):
            raise ParamError(self.name, f"expected an integer, got {value!r}") from None
        return int(coords.clamp(v, self.min, self.max))


@dataclass
class FloatParam(ParamSpec):
    min: float = 0.0
    max: float = 1.0
    step: float = 0.01
    kind: str = field(default="float", init=False)

    def schema(self) -> dict[str, Any]:
        return {**super().schema(), "min": self.min, "max": self.max, "step": self.step}

    def coerce(self, value: Any) -> float:
        try:
            v = float(value)
        except (TypeError, ValueError):
            raise ParamError(self.name, f"expected a number, got {value!r}") from None
        return float(coords.clamp(v, self.min, self.max))


@dataclass
class OddKernelParam(ParamSpec):
    min: int = 1
    max: int = 31
    kind: str = field(default="odd_kernel", init=False)

    def schema(self) -> dict[str, Any]:
        return {**super().schema(), "min": self.min, "max": self.max, "step": 2}

    def coerce(self, value: Any) -> int:
        try:
            v = int(round(float(value)))
        except (TypeError, ValueError):
            raise ParamError(self.name, f"expected an integer, got {value!r}") from None
        v = int(coords.clamp(v, self.min, self.max))
        return coords.ensure_odd(v, minimum=self.min)


@dataclass
class AngleParam(ParamSpec):
    min: float = -180.0
    max: float = 180.0
    step: float = 1.0
    kind: str = field(default="angle", init=False)

    def schema(self) -> dict[str, Any]:
        return {**super().schema(), "min": self.min, "max": self.max, "step": self.step}

    def coerce(self, value: Any) -> float:
        try:
            v = float(value)
        except (TypeError, ValueError):
            raise ParamError(self.name, f"expected an angle in degrees, got {value!r}") from None
        # Wrap into [-180, 180].
        v = (v + 180.0) % 360.0 - 180.0
        return v


@dataclass
class EnumOption:
    value: str
    label: str


@dataclass
class EnumParam(ParamSpec):
    options: Sequence[Any] = ()
    kind: str = field(default="enum", init=False)

    def _pairs(self) -> list[EnumOption]:
        out: list[EnumOption] = []
        for opt in self.options:
            if isinstance(opt, EnumOption):
                out.append(opt)
            elif isinstance(opt, (list, tuple)) and len(opt) == 2:
                out.append(EnumOption(str(opt[0]), str(opt[1])))
            else:
                out.append(EnumOption(str(opt), str(opt)))
        return out

    def schema(self) -> dict[str, Any]:
        return {
            **super().schema(),
            "options": [{"value": o.value, "label": o.label} for o in self._pairs()],
        }

    def coerce(self, value: Any) -> str:
        allowed = {o.value for o in self._pairs()}
        sval = str(value)
        if sval not in allowed:
            raise ParamError(self.name, f"{sval!r} is not one of {sorted(allowed)}")
        return sval


@dataclass
class BoolParam(ParamSpec):
    kind: str = field(default="bool", init=False)

    def coerce(self, value: Any) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            return value.strip().lower() in ("1", "true", "yes", "on")
        raise ParamError(self.name, f"expected a boolean, got {value!r}")


@dataclass
class ColorParam(ParamSpec):
    alpha: bool = False
    kind: str = field(default="color", init=False)

    def coerce(self, value: Any) -> tuple[int, int, int]:
        try:
            return coords.parse_color(value)
        except ValueError as exc:
            raise ParamError(self.name, str(exc)) from exc


def _validate_normalized_point(name: str, value: Any) -> tuple[float, float]:
    if isinstance(value, dict):
        x, y = value.get("x"), value.get("y")
    elif isinstance(value, (list, tuple)) and len(value) == 2:
        x, y = value[0], value[1]
    else:
        raise ParamError(name, f"expected a point {{x, y}}, got {value!r}")
    if x is None or y is None:
        raise ParamError(name, f"point is missing x/y: {value!r}")
    try:
        xf, yf = float(x), float(y)
    except (TypeError, ValueError):
        raise ParamError(name, f"point coordinates must be numbers, got {value!r}") from None
    if not (0.0 <= xf <= 1.0 and 0.0 <= yf <= 1.0):
        raise ParamError(name, "point coordinates must be normalized to [0, 1]")
    return (xf, yf)


@dataclass
class PointParam(ParamSpec):
    space: str = "normalized"
    kind: str = field(default="point", init=False)

    def __post_init__(self) -> None:
        self.needs_image = True

    def schema(self) -> dict[str, Any]:
        return {**super().schema(), "space": self.space}

    def coerce(self, value: Any) -> tuple[float, float]:
        return _validate_normalized_point(self.name, value)

    def to_pixels(self, value: tuple[float, float], width: int, height: int):
        return coords.denormalize_point(value[0], value[1], width, height)


@dataclass
class PointsParam(ParamSpec):
    space: str = "normalized"
    min_points: int = 0
    max_points: int | None = None
    kind: str = field(default="points", init=False)

    def __post_init__(self) -> None:
        self.needs_image = True

    def schema(self) -> dict[str, Any]:
        return {
            **super().schema(),
            "space": self.space,
            "min_points": self.min_points,
            "max_points": self.max_points,
        }

    def coerce(self, value: Any) -> list[tuple[float, float]]:
        if not isinstance(value, (list, tuple)):
            raise ParamError(self.name, f"expected a list of points, got {value!r}")
        pts = [_validate_normalized_point(self.name, v) for v in value]
        if len(pts) < self.min_points:
            raise ParamError(self.name, f"needs at least {self.min_points} point(s)")
        if self.max_points is not None and len(pts) > self.max_points:
            raise ParamError(self.name, f"allows at most {self.max_points} point(s)")
        return pts

    def to_pixels(self, value, width: int, height: int):
        return [coords.denormalize_point(x, y, width, height) for (x, y) in value]


@dataclass
class RectParam(ParamSpec):
    space: str = "normalized"
    kind: str = field(default="rect", init=False)

    def __post_init__(self) -> None:
        self.needs_image = True

    def schema(self) -> dict[str, Any]:
        return {**super().schema(), "space": self.space}

    def coerce(self, value: Any) -> tuple[float, float, float, float]:
        if not isinstance(value, dict):
            raise ParamError(self.name, f"expected a rect {{x, y, w, h}}, got {value!r}")
        try:
            x, y, w, h = (
                float(value["x"]),
                float(value["y"]),
                float(value["w"]),
                float(value["h"]),
            )
        except (KeyError, TypeError, ValueError):
            raise ParamError(self.name, f"invalid rect {value!r}") from None
        for component in (x, y, w, h):
            if not (0.0 <= component <= 1.0):
                raise ParamError(self.name, "rect values must be normalized to [0, 1]")
        return (x, y, w, h)

    def to_pixels(self, value, width: int, height: int):
        return coords.denormalize_rect(value[0], value[1], value[2], value[3], width, height)


@dataclass
class TextParam(ParamSpec):
    """A short free-text value (e.g. a custom filter's display name)."""

    max_length: int = 80
    kind: str = field(default="text", init=False)

    def schema(self) -> dict[str, Any]:
        return {**super().schema(), "max_length": self.max_length}

    def coerce(self, value: Any) -> str:
        if value is None:
            return ""
        if not isinstance(value, str):
            raise ParamError(self.name, f"expected text, got {value!r}")
        return value.strip()[: self.max_length]


@dataclass
class MatrixParam(ParamSpec):
    """A square, odd-sized matrix of numbers (convolution kernels).

    ``presets`` are offered by the UI as starting points; each is
    ``{"label": str, "value": list[list[float]]}``.
    """

    min_size: int = 3
    max_size: int = 9
    value_min: float = -255.0
    value_max: float = 255.0
    presets: list[dict[str, Any]] = field(default_factory=list)
    kind: str = field(default="matrix", init=False)

    def schema(self) -> dict[str, Any]:
        return {
            **super().schema(),
            "min_size": self.min_size,
            "max_size": self.max_size,
            "value_min": self.value_min,
            "value_max": self.value_max,
            "presets": self.presets,
        }

    def coerce(self, value: Any) -> list[list[float]]:
        if not isinstance(value, list) or not value or not all(isinstance(r, list) for r in value):
            raise ParamError(self.name, "expected a matrix (a list of rows)")
        size = len(value)
        if any(len(r) != size for r in value):
            raise ParamError(self.name, "the matrix must be square")
        if size % 2 == 0 or not (self.min_size <= size <= self.max_size):
            raise ParamError(
                self.name, f"size must be odd, between {self.min_size} and {self.max_size}"
            )
        out: list[list[float]] = []
        for row in value:
            cells: list[float] = []
            for v in row:
                if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v:
                    raise ParamError(self.name, f"cells must be numbers, got {v!r}")
                if not (self.value_min <= v <= self.value_max):
                    raise ParamError(
                        self.name,
                        f"cells must be between {self.value_min:g} and {self.value_max:g}",
                    )
                cells.append(float(v))
            out.append(cells)
        return out


@dataclass
class StepsParam(ParamSpec):
    """An embedded list of pipeline steps (the body of a custom filter)."""

    max_steps: int = 30
    kind: str = field(default="steps", init=False)

    def schema(self) -> dict[str, Any]:
        return {**super().schema(), "max_steps": self.max_steps}

    def coerce(self, value: Any) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            raise ParamError(self.name, "expected a list of steps")
        if len(value) > self.max_steps:
            raise ParamError(self.name, f"at most {self.max_steps} steps")
        steps: list[dict[str, Any]] = []
        for i, step in enumerate(value, start=1):
            if not isinstance(step, dict) or not isinstance(step.get("name"), str):
                raise ParamError(self.name, f"step {i} must have a name")
            params = step.get("params") or {}
            if not isinstance(params, dict):
                raise ParamError(self.name, f"step {i}: params must be an object")
            steps.append(
                {
                    "name": step["name"],
                    "params": params,
                    "enabled": step.get("enabled", True) is not False,
                }
            )
        return steps
