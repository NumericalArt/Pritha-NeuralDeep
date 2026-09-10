"""Small runtime compatibility shims for Pritha Python scripts."""

import json
import os
import re
from pathlib import Path


def _load_path_env_file(file):
    """Read path configuration only, without importing credentials or shell code."""
    try:
        lines = Path(file).read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return
    for line in lines:
        match = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", line.strip())
        if not match:
            continue
        key, value = match.groups()
        if key not in {"TECHSCOPE_ROOT", "PRITHA_STATE_ROOT"} or key in os.environ:
            continue
        value = re.sub(r"^[\"']|[\"']$", "", value.strip())
        os.environ[key] = value


def load_pritha_runtime_env(root=None):
    """Match Node's env-first, first-file-wins path selection before ML imports."""
    selected = Path(root or os.environ.get("TECHSCOPE_ROOT") or Path(__file__).resolve().parent.parent).resolve()
    _load_path_env_file(selected / ".env")
    _load_path_env_file(selected / ".env.local")
    code_root = Path(os.environ.get("TECHSCOPE_ROOT") or selected).resolve()
    pointer = code_root / ".pritha-instance.json"
    if "PRITHA_STATE_ROOT" not in os.environ and pointer.exists():
        config = json.loads(pointer.read_text(encoding="utf-8"))
        os.environ["PRITHA_STATE_ROOT"] = config["stateRoot"]
    state_root = Path(os.environ.get("PRITHA_STATE_ROOT") or code_root).resolve()
    if state_root != code_root:
        _load_path_env_file(state_root / "config" / "runtime.env")
    # Process values cannot be replaced by a runtime file; return the final paths.
    return (Path(os.environ.get("TECHSCOPE_ROOT") or code_root).resolve(),
            Path(os.environ.get("PRITHA_STATE_ROOT") or code_root).resolve())


def apply_runtime_compat():
    """Patch optional dependency incompatibilities before heavy ML imports."""
    try:
        import urllib3.util.ssl_ as urllib3_ssl
    except Exception:
        return

    if not hasattr(urllib3_ssl, "DEFAULT_CIPHERS"):
        urllib3_ssl.DEFAULT_CIPHERS = (
            "ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:"
            "ECDH+AESGCM:DH+AESGCM:ECDH+AES:DH+AES:RSA+AESGCM:"
            "RSA+AES:!aNULL:!eNULL:!MD5:!DSS"
        )
