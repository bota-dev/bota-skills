"""Behavior tests using disposable Git repositories; no network or credentials."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

SOURCE_BUNDLE = Path(__file__).resolve().parents[1] / "bundle"
SPEC = importlib.util.spec_from_file_location("bota_harness", SOURCE_BUNDLE / "harness.py")
harness = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(harness)


class HarnessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.repo = self.root / "consumer"
        self.repo.mkdir()
        shutil.copytree(SOURCE_BUNDLE, self.source / harness.BUNDLE_PATH,
                        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        self.git("init", "-q", "-b", "main")
        self.git("remote", "add", "origin", "https://github.com/bota-dev/bota-skills.git")
        self.commit("initial source")
        self.metadata, self.files = harness.load_source(self.source)

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.source), *args], stderr=subprocess.DEVNULL)

    def commit(self, message):
        self.git("add", "--", "engineering")
        self.git("-c", "user.name=Harness Fixture", "-c", "user.email=fixture@example.invalid",
                 "commit", "-q", "-m", message)

    def initialize(self):
        return harness.install(self.repo, self.metadata, self.files, initialize=True)

    def snapshot(self):
        return {p.relative_to(self.repo).as_posix(): p.read_bytes()
                for p in self.repo.rglob("*") if p.is_file() and not p.is_symlink()}

    def test_install_and_exact_upstream_comparison(self):
        result = self.initialize()
        self.assertEqual(result["source_commit"], self.metadata["commit"])
        self.assertEqual(len(self.metadata["commit"]), 40)
        self.assertTrue((self.repo / "scripts/bota-harness.py").is_file())
        self.assertTrue((self.repo / ".agents/skills/bota-code-change/SKILL.md").is_file())
        self.assertEqual(harness.check(self.repo, self.source), result)

    def test_existing_instructions_are_preserved(self):
        original = "# Owner rules\n\nRun existing tests. Keep release approval.\n"
        (self.repo / "AGENTS.md").write_text(original)
        self.initialize()
        self.assertEqual((self.repo / harness.LOCAL_PATH).read_text(), original)
        self.assertIn(original.strip(), (self.repo / "AGENTS.md").read_text())

    def test_two_instruction_sources_require_reconciliation(self):
        (self.repo / ".bota-harness").mkdir()
        (self.repo / harness.LOCAL_PATH).write_text("local")
        (self.repo / "AGENTS.md").write_text("existing")
        before = self.snapshot()
        with self.assertRaisesRegex(harness.HarnessError, "reconcile"):
            self.initialize()
        self.assertEqual(self.snapshot(), before)

    def test_local_edit_requires_render_and_keeps_pin(self):
        self.initialize()
        notes = self.repo / harness.LOCAL_PATH
        notes.write_text("Run npm test and preserve the preview publication guard.\n")
        with self.assertRaisesRegex(harness.HarnessError, "stale"):
            harness.check(self.repo)
        harness.render(self.repo)
        self.assertEqual(harness.check(self.repo)["source_commit"], self.metadata["commit"])
        self.assertIn("preview publication guard", (self.repo / "AGENTS.md").read_text())

    def test_direct_agents_edits_are_not_clobbered(self):
        self.initialize()
        agents = self.repo / "AGENTS.md"
        agents.write_text(agents.read_text() + "owner's local change\n")
        before = self.snapshot()
        with self.assertRaisesRegex(harness.HarnessError, "edited directly"):
            harness.render(self.repo)
        with self.assertRaisesRegex(harness.HarnessError, "edited directly"):
            harness.install(self.repo, self.metadata, self.files)
        self.assertEqual(self.snapshot(), before)

    def test_shared_file_drift_refuses_update_without_partial_writes(self):
        self.initialize()
        path = self.repo / ".agents/skills/bota-code-change/SKILL.md"
        path.write_text(path.read_text() + "local changes\n")
        before = self.snapshot()
        with self.assertRaisesRegex(harness.HarnessError, "Shared file drift"):
            harness.check(self.repo)
        with self.assertRaisesRegex(harness.HarnessError, "Shared file drift"):
            harness.install(self.repo, self.metadata, self.files)
        self.assertEqual(self.snapshot(), before)

    def test_existing_workflow_collision_is_preserved(self):
        path = self.repo / ".github/workflows/bota-harness.yml"
        path.parent.mkdir(parents=True)
        path.write_text("existing owner workflow\n")
        before = self.snapshot()
        with self.assertRaisesRegex(harness.HarnessError, "overwritten"):
            self.initialize()
        self.assertEqual(self.snapshot(), before)

    def test_existing_shared_skill_collision_is_preserved(self):
        path = self.repo / ".agents/skills/bota-code-change/owner-notes.md"
        path.parent.mkdir(parents=True)
        path.write_text("owner's notes")
        before = self.snapshot()
        with self.assertRaisesRegex(harness.HarnessError, "overwritten"):
            self.initialize()
        self.assertEqual(self.snapshot(), before)

    def test_repository_specific_skill_is_preserved(self):
        path = self.repo / ".agents/skills/bota-cli-test/SKILL.md"
        path.parent.mkdir(parents=True)
        path.write_text("local skill")
        self.initialize()
        harness.check(self.repo)
        self.assertEqual(path.read_text(), "local skill")

    def test_extra_files_inside_shared_skill_are_detected(self):
        self.initialize()
        (self.repo / ".agents/skills/bota-code-change/notes.md").write_text("local")
        with self.assertRaisesRegex(harness.HarnessError, "Unmanaged file"):
            harness.check(self.repo)

    @unittest.skipUnless(hasattr(Path, "symlink_to"), "symlinks unavailable")
    def test_symlinked_destination_is_refused_before_writes(self):
        outside = self.root / "outside"
        outside.mkdir()
        try:
            (self.repo / ".agents").symlink_to(outside, target_is_directory=True)
        except OSError:
            self.skipTest("symlink creation is unavailable")
        with self.assertRaisesRegex(harness.HarnessError, "symlink"):
            self.initialize()
        self.assertFalse((self.repo / harness.LOCK_PATH).exists())
        self.assertEqual(list(outside.iterdir()), [])

    def test_lock_target_traversal_is_refused(self):
        self.initialize()
        path = self.repo / harness.LOCK_PATH
        lock = json.loads(path.read_text())
        lock["files"][0]["target"] = "../outside"
        path.write_text(json.dumps(lock))
        with self.assertRaises(harness.HarnessError):
            harness.check(self.repo)

    def test_update_preserves_notes_and_installs_new_source(self):
        self.initialize()
        notes = (self.repo / harness.LOCAL_PATH).read_text()
        rules = self.source / harness.BUNDLE_PATH / "rules.md"
        rules.write_text(rules.read_text() + "\nUpdated reviewed guidance.\n")
        self.commit("reviewed rules update")
        metadata, files = harness.load_source(self.source)
        self.assertNotEqual(metadata["commit"], self.metadata["commit"])
        harness.install(self.repo, metadata, files)
        self.assertEqual((self.repo / harness.LOCAL_PATH).read_text(), notes)
        self.assertIn("Updated reviewed guidance", (self.repo / "AGENTS.md").read_text())
        self.assertEqual(harness.check(self.repo, self.source)["source_commit"], metadata["commit"])

    def test_removed_upstream_skill_files_are_removed(self):
        self.initialize()
        shutil.rmtree(self.source / harness.BUNDLE_PATH / "skills/bota-review-change")
        self.commit("remove a shared skill")
        metadata, files = harness.load_source(self.source)
        harness.install(self.repo, metadata, files)
        self.assertFalse((self.repo / ".agents/skills/bota-review-change/SKILL.md").exists())
        harness.check(self.repo, self.source)

    def test_missing_managed_file_is_not_silently_replaced(self):
        self.initialize()
        (self.repo / harness.COMMON_PATH).unlink()
        before = self.snapshot()
        with self.assertRaisesRegex(harness.HarnessError, "Shared file drift"):
            harness.install(self.repo, self.metadata, self.files)
        self.assertEqual(self.snapshot(), before)

    def test_source_branch_advancement_keeps_old_pin_valid(self):
        self.initialize()
        (self.source / harness.BUNDLE_PATH / "rules.md").write_text("new source rules\n")
        self.commit("advance source")
        self.assertEqual(harness.check(self.repo, self.source)["source_commit"], self.metadata["commit"])

    def test_uncommitted_source_edits_are_excluded(self):
        (self.source / harness.BUNDLE_PATH / "rules.md").write_text("uncommitted source\n")
        metadata, files = harness.load_source(self.source)
        self.assertEqual(metadata, self.metadata)
        self.assertEqual(files, self.files)

    def test_source_origin_mismatch_has_safe_error(self):
        self.git("remote", "set-url", "origin", "https://secret-synthetic-value@github.com/other/repo.git")
        with self.assertRaisesRegex(harness.HarnessError, "Source origin") as caught:
            harness.load_source(self.source)
        self.assertNotIn("secret-synthetic-value", str(caught.exception))

    def test_crlf_checkouts_compare_as_text(self):
        self.initialize()
        for path in self.repo.rglob("*"):
            if path.is_file():
                path.write_bytes(path.read_bytes().replace(b"\n", b"\r\n"))
        harness.check(self.repo, self.source)

    def test_cli_returns_nonzero_for_drift(self):
        self.initialize()
        (self.repo / harness.COMMON_PATH).write_text("drift")
        result = subprocess.run([sys.executable, str(self.repo / harness.SCRIPT_PATH), "check", "--repo", str(self.repo)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("Shared file drift", result.stderr)

    def test_wrong_operation_leaves_consumer_unchanged(self):
        before = self.snapshot()
        with self.assertRaisesRegex(harness.HarnessError, "Use init"):
            harness.install(self.repo, self.metadata, self.files)
        self.assertEqual(self.snapshot(), before)
        self.initialize()
        before = self.snapshot()
        with self.assertRaisesRegex(harness.HarnessError, "Use init"):
            self.initialize()
        self.assertEqual(self.snapshot(), before)

    def test_invalid_source_metadata_cannot_write(self):
        before = self.snapshot()
        with self.assertRaisesRegex(harness.HarnessError, "valid source"):
            harness.install(self.repo, {**self.metadata, "commit": "main"}, self.files, initialize=True)
        self.assertEqual(self.snapshot(), before)

    def test_upstream_comparison_checks_manifest_content(self):
        self.initialize()
        path = self.repo / harness.COMMON_PATH
        path.write_text("Different shared rules\n")
        lock = json.loads((self.repo / harness.LOCK_PATH).read_text())
        for item in lock["files"]:
            if item["target"] == harness.COMMON_PATH:
                item["sha256"] = harness.digest(path.read_text())
        harness.save_lock(self.repo, lock)
        harness.render(self.repo)
        harness.check(self.repo)
        with self.assertRaisesRegex(harness.HarnessError, "differs"):
            harness.check(self.repo, self.source)

    def test_skills_have_matching_names_and_interface_prompts(self):
        for skill in (SOURCE_BUNDLE / "skills").iterdir():
            if not skill.is_dir():
                continue
            content = (skill / "SKILL.md").read_text()
            self.assertTrue(content.startswith("---\n"))
            self.assertIn(f"name: {skill.name}\n", content)
            self.assertIn("description:", content.split("---", 2)[1])
            self.assertIn("$" + skill.name, (skill / "agents/openai.yaml").read_text())


if __name__ == "__main__":
    unittest.main()
