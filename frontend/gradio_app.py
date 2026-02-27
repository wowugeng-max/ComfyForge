import gradio as gr
import requests
import json
import base64
from PIL import Image
import io

BACKEND_URL = "http://localhost:8000"


# ========== 图像生成管道部分（原功能） ==========
def run_pipeline(pipeline_json, api_keys_json):
    try:
        pipeline = json.loads(pipeline_json)
        api_keys = json.loads(api_keys_json)
    except json.JSONDecodeError as e:
        return str(e), None

    try:
        response = requests.post(f"{BACKEND_URL}/api/tasks/direct", json={
            "pipeline": pipeline,
            "api_keys": api_keys,
            "sync": True
        }, timeout=60)
        if response.status_code != 200:
            return f"请求失败: {response.text}", None
    except Exception as e:
        return f"请求异常: {e}", None

    try:
        data = response.json()
    except Exception as e:
        return f"响应解析失败: {response.text[:200]}", None

    # 提取图像数据
    img_pil = None
    try:
        outputs = data.get("outputs", {})
        for key, value in outputs.items():
            if isinstance(value, str) and len(value) > 100:
                if value.startswith("iVBOR"):  # PNG
                    img_bytes = base64.b64decode(value)
                    img_pil = Image.open(io.BytesIO(img_bytes))
                    break
                elif value.startswith("/9j/"):  # JPEG
                    img_bytes = base64.b64decode(value)
                    img_pil = Image.open(io.BytesIO(img_bytes))
                    break
                elif value.startswith("data:image"):
                    header, encoded = value.split(",", 1)
                    img_bytes = base64.b64decode(encoded)
                    img_pil = Image.open(io.BytesIO(img_bytes))
                    break
    except Exception as e:
        img_pil = None

    return json.dumps(data, indent=2, ensure_ascii=False), img_pil


# ========== 资产管理功能 ==========
def load_assets(type_filter=""):
    try:
        url = f"{BACKEND_URL}/api/assets/"
        if type_filter:
            url += f"?type={type_filter}"
        resp = requests.get(url)
        if resp.status_code == 200:
            return resp.json()
        else:
            return [{"error": f"加载失败: {resp.text}"}]
    except Exception as e:
        return [{"error": str(e)}]


def save_asset(ast_type, name, desc, tags_str, data_json, thumbnail):
    try:
        tags = [t.strip() for t in tags_str.split(",") if t.strip()]
        data = json.loads(data_json) if data_json.strip() else {}
    except json.JSONDecodeError as e:
        return f"数据 JSON 格式错误: {e}"

    payload = {
        "type": ast_type,
        "name": name,
        "description": desc,
        "tags": tags,
        "data": data,
        "thumbnail": thumbnail if thumbnail else None
    }
    try:
        resp = requests.post(f"{BACKEND_URL}/api/assets/", json=payload)
        if resp.status_code == 200:
            return f"资产保存成功，ID: {resp.json().get('id')}"
        else:
            return f"保存失败: {resp.text}"
    except Exception as e:
        return f"请求异常: {e}"


def delete_asset(asset_id):
    try:
        resp = requests.delete(f"{BACKEND_URL}/api/assets/{asset_id}")
        if resp.status_code == 204:
            return f"资产 {asset_id} 已删除"
        else:
            return f"删除失败: {resp.text}"
    except Exception as e:
        return f"请求异常: {e}"


# ========== 构建界面 ==========
with gr.Blocks(title="ComfyForge") as demo:
    gr.Markdown("# ComfyForge 智能创作助理")

    with gr.Tab("图像生成管道"):
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

    with gr.Tab("资产管理"):
        with gr.Row():
            with gr.Column(scale=1):
                gr.Markdown("### 新建资产")
                asset_type = gr.Dropdown(["prompt", "character", "workflow", "image", "video", "lora"],
                                         label="资产类型", value="prompt")
                asset_name = gr.Textbox(label="资产名称")
                asset_desc = gr.Textbox(label="描述")
                asset_tags = gr.Textbox(label="标签 (用逗号分隔)", value="")
                asset_data = gr.Textbox(label="资产数据 (JSON)", lines=5, value="{}")
                asset_thumbnail = gr.Textbox(label="缩略图 (路径或base64，可选)")
                save_btn = gr.Button("保存资产")
                save_result = gr.Textbox(label="保存结果", interactive=False)

            with gr.Column(scale=2):
                gr.Markdown("### 资产列表")
                with gr.Row():
                    filter_type = gr.Dropdown(["", "prompt", "character", "workflow", "image", "video", "lora"],
                                              label="过滤类型", value="")
                    refresh_btn = gr.Button("刷新列表")
                asset_list = gr.JSON(label="资产列表")
                with gr.Row():
                    delete_id = gr.Number(label="要删除的资产ID", precision=0)
                    delete_btn = gr.Button("删除资产")
                    delete_result = gr.Textbox(label="删除结果", interactive=False)

        # 事件绑定
        refresh_btn.click(
            fn=load_assets,
            inputs=filter_type,
            outputs=asset_list
        )
        save_btn.click(
            fn=save_asset,
            inputs=[asset_type, asset_name, asset_desc, asset_tags, asset_data, asset_thumbnail],
            outputs=save_result
        )
        delete_btn.click(
            fn=delete_asset,
            inputs=delete_id,
            outputs=delete_result
        )
        # 页面加载时自动加载资产列表
        demo.load(fn=load_assets, inputs=filter_type, outputs=asset_list)

if __name__ == "__main__":
    demo.launch(server_port=7860)