"""BattleFight 3v3 tactical actor-critic policy (observation 86, option 17)."""

import torch
from torch import nn


class TacticalPolicy(nn.Module):
    def __init__(self):
        super().__init__()
        self.actor = nn.Sequential(nn.Linear(103, 64), nn.ReLU(), nn.Linear(64, 64), nn.ReLU(), nn.Linear(64, 1))
        self.critic = nn.Sequential(nn.Linear(86, 64), nn.ReLU(), nn.Linear(64, 1))

    def forward(self, observations, options, legal_mask):
        if observations.ndim != 2 or observations.shape[-1] != 86:
            raise ValueError("expected observations [batch,86]")
        if options.ndim != 3 or options.shape[0] != observations.shape[0] or options.shape[-1] != 17:
            raise ValueError("expected options [batch,options,17]")
        if legal_mask.shape != options.shape[:2]:
            raise ValueError("legal mask must match options")
        expanded = observations.unsqueeze(1).expand(-1, options.shape[1], -1)
        logits = self.actor(torch.cat((expanded, options), dim=-1)).squeeze(-1)
        logits = logits.masked_fill(~legal_mask.bool(), torch.finfo(logits.dtype).min)
        value = self.critic(observations).squeeze(-1)
        return logits, value
