import importlib.util
import hashlib
import io
import tarfile
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("deploy_release.py")
SPEC = importlib.util.spec_from_file_location("deploy_release", SCRIPT)
deploy_release = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(deploy_release)


def build_archive(entries):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz") as archive:
        for name, kind, data in entries:
            info = tarfile.TarInfo(name)
            if kind == "dir":
                info.type = tarfile.DIRTYPE
                archive.addfile(info)
            elif kind == "symlink":
                info.type = tarfile.SYMTYPE
                info.linkname = data.decode()
                archive.addfile(info)
            else:
                info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
    output.seek(0)
    return output


class ReleaseArchiveTests(unittest.TestCase):
    def valid_entries(self):
        return [
            ("dist", "dir", b""),
            ("dist/index.html", "file", b"<main>ok</main>"),
            ("server", "dir", b""),
            ("server/index.mjs", "file", b"export {};"),
            ("package.json", "file", b'{"name":"app"}'),
        ]

    def test_accepts_and_extracts_expected_regular_files(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "release"
            members = deploy_release.extract_archive(build_archive(self.valid_entries()), target)
            self.assertEqual(len(members), 5)
            self.assertEqual((target / "dist/index.html").read_bytes(), b"<main>ok</main>")
            self.assertEqual((target / "server/index.mjs").read_bytes(), b"export {};")

    def test_rejects_path_traversal_before_extracting(self):
        entries = self.valid_entries() + [("dist/../../etc/cron.d/pwn", "file", b"bad")]
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "release"
            with self.assertRaises(deploy_release.ArchiveValidationError):
                deploy_release.extract_archive(build_archive(entries), target)
            self.assertFalse(target.exists())

    def test_rejects_symlinks(self):
        entries = self.valid_entries() + [("server/escape", "symlink", b"/etc/passwd")]
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(deploy_release.ArchiveValidationError):
                deploy_release.extract_archive(build_archive(entries), Path(temp) / "release")

    def test_rejects_unexpected_top_level_paths(self):
        entries = self.valid_entries() + [(".env", "file", b"never deploy")]
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(deploy_release.ArchiveValidationError):
                deploy_release.extract_archive(build_archive(entries), Path(temp) / "release")

    def test_requires_runtime_entrypoints(self):
        entries = [
            ("dist/index.html", "file", b"ok"),
            ("server/index.mjs", "file", b"ok"),
        ]
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(deploy_release.ArchiveValidationError):
                deploy_release.extract_archive(build_archive(entries), Path(temp) / "release")

    def test_request_checks_commit_checksum_and_archive_size(self):
        archive = build_archive(self.valid_entries()).read()
        commit = "a" * 40
        digest = hashlib.sha256(archive).hexdigest()
        request = io.BytesIO(f"{commit}\n{digest}\n".encode() + archive)
        parsed_commit, parsed_digest, parsed_archive = deploy_release.read_request(request)
        self.assertEqual(parsed_commit, commit)
        self.assertEqual(parsed_digest, digest)
        self.assertEqual(parsed_archive, archive)

        bad_request = io.BytesIO(f"{commit}\n{'0' * 64}\n".encode() + archive)
        with self.assertRaises(deploy_release.DeploymentError):
            deploy_release.read_request(bad_request)


if __name__ == "__main__":
    unittest.main()
