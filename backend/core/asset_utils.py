# backend/core/asset_utils.py
import os
import uuid
import base64
import re
from datetime import datetime
from PIL import Image
import io
from sqlalchemy.orm import Session
from ..models.asset import Asset
from ..models.schemas import VideoData

# 配置图像存储目录
IMAGES_DIR = "data/assets/images"
os.makedirs(IMAGES_DIR, exist_ok=True)

VIDEOS_DIR = "data/assets/videos"
os.makedirs(VIDEOS_DIR, exist_ok=True)


def save_image_from_base64(base64_str: str, db: Session, source_ids: list = None) -> int:
    """
    将 base64 图像保存为文件，并在数据库中创建 image 类型资产。

    :param base64_str: 图像的 base64 字符串（可能带 data URL 前缀）
    :param db: SQLAlchemy 数据库会话
    :param source_ids: 来源资产 ID 列表（用于血缘追踪）
    :return: 新创建的资产 ID
    """
    # 1. 提取纯 base64 数据（去掉 data URL 头，如果有）
    if base64_str.startswith("data:image"):
        # 格式: data:image/png;base64,xxxx
        header, encoded = base64_str.split(",", 1)
        base64_data = encoded
        # 从 header 中提取 mime 类型，用于文件后缀
        mime_match = re.search(r'image/(\w+)', header)
        ext = mime_match.group(1) if mime_match else "png"
    else:
        # 假设是纯 base64，默认 png
        base64_data = base64_str
        ext = "png"

    # 2. 解码 base64
    try:
        image_bytes = base64.b64decode(base64_data)
    except Exception as e:
        raise ValueError(f"Invalid base64 image data: {e}")

    # 3. 使用 PIL 验证并获取图像尺寸
    try:
        img = Image.open(io.BytesIO(image_bytes))
        width, height = img.size
        format = img.format.lower() if img.format else "png"
        # 如果格式与扩展名不一致，以实际格式为准
        if format in ["jpeg", "jpg"]:
            ext = "jpg"
        elif format == "png":
            ext = "png"
        elif format == "gif":
            ext = "gif"
        # 其他格式可能不支持，但保留
    except Exception as e:
        raise ValueError(f"Invalid image data: {e}")

    # 4. 生成唯一文件名
    filename = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(IMAGES_DIR, filename)

    # 5. 保存文件
    with open(file_path, "wb") as f:
        f.write(image_bytes)

    # 6. 创建资产记录
    asset = Asset(
        type="image",
        name=f"Image {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        description="Automatically saved from pipeline output",
        tags=[],  # 可留空或由前端后续编辑
        data={
            "file_path": file_path,
            "width": width,
            "height": height,
            "format": format,
            "original_base64_preview": base64_data[:100]  # 存储前100字符用于预览，但不存储全部
        },
        thumbnail=file_path,  # 直接使用文件路径作为缩略图，前端可读取
        source_asset_ids=source_ids or [],
        file_path=file_path
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    return asset.id


def get_video_info(file_path: str):
    """使用 ffprobe 获取视频信息"""
    import json
    cmd = [
        'ffprobe', '-v', 'quiet', '-print_format', 'json',
        '-show_streams', file_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    info = json.loads(result.stdout)
    video_stream = next(s for s in info['streams'] if s['codec_type'] == 'video')
    width = int(video_stream['width'])
    height = int(video_stream['height'])
    duration = float(video_stream.get('duration', 0))
    fps_parts = video_stream.get('r_frame_rate', '30/1').split('/')
    fps = int(fps_parts[0]) / int(fps_parts[1]) if len(fps_parts) == 2 else 30.0
    return width, height, duration, fps


def save_video_as_asset(video_path: str, db, name=None, source_ids=None, project_id=None):
    """保存视频文件为资产，并记录血缘"""
    # 生成唯一文件名
    ext = os.path.splitext(video_path)[1]
    new_filename = f"{uuid.uuid4().hex}{ext}"
    new_path = os.path.join(VIDEOS_DIR, new_filename)

    # 复制或移动文件（这里用复制）
    import shutil
    shutil.copy2(video_path, new_path)

    # 获取视频信息
    width, height, duration, fps = get_video_info(new_path)

    # 构造 data 字段
    data = VideoData(
        file_path=new_path,
        width=width,
        height=height,
        duration=duration,
        fps=fps,
        format=ext[1:].lower()
    ).dict()

    # 创建资产记录
    asset = Asset(
        type="video",
        name=name or f"Video {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        description="Automatically saved from pipeline output",
        tags=[],
        data=data,
        thumbnail=None,
        source_asset_ids=source_ids or [],
        file_path=new_path,
        project_id=project_id
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset.id