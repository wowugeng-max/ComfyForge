# frontend/gradio_app.py
import gradio as gr
import requests
import json

BACKEND_URL = "http://localhost:8000"

def run_pipeline(pipeline_json, api_keys_json):
    try:
        pipeline = json.loads(pipeline_json)
        api_keys = json.loads(api_keys_json)
    except json.JSONDecodeError as e:
        return f"JSON 解析错误: {e}"

    # 调用后端 API
    response = requests.post(f"{BACKEND_URL}/api/tasks/direct", json={
        "pipeline": pipeline,
        "api_keys": api_keys,
        "sync": True  # 同步等待
    })
    if response.status_code == 200:
        data = response.json()
        # 获取结果
        task_id = data["task_id"]
        # 由于是同步，结果应该已经在 tasks 中，可以直接再查询一次（或者后端直接返回结果）
        # 为了简单，我们直接再请求一次获取结果
        result_resp = requests.get(f"{BACKEND_URL}/api/tasks/{task_id}")
        if result_resp.status_code == 200:
            result_data = result_resp.json()
            return json.dumps(result_data, indent=2, ensure_ascii=False)
        else:
            return f"获取结果失败: {result_resp.text}"
    else:
        return f"请求失败: {response.text}"

with gr.Blocks(title="ComfyForge 测试") as demo:
    gr.Markdown("# ComfyForge 直接 API 管道测试")
    with gr.Row():
        pipeline_input = gr.Textbox(label="管道定义 (JSON)", lines=10, value=json.dumps([
            {
                "step": "llm",
                "provider": "grok",
                "model": "grok-1",
                "prompt": "生成一个赛博朋克女主的描述，20字以内",
                "output_var": "character_desc"
            },
            {
                "step": "image",
                "provider": "nano_banana",  # 假设有该适配器
                "model": "nano-1",
                "prompt": "{character_desc}",
                "output_var": "character_img"
            }
        ], indent=2, ensure_ascii=False))
        api_keys_input = gr.Textbox(label="API Keys (JSON)", lines=5, value=json.dumps({
            "grok": "your-grok-key",
            "nano_banana": "your-nano-key"
        }, indent=2))
    run_btn = gr.Button("运行")
    output = gr.JSON(label="结果")

    run_btn.click(fn=run_pipeline, inputs=[pipeline_input, api_keys_input], outputs=output)

if __name__ == "__main__":
    demo.launch(server_port=7860)