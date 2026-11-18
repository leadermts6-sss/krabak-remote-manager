#!/usr/bin/env python3
"""Restricted root-side receiver for one validated KRABAK app release."""

from __future__ import annotations

import hashlib
import hmac
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.request
from pathlib import Path, PurePosixPath


APP_ROOT = Path("/opt/krabak-remote-manager")
RELEASE_ROOT = APP_ROOT / "releases"
CURRENT = APP_ROOT / "current"
UPLOAD_LIMIT = 50 * 1024 * 1024
FILE_LIMIT = 32 * 1024 * 1024
TOTAL_FILE_LIMIT = 100 * 1024 * 1024
MEMBER_LIMIT = 5000
SERVICE = "krabak-remote.service"
HEALTH_URL = "http://127.0.0.1:8787/api/status"
SHA_RE = re.compile(r"\A[0-9a-f]{40}\Z")
CHECKSUM_RE = re.compile(r"\A[0-9a-f]{64}\Z")
REQUIRED_FILES = {"dist/index.html", "server/index.mjs", "package.json"}


class ArchiveValidationError(ValueError):
    """The release archive is outside the deploy wrapper's narrow contract."""


class DeploymentError(RuntimeError):
    """A release failed to activate or become healthy."""


def _member_parts(member: tarfile.TarInfo) -> tuple[str, ...]:
    raw_name = member.name
    if not raw_name or "\x00" in raw_name or "\\" in raw_name or raw_name.startswith("/"):
        raise ArchiveValidationError("unsafe archive path")
    name = raw_name
    if member.isdir() and name.endswith("/"):
        name = name[:-1]
    parts = tuple(name.split("/"))
    if not parts or any(part in ("", ".", "..") or part.startswith(".") for part in parts):
        raise ArchiveValidationError("unsafe archive path")

    if parts[0] == "package.json":
        if len(parts) != 1 or not member.isfile():
            raise ArchiveValidationError("unexpected package manifest entry")
    elif parts[0] in ("dist", "server"):
        if len(parts) < 2 and not member.isdir():
            raise ArchiveValidationError("unexpected app entry")
    else:
        raise ArchiveValidationError("unexpected archive root")

    if not (member.isfile() or member.isdir()):
        raise ArchiveValidationError("non-regular archive entry")
    if member.size < 0 or member.size > FILE_LIMIT:
        raise ArchiveValidationError("archive member size is outside limits")
    return parts


def validate_members(members: list[tarfile.TarInfo]) -> list[tuple[tarfile.TarInfo, tuple[str, ...]]]:
    if not members or len(members) > MEMBER_LIMIT:
        raise ArchiveValidationError("archive member count is outside limits")

    normalized: list[tuple[tarfile.TarInfo, tuple[str, ...]]] = []
    seen: dict[tuple[str, ...], bool] = {}
    total_size = 0
    for member in members:
        parts = _member_parts(member)
        if parts in seen:
            raise ArchiveValidationError("duplicate archive path")
        seen[parts] = member.isdir()
        total_size += member.size
        if total_size > TOTAL_FILE_LIMIT:
            raise ArchiveValidationError("archive expanded size is outside limits")
        normalized.append((member, parts))

    for _, parts in normalized:
        for end in range(1, len(parts)):
            parent = parts[:end]
            if parent in seen and not seen[parent]:
                raise ArchiveValidationError("archive file is used as a directory")

    files = {"/".join(parts) for member, parts in normalized if member.isfile()}
    if not REQUIRED_FILES.issubset(files):
        raise ArchiveValidationError("required runtime entrypoint is missing")
    return normalized


def extract_archive(archive_file: io.BufferedIOBase, destination: Path) -> list[tarfile.TarInfo]:
    """Validate every path and file type before writing any archive content."""
    try:
        with tarfile.open(fileobj=archive_file, mode="r:gz") as archive:
            members = archive.getmembers()
            validated = validate_members(members)
            if destination.exists() or destination.is_symlink():
                raise ArchiveValidationError("staging path already exists")
            destination.mkdir(mode=0o755, parents=False)
            try:
                for member, parts in validated:
                    target = destination.joinpath(*parts)
                    if member.isdir():
                        target.mkdir(parents=True, exist_ok=True)
                        target.chmod(0o755)
                        continue
                    target.parent.mkdir(parents=True, exist_ok=True)
                    stream = archive.extractfile(member)
                    if stream is None:
                        raise ArchiveValidationError("archive file cannot be read")
                    with stream, target.open("xb") as output:
                        shutil.copyfileobj(stream, output, length=1024 * 1024)
                    target.chmod(0o644)
                for directory in sorted((p for p in destination.rglob("*") if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
                    directory.chmod(0o755)
                destination.chmod(0o755)
            except Exception:
                shutil.rmtree(destination, ignore_errors=True)
                raise
            return members
    except (tarfile.TarError, OSError) as error:
        if isinstance(error, ArchiveValidationError):
            raise
        raise ArchiveValidationError("archive format or extraction error") from error


def _read_line(stream: io.BufferedReader) -> str:
    line = stream.readline(128)
    if not line.endswith(b"\n"):
        raise DeploymentError("deploy header is incomplete")
    try:
        return line[:-1].decode("ascii")
    except UnicodeDecodeError as error:
        raise DeploymentError("deploy header is invalid") from error


def read_request(stream: io.BufferedReader) -> tuple[str, str, bytes]:
    commit = _read_line(stream)
    expected_digest = _read_line(stream)
    if not SHA_RE.fullmatch(commit) or not CHECKSUM_RE.fullmatch(expected_digest):
        raise DeploymentError("deploy header is invalid")
    archive = stream.read(UPLOAD_LIMIT + 1)
    if not archive or len(archive) > UPLOAD_LIMIT:
        raise DeploymentError("release archive size is outside limits")
    actual_digest = hashlib.sha256(archive).hexdigest()
    if not hmac.compare_digest(actual_digest, expected_digest):
        raise DeploymentError("release checksum did not match")
    return commit, actual_digest, archive


def _health_check(timeout_seconds: int = 30) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        try:
            request = urllib.request.Request(HEALTH_URL, headers={"Connection": "close"})
            with urllib.request.urlopen(request, timeout=2) as response:
                payload = json.loads(response.read(16 * 1024))
            if payload.get("ok") is True and payload.get("initialised") is True:
                return True
        except Exception:
            pass
        time.sleep(1)
    return False


def _run_systemctl(action: str) -> None:
    result = subprocess.run(
        ["/usr/bin/systemctl", action, SERVICE],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
        timeout=45,
    )
    if result.returncode != 0:
        raise DeploymentError("service operation failed")


def _current_target() -> Path:
    if not CURRENT.is_symlink():
        raise DeploymentError("release layout is not prepared")
    target = (APP_ROOT / os.readlink(CURRENT)).resolve(strict=True)
    if target.parent != RELEASE_ROOT.resolve(strict=True) or not target.is_dir():
        raise DeploymentError("active release path is invalid")
    return target


def _switch_current(target: Path) -> None:
    link = APP_ROOT / f".current-{os.getpid()}"
    try:
        link.symlink_to(os.path.relpath(target, APP_ROOT), target_is_directory=True)
        os.replace(link, CURRENT)
    finally:
        if link.is_symlink():
            link.unlink()


def _prune_releases(active: Path, previous: Path) -> None:
    releases = [p for p in RELEASE_ROOT.iterdir() if p.is_dir() and not p.is_symlink()]
    releases.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    keep = {active.resolve(), previous.resolve()}
    keep.update(p.resolve() for p in releases[:5])
    for release in releases:
        if release.resolve() not in keep:
            shutil.rmtree(release)


def deploy(commit: str, digest: str, archive: bytes) -> None:
    if not SHA_RE.fullmatch(commit) or not CHECKSUM_RE.fullmatch(digest):
        raise DeploymentError("deploy identifiers are invalid")
    APP_ROOT.mkdir(mode=0o755, parents=True, exist_ok=True)
    RELEASE_ROOT.mkdir(mode=0o755, parents=True, exist_ok=True)
    previous = _current_target()
    final = RELEASE_ROOT / commit
    stage: Path | None = None
    if final.exists():
        marker = final / ".release-sha256"
        if not marker.is_file() or marker.read_text("ascii").strip() != digest:
            raise DeploymentError("release commit already exists with different content")
    else:
        stage = RELEASE_ROOT / f".{commit}.staging-{os.getpid()}"
        if stage.exists() or stage.is_symlink():
            raise DeploymentError("staging path already exists")
        try:
            extract_archive(io.BytesIO(archive), stage)
            (stage / ".release-sha256").write_text(digest + "\n", encoding="ascii")
            for path in (p for p in stage.rglob("*") if p.is_file()):
                path.chmod(0o644)
            for path in sorted((p for p in stage.rglob("*") if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
                path.chmod(0o755)
            stage.chmod(0o755)
            os.replace(stage, final)
            stage = None
        except Exception:
            if stage is not None:
                shutil.rmtree(stage, ignore_errors=True)
            raise

    _switch_current(final)
    try:
        _run_systemctl("restart")
        if not _health_check():
            raise DeploymentError("new release did not become healthy")
    except Exception as original_error:
        _switch_current(previous)
        try:
            _run_systemctl("restart")
            restored = _health_check()
        except Exception:
            restored = False
        if restored:
            raise DeploymentError("new release failed; previous release restored") from original_error
        raise DeploymentError("deployment and automatic rollback both failed") from original_error

    _prune_releases(final, previous)
    print(f"DEPLOYMENT_SHA={commit} STATUS=healthy")


def main() -> int:
    if os.geteuid() != 0 or len(sys.argv) != 1:
        print("DEPLOY_FAILED=invalid_invocation", file=sys.stderr)
        return 64
    try:
        commit, digest, archive = read_request(sys.stdin.buffer)
        deploy(commit, digest, archive)
        return 0
    except (DeploymentError, ArchiveValidationError):
        print("DEPLOY_FAILED=validation_or_health_check", file=sys.stderr)
        return 1
    except Exception:
        print("DEPLOY_FAILED=internal_error", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
