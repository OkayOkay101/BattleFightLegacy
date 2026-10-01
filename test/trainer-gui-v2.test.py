import ast
import pathlib
import types
import unittest

source = pathlib.Path(__file__).resolve().parents[1] / 'tools' / 'trainer_gui.py'
tree = ast.parse(source.read_text(encoding='utf-8'))
app = next(node for node in tree.body if isinstance(node, ast.ClassDef))
functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)]
functions += [node for node in app.body if isinstance(node, ast.FunctionDef) and node.name in ('toggle_training', 'on_policy_change')]
namespace = {'START_API': 'start', 'STOP_API': 'stop', 'DEMO_POLICIES_API': 'demo'}
exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), 'exec'), namespace)

class GuiV2Tests(unittest.TestCase):
    def test_telemetry_has_schema_and_opponent_outcomes(self):
        text = namespace['format_v2_telemetry']({'schemaVersion': 2, 'trainingProtocolVersion': 2,
            'phase': 'final-test', 'pendingMultiOptionDecisions': 8192,
            'opponentMetrics': {'champion': {'version': 'n-000001', 'wins': 40, 'draws': 10, 'losses': 10,
                'games': 60, 'lowerBound': .61}}})
        for expected in ('Schema 2', 'ทดสอบสุดท้าย', '8192', '40/10/10', '61.0%'):
            self.assertIn(expected, text)

    def test_start_explicitly_requests_v2_and_selection_preserves_other_team(self):
        calls = []
        class Thread:
            def __init__(self, target, args, daemon):
                self.target, self.args = target, args
            def start(self):
                self.target(*self.args)
        namespace['threading'] = types.SimpleNamespace(Thread=Thread)
        gui = types.SimpleNamespace(current_state='stopped', log=lambda _: None,
            worker_var=types.SimpleNamespace(get=lambda: 4),
            btn_toggle_train=types.SimpleNamespace(configure=lambda **kwargs: None),
            _api_post=lambda *args: calls.append(args),
            policy_var=types.SimpleNamespace(get=lambda: 'champion'),
            red_policy_var=types.SimpleNamespace(get=lambda: 'n-000005'))
        namespace['toggle_training'](gui)
        self.assertEqual(calls[-1], ('start', {'workers': 4, 'neural': True, 'schemaVersion': 2, 'speed': 'max'}))
        namespace['on_policy_change'](gui, None)
        self.assertEqual(calls[-1], ('demo', {'blue': 'champion', 'red': 'n-000005'}))

if __name__ == '__main__':
    unittest.main()
