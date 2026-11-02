import asyncio
import json
import os
import struct
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
import host  # noqa: E402

host.send = lambda msg: None  # no browser here
host.log = lambda *a: None


class FakePipe:
    def __init__(self):
        self.frames = []
        self.transport = self

    def write(self, op, data):
        self.frames.append((op, data))

    def close(self):
        pass


def ready_discord():
    d = host.Discord()
    d.pipe, d.ready = FakePipe(), True
    return d


class DecoderTest(unittest.TestCase):
    def test_split_and_glued(self):
        a, b = host.frame(1, {'title': 'Гори твоё фото'}), host.frame(3, {'x': 1})
        d = host.Decoder()
        self.assertEqual(d.push(a[:5]), [])
        self.assertEqual(d.push(a[5:] + b), [(1, {'title': 'Гори твоё фото'}), (3, {'x': 1})])

    def test_too_large(self):
        with self.assertRaises(ValueError):
            host.Decoder().push(struct.pack('<II', 1, 2 << 20))


class ActivityTest(unittest.IsolatedAsyncioTestCase):
    def test_same_ignores_small_timestamp_drift(self):
        a = {'details': 'x', 'timestamps': {'start': 100, 'end': 300}}
        self.assertTrue(host.same(a, {'details': 'x', 'timestamps': {'start': 101, 'end': 301}}))
        self.assertFalse(host.same(a, {'details': 'x', 'timestamps': {'start': 110, 'end': 310}}))
        self.assertFalse(host.same(a, {'details': 'y', 'timestamps': {'start': 100, 'end': 300}}))
        self.assertTrue(host.same(None, None))
        self.assertFalse(host.same(None, a))

    async def test_rate_limit_keeps_only_latest(self):
        d = ready_discord()
        for i in range(8):
            d.set({'details': f'track {i}'})
        self.assertEqual(len(d.pipe.frames), 5)
        self.assertIsNotNone(d.timer)  # the rest goes out when the window frees up
        d.sent_times.clear()
        d._later()
        self.assertEqual(d.pipe.frames[-1][1]['args']['activity'], {'details': 'track 7'})

    async def test_unchanged_is_not_resent(self):
        d = ready_discord()
        d.set({'details': 'a'})
        d.set({'details': 'a'})
        self.assertEqual(len(d.pipe.frames), 1)

    async def test_falls_back_without_new_fields(self):
        d = ready_discord()
        d.set({'details': 'a', 'status_display_type': 1})
        nonce = d.pipe.frames[0][1]['nonce']
        d.on_frame(d.pipe, 1, {'cmd': 'SET_ACTIVITY', 'evt': 'ERROR', 'nonce': nonce, 'data': {}})
        self.assertEqual(d.pipe.frames[-1][1]['args']['activity'], {'details': 'a'})
        self.assertTrue(d.plain)


if __name__ == '__main__':
    unittest.main()
