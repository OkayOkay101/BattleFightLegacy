"""Persistent, single-writer PPO optimizer for BattleFight self-play."""
import argparse
import json
import os
import re
import uuid
from pathlib import Path
import torch
from export_model import export
from model import TacticalPolicy
from ppo import train_batch
from schema import get_schema


def _atomic_text(path,text):
    temporary=path.with_name(path.name+f'.{uuid.uuid4().hex}.tmp')
    temporary.write_text(text,encoding='utf-8')
    os.replace(temporary,path)


def _metadata(schema_version,environment_hash,protocol_version,parent_version=None):
    schema=get_schema(schema_version)
    if schema_version >= 2:
        if not isinstance(environment_hash,str) or not environment_hash or protocol_version != 2:
            raise ValueError('Neural requires environment hash and protocol version 2')
        return dict(schemaVersion=schema_version,observationSchemaVersion=schema_version,actionSchemaVersion=schema_version,schemaHash=schema['schemaHash'],environmentHash=environment_hash,trainingProtocolVersion=protocol_version,parentVersion=parent_version)
    return {}


def _version(value,default):
    if value is None: return default
    if str(value).isdigit(): return f'n-{int(value):06d}'
    if not re.fullmatch(r'n-\d{6,}',str(value)): raise ValueError('invalid next version')
    return str(value)


def _save(data_dir,version,roster_hash,model,optimizer,metrics=None,*,environment_hash=None,protocol_version=2,parent_version=None,trained_from_version=None):
    weights_path,optimizer_path=data_dir/f'weights-{version}.json',data_dir/f'optimizer-{version}.pt'
    if weights_path.exists() or optimizer_path.exists(): raise ValueError('numbered neural artifact already exists; refusing overwrite')
    metadata=_metadata(model.schema_version,environment_hash,protocol_version,parent_version)
    envelope=export(model,roster_hash,environment_hash=environment_hash,protocol_version=protocol_version,parent_version=parent_version)
    temporary=optimizer_path.with_name(optimizer_path.name+f'.{uuid.uuid4().hex}.tmp')
    torch.save(dict(version=version,rosterHash=roster_hash,model=model.state_dict(),optimizer=optimizer.state_dict(),torchRng=torch.get_rng_state(),trainedFromVersion=trained_from_version,**metadata),temporary)
    # Hard links publish immutable artifacts exclusively; existing numbered files are never replaced.
    try: os.link(temporary,optimizer_path)
    finally: temporary.unlink(missing_ok=True)
    with weights_path.open('x',encoding='utf-8') as handle: json.dump(envelope,handle)
    manifest=dict(version=version,rosterHash=roster_hash,weightsPath=str(weights_path),optimizerPath=str(optimizer_path),metrics=metrics,trainedFromVersion=trained_from_version,**metadata)
    _atomic_text(data_dir/'manifest.json',json.dumps(manifest))
    return manifest


def _load(data_dir,roster_hash,*,schema_version=1,environment_hash=None,protocol_version=2):
    data_dir=Path(data_dir).resolve()
    expected=_metadata(schema_version,environment_hash,protocol_version)
    manifest=json.loads((data_dir/'manifest.json').read_text(encoding='utf-8'))
    if manifest['rosterHash'] != roster_hash: raise ValueError('neural roster hash changed')
    if manifest.get('schemaVersion',1) != schema_version: raise ValueError('neural schema mismatch')
    for key in ['schemaVersion','observationSchemaVersion','actionSchemaVersion','schemaHash','environmentHash','trainingProtocolVersion'] if schema_version >= 2 else []:
        if manifest.get(key) != expected[key]: raise ValueError(f'neural {key} mismatch')
    weights_path=data_dir/f"weights-{manifest['version']}.json"
    if not weights_path.exists(): raise ValueError('neural weights missing')
    checkpoint=torch.load(data_dir/f"optimizer-{manifest['version']}.pt",map_location='cpu',weights_only=True)
    if checkpoint['version'] != manifest['version'] or checkpoint['rosterHash'] != roster_hash: raise ValueError('neural optimizer checkpoint mismatch')
    if checkpoint.get('trainedFromVersion') != manifest.get('trainedFromVersion'): raise ValueError('neural checkpoint training source mismatch')
    for key in ['schemaVersion','observationSchemaVersion','actionSchemaVersion','schemaHash','environmentHash','trainingProtocolVersion','parentVersion'] if schema_version >= 2 else []:
        if checkpoint.get(key) != manifest.get(key): raise ValueError(f'neural checkpoint {key} mismatch')
    model=TacticalPolicy(schema_version)
    model.load_state_dict(checkpoint['model'])
    optimizer=torch.optim.Adam(model.parameters(),lr=3e-4)
    optimizer.load_state_dict(checkpoint['optimizer'])
    torch.set_rng_state(checkpoint['torchRng'])
    return manifest,model,optimizer


def _warm_start(model,parent_checkpoint,roster_hash):
    checkpoint=torch.load(parent_checkpoint,map_location='cpu',weights_only=True)
    if checkpoint.get('rosterHash') != roster_hash: raise ValueError('parent checkpoint roster mismatch')
    parent_schema=checkpoint.get('schemaVersion',1)
    allowed=(1,) if model.schema_version == 2 else (1,2,3)
    if parent_schema not in allowed or parent_schema > model.schema_version:
        raise ValueError('warm start parent has incompatible schema')
    parent_definition=get_schema(parent_schema)
    if parent_schema >= 2:
        if (checkpoint.get('observationSchemaVersion') != parent_schema or checkpoint.get('actionSchemaVersion') != parent_schema or
            checkpoint.get('schemaHash') != parent_definition['schemaHash'] or not checkpoint.get('environmentHash') or checkpoint.get('trainingProtocolVersion') != 2):
            raise ValueError('warm start parent schema/protocol metadata mismatch')
    old=TacticalPolicy(parent_schema)
    old.load_state_dict(checkpoint['model'])
    state=model.state_dict()
    observation_count=parent_definition['observationCount']
    action_count=parent_definition['actionCount']
    target_offset=model.schema['observationCount']
    for name,source in old.state_dict().items():
        if name == 'actor.0.weight':
            state[name].zero_()
            state[name][:,:observation_count].copy_(source[:,:observation_count])
            state[name][:,target_offset:target_offset+action_count].copy_(source[:,observation_count:observation_count+action_count])
        elif name == 'critic.0.weight':
            state[name].zero_()
            state[name][:,:observation_count].copy_(source)
        else: state[name].copy_(source)
    model.load_state_dict(state)
    return checkpoint['version']


def initialize(data_dir,roster_hash,*,schema_version=1,environment_hash=None,protocol_version=2,parent_checkpoint=None,next_version=None):
    data_dir=Path(data_dir).resolve(); data_dir.mkdir(parents=True,exist_ok=True)
    _metadata(schema_version,environment_hash,protocol_version)
    if (data_dir/'manifest.json').exists():
        manifest,_,_=_load(data_dir,roster_hash,schema_version=schema_version,environment_hash=environment_hash,protocol_version=protocol_version)
        return manifest
    if schema_version >= 2 and next_version is None: raise ValueError('Neural requires global next version')
    torch.manual_seed(7)
    model=TacticalPolicy(schema_version)
    parent_version=_warm_start(model,parent_checkpoint,roster_hash) if parent_checkpoint and schema_version >= 2 else None
    optimizer=torch.optim.Adam(model.parameters(),lr=3e-4)
    return _save(data_dir,_version(next_version,'n-000000'),roster_hash,model,optimizer,environment_hash=environment_hash,protocol_version=protocol_version,parent_version=parent_version)


def update(data_dir,rows,roster_hash,*,schema_version=1,environment_hash=None,protocol_version=2,next_version=None):
    data_dir=Path(data_dir).resolve()
    current,model,optimizer=_load(data_dir,roster_hash,schema_version=schema_version,environment_hash=environment_hash,protocol_version=protocol_version)
    if not rows or any(row.get('policyVersion') != current['version'] for row in rows): raise ValueError('trajectory policy version does not match optimizer checkpoint')
    if any(row.get('rosterHash') != roster_hash for row in rows): raise ValueError('trajectory roster hash does not match optimizer checkpoint')
    if schema_version >= 2:
        if next_version is None: raise ValueError('Neural requires global next version')
        for key in ['schemaVersion','schemaHash','environmentHash','trainingProtocolVersion']:
            if any(row.get(key) != current[key] for row in rows): raise ValueError(f'trajectory {key} does not match optimizer checkpoint')
    version=_version(next_version,f"n-{int(current['version'][2:])+1:06d}")
    if (data_dir/f'weights-{version}.json').exists() or (data_dir/f'optimizer-{version}.pt').exists(): raise ValueError('numbered neural artifact already exists; refusing overwrite')
    metrics=train_batch(model,optimizer,rows)
    return _save(data_dir,version,roster_hash,model,optimizer,metrics,environment_hash=environment_hash,protocol_version=protocol_version,parent_version=current.get('parentVersion'),trained_from_version=current['version'])


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--data-dir',required=True); parser.add_argument('--roster-hash',required=True)
    parser.add_argument('--batch'); parser.add_argument('--schema-version',type=int,default=1)
    parser.add_argument('--environment-hash'); parser.add_argument('--protocol-version',type=int,default=2)
    parser.add_argument('--parent-checkpoint'); parser.add_argument('--next-version')
    args=parser.parse_args()
    options=dict(schema_version=args.schema_version,environment_hash=args.environment_hash,protocol_version=args.protocol_version,next_version=args.next_version)
    if args.batch:
        rows=json.loads(Path(args.batch).read_text(encoding='utf-8'))
        result=update(args.data_dir,rows,args.roster_hash,**options)
    else: result=initialize(args.data_dir,args.roster_hash,parent_checkpoint=args.parent_checkpoint,**options)
    print(json.dumps(result))

if __name__=='__main__': main()
