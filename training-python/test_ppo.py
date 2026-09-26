import math
import unittest

import torch

from model import TacticalPolicy
from ppo import train_batch


class PpoTests(unittest.TestCase):
    def test_tiny_batch_updates_finite_policy_without_mixing_versions(self):
        torch.manual_seed(3)
        model = TacticalPolicy()
        optimizer = torch.optim.Adam(model.parameters(), lr=3e-4)
        row = {
            "playerId": "blue-1", "policyVersion": "n1", "rosterHash": "roster",
            "observation": [0.01] * 86,
            "options": [[0.0] * 17, [1.0] + [0.0] * 16],
            "chosenIndex": 1, "logProb": -math.log(2), "value": 0,
            "reward": 1, "done": True, "simulatedAt": 100,
        }
        before = model.actor[0].weight.detach().clone()
        metrics = train_batch(model, optimizer, [row] * 8, epochs=2)
        self.assertTrue(math.isfinite(metrics["loss"]))
        self.assertFalse(torch.equal(before, model.actor[0].weight))
        with self.assertRaisesRegex(ValueError, "version"):
            train_batch(model, optimizer, [row, {**row, "policyVersion": "n2"}])


if __name__ == "__main__":
    unittest.main()
