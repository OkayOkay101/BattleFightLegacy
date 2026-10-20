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


def export(model, roster_hash, *, environment_hash=None, protocol_version=2, parent_version=None):
    payload = {
        "schemaVersion": model.schema_version,
        "observationSchemaVersion": model.schema_version,
        "rosterHash": roster_hash,
        "actor": export_layers(model.actor),
        "critic": export_layers(model.critic),
    }
    if model.schema_version >= 2:
        if not environment_hash or protocol_version != 2:
            raise ValueError('Neural requires environment and protocol metadata')
        payload.update(actionSchemaVersion=model.schema_version, schemaHash=model.schema['schemaHash'],
                       environmentHash=environment_hash, trainingProtocolVersion=protocol_version,
                       parentVersion=parent_version)
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return {"payload": serialized, "checksum": hashlib.sha256(serialized.encode()).hexdigest()}


def golden(model):
    observation = [math.sin(index) * 0.1 for index in range(model.schema['observationCount'])]
    actions = [[math.cos(index + action) * 0.1 for index in range(model.schema['actionCount'])] for action in range(2)]
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
    parser.add_argument("--schema-version", type=int, default=1)
    parser.add_argument("--environment-hash")
    parser.add_argument("--protocol-version", type=int, default=2)
    args = parser.parse_args()
    torch.manual_seed(7)
    model = TacticalPolicy(args.schema_version)
    parent_version = None
    if args.checkpoint:
        checkpoint = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
        model.load_state_dict(checkpoint.get('model', checkpoint))
        parent_version = checkpoint.get('parentVersion')
    model.eval()
    for output in (args.out, args.golden_out):
        Path(output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(export(model, args.roster_hash,
        environment_hash=args.environment_hash, protocol_version=args.protocol_version,
        parent_version=parent_version)), encoding="utf-8")
    Path(args.golden_out).write_text(json.dumps(golden(model)), encoding="utf-8")


if __name__ == "__main__":
    main()
