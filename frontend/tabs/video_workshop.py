# frontend/tabs/video_workshop.py
import gradio as gr
import requests
import json
import os
import shutil
import time

BACKEND_URL = "http://localhost:8000"

def generate_video(workflow_asset_id, segments_json, backend):
    if not workflow_asset_id:
        return None, "请填写工作流模板资产ID"
    try:
        segments = json.loads(segments_json)
        if not isinstance(segments, list) or len(segments) == 0:
            return None, "段列表必须为非空列表"
        for seg in segments:
            if not all(k in seg for k in ("frame_a_asset_id", "frame_b_asset_id", "prompt_asset_id")):
                return None, "每个段必须包含 frame_a_asset_id, frame_b_asset_id, prompt_asset_id"
    except json.JSONDecodeError as e:
        return None, f"JSON格式错误: {e}"

    task = {
        "workflow_asset_id": int(workflow_asset_id),
        "segments": segments,
        "project_id": None,
        "source_asset_ids": []
    }

    if backend == "本地 (5090)":
        endpoint = f"{BACKEND_URL}/api/tasks/real_video_loop"
        timeout = 600
    else:
        endpoint = f"{BACKEND_URL}/api/tasks/cloud_video_loop"
        timeout = 600

    try:
        response = requests.post(endpoint, json=task, timeout=timeout)
        if response.status_code == 200:
            data = response.json()
            final_path = data.get("final_video")
            if final_path and os.path.exists(final_path):
                return final_path, "生成成功！"
            else:
                return None, f"生成失败: 视频文件不存在 {final_path}"
        else:
            return None, f"生成失败: {response.text}"
    except requests.exceptions.Timeout:
        return None, f"请求超时（超过{timeout}秒），请稍后重试"
    except Exception as e:
        return None, f"请求异常: {e}"

def create_tab():
    with gr.Tab("🎬 视频工坊"):
        gr.Markdown("## 多段视频生成（手动指定每段的首帧、尾帧和提示词）")
        with gr.Row():
            with gr.Column():
                workflow_asset_id = gr.Number(
                    label="1. 工作流模板资产ID",
                    precision=0,
                    value=None
                )
                segments_json = gr.Textbox(
                    label="2. 段定义 (JSON列表)",
                    lines=10,
                    value=json.dumps([
                        {"frame_a_asset_id": 1, "frame_b_asset_id": 2, "prompt_asset_id": 3},
                        {"frame_a_asset_id": 4, "frame_b_asset_id": 5, "prompt_asset_id": 6}
                    ], indent=2),
                    info="每个段需包含 frame_a_asset_id, frame_b_asset_id, prompt_asset_id"
                )
                execution_backend = gr.Radio(
                    ["本地 (5090)", "云端 RunningHub"],
                    label="3. 选择执行后端",
                    value="本地 (5090)"
                )
                generate_btn = gr.Button("✨ 一键生成", variant="primary")

            with gr.Column():
                output_video = gr.Video(label="生成结果")
                status = gr.Textbox(label="状态", interactive=False)

        generate_btn.click(
            fn=generate_video,
            inputs=[workflow_asset_id, segments_json, execution_backend],
            outputs=[output_video, status]
        )

        gr.Markdown("""
        ---
        ### 📌 使用说明
        - **工作流模板**：必须包含参数 `frame_a`, `frame_b`, `prompt`，对应首帧图像节点、尾帧图像节点、提示词文本节点。
        - **段定义**：一个 JSON 列表，每个元素包含三个资产 ID。
        - **资产准备**：提前在“资产管理”中上传图像（类型 `image`）和提示词（类型 `prompt`）资产。
        - **生成结果**：所有段依次生成并拼接，自动保存为视频资产。
        """)