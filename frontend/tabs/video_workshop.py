# frontend/tabs/video_workshop.py
import gradio as gr
import requests
import json
import os
import shutil
import time

BACKEND_URL = "http://localhost:8000"


def generate_video(initial_file, total_sec, segment_sec, global_prompt, backend):
    """生成视频，根据后端选择调用不同API"""
    if initial_file is None:
        return None, "请上传初始视频"

    # 将上传的文件保存到本地数据目录
    os.makedirs("data/uploads", exist_ok=True)
    original_name = os.path.basename(initial_file.name)
    base, ext = os.path.splitext(original_name)
    dest_path = f"data/uploads/{base}_{int(time.time())}{ext}"
    shutil.copy(initial_file.name, dest_path)

    # 构造任务定义（两种后端共用同一套参数）
    task = {
        "initial_video_path": dest_path,
        "total_seconds": total_sec,
        "segment_seconds": segment_sec,
        "global_prompt": global_prompt,
        "segment_prompts": [],  # 可扩展为列表
        "project_id": None,
        "source_asset_ids": []
    }

    # 根据后端选择API端点
    if backend == "本地 (5090)":
        endpoint = f"{BACKEND_URL}/api/tasks/video_loop"
        timeout = 60  # 本地任务超时较短
    else:
        endpoint = f"{BACKEND_URL}/api/tasks/cloud_video_loop"
        timeout = 600  # 云端任务可能需要更长时间

    print(f"调用后端: {backend}, 端点: {endpoint}")
    print(f"任务参数: 总时长={total_sec}s, 每段时长={segment_sec}s")

    try:
        response = requests.post(endpoint, json=task, timeout=timeout)
        print(f"请求完成，状态码: {response.status_code}")
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
        print(f"请求异常: {e}")
        return None, f"请求异常: {e}"


def create_tab():
    with gr.Tab("🎬 视频工坊"):
        gr.Markdown("## 一键生成超长视频（支持本地/云端双引擎）")
        with gr.Row():
            with gr.Column():
                initial_input = gr.File(
                    label="1. 上传起始视频",
                    file_types=["video"]
                )
                with gr.Row():
                    total_duration = gr.Slider(
                        minimum=10,
                        maximum=300,
                        value=30,
                        step=10,
                        label="目标时长 (秒)"
                    )
                    segment_duration = gr.Slider(
                        minimum=5,
                        maximum=20,
                        value=10,
                        step=5,
                        label="每段时长 (秒)"
                    )
                global_prompt = gr.Textbox(
                    label="2. 描述视频内容",
                    lines=3,
                    placeholder="例如：一只可爱的柯基在草地上奔跑..."
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

        # 绑定事件
        generate_btn.click(
            fn=generate_video,
            inputs=[
                initial_input,
                total_duration,
                segment_duration,
                global_prompt,
                execution_backend
            ],
            outputs=[output_video, status]
        )

        # 添加说明信息
        gr.Markdown("""
        ---
        ### 📌 使用说明
        - **本地模式**：使用你的 RTX 5090 本地生成，速度快，免费
        - **云端模式**：通过 RunningHub 云端生成，适合超长视频或本地繁忙时使用
        - 每段时长建议不超过20秒，避免显存不足
        - 生成结果自动保存为视频资产，可在“资产管理”中查看
        """)