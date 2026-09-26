import json
import tempfile
import unittest
from pathlib import Path

from train import initialize, update


def decision(version, roster_hash):
    return {"playerId": "blue-1", "policyVersion": version, "rosterHash": roster_hash,
            "observation": [0.01] * 86, "options": [[0.0] * 17, [1.0] + [0.0] * 16],
            "chosenIndex": 1, "logProb": -0.69314718056, "value": 0,
            "reward": 1, "done": True, "simulatedAt": 100}


class TrainTests(unittest.TestCase):
    def test_update_persists_weights_optimizer_and_version_for_resume(self):
        with tempfile.TemporaryDirectory() as directory:
            roster_hash = "a" * 64
            first = initialize(Path(directory), roster_hash)
            self.assertEqual(first["version"], "n-000000")
            self.assertTrue(Path(first["weightsPath"]).exists())
            updated = update(Path(directory), [decision(first["version"], roster_hash)] * 8, roster_hash)
            self.assertEqual(updated["version"], "n-000001")
            self.assertTrue(Path(updated["weightsPath"]).exists())
            self.assertTrue(Path(updated["optimizerPath"]).exists())
            self.assertEqual(initialize(Path(directory), roster_hash)["version"], "n-000001")
            with self.assertRaisesRegex(ValueError, "version"):
                update(Path(directory), [decision(first["version"], roster_hash)], roster_hash)
            envelope = json.loads(Path(updated["weightsPath"]).read_text(encoding="utf-8"))
            self.assertIn("checksum", envelope)


if __name__ == "__main__":
    unittest.main()
