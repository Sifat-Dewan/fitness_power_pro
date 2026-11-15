"""Safe, simulated tests. No gym device or cloud connection is used."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import patch
import sys
import unittest

# Optional dependency stubs: tests can run before the gym PC installs pyzk.
if "dotenv" not in sys.modules:
    dotenv = ModuleType("dotenv")
    dotenv.load_dotenv = lambda *_args, **_kwargs: None
    sys.modules["dotenv"] = dotenv
if "zk" not in sys.modules:
    zk = ModuleType("zk")
    zk.ZK = lambda *args, **kwargs: None
    sys.modules["zk"] = zk
spec = importlib.util.spec_from_file_location("k40_agent_under_test", Path(__file__).with_name("agent.py"))
assert spec is not None and spec.loader is not None
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)

class FakeDevice:
    def __init__(self, people):
        self.people = people
        self.deletions = []
        self.disconnected = False

    def get_users(self):
        return list(self.people)

    def delete_user(self, uid=0, user_id=""):
        self.deletions.append((uid, user_id))
        self.people = [u for u in self.people if not (int(u.uid) == uid and str(u.user_id) == str(user_id))]
        return True

    def disconnect(self):
        self.disconnected = True

class SafetyTests(unittest.TestCase):
    def test_valid_delete(self):
        conn = FakeDevice([SimpleNamespace(user_id="41",uid=7,privilege=0)])
        with patch.object(agent,"connect",return_value=conn):
            agent.delete_exact_user("41",7)
        self.assertEqual(conn.deletions,[(7,"41")])
        self.assertTrue(conn.disconnected)

    def test_uid_mismatch_must_never_delete(self):
        conn = FakeDevice([SimpleNamespace(user_id="41",uid=8,privilege=0)])
        with patch.object(agent,"connect",return_value=conn):
            with self.assertRaisesRegex(RuntimeError,"UID mismatch"):
                agent.delete_exact_user("41",7)
        self.assertEqual(conn.deletions,[])

    def test_admin_must_never_delete(self):
        conn = FakeDevice([SimpleNamespace(user_id="41",uid=7,privilege=14)])
        with patch.object(agent,"connect",return_value=conn):
            with self.assertRaisesRegex(RuntimeError,"administrator"):
                agent.delete_exact_user("41",7)
        self.assertEqual(conn.deletions,[])

    def test_already_absent_is_safe(self):
        conn = FakeDevice([])
        with patch.object(agent,"connect",return_value=conn):
            agent.delete_exact_user("41",7)
        self.assertEqual(conn.deletions,[])

    def test_duplicate_user_id_must_never_delete(self):
        conn = FakeDevice([SimpleNamespace(user_id="41",uid=7,privilege=0),SimpleNamespace(user_id="41",uid=8,privilege=0)])
        with patch.object(agent,"connect",return_value=conn):
            with self.assertRaisesRegex(RuntimeError,"Duplicate"):
                agent.delete_exact_user("41",7)
        self.assertEqual(conn.deletions,[])

if __name__ == "__main__":
    unittest.main()
