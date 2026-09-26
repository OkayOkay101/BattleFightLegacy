"""Export PyTorch weights to checksum-sealed JSON for pure Node inference."""

import argparse
import hashlib
import json
import math
from pathlib import Path

import torch

from model import TacticalPolicy


def export_layers(sequence):
    layers = []
    for layer in sequence:
        if isinstance(layer, torch.nn.Linear):
            rows, cols = layer.weight.shape
            layers.append({
                "rows": rows,
                "cols": cols,
                "weights": layer.weight.detach().cpu().contiguous().view(-1).tolist(),
                "bias": layer.bias.detach().cpu().tolist(),
            })
    return layers


def export(model, roster_hash):
    payload = {
        "schemaVersion": 1,
        "observationSchemaVersion": 1,
        "rosterHash": roster_hash,
        "actor": export_layers(model.actor),
        "critic": export_layers(model.critic),
    }
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return {"payload": serialized, "checksum": hashlib.sha256(serialized.encode()).hexdigest()}


def golden(model):
    observation = [math.sin(index) * 0.1 for index in range(86)]
    actions = [[math.cos(index + action) * 0.1 for index in range(17)] for action in range(2)]
    with torch.no_grad():
        logits, value = model(torch.tensor([observation], dtype=torch.float32),
                              torch.tensor([actions], dtype=torch.float32),
                              torch.tensor([[True, True]]))
    return {"observation": observation, "actions": actions,
            "logits": logits[0].tolist(), "value": value[0].item()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--roster-hash", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--golden-out", required=True)
    parser.add_argument("--checkpoint")
    args = parser.parse_args()
    torch.manual_seed(7)
    model = TacticalPolicy()
    if args.checkpoint:
        model.load_state_dict(torch.load(args.checkpoint, map_location="cpu", weights_only=True))
    model.eval()
    for output in (args.out, args.golden_out):
        Path(output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(export(model, args.roster_hash)), encoding="utf-8")
    Path(args.golden_out).write_text(json.dumps(golden(model)), encoding="utf-8")


if __name__ == "__main__":
    main()
