"""Masked PPO update for version-homogeneous BattleFight decisions."""

import math

import torch
from torch.distributions import Categorical


def _advantages(rows, gamma=0.99, gae_lambda=0.95):
    by_player = {}
    for index, row in enumerate(rows):
        by_player.setdefault(row["playerId"], []).append(index)
    advantages = [0.0] * len(rows)
    returns = [0.0] * len(rows)
    for indices in by_player.values():
        next_advantage = 0.0
        next_value = 0.0
        for index in reversed(indices):
            row = rows[index]
            continuation = 0.0 if row["done"] else 1.0
            delta = row["reward"] + gamma * next_value * continuation - row["value"]
            next_advantage = delta + gamma * gae_lambda * continuation * next_advantage
            advantages[index] = next_advantage
            returns[index] = next_advantage + row["value"]
            next_value = row["value"]
    return advantages, returns


def train_batch(model, optimizer, rows, *, epochs=4, minibatch_size=1024):
    if not rows:
        raise ValueError("empty trajectory batch")
    if len({row["policyVersion"] for row in rows}) != 1:
        raise ValueError("mixed policy versions in trajectory batch")
    if len({row["rosterHash"] for row in rows}) != 1:
        raise ValueError("mixed roster hashes in trajectory batch")
    def get_obs(r):
        return r.get("observation") or r.get("observation86") or r.get("observation82")

    def get_opts(r):
        return r.get("options") or r.get("options17") or r.get("options13")

    if any(len(get_obs(row) or []) != 86 or not 1 <= len(get_opts(row) or []) <= 16 or
           any(len(option) != 17 for option in get_opts(row)) or
           not 0 <= row["chosenIndex"] < len(get_opts(row)) or
           not all(math.isfinite(float(row[key])) for key in ("logProb", "value", "reward"))
           for row in rows):
        raise ValueError("invalid trajectory dimensions or values")

    count = len(rows)
    option_count = max(len(get_opts(row)) for row in rows)
    observations = torch.tensor([get_obs(row) for row in rows], dtype=torch.float32)
    options = torch.zeros((count, option_count, 17), dtype=torch.float32)
    legal_mask = torch.zeros((count, option_count), dtype=torch.bool)
    for index, row in enumerate(rows):
        opts = get_opts(row)
        width = len(opts)
        options[index, :width] = torch.tensor(opts, dtype=torch.float32)
        legal_mask[index, :width] = True
    actions = torch.tensor([row["chosenIndex"] for row in rows], dtype=torch.long)
    old_log_probs = torch.tensor([row["logProb"] for row in rows], dtype=torch.float32)
    advantages, returns = _advantages(rows)
    advantage = torch.tensor(advantages, dtype=torch.float32)
    target_value = torch.tensor(returns, dtype=torch.float32)
    if count > 1 and advantage.std(unbiased=False) > 1e-8:
        advantage = (advantage - advantage.mean()) / (advantage.std(unbiased=False) + 1e-8)

    metrics = None
    model.train()
    for _ in range(epochs):
        for start in range(0, count, minibatch_size):
            indices = torch.arange(start, min(start + minibatch_size, count))
            logits, values = model(observations[indices], options[indices], legal_mask[indices])
            distribution = Categorical(logits=logits)
            new_log_probs = distribution.log_prob(actions[indices])
            ratio = torch.exp(new_log_probs - old_log_probs[indices])
            policy_loss = -torch.minimum(ratio * advantage[indices],
                                         torch.clamp(ratio, 0.8, 1.2) * advantage[indices]).mean()
            value_loss = torch.nn.functional.mse_loss(values, target_value[indices])
            entropy = distribution.entropy().mean()
            loss = policy_loss + 0.5 * value_loss - 0.01 * entropy
            if not torch.isfinite(loss):
                raise ValueError("non-finite PPO loss")
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 0.5)
            optimizer.step()
            metrics = {"loss": float(loss.detach()), "policyLoss": float(policy_loss.detach()),
                       "valueLoss": float(value_loss.detach()), "entropy": float(entropy.detach()),
                       "decisions": count}
    model.eval()
    return metrics
