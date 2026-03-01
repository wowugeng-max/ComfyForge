# backend/core/executors/cloud_video_loop.py
import os
import math
import shutil
import uuid
from typing import Dict, Any, List
from .base import BaseExecutor
from ..asset_utils import save_video_as_asset
from ..cloud_comfy_client import CloudComfyClient


class CloudVideoLoopExecutor(BaseExecutor):
    """云端视频循环执行器（RunningHub版）"""

    def __init__(self, cloud_config: Dict[str, str]):
        """
        :param cloud_config: {"base_url": "xxx", "api_key": "xxx"}
        """
        self.client = CloudComfyClient(
            base_url=cloud_config["base_url"],
            api_key=cloud_config.get("api_key")
        )
        # 云端工作流模板ID（需要先在RunningHub上创建并保存）
        self.workflow_template_id = cloud_config.get("workflow_template_id")

    async def execute(self, task_def: Dict[str, Any]) -> Dict[str, Any]:
        """
        执行云端视频循环
        task_def 参数与 VideoLoopExecutor 兼容
        """
        initial_path = task_def["initial_video_path"]
        total_sec = task_def["total_seconds"]
        segment_sec = task_def["segment_seconds"]
        global_prompt = task_def.get("global_prompt", "")
        segment_prompts = task_def.get("segment_prompts", [])
        project_id = task_def.get("project_id")
        source_ids = task_def.get("source_asset_ids", [])

        num_segments = math.ceil(total_sec / segment_sec)
        segments = []
        current_input = initial_path

        for i in range(num_segments):
            # 获取该段prompt
            prompt = segment_prompts[i] if i < len(segment_prompts) else global_prompt

            # 1. 上传当前输入文件到云端（如果需要）
            # 大部分云平台支持直接传URL或base64，这里简化处理
            # 实际实现需要根据RunningHub的API调整
            input_file = await self._upload_file(current_input)

            # 2. 构建工作流（基于模板修改）
            workflow = await self._build_workflow(
                input_file=input_file,
                prompt=prompt,
                segment_index=i
            )

            # 3. 提交任务
            prompt_id = await self.client.queue_prompt(workflow)
            logger.info(f"Segment {i} submitted, prompt_id={prompt_id}")

            # 4. 等待完成
            history = await self.client.wait_for_completion(prompt_id)

            # 5. 下载生成的片段
            output_path = await self._download_segment(history, i)
            segments.append(output_path)
            current_input = output_path  # 下一段的输入

        # 6. 拼接所有片段
        final_video = await self._stitch_segments(segments)

        # 7. 保存为资产
        asset_id = None
        if project_id is not None:
            # 这里需要传入数据库会话，实际使用时在app.py中处理
            pass

        return {
            "status": "completed",
            "final_video": final_video,
            "segments": segments,
            "num_segments": num_segments,
            "asset_id": asset_id
        }

    async def _upload_file(self, file_path: str) -> str:
        """上传文件到云端，返回云端可访问的URL或文件ID"""
        # TODO: 根据RunningHub API实现
        # 通常有两种方式：
        # 1. 直接上传二进制
        # 2. 如果平台支持，可以使用预签名URL
        return file_path  # 临时返回本地路径

    async def _build_workflow(self, input_file: str, prompt: str, segment_index: int) -> Dict:
        """基于模板构建具体的工作流JSON"""
        # 这里需要从数据库加载workflow资产
        # 简化版：直接返回一个预设的模板JSON
        workflow = {
            "prompt": {
                "3": {"class_type": "LoadVideo", "inputs": {"video": input_file}},
                "4": {"class_type": "WanVideoExtender", "inputs": {"prompt": prompt, "frames": 300}},  # 假设10秒
                "5": {"class_type": "VHS_VideoCombine",
                      "inputs": {"frame_rate": 30, "filename_prefix": f"segment_{segment_index:03d}"}}
            }
        }
        return workflow

    async def _download_segment(self, history: Dict, index: int) -> str:
        """从云端下载生成的视频片段"""
        # 从history中提取文件名
        outputs = history.get("outputs", {})
        for node_id, node_output in outputs.items():
            if "videos" in node_output or "files" in node_output:
                files = node_output.get("videos") or node_output.get("files", [])
                if files:
                    filename = files[0]["filename"]
                    subfolder = files[0].get("subfolder", "")
                    file_type = files[0].get("type", "output")

                    # 下载文件
                    content = await self.client.download_output(filename, subfolder, file_type)

                    # 保存到本地临时目录
                    os.makedirs("data/temp", exist_ok=True)
                    local_path = f"data/temp/cloud_segment_{index}_{uuid.uuid4().hex}.mp4"
                    with open(local_path, "wb") as f:
                        f.write(content)
                    return local_path
        raise ValueError(f"No output files found in history: {history}")

    async def _stitch_segments(self, segments: List[str]) -> str:
        """拼接片段（复用VideoLoopExecutor的逻辑）"""
        # 可以复用之前写的拼接逻辑
        from .video_loop import VideoLoopExecutor
        temp_executor = VideoLoopExecutor()
        return temp_executor._stitch_segments(segments)