import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("prepare_norte_magnata_video_queue.py")
SPEC = importlib.util.spec_from_file_location("video_queue", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class VideoQueueTests(unittest.TestCase):
    def test_prompt_is_english_and_bounded(self):
        scene = {"prompt_imagem": "Full-bleed cinematic 16:9; no readable text; Hiro opens one plain envelope and reaches for a pencil.", "movimento": "Dolly-in lento"}
        prompt = MODULE.provider_prompt(scene, 6)
        self.assertIn("exact reference image", prompt)
        self.assertIn("clear material result", prompt)
        self.assertLessEqual(len(prompt), 420)
        self.assertNotIn("Começo", prompt)

    def test_atomic_json_replaces_file(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "queue.json"
            MODULE.atomic_json(path, {"status": "ok"})
            self.assertEqual(json.loads(path.read_text()), {"status": "ok"})


if __name__ == "__main__":
    unittest.main()
