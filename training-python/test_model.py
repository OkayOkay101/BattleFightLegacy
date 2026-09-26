import unittest

import torch

from model import TacticalPolicy


class ModelTests(unittest.TestCase):
    def test_shapes_and_legal_mask(self):
        torch.manual_seed(7)
        model = TacticalPolicy()
        observations = torch.zeros((2, 86))
        options = torch.zeros((2, 3, 17))
        mask = torch.tensor([[True, False, True], [False, True, False]])
        logits, value = model(observations, options, mask)
        self.assertEqual(tuple(logits.shape), (2, 3))
        self.assertEqual(tuple(value.shape), (2,))
        self.assertLess(logits[0, 1].item(), -1e30)
        self.assertTrue(torch.isfinite(value).all().item())


if __name__ == '__main__':
    unittest.main()
