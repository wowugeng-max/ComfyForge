import gradio as gr
import requests
import json
import base64
from PIL import Image
import io

BACKEND_URL = "http://localhost:8000"

def create_placeholder_image(text="生成中..."):
    """创建一个简单的占位图像（红色背景，白色文字）"""
    from PIL import Image, ImageDraw
    img = Image.new('RGB', (512, 512), color='red')
    draw = ImageDraw.Draw(img)
    draw.text((10, 256), text, fill='white')
    return img

def run_pipeline(pipeline_json, api_keys_json):
    print(">>> 函数开始执行")
    try:
        pipeline = json.loads(pipeline_json)
        api_keys = json.loads(api_keys_json)
        print(">>> JSON 解析成功")
    except json.JSONDecodeError as e:
        print(f">>> JSON 解析错误: {e}")
        return str(e), create_placeholder_image("JSON错误")

    try:
        print(f">>> 发送请求到 {BACKEND_URL}/api/tasks/direct")
        response = requests.post(f"{BACKEND_URL}/api/tasks/direct", json={
            "pipeline": pipeline,
            "api_keys": api_keys,
            "sync": True
        }, timeout=60)
        print(f">>> 请求完成，状态码: {response.status_code}")
        if response.status_code != 200:
            return f"请求失败: {response.text}", create_placeholder_image("请求失败")
    except Exception as e:
        print(f">>> 请求异常: {e}")
        return f"请求异常: {e}", create_placeholder_image("网络错误")

    try:
        data = response.json()
        print(">>> 响应 JSON 解析成功")
        print(f">>> 响应 keys: {list(data.keys())}")
    except Exception as e:
        print(f">>> JSON 解析异常: {e}")
        return f"响应解析失败: {response.text[:200]}", create_placeholder_image("解析错误")

    # 提取图像数据
    img_pil = None
    try:
        outputs = data.get("outputs", {})
        print(f">>> outputs keys: {list(outputs.keys())}")
        for key, value in outputs.items():
            if isinstance(value, str) and len(value) > 100:
                print(f">>> 找到长字符串，key={key}, 长度={len(value)}, 前缀={value[:30]}")
                if value.startswith("iVBOR"):  # PNG
                    print(">>> 检测到 PNG base64")
                    img_bytes = base64.b64decode(value)
                    img_pil = Image.open(io.BytesIO(img_bytes))
                    break
                elif value.startswith("/9j/"): # JPEG
                    print(">>> 检测到 JPEG base64")
                    img_bytes = base64.b64decode(value)
                    img_pil = Image.open(io.BytesIO(img_bytes))
                    break
                elif value.startswith("data:image"):
                    print(">>> 检测到 data URL")
                    # 从 data URL 提取 base64
                    header, encoded = value.split(",", 1)
                    img_bytes = base64.b64decode(encoded)
                    img_pil = Image.open(io.BytesIO(img_bytes))
                    break
    except Exception as e:
        print(f">>> 图像处理异常: {e}")
        img_pil = create_placeholder_image(f"图像错误: {str(e)[:20]}")

    if img_pil is None:
        print(">>> 未找到图像数据，使用占位图")
        img_pil = create_placeholder_image("无图像")

    # 返回原始响应文本和 PIL 图像
    return json.dumps(data, indent=2, ensure_ascii=False), img_pil

with gr.Blocks(title="ComfyForge 测试") as demo:
    gr.Markdown("# ComfyForge 直接 API 管道测试")
    with gr.Row():
        with gr.Column():
            pipeline_input = gr.Textbox(
                label="管道定义 (JSON)",
                lines=10,
                value=json.dumps([
                    {
                        "step": "image",
                        "provider": "Qwen",
                        "model": "z-image-turbo",
                        "prompt": "霓虹雨夜，机械又暖，冷艳黑盔行未央城",
                        "output_var": "character_img"
                    }
                ], indent=2, ensure_ascii=False)
            )
            api_keys_input = gr.Textbox(
                label="API Keys (JSON)",
                lines=5,
                value=json.dumps({
                    "Qwen": "sk-3a209363921e4cdd969958d48e00e3df"
                }, indent=2)
            )
            run_btn = gr.Button("运行")
    with gr.Row():
        output_text = gr.Textbox(label="原始响应", lines=20)
        output_image = gr.Image(label="生成的图像", type="pil")
    run_btn.click(
        fn=run_pipeline,
        inputs=[pipeline_input, api_keys_input],
        outputs=[output_text, output_image]
    )

if __name__ == "__main__":
    demo.launch(server_port=7860)