"""Optional Python checks for the standalone EPD research helper."""
import hashlib
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import numpy as np
from scipy.special import expit

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/analysis/epd-material-audit.py"
spec = importlib.util.spec_from_file_location("epd_audit", SCRIPT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class EpdAuditTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.file = Path(self.directory.name) / "positions.epd"

    def row(self, game="a", result="1-0", turn="w", hm=1):
        return f"4k3/8/8/8/8/8/P7/4KQ2 {turn} - - 0 1;variant chess;hmvc {hm};result {result};game {game}\n"

    def test_global_game_grouping_draws_and_unit_weights(self):
        text = self.row() + self.row("b", "1/2-1/2") + self.row(turn="b") + self.row(hm=0)
        self.file.write_text(text, encoding="utf-8")
        rows, metadata = audit.load(self.file)
        self.assertEqual(metadata["games"], 2)
        self.assertEqual(metadata["sha256"], hashlib.sha256(self.file.read_bytes()).hexdigest())
        self.assertEqual(rows[2]["original_x"][0], -1)
        self.assertEqual(rows[2]["original_y"], 0)
        eligible, groups, _, labels, weights, ids = audit.prepare(rows)
        self.assertEqual(len(eligible), 3)
        self.assertIn(0.5, labels)
        for index in range(len(groups)):
            self.assertAlmostEqual(float(weights[ids == index].sum()), 1)

    def test_conflicting_labels_and_duplicate_annotations_reject(self):
        self.file.write_text(self.row() + self.row(result="0-1"), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            audit.load(self.file)
        self.file.write_text(self.row().strip() + ";result 0-1\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "repeated annotation"):
            audit.load(self.file)

    def test_invalid_board_and_unlabelled_book_reject(self):
        for text in [self.row().replace("KQ2", "KX2"), self.row().replace("P7", "P8"),
                     self.row().replace("4k3", "8"), self.row().split(";")[0] + ";\n"]:
            self.file.write_text(text, encoding="utf-8")
            with self.assertRaises(ValueError):
                audit.load(self.file)

    def test_fractional_fit_recovers_effects_and_repeated_rows_preserve_weights(self):
        rng = np.random.default_rng(8)
        features = rng.normal(size=(300, 2))
        expected = np.array([0.5, 1.2])
        labels = expit(features @ expected + 0.1)
        slopes, intercept, converged, _ = audit.fit(features, labels, np.ones(300))
        self.assertTrue(converged)
        np.testing.assert_allclose(slopes, expected, atol=0.03)
        self.assertAlmostEqual(intercept, 0.1, delta=0.01)
        repeated = audit.fit(np.repeat(features, 3, axis=0), np.repeat(labels, 3), np.ones(900) / 3)
        np.testing.assert_allclose(repeated[0], slopes, atol=1e-10)
        self.assertAlmostEqual(repeated[1], intercept, places=10)

    def test_existing_output_rejects_before_input_read(self):
        output = Path(self.directory.name) / "keep.json"
        output.write_text("keep", encoding="utf-8")
        result = subprocess.run([sys.executable, str(SCRIPT), "missing.epd", "--out", str(output)],
                                capture_output=True, text=True, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("existing output is never replaced", result.stderr)
        self.assertEqual(output.read_text(), "keep")

    def test_game_bootstrap_recomputes_the_pawn_denominator(self):
        rng = np.random.default_rng(3)
        rows = []
        for index in range(40):
            label = index % 2
            features = rng.normal(size=6)
            features[0] = (1 if label else -1) + rng.uniform(-0.4, 0.4)
            features[5] = 0
            rows.append({"game": str(index), "hm": 1, "y": label,
                         "original_x": features.tolist(), "original_y": label})
        result = audit.reference_game_bootstrap(rows, count=8, seed=42)
        self.assertEqual(result["completed"], 8)
        self.assertEqual(result["ratios"]["P"]["std"], 0)
        self.assertEqual(result["ratios"]["P"]["lower"], 1)
        self.assertEqual(result["ratios"]["P"]["upper"], 1)


if __name__ == "__main__":
    unittest.main()
