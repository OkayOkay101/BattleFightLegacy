import hashlib
import json
import math
import subprocess
import tempfile
import unittest
from pathlib import Path

import torch
from model import TacticalPolicy
from ppo import _advantages, train_batch
from train import initialize, update, _load
from export_model import export, golden


class V3Tests(unittest.TestCase):
    def row(self, version='n-000031', **changes):
        from schema import get_schema
        return dict({"playerId":"p", "matchId":"m", "lifeId":"l", "teamId":"blue",
            "policyVersion":version,"rosterHash":"r", "schemaVersion":3,
            "schemaHash":get_schema(3)['schemaHash'],"environmentHash":"env","trainingProtocolVersion":2,
            "observation":[.01]*184,"options":[[0.0]*27,[1.0]+[0.0]*26],
            "chosenIndex":1,"logProb":-math.log(2),"value":0.,"reward":1.,"done":True,
            "simulatedAt":100.,"nextSimulatedAt":300., "potential":0.,
            "requestedAction":{},"executedAction":{},"overrideReasons":[]}, **changes)

    def test_duration_aware_gae_sorts_and_separates_matches(self):
        rows = [self.row(value=2., reward=3., simulatedAt=300., nextSimulatedAt=500.),
                self.row(value=1., reward=0., done=False, simulatedAt=100., nextSimulatedAt=300.),
                self.row(matchId='other', value=4., reward=5.)]
        advantages, returns = _advantages(rows, schema_version=3)
        gamma, lam = .999**2, .95**2
        self.assertAlmostEqual(advantages[0],1.)
        self.assertAlmostEqual(advantages[1], gamma*2-1+gamma*lam)
        self.assertAlmostEqual(advantages[2],1.)

    def test_single_option_trains_critic_only_and_validates_finite_features(self):
        model = TacticalPolicy(3)
        optimizer = torch.optim.Adam(model.parameters(),lr=3e-4)
        actor = [param.detach().clone() for param in model.actor.parameters()]
        critic = model.critic[0].weight.detach().clone()
        row = self.row(options=[[0.]*27],chosenIndex=0,logProb=0.)
        metrics = train_batch(model,optimizer,[row],epochs=2)
        self.assertEqual(metrics['actorDecisions'],0)
        self.assertEqual(metrics['entropy'],0.)
        self.assertEqual(metrics['policyLoss'],0.)
        self.assertTrue(all(torch.equal(before,after) for before,after in zip(actor,model.actor.parameters())))
        self.assertFalse(torch.equal(critic,model.critic[0].weight))
        with self.assertRaisesRegex(ValueError,'values|finite'):
            train_batch(model,optimizer,[self.row(observation=[float('nan')]*184)])
        with self.assertRaisesRegex(ValueError,'environment'):
            train_batch(model,optimizer,[self.row(),self.row(environmentHash='other')])

    def test_warm_migration_preserves_common_logits_resets_adam_and_resumes_rng(self):
        with tempfile.TemporaryDirectory() as directory:
            first = initialize(Path(directory)/'v1','r')
            old_manifest, old_model, _ = _load(Path(directory)/'v1','r')
            migrated = initialize(Path(directory)/'v3','r',schema_version=3,environment_hash='env',
                parent_checkpoint=first['optimizerPath'],next_version='n-000031')
            self.assertEqual(migrated['parentVersion'],'n-000000')
            _,model,optimizer = _load(Path(directory)/'v3','r',schema_version=3,environment_hash='env')
            self.assertEqual(optimizer.state_dict()['state'],{})
            self.assertTrue(torch.equal(model.actor[0].weight[:,86:184],torch.zeros((64,98))))
            self.assertTrue(torch.equal(model.actor[0].weight[:,201:],torch.zeros((64,10))))
            obs = torch.randn(2,86); actions = torch.randn(2,3,17); mask=torch.ones(2,3,dtype=torch.bool)
            old_logits,old_values=old_model(obs,actions,mask)
            new_logits,new_values=model(torch.cat((obs,torch.randn(2,98)),dim=1),torch.cat((actions,torch.randn(2,3,10)),dim=2),mask)
            self.assertTrue(torch.allclose(old_logits,new_logits,atol=1e-5,rtol=0))
            self.assertTrue(torch.allclose(old_values,new_values,atol=1e-5,rtol=0))
            updated = update(Path(directory)/'v3',[self.row()]*4,'r',schema_version=3,environment_hash='env',next_version='n-000035')
            self.assertEqual(updated['version'],'n-000035')
            self.assertGreater(updated['metrics']['updates'],0)
            self.assertEqual(updated['metrics']['actorDecisions'],4)
            self.assertEqual(updated['parentVersion'],'n-000000')
            _load(Path(directory)/'v3','r',schema_version=3,environment_hash='env')
            expected=torch.rand(4)
            torch.manual_seed(99)
            _load(Path(directory)/'v3','r',schema_version=3,environment_hash='env')
            self.assertTrue(torch.equal(torch.rand(4),expected))
            with self.assertRaisesRegex(ValueError,'exists|overwrite'):
                update(Path(directory)/'v3',[self.row(version='n-000035')]*4,'r',schema_version=3,environment_hash='env',next_version='n-000031')

    def test_node_python_v3_golden_and_schema_hash_agree(self):
        from schema import get_schema
        torch.manual_seed(7)
        model=TacticalPolicy(3).eval()
        fixture=golden(model)
        with tempfile.TemporaryDirectory() as directory:
            weights=Path(directory)/'weights.json'; data=Path(directory)/'golden.json'
            weights.write_text(json.dumps(export(model,'r',environment_hash='env')))
            data.write_text(json.dumps(fixture))
            # Load via the real validator with the current roster, then run Node inference.
            script = "const fs=require('fs'),n=require('./server/training/NeuralInference'),c=require('crypto'),s=require('./server/training/NeuralSchema');let e=JSON.parse(fs.readFileSync(process.argv[1])),p=JSON.parse(e.payload);p.rosterHash=require('./server/training/NeuralObservation').rosterHash;e.payload=JSON.stringify(p);e.checksum=c.createHash('sha256').update(e.payload).digest('hex');const f=JSON.parse(fs.readFileSync(process.argv[2]));console.log(JSON.stringify({...n.scoreActions(n.loadWeights(e),f.observation,f.actions.map(features=>({features,legal:true}))),schemaHash:s.getSchema(3).schemaHash}));"
            result=subprocess.run(['node','-e',script,str(weights),str(data)],cwd=Path(__file__).resolve().parent.parent,check=True,capture_output=True,text=True)
            actual=json.loads(result.stdout)
            self.assertEqual(actual['schemaHash'],get_schema(3)['schemaHash'])
            for a,b in zip(actual['logits'],fixture['logits']): self.assertAlmostEqual(a,b,delta=1e-5)
            self.assertAlmostEqual(actual['value'],fixture['value'],delta=1e-5)

    def test_kl_stop_reports_observed_divergence_without_updating_policy(self):
        model=TacticalPolicy(3)
        optimizer=torch.optim.Adam(model.parameters(),lr=3e-4)
        before=[param.detach().clone() for param in model.parameters()]
        metrics=train_batch(model,optimizer,[self.row(logProb=-10.)],epochs=4)
        self.assertTrue(metrics['earlyStopped'])
        self.assertGreater(metrics['approxKL'],.02)
        self.assertEqual(metrics['updates'],0)
        self.assertTrue(all(torch.equal(a,b) for a,b in zip(before,model.parameters())))

    def test_export_cli_writes_v3_weights_and_golden_dimensions(self):
        import sys
        with tempfile.TemporaryDirectory() as directory:
            weights=Path(directory)/'weights.json'; fixture=Path(directory)/'golden.json'
            result=subprocess.run([sys.executable,str(Path(__file__).parent/'export_model.py'),
                '--roster-hash','r','--out',str(weights),'--golden-out',str(fixture),
                '--schema-version','3','--environment-hash','env'],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            payload=json.loads(json.loads(weights.read_text())['payload'])
            self.assertEqual(payload['actionSchemaVersion'],3)
            self.assertEqual(payload['environmentHash'],'env')
            golden_data=json.loads(fixture.read_text())
            self.assertEqual(len(golden_data['observation']),184)
            self.assertEqual(len(golden_data['actions'][0]),27)


    def test_v2_parent_migration_preserves_all_old_features_and_resets_optimizer(self):
        with tempfile.TemporaryDirectory() as directory:
            parent=initialize(Path(directory)/'v2','r',schema_version=2,environment_hash='env2',next_version='n-000040')
            from schema import get_schema
            row=self.row(version=parent['version'],schemaVersion=2,schemaHash=get_schema(2)['schemaHash'],environmentHash='env2',
                observation=[.01]*149,options=[[0.]*18,[1.]+[0.]*17])
            parent=update(Path(directory)/'v2',[row]*4,'r',schema_version=2,environment_hash='env2',next_version='n-000042')
            _,old_model,old_optimizer=_load(Path(directory)/'v2','r',schema_version=2,environment_hash='env2')
            self.assertTrue(old_optimizer.state_dict()['state'])
            migrated=initialize(Path(directory)/'v3','r',schema_version=3,environment_hash='env3',parent_checkpoint=parent['optimizerPath'],next_version='n-000043')
            _,model,optimizer=_load(Path(directory)/'v3','r',schema_version=3,environment_hash='env3')
            self.assertEqual(migrated['parentVersion'],'n-000042')
            self.assertEqual(optimizer.state_dict()['state'],{})
            obs=torch.randn(2,149);actions=torch.randn(2,3,18);mask=torch.ones(2,3,dtype=torch.bool)
            expected=old_model(obs,actions,mask)
            actual=model(torch.cat((obs,torch.randn(2,35)),1),torch.cat((actions,torch.randn(2,3,9)),2),mask)
            for before,after in zip(expected,actual): self.assertTrue(torch.allclose(before,after,atol=1e-5,rtol=0))
            self.assertTrue(torch.equal(model.actor[0].weight[:,149:184],torch.zeros((64,35))))
            self.assertTrue(torch.equal(model.actor[0].weight[:,202:],torch.zeros((64,9))))

    def test_exact_schema_metadata_rejects_cross_version_rows_and_resume(self):
        from schema import get_schema
        model=TacticalPolicy(3);optimizer=torch.optim.Adam(model.parameters(),lr=3e-4)
        with self.assertRaisesRegex(ValueError,'schema'):
            train_batch(model,optimizer,[self.row(schemaVersion=2,schemaHash=get_schema(2)['schemaHash'])])
        with tempfile.TemporaryDirectory() as directory:
            initialize(directory,'r',schema_version=3,environment_hash='env',next_version='n-000045')
            path=Path(directory)/'manifest.json';manifest=json.loads(path.read_text());manifest['actionSchemaVersion']=2
            path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError,'actionSchemaVersion'):
                _load(directory,'r',schema_version=3,environment_hash='env')

if __name__=='__main__': unittest.main()
