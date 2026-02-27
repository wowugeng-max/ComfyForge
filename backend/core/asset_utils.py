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

# 配置图像存储目录
IMAGES_DIR = "data/assets/images"
os.makedirs(IMAGES_DIR, exist_ok=True)


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