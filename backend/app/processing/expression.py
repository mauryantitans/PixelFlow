"""
Safe per-pixel formulas for the Expression operation.

A formula such as ``0.3*r + 0.59*g + 0.11*b`` is parsed with :mod:`ast` and
evaluated by walking the tree with NumPy, never with ``eval``. Only the node
types, names and functions listed below are accepted; anything else (attribute
access, subscripts, strings, lambdas, comprehensions, keyword arguments, ...)
is rejected before any pixel is touched. Every value is a float32 scalar or a
float32 array the size of the image, so the cost is bounded by the formula's
length (at most ``MAX_LENGTH`` characters, ``MAX_NODES`` nodes) times the
number of pixels, and overflow turns into ``inf`` instead of an exception or a
runaway integer power.

Variables (per pixel): ``r``, ``g``, ``b`` (0..1), ``l`` (luma, 0..1),
``x``, ``y`` (position, 0..1 from the top-left), and ``w``, ``h`` (image size
in pixels). Constants: ``pi``, ``e``.
"""

from __future__ import annotations

import ast
import math
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import numpy as np

MAX_LENGTH = 200
MAX_NODES = 120

VARIABLES = ("r", "g", "b", "l", "x", "y", "w", "h")
CONSTANTS: dict[str, float] = {"pi": math.pi, "e": math.e}


class ExpressionError(ValueError):
    """A formula that can't be parsed or uses something that isn't allowed."""


def _f(v: Any) -> Any:
    return np.asarray(v, dtype=np.float32) if isinstance(v, np.ndarray) else np.float32(v)


def _clamp(v: Any, lo: Any, hi: Any) -> Any:
    return np.minimum(np.maximum(v, lo), hi)


def _mix(a: Any, b: Any, t: Any) -> Any:
    return a + (b - a) * t


def _step(edge: Any, v: Any) -> Any:
    return _f(np.asarray(v) >= edge)


def _smoothstep(e0: Any, e1: Any, v: Any) -> Any:
    t = _clamp((v - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _where(cond: Any, a: Any, b: Any) -> Any:
    return np.where(np.asarray(cond) != 0, a, b)


def _min(*args: Any) -> Any:
    out = args[0]
    for a in args[1:]:
        out = np.minimum(out, a)
    return out


def _max(*args: Any) -> Any:
    out = args[0]
    for a in args[1:]:
        out = np.maximum(out, a)
    return out


# name -> (callable, min args, max args)
FUNCTIONS: dict[str, tuple[Callable[..., Any], int, int]] = {
    "abs": (np.abs, 1, 1),
    "sqrt": (np.sqrt, 1, 1),
    "exp": (np.exp, 1, 1),
    "log": (np.log, 1, 1),
    "sin": (np.sin, 1, 1),
    "cos": (np.cos, 1, 1),
    "tan": (np.tan, 1, 1),
    "floor": (np.floor, 1, 1),
    "ceil": (np.ceil, 1, 1),
    "round": (np.round, 1, 1),
    "pow": (np.power, 2, 2),
    "min": (_min, 2, 8),
    "max": (_max, 2, 8),
    "clamp": (_clamp, 3, 3),
    "mix": (_mix, 3, 3),
    "step": (_step, 2, 2),
    "smoothstep": (_smoothstep, 3, 3),
    "where": (_where, 3, 3),
}

_BINOPS: dict[type, Callable[[Any, Any], Any]] = {
    ast.Add: np.add,
    ast.Sub: np.subtract,
    ast.Mult: np.multiply,
    ast.Div: np.divide,
    ast.Mod: np.mod,
    ast.Pow: np.power,
}
_CMPOPS: dict[type, Callable[[Any, Any], Any]] = {
    ast.Lt: np.less,
    ast.LtE: np.less_equal,
    ast.Gt: np.greater,
    ast.GtE: np.greater_equal,
    ast.Eq: np.equal,
    ast.NotEq: np.not_equal,
}
_BOOLOPS: dict[type, Callable[[Any, Any], Any]] = {ast.And: np.logical_and, ast.Or: np.logical_or}
_ALLOWED_NODES = (
    ast.Expression,
    ast.BinOp,
    ast.UnaryOp,
    ast.BoolOp,
    ast.Compare,
    ast.IfExp,
    ast.Call,
    ast.Name,
    ast.Constant,
    ast.Load,
    ast.UAdd,
    ast.USub,
    ast.Not,
    ast.And,
    ast.Or,
    *_BINOPS,
    *_CMPOPS,
)
_SYMBOLS: dict[type, str] = {
    ast.FloorDiv: "//",
    ast.MatMult: "@",
    ast.BitAnd: "&",
    ast.BitOr: "|",
    ast.BitXor: "^",
}


@dataclass(frozen=True)
class Formula:
    source: str
    tree: ast.Expression
    names: frozenset[str]


def _describe(node: ast.AST) -> str:
    if isinstance(node, ast.Attribute):
        return "attribute access (the '.' after a name)"
    if isinstance(node, ast.Subscript):
        return "indexing with [ ]"
    if isinstance(node, ast.Constant):
        return f"the value {node.value!r} (only numbers are allowed)"
    if isinstance(node, (ast.Lambda, ast.ListComp, ast.GeneratorExp, ast.SetComp, ast.DictComp)):
        return "lambdas and comprehensions"
    if isinstance(node, (ast.List, ast.Tuple, ast.Set, ast.Dict)):
        return "lists, tuples and dicts"
    if isinstance(node, ast.keyword):
        return "name=value arguments (pass plain values)"
    if type(node) in _SYMBOLS:
        return f"the {_SYMBOLS[type(node)]} operator"
    return f"this kind of syntax ({type(node).__name__})"


@lru_cache(maxsize=256)
def compile_formula(source: str) -> Formula:
    """Parse and check a formula. Raises :class:`ExpressionError` with a message meant for users."""
    text = source.strip()
    if not text:
        raise ExpressionError("the formula is empty")
    if len(text) > MAX_LENGTH:
        raise ExpressionError(f"the formula is longer than {MAX_LENGTH} characters")
    try:
        tree = ast.parse(text, mode="eval")
    except SyntaxError as e:
        col = f" near column {e.offset}" if e.offset else ""
        raise ExpressionError(f"syntax error{col}") from None
    nodes = list(ast.walk(tree))
    if len(nodes) > MAX_NODES:
        raise ExpressionError("the formula is too long")
    # Reject unsupported syntax anywhere before looking at names and calls, so
    # e.g. obj.method() reports the attribute access rather than a bad call.
    for node in nodes:
        if not isinstance(node, _ALLOWED_NODES):
            raise ExpressionError(f"can't use {_describe(node)}")
    names: set[str] = set()
    for node in nodes:
        if isinstance(node, ast.Constant):
            if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
                raise ExpressionError(f"can't use {_describe(node)}")
            if not _fits_float(node.value) or not math.isfinite(float(node.value)):
                raise ExpressionError(f"the number {node.value} is too large")
        elif isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                raise ExpressionError("only functions can be called, by name, e.g. abs(r)")
            if node.func.id not in FUNCTIONS:
                fname = node.func.id
                raise ExpressionError(
                    f"unknown function '{fname}'. Available: {', '.join(sorted(FUNCTIONS))}"
                )
            if node.keywords:
                raise ExpressionError(f"{node.func.id}() takes plain arguments, not name=value")
            _, lo, hi = FUNCTIONS[node.func.id]
            if not lo <= len(node.args) <= hi:
                want = str(lo) if lo == hi else f"{lo} to {hi}"
                raise ExpressionError(
                    f"{node.func.id}() takes {want} argument(s), got {len(node.args)}"
                )
        elif isinstance(node, ast.Name):
            if node.id in FUNCTIONS:
                # Only valid as the callee of a Call (checked above); a bare function name is an error.
                continue
            if node.id not in VARIABLES and node.id not in CONSTANTS:
                raise ExpressionError(
                    f"unknown name '{node.id}'. Use {', '.join(VARIABLES)}, pi or e"
                )
            names.add(node.id)
    _check_callees(tree)
    return Formula(text, tree, frozenset(names))


def _fits_float(v: int | float) -> bool:
    try:
        float(v)
        return True
    except OverflowError:
        return False


def _check_callees(tree: ast.AST) -> None:
    """Function names may only appear as the thing being called."""
    callees = {id(n.func) for n in ast.walk(tree) if isinstance(n, ast.Call)}
    for n in ast.walk(tree):
        if isinstance(n, ast.Name) and n.id in FUNCTIONS and id(n) not in callees:
            raise ExpressionError(f"'{n.id}' is a function: call it like {n.id}(...)")


def _eval(node: ast.AST, env: dict[str, Any]) -> Any:
    if isinstance(node, ast.Expression):
        return _eval(node.body, env)
    if isinstance(node, ast.Constant):
        return np.float32(node.value)
    if isinstance(node, ast.Name):
        return env[node.id]
    if isinstance(node, ast.BinOp):
        return _BINOPS[type(node.op)](_eval(node.left, env), _eval(node.right, env))
    if isinstance(node, ast.UnaryOp):
        v = _eval(node.operand, env)
        if isinstance(node.op, ast.USub):
            return np.negative(v)
        if isinstance(node.op, ast.Not):
            return _f(np.asarray(v) == 0)
        return v
    if isinstance(node, ast.BoolOp):
        vals = [np.asarray(_eval(v, env)) != 0 for v in node.values]
        combine = _BOOLOPS[type(node.op)]
        out = vals[0]
        for v in vals[1:]:
            out = combine(out, v)
        return _f(out)
    if isinstance(node, ast.Compare):
        left = _eval(node.left, env)
        result: Any = True
        for op, comp in zip(node.ops, node.comparators, strict=True):
            right = _eval(comp, env)
            result = np.logical_and(result, _CMPOPS[type(op)](left, right))
            left = right
        return _f(result)
    if isinstance(node, ast.IfExp):
        return _where(_eval(node.test, env), _eval(node.body, env), _eval(node.orelse, env))
    if isinstance(node, ast.Call):
        assert isinstance(node.func, ast.Name)
        fn = FUNCTIONS[node.func.id][0]
        return fn(*[_eval(a, env) for a in node.args])
    raise ExpressionError(f"can't use {_describe(node)}")  # unreachable after compile_formula


def evaluate(formulas: list[Formula], rgb: np.ndarray) -> list[np.ndarray]:
    """Evaluate formulas over an ``(H, W, 3)`` float32 image in 0..1.

    Returns one ``(H, W)`` float32 array per formula, with NaN/inf replaced and
    values clipped to 0..1.
    """
    h, w = rgb.shape[:2]
    needed = set().union(*(f.names for f in formulas))
    env: dict[str, Any] = {k: np.float32(v) for k, v in CONSTANTS.items()}
    env["r"], env["g"], env["b"] = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    env["w"], env["h"] = np.float32(w), np.float32(h)
    if "l" in needed:
        env["l"] = (0.299 * env["r"] + 0.587 * env["g"] + 0.114 * env["b"]).astype(np.float32)
    if "x" in needed:
        env["x"] = (np.arange(w, dtype=np.float32) / max(w - 1, 1))[None, :]
    if "y" in needed:
        env["y"] = (np.arange(h, dtype=np.float32) / max(h - 1, 1))[:, None]
    out = []
    with np.errstate(all="ignore"):
        for f in formulas:
            v = np.broadcast_to(np.asarray(_eval(f.tree, env), dtype=np.float32), (h, w))
            v = np.nan_to_num(v, nan=0.0, posinf=1.0, neginf=0.0)
            out.append(np.clip(v, 0.0, 1.0).astype(np.float32))
    return out
