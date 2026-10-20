"""Masked PPO updates with schema-specific episode and credit assignment."""
import math
import torch
from torch.distributions import Categorical
from schema import get_schema


def _advantages(rows, gamma=None, gae_lambda=0.95, *, schema_version=1):
    gamma = gamma if gamma is not None else (0.999 if schema_version >= 2 else 0.99)
    by_player = {}
    for index, row in enumerate(rows):
        key = (row['matchId'], row['playerId']) if schema_version >= 2 else row['playerId']
        by_player.setdefault(key, []).append(index)
    advantages, returns = [0.0] * len(rows), [0.0] * len(rows)
    for indices in by_player.values():
        if schema_version >= 2:
            indices.sort(key=lambda index: rows[index]['simulatedAt'])
        next_advantage, next_value = 0.0, 0.0
        for index in reversed(indices):
            row = rows[index]
            steps = (row['nextSimulatedAt'] - row['simulatedAt']) / 100.0 if schema_version >= 2 else 1.0
            if steps < 0 or not math.isfinite(steps):
                raise ValueError('invalid trajectory duration')
            discount, trace_discount = gamma ** steps, gae_lambda ** steps
            continuation = 0.0 if row['done'] else 1.0
            delta = row['reward'] + discount * next_value * continuation - row['value']
            next_advantage = delta + discount * trace_discount * continuation * next_advantage
            advantages[index], returns[index] = next_advantage, next_advantage + row['value']
            next_value = row['value']
    return advantages, returns


def train_batch(model, optimizer, rows, *, epochs=4, minibatch_size=1024, target_kl=0.02):
    if not rows:
        raise ValueError('empty trajectory batch')
    version = model.schema_version
    schema = get_schema(version)
    for key in ['policyVersion', 'rosterHash'] + (['schemaVersion', 'schemaHash', 'environmentHash', 'trainingProtocolVersion'] if version >= 2 else []):
        if any(key not in row for row in rows) or len({row.get(key) for row in rows}) != 1:
            raise ValueError(f'mixed or missing {key} (policy version or metadata) in trajectory batch')
    if version >= 2 and (rows[0]['schemaVersion'] != version or rows[0]['schemaHash'] != schema['schemaHash'] or not rows[0]['environmentHash'] or rows[0]['trainingProtocolVersion'] != 2):
        raise ValueError('incompatible schema/environment/protocol metadata')
    def get_obs(row):
        return row.get('observation') or row.get('observation86') or row.get('observation82')
    def get_opts(row):
        return row.get('options') or row.get('options17') or row.get('options13')
    for row in rows:
        obs, opts = get_obs(row), get_opts(row)
        if (len(obs or []) != schema['observationCount'] or not 1 <= len(opts or []) <= schema['maxOptions'] or
            any(len(option) != schema['actionCount'] for option in opts) or
            not isinstance(row.get('chosenIndex'), int) or not 0 <= row['chosenIndex'] < len(opts) or
            not all(math.isfinite(float(value)) for value in obs + [item for option in opts for item in option] + [row.get(key, float('nan')) for key in ('logProb', 'value', 'reward')])):
            raise ValueError('invalid trajectory dimensions or values')
        if version >= 2:
            required = ['matchId', 'lifeId', 'teamId', 'potential', 'requestedAction', 'executedAction', 'overrideReasons', 'simulatedAt', 'nextSimulatedAt']
            if any(key not in row for key in required) or not all(math.isfinite(float(row[key])) for key in ['potential', 'simulatedAt', 'nextSimulatedAt']) or row['nextSimulatedAt'] < row['simulatedAt']:
                raise ValueError('missing neural trajectory metadata or invalid duration values')
    count, option_count = len(rows), max(len(get_opts(row)) for row in rows)
    observations = torch.tensor([get_obs(row) for row in rows], dtype=torch.float32)
    options = torch.zeros((count, option_count, schema['actionCount']), dtype=torch.float32)
    legal_mask = torch.zeros((count, option_count), dtype=torch.bool)
    for index, row in enumerate(rows):
        width = len(get_opts(row))
        options[index, :width] = torch.tensor(get_opts(row), dtype=torch.float32)
        legal_mask[index, :width] = True
    actor_mask = legal_mask.sum(dim=1) > 1 if version >= 2 else torch.ones(count,dtype=torch.bool)
    actions = torch.tensor([row['chosenIndex'] for row in rows], dtype=torch.long)
    old_log_probs = torch.tensor([row['logProb'] for row in rows], dtype=torch.float32)
    advantages, returns = _advantages(rows, schema_version=version)
    advantage, target_value = torch.tensor(advantages,dtype=torch.float32), torch.tensor(returns,dtype=torch.float32)
    normalization = advantage[actor_mask]
    if len(normalization) > 1 and normalization.std(unbiased=False) > 1e-8:
        advantage = (advantage - normalization.mean()) / (normalization.std(unbiased=False) + 1e-8)
    totals = {key:0.0 for key in ['loss','policyLoss','valueLoss','entropy','approxKL','clipFraction']}
    sample_weight, actor_weight, updates, stopped, stopping_kl = 0, 0, 0, False, None
    model.train()
    for epoch in range(epochs):
        order = torch.randperm(count) if version >= 2 else torch.arange(count)
        for start in range(0,count,minibatch_size):
            indices = order[start:start+minibatch_size]
            logits, values = model(observations[indices],options[indices],legal_mask[indices])
            distribution = Categorical(logits=logits)
            active = actor_mask[indices]
            new_log_probs = distribution.log_prob(actions[indices])
            log_ratio = new_log_probs - old_log_probs[indices]
            ratio = torch.exp(log_ratio)
            if active.any():
                policy_loss = -torch.minimum(ratio[active]*advantage[indices][active], torch.clamp(ratio[active],0.8,1.2)*advantage[indices][active]).mean()
                entropy = distribution.entropy()[active].mean()
                approx_kl = ((ratio[active]-1)-log_ratio[active]).mean()
                clip_fraction = ((ratio[active]-1).abs()>0.2).float().mean()
            else:
                policy_loss = torch.tensor(0.0); entropy = torch.tensor(0.0)
                approx_kl = torch.tensor(0.0); clip_fraction = torch.tensor(0.0)
            if version >= 2 and approx_kl.detach().item() > target_kl:
                stopped = True
                stopping_kl = float(approx_kl.detach())
                break
            value_loss = torch.nn.functional.mse_loss(values,target_value[indices])
            loss = policy_loss + 0.5*value_loss - 0.01*entropy
            if not torch.isfinite(loss): raise ValueError('non-finite PPO loss')
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(),0.5)
            optimizer.step()
            width, actors = len(indices), int(active.sum())
            sample_weight += width; actor_weight += actors; updates += 1
            for key,value in [('loss',loss),('valueLoss',value_loss)]: totals[key] += float(value.detach())*width
            for key,value in [('policyLoss',policy_loss),('entropy',entropy),('approxKL',approx_kl),('clipFraction',clip_fraction)]: totals[key] += float(value.detach())*actors
        if stopped: break
    model.eval()
    metrics = {key:total/max(1,sample_weight if key in ['loss','valueLoss'] else actor_weight) for key,total in totals.items()}
    metrics.update(decisions=count, actorDecisions=int(actor_mask.sum()), updates=updates, earlyStopped=stopped, epochsCompleted=epoch+(0 if stopped else 1), targetKL=target_kl)
    metrics['stoppingKL'] = stopping_kl
    if not updates and stopping_kl is not None:
        metrics['approxKL'] = stopping_kl
    return metrics
