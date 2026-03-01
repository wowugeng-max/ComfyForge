# backend/core/executors/real_video_loop.py
import os
import copy
import subprocess
import uuid
import logging
from typing import Dict, Any, List, Optional
from .base import BaseExecutor
from .local_comfy import LocalComfyExecutor
from ...db import SessionLocal
from ...models.asset import Asset
from ...core.asset_utils import save_video_as_asset

# 配置日志
logger = logging.getLogger(__name__)

class RealVideoLoopExecutor(BaseExecutor):
    """
    真实视频循环执行器（支持多组手动输入）
    每组包含：首帧图像资产、尾帧图像资产、提示词资产
    """

    def __init__(self, comfy_base_url: str = "http://127.0.0.1:8188", ffmpeg_path: Optional[str] = None):
        """
        :param comfy_base_url: ComfyUI API 地址
        :param ffmpeg_path: ffmpeg 可执行文件路径，若为 None 则尝试从 PATH 中查找
        """
        self.comfy = LocalComfyExecutor(comfy_base_url)
        self.ffmpeg_path = ffmpeg_path or self._find_ffmpeg()

    def _find_ffmpeg(self) -> str:
        """尝试从 PATH 中查找 ffmpeg，如果找不到则返回默认猜测路径"""
        # 先检查环境变量
        ffmpeg_in_path = os.environ.get("FFMPEG_PATH")
        if ffmpeg_in_path and os.path.exists(ffmpeg_in_path):
            return ffmpeg_in_path

        # 尝试在常见位置查找
        common_paths = [
            r"D:\ffmpeg\bin\ffmpeg.exe",
            r"C:\ffmpeg\bin\ffmpeg.exe",
            r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
            "ffmpeg"  # 让系统在 PATH 中查找
        ]
        for path in common_paths:
            if path == "ffmpeg":
                # 检查是否在 PATH 中
                try:
                    subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
                    return "ffmpeg"
                except (subprocess.SubprocessError, FileNotFoundError):
                    continue
            elif os.path.exists(path):
                return path
        raise RuntimeError("未找到 ffmpeg，请安装 ffmpeg 并添加到 PATH，或在初始化时传入 ffmpeg_path")

    async def execute(self, task_def: Dict[str, Any]) -> Dict[str, Any]:
        # 参数验证
        if "workflow_asset_id" not in task_def:
            raise ValueError("缺少 workflow_asset_id")
        if "segments" not in task_def:
            raise ValueError("缺少 segments")

        workflow_asset_id = task_def["workflow_asset_id"]
        segments = task_def["segments"]
        project_id = task_def.get("project_id")
        source_ids = task_def.get("source_asset_ids", [])

        # 校验 segments 格式
        if not isinstance(segments, list):
            if isinstance(segments, dict):
                segments = [segments]  # 兼容单个对象
            else:
                raise ValueError("segments 必须是列表或对象")
        if not segments:
            raise ValueError("segments 不能为空")

        # 加载工作流模板
        db = SessionLocal()
        try:
            asset = db.query(Asset).filter(Asset.id == workflow_asset_id).first()
            if not asset or asset.type != "workflow":
                raise ValueError(f"工作流资产 {workflow_asset_id} 不存在或类型错误")
            workflow_data = asset.data
            base_workflow = workflow_data.get("workflow_json", {})
            parameters_def = workflow_data.get("parameters", {})
            # 验证必要参数
            required_params = ["frame_a", "frame_b", "prompt"]
            for param in required_params:
                if param not in parameters_def:
                    raise ValueError(f"工作流模板必须定义参数 '{param}'")
            logger.info(f"加载工作流模板成功，ID: {workflow_asset_id}")
        finally:
            db.close()

        segment_paths = []
        final_video = None
        asset_id = None

        try:
            for i, seg in enumerate(segments):
                logger.info(f"开始处理第 {i+1} 段")
                # 获取本段资产 ID
                frame_a_id = seg.get("frame_a_asset_id")
                frame_b_id = seg.get("frame_b_asset_id")
                prompt_id = seg.get("prompt_asset_id")
                if not all([frame_a_id, frame_b_id, prompt_id]):
                    raise ValueError(f"第 {i+1} 段缺少必要资产 ID")

                # 加载资产
                db = SessionLocal()
                try:
                    frame_a_asset = db.query(Asset).filter(Asset.id == frame_a_id).first()
                    frame_b_asset = db.query(Asset).filter(Asset.id == frame_b_id).first()
                    prompt_asset = db.query(Asset).filter(Asset.id == prompt_id).first()
                    if not all([frame_a_asset, frame_b_asset, prompt_asset]):
                        raise ValueError(f"第 {i+1} 段资产未找到")

                    # 类型检查
                    if frame_a_asset.type != "image" or frame_b_asset.type != "image":
                        raise ValueError("首尾帧资产必须是 image 类型")
                    if prompt_asset.type != "prompt":
                        raise ValueError("提示词资产必须是 prompt 类型")

                    # 获取数据
                    frame_a_path = frame_a_asset.data.get("file_path")
                    frame_b_path = frame_b_asset.data.get("file_path")
                    prompt_text = prompt_asset.data.get("content")
                    if not frame_a_path or not frame_b_path or not prompt_text:
                        raise ValueError("资产数据不完整（缺少 file_path 或 content）")
                finally:
                    db.close()

                # 复制图像到 ComfyUI 输入目录
                input_files = self.comfy.prepare_input_files({
                    "frame_a": frame_a_path,
                    "frame_b": frame_b_path
                })
                logger.info(f"第 {i+1} 段图像已复制: {input_files}")

                # 填充工作流
                workflow = copy.deepcopy(base_workflow)
                self._set_parameter(workflow, parameters_def["frame_a"], input_files["frame_a"])
                self._set_parameter(workflow, parameters_def["frame_b"], input_files["frame_b"])
                self._set_parameter(workflow, parameters_def["prompt"], prompt_text)

                # 执行工作流
                logger.info(f"第 {i+1} 段提交工作流")
                result = await self.comfy.execute({"workflow_json": workflow})
                output_files = result.get("output_files", [])
                if not output_files:
                    raise RuntimeError(f"第 {i+1} 段未生成输出文件")
                segment_paths.append(output_files[0])
                logger.info(f"第 {i+1} 段完成，输出文件: {output_files[0]}")

            # 拼接所有片段
            if len(segment_paths) == 1:
                final_video = segment_paths[0]
                logger.info("只有一个片段，跳过拼接")
            else:
                logger.info(f"开始拼接 {len(segment_paths)} 个片段")
                final_video = self._stitch_segments(segment_paths)
                logger.info(f"拼接完成，最终视频: {final_video}")

            # 保存为资产
            if project_id is not None:
                db = SessionLocal()
                try:
                    asset_id = save_video_as_asset(final_video, db, source_ids=source_ids, project_id=project_id)
                    logger.info(f"视频已保存为资产，ID: {asset_id}")
                finally:
                    db.close()
        except Exception as e:
            logger.error(f"视频生成失败: {e}", exc_info=True)
            raise  # 重新抛出，由上层处理
        finally:
            await self.comfy.close()  # 释放 httpx 客户端
            logger.info("ComfyUI 客户端已关闭")

        return {
            "status": "completed",
            "final_video": final_video,
            "segments": segment_paths,
            "num_segments": len(segments),
            "asset_id": asset_id
        }

    def _set_parameter(self, workflow: Dict, param_def: Dict, value: Any) -> None:
        """将值设置到工作流指定位置，如果节点或字段不存在则静默失败（可添加警告）"""
        node_id = param_def.get("node_id")
        field_path = param_def.get("field", "").split('/')
        if not node_id or not field_path:
            logger.warning(f"参数定义不完整: {param_def}")
            return
        node = workflow.get(node_id)
        if not node:
            logger.warning(f"节点 {node_id} 不存在于工作流中")
            return
        target = node
        for part in field_path[:-1]:
            if part not in target:
                logger.warning(f"字段路径 {part} 不存在，跳过")
                return
            target = target[part]
        target[field_path[-1]] = value
        logger.debug(f"已设置参数: 节点 {node_id}, 字段 {field_path} = {value}")

    def _stitch_segments(self, segments: List[str]) -> str:
        """使用 ffmpeg 拼接视频片段，返回最终视频的绝对路径"""
        if len(segments) == 1:
            return os.path.abspath(segments[0])

        # 创建临时文件列表
        list_id = uuid.uuid4().hex
        list_path = os.path.abspath(f"data/temp/concat_{list_id}.txt")
        try:
            with open(list_path, "w", encoding="utf-8") as f:
                for seg in segments:
                    abs_path = os.path.abspath(seg).replace('\\', '/')
                    f.write(f"file '{abs_path}'\n")
            output_path = os.path.abspath(f"data/temp/final_{list_id}.mp4")

            # 构建 ffmpeg 命令
            cmd = [
                self.ffmpeg_path,
                "-f", "concat",
                "-safe", "0",
                "-i", list_path,
                "-c", "copy",      # 直接复制流，不重新编码
                "-y",              # 覆盖输出文件
                output_path
            ]
            logger.info(f"执行 ffmpeg 命令: {' '.join(cmd)}")

            # 执行并捕获输出
            result = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=300)
            logger.info(f"ffmpeg 输出: {result.stdout}")
            if result.stderr:
                logger.warning(f"ffmpeg 警告: {result.stderr}")

            # 检查输出文件是否存在
            if not os.path.exists(output_path):
                raise RuntimeError("ffmpeg 执行成功但输出文件不存在")
            return output_path
        except subprocess.CalledProcessError as e:
            logger.error(f"ffmpeg 错误: {e.stderr}")
            raise RuntimeError(f"视频拼接失败: {e.stderr}")
        except subprocess.TimeoutExpired:
            logger.error("ffmpeg 超时")
            raise RuntimeError("视频拼接超时（超过300秒）")
        except FileNotFoundError:
            logger.error(f"ffmpeg 可执行文件未找到: {self.ffmpeg_path}")
            raise RuntimeError("ffmpeg 未安装或路径错误")
        finally:
            if os.path.exists(list_path):
                os.remove(list_path)
                logger.debug(f"临时文件 {list_path} 已删除")