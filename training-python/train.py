"""Persistent, single-writer PPO optimizer for BattleFight self-play."""

import argparse
import json
import os
import uuid
from pathlib import Path

import torch

from export_model import export
from model import TacticalPolicy
from ppo import train_batch


def _atomic_text(path, text):
    temporary = path.with_name(path.name + f".{uuid.uuid4().hex}.tmp")
    temporary.write_text(text, encoding="utf-8")
    os.replace(temporary, path)


def _save(data_dir, version, roster_hash, model, optimizer, metrics=None):
    weights_path = data_dir / f"weights-{version}.json"
    optimizer_path = data_dir / f"optimizer-{version}.pt"
    temporary = optimizer_path.with_name(optimizer_path.name + f".{uuid.uuid4().hex}.tmp")
    torch.save({"version": version, "rosterHash": roster_hash,
                "model": model.state_dict(), "optimizer": optimizer.state_dict(),
                "torchRng": torch.get_rng_state()}, temporary)
    os.replace(temporary, optimizer_path)
    _atomic_text(weights_path, json.dumps(export(model, roster_hash)))
    manifest = {"version": version, "rosterHash": roster_hash,
                "weightsPath": str(weights_path), "optimizerPath": str(optimizer_path),
                "metrics": metrics}
    _atomic_text(data_dir / "manifest.json", json.dumps(manifest))
    return manifest


def _load(data_dir, roster_hash):
    manifest = json.loads((data_dir / "manifest.json").read_text(encoding="utf-8"))
    if manifest["rosterHash"] != roster_hash:
        raise ValueError("neural roster hash changed")
    checkpoint_path = data_dir / f"optimizer-{manifest['version']}.pt"
    weights_path = data_dir / f"weights-{manifest['version']}.json"
    if not weights_path.exists():
        raise ValueError("neural weights missing")
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    if checkpoint["version"] != manifest["version"] or checkpoint["rosterHash"] != roster_hash:
        raise ValueError("neural optimizer checkpoint mismatch")
    model = TacticalPolicy()
    model.load_state_dict(checkpoint["model"])
    optimizer = torch.optim.Adam(model.parameters(), lr=3e-4)
    optimizer.load_state_dict(checkpoint["optimizer"])
    torch.set_rng_state(checkpoint["torchRng"])
    return manifest, model, optimizer


def initialize(data_dir, roster_hash):
    data_dir = Path(data_dir).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    if (data_dir / "manifest.json").exists():
        manifest, _, _ = _load(data_dir, roster_hash)
        return manifest
    torch.manual_seed(7)
    model = TacticalPolicy()
    optimizer = torch.optim.Adam(model.parameters(), lr=3e-4)
    return _save(data_dir, "n-000000", roster_hash, model, optimizer)


def update(data_dir, rows, roster_hash):
    data_dir = Path(data_dir).resolve()
    current, model, optimizer = _load(data_dir, roster_hash)
    if not rows or any(row.get("policyVersion") != current["version"] for row in rows):
        raise ValueError("trajectory policy version does not match optimizer checkpoint")
    if any(row.get("rosterHash") != roster_hash for row in rows):
        raise ValueError("trajectory roster hash does not match optimizer checkpoint")
    metrics = train_batch(model, optimizer, rows)
    next_version = f"n-{int(current['version'][2:]) + 1:06d}"
    return _save(data_dir, next_version, roster_hash, model, optimizer, metrics)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--roster-hash", required=True)
    parser.add_argument("--batch")
    args = parser.parse_args()
    if args.batch:
        rows = json.loads(Path(args.batch).read_text(encoding="utf-8"))
        print(json.dumps(update(args.data_dir, rows, args.roster_hash)))
    else:
        print(json.dumps(initialize(args.data_dir, args.roster_hash)))


if __name__ == "__main__":
    main()
