import os
import math
import shutil
import time
import subprocess
from typing import Dict, Any, List
from .base import BaseExecutor
from ..asset_utils import save_video_as_asset

# 确保 demo 视频存在
DEMO_VIDEO_PATH = "data/demo_segment.mp4"

def ensure_demo_video():
    """如果 demo 视频不存在，则生成一个5秒的测试视频"""
    if os.path.exists(DEMO_VIDEO_PATH):
        return
    os.makedirs("data", exist_ok=True)
    # 优先使用 ffmpeg 生成测试视频
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
        cmd = [
            "ffmpeg", "-f", "lavfi", "-i", "testsrc=duration=5:size=640x360",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", DEMO_VIDEO_PATH
        ]
        subprocess.run(cmd, check=True)
        print("✅ 测试视频已生成 (ffmpeg)")
    except (subprocess.CalledProcessError, FileNotFoundError):
        # 如果没有 ffmpeg，用 moviepy 生成空白视频
        try:
            from moviepy.video.VideoClip import ColorClip
            clip = ColorClip(size=(640, 360), color=(255, 0, 0), duration=5)
            clip.write_videofile(DEMO_VIDEO_PATH, fps=24, codec="libx264")
            print("✅ 测试视频已生成 (moviepy)")
        except ImportError:
            print("❌ 无法生成测试视频，请安装 ffmpeg 或 moviepy")
            raise

# 调用一次确保存在
ensure_demo_video()

class MockComfyUI:
    def queue_prompt(self, workflow):
        return "mock_prompt_id"

    def wait_for_completion(self, prompt_id):
        time.sleep(0.5)  # 模拟生成耗时减半
        os.makedirs("data/temp", exist_ok=True)
        segment_path = f"data/temp/segment_{int(time.time())}_{os.getpid()}.mp4"
        shutil.copy(DEMO_VIDEO_PATH, segment_path)
        return segment_path

class VideoLoopExecutor(BaseExecutor):
    async def execute(self, task_def: Dict[str, Any]) -> Dict[str, Any]:
        initial_path = task_def["initial_video_path"]
        total_sec = task_def["total_seconds"]
        segment_sec = task_def["segment_seconds"]
        global_prompt = task_def.get("global_prompt", "")
        segment_prompts = task_def.get("segment_prompts", [])
        project_id = task_def.get("project_id")
        source_ids = task_def.get("source_asset_ids", [])

        num_segments = math.ceil(total_sec / segment_sec)
        comfy = MockComfyUI()
        segments = []
        current_input = initial_path

        for i in range(num_segments):
            if i < len(segment_prompts):
                prompt = segment_prompts[i]
            else:
                prompt = global_prompt

            # 模拟工作流（实际使用时替换为真实模板）
            workflow = {
                "prompt": {
                    "3": {"class_type": "LoadVideo", "inputs": {"video": current_input}},
                    "4": {"class_type": "WanVideoExtender", "inputs": {"prompt": prompt, "frames": segment_sec * 30}},
                    "5": {"class_type": "VHS_VideoCombine",
                          "inputs": {"frame_rate": 30, "filename_prefix": f"segment_{i:03d}"}}
                }
            }
            prompt_id = comfy.queue_prompt(workflow)
            output_path = comfy.wait_for_completion(prompt_id)
            segments.append(output_path)
            current_input = output_path

        final_video = self._stitch_segments(segments)
        return {
            "status": "completed",
            "final_video": final_video,
            "segments": segments,
            "num_segments": num_segments
        }

    def _stitch_segments(self, segments: List[str]) -> str:
        # 测试阶段直接返回第一个片段，跳过耗时的拼接
        return segments[0] if segments else None