# frontend/tabs/key_manager.py
import gradio as gr
import requests
import json

BACKEND_URL = "http://localhost:8000"


def load_keys(provider_filter=""):
    try:
        url = f"{BACKEND_URL}/api/keys/"
        if provider_filter:
            url += f"?provider={provider_filter}"
        resp = requests.get(url)
        if resp.status_code == 200:
            return resp.json()
        else:
            return [{"error": f"加载失败: {resp.text}"}]
    except Exception as e:
        return [{"error": str(e)}]


def add_key(provider, key, description, priority, tags_str):
    tags = [t.strip() for t in tags_str.split(",") if t.strip()]
    payload = {
        "provider": provider,
        "key": key,
        "description": description,
        "priority": priority,
        "tags": tags
    }
    try:
        resp = requests.post(f"{BACKEND_URL}/api/keys/", json=payload)
        if resp.status_code == 200:
            return "Key添加成功", resp.json()
        else:
            return f"添加失败: {resp.text}", None
    except Exception as e:
        return f"请求异常: {e}", None


def test_key(key_id):
    try:
        resp = requests.post(f"{BACKEND_URL}/api/keys/{key_id}/test")
        if resp.status_code == 200:
            result = resp.json()
            if result.get("valid"):
                return f"✅ Key有效" + (
                    f"，剩余额度: {result.get('quota_remaining')}" if result.get("quota_remaining") else "")
            else:
                return f"❌ Key无效: {result.get('message')}"
        else:
            return f"测试失败: {resp.text}"
    except Exception as e:
        return f"请求异常: {e}"


def create_tab():
    with gr.Tab("🔑 Key管理"):
        gr.Markdown("## API密钥管理 - 让每一分钱都花在刀刃上")

        with gr.Row():
            with gr.Column(scale=1):
                gr.Markdown("### 添加新Key")
                provider = gr.Dropdown(
                    ["Qwen", "Gemini", "Grok", "Hailuo", "OpenAI"],
                    label="提供商"
                )
                key_input = gr.Textbox(label="API Key", type="password")
                key_desc = gr.Textbox(label="备注")
                priority = gr.Slider(0, 10, value=5, step=1, label="优先级 (0最高)")
                tags = gr.Textbox(label="标签 (逗号分隔)", value="")
                add_btn = gr.Button("添加Key")
                add_result = gr.Textbox(label="添加结果", interactive=False)

            with gr.Column(scale=2):
                gr.Markdown("### Key列表")
                with gr.Row():
                    filter_provider = gr.Dropdown(
                        ["", "Qwen", "Gemini", "Grok", "Hailuo", "OpenAI"],
                        label="过滤提供商"
                    )
                    refresh_btn = gr.Button("刷新列表")
                key_list = gr.JSON(label="Keys")

                with gr.Row():
                    test_id = gr.Number(label="测试Key ID", precision=0)
                    test_btn = gr.Button("测试Key")
                    test_all_btn = gr.Button("测试所有Key")
                    test_result = gr.Textbox(label="测试结果")



        # 事件绑定
        refresh_btn.click(
            fn=load_keys,
            inputs=filter_provider,
            outputs=key_list
        )

        add_btn.click(
            fn=add_key,
            inputs=[provider, key_input, key_desc, priority, tags],
            outputs=[add_result, key_list]
        )

        test_btn.click(
            fn=test_key,
            inputs=test_id,
            outputs=test_result
        )

        test_all_btn.click(
            fn=test_all_keys,
            outputs=[test_result, key_list]  # 假设key_list是刷新后的列表
        )


def test_all_keys():
    try:
        resp = requests.post(f"{BACKEND_URL}/api/keys/test-all")
        if resp.status_code == 200:
            results = resp.json()
            # 可以简单显示结果，或触发列表刷新
            return "批量测试完成", results
        else:
            return f"测试失败: {resp.text}", None
    except Exception as e:
        return f"请求异常: {e}", None

