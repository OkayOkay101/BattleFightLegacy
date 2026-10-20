"""BattleFight 3v3 tactical actor-critic policy (observation 86, option 17)."""

import torch
from torch import nn
from schema import get_schema


class TacticalPolicy(nn.Module):
    def __init__(self, schema_version=1):
        super().__init__()
        self.schema_version = schema_version
        self.schema = get_schema(schema_version)
        self.actor = nn.Sequential(nn.Linear(self.schema['actorDimensions'][0], 64), nn.ReLU(), nn.Linear(64, 64), nn.ReLU(), nn.Linear(64, 1))
        self.critic = nn.Sequential(nn.Linear(self.schema['observationCount'], 64), nn.ReLU(), nn.Linear(64, 1))

    def forward(self, observations, options, legal_mask):
        if observations.ndim != 2 or observations.shape[-1] != self.schema['observationCount']:
            raise ValueError("invalid observation dimensions")
        if options.ndim != 3 or options.shape[0] != observations.shape[0] or options.shape[-1] != self.schema['actionCount']:
            raise ValueError("invalid action dimensions")
        if legal_mask.shape != options.shape[:2]:
            raise ValueError("legal mask must match options")
        if not legal_mask.bool().any(dim=1).all() or not torch.isfinite(observations).all() or not torch.isfinite(options).all():
            raise ValueError("non-finite features or no legal actions")
        expanded = observations.unsqueeze(1).expand(-1, options.shape[1], -1)
        logits = self.actor(torch.cat((expanded, options), dim=-1)).squeeze(-1)
        logits = logits.masked_fill(~legal_mask.bool(), torch.finfo(logits.dtype).min)
        value = self.critic(observations).squeeze(-1)
        return logits, value
