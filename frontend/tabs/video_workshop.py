# frontend/tabs/video_workshop.py
import gradio as gr
import requests
import json
import os
import shutil
import time

BACKEND_URL = "http://localhost:8000"


def generate_video(initial_file, total_sec, segment_sec, global_prompt):
    if initial_file is None:
        return None, "请上传初始视频"

    # 将上传的文件保存到本地数据目录，以便后端访问
    os.makedirs("data/uploads", exist_ok=True)
    original_name = os.path.basename(initial_file.name)
    # 避免文件名冲突，添加时间戳
    base, ext = os.path.splitext(original_name)
    dest_path = f"data/uploads/{base}_{int(time.time())}{ext}"
    shutil.copy(initial_file.name, dest_path)

    # 构造任务定义
    task = {
        "initial_video_path": dest_path,
        "total_seconds": total_sec,
        "segment_seconds": segment_sec,
        "global_prompt": global_prompt,
        "project_id": None,
        "source_asset_ids": []
    }

    # 调用后端执行器
    try:
        print(f"发送请求到后端，总时长={total_sec}, 每段时长={segment_sec}")
        response = requests.post(f"{BACKEND_URL}/api/tasks/video_loop", json=task, timeout=60)
        print(f"请求完成，状态码: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            final_path = data.get("final_video")
            return final_path, "生成成功！"
        else:
            return None, f"生成失败: {response.text}"
    except Exception as e:
        print(f"请求异常: {e}")
        return None, f"请求异常: {e}"


def create_tab():
    with gr.Tab("🎬 视频工坊"):
        gr.Markdown("## 一键生成超长视频（本地模拟版）")
        with gr.Row():
            with gr.Column():
                initial_input = gr.File(label="1. 上传起始视频", file_types=["video"])
                total_duration = gr.Slider(10, 300, value=30, step=10, label="目标时长 (秒)")
                segment_duration = gr.Slider(5, 20, value=10, step=5, label="每段时长 (秒)")
                global_prompt = gr.Textbox(label="2. 描述视频内容", lines=3, placeholder="例如：一只可爱的柯基在奔跑...")
                generate_btn = gr.Button("✨ 一键生成", variant="primary")

            with gr.Column():
                output_video = gr.Video(label="生成结果")
                status = gr.Textbox(label="状态", interactive=False)

        generate_btn.click(
            fn=generate_video,
            inputs=[initial_input, total_duration, segment_duration, global_prompt],
            outputs=[output_video, status]
        )