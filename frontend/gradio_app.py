import gradio as gr
import requests
import json
import base64
from PIL import Image
import io

BACKEND_URL = "http://localhost:8000"


# ========== 图像生成管道部分 ==========
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


# ========== 项目管理功能 ==========
def load_projects():
    """获取所有项目列表，返回项目列表和用于下拉框的选项"""
    try:
        resp = requests.get(f"{BACKEND_URL}/api/projects/")
        if resp.status_code == 200:
            projects = resp.json()
            choices = [(p["name"], p["id"]) for p in projects]
            return projects, gr.Dropdown(choices=choices, value=None)
        else:
            return [{"error": f"加载失败: {resp.text}"}], gr.Dropdown(choices=[], value=None)
    except Exception as e:
        return [{"error": str(e)}], gr.Dropdown(choices=[], value=None)


def create_project(name, desc, tags_str):
    """创建新项目"""
    try:
        tags = [t.strip() for t in tags_str.split(",") if t.strip()]
        payload = {"name": name, "description": desc, "tags": tags}
        resp = requests.post(f"{BACKEND_URL}/api/projects/", json=payload)
        if resp.status_code == 200:
            return "项目创建成功", None
        else:
            return f"创建失败: {resp.text}", None
    except Exception as e:
        return f"请求异常: {e}", None


# ========== 资产管理功能 ==========
def load_assets(type_filter="", project_id=None):
    """获取资产列表，可按类型和项目过滤"""
    try:
        url = f"{BACKEND_URL}/api/assets/"
        params = {}
        if type_filter:
            params["type"] = type_filter
        if project_id is not None:
            params["project_id"] = project_id
        resp = requests.get(url, params=params)
        if resp.status_code == 200:
            return resp.json()
        else:
            return [{"error": f"加载失败: {resp.text}"}]
    except Exception as e:
        return [{"error": str(e)}]


def save_asset(ast_type, name, desc, tags_str, data_json, thumbnail, project_id):
    """保存资产，支持项目 ID"""
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
        "thumbnail": thumbnail if thumbnail else None,
        "project_id": project_id
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


def assign_asset_to_project(asset_id, project_id):
    """将资产分配到指定项目"""
    if not asset_id:
        return "请填写资产ID"
    if not project_id:
        return "请填写目标项目ID"
    try:
        resp = requests.put(f"{BACKEND_URL}/api/assets/{asset_id}", json={
            "project_id": project_id
        })
        if resp.status_code == 200:
            return f"资产 {asset_id} 已分配到项目 {project_id}"
        else:
            return f"分配失败: {resp.text}"
    except Exception as e:
        return f"请求异常: {e}"


def detach_asset_from_project(asset_id):
    """将资产从项目中剥离（project_id 设为 null）"""
    if not asset_id:
        return "请填写资产ID"
    try:
        resp = requests.put(f"{BACKEND_URL}/api/assets/{asset_id}", json={
            "project_id": None
        })
        if resp.status_code == 200:
            return f"资产 {asset_id} 已从项目中剥离"
        else:
            return f"剥离失败: {resp.text}"
    except Exception as e:
        return f"请求异常: {e}"


# ========== 构建界面 ==========
with gr.Blocks(title="ComfyForge") as demo:
    gr.Markdown("# ComfyForge 智能创作助理")

    # 图像生成管道选项卡
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

    # 资产管理选项卡
    with gr.Tab("资产管理"):
        with gr.Row():
            # 左侧：项目管理区域
            with gr.Column(scale=1):
                gr.Markdown("### 项目管理")
                refresh_projects_btn = gr.Button("刷新项目列表")
                project_dropdown = gr.Dropdown(
                    label="当前项目",
                    choices=[],
                    interactive=True,
                    value=None
                )
                new_project_name = gr.Textbox(label="新项目名称")
                new_project_desc = gr.Textbox(label="新项目描述")
                new_project_tags = gr.Textbox(label="新项目标签 (逗号分隔)")
                create_project_btn = gr.Button("创建项目")
                project_create_result = gr.Textbox(label="创建结果", interactive=False)
                project_list = gr.JSON(label="项目列表")

            # 右侧：资产管理区域
            with gr.Column(scale=2):
                gr.Markdown("### 资产库")
                with gr.Row():
                    filter_type = gr.Dropdown(
                        ["", "prompt", "character", "workflow", "image", "video", "lora"],
                        label="过滤类型",
                        value=""
                    )
                    refresh_assets_btn = gr.Button("刷新资产列表")
                asset_list = gr.JSON(label="资产列表")

                gr.Markdown("#### 新建资产")
                asset_type = gr.Dropdown(
                    ["prompt", "character", "workflow", "image", "video", "lora"],
                    label="资产类型",
                    value="prompt"
                )
                asset_name = gr.Textbox(label="资产名称")
                asset_desc = gr.Textbox(label="描述")
                asset_tags = gr.Textbox(label="标签 (用逗号分隔)", value="")
                asset_data = gr.Textbox(label="资产数据 (JSON)", lines=5, value="{}")
                asset_thumbnail = gr.Textbox(label="缩略图 (路径或base64，可选)")
                gr.Markdown("资产将归属于当前选中的项目（可选）")
                save_asset_btn = gr.Button("保存资产")
                save_asset_result = gr.Textbox(label="保存结果", interactive=False)

                with gr.Row():
                    delete_id = gr.Number(label="要删除的资产ID", precision=0)
                    delete_asset_btn = gr.Button("删除资产")
                    delete_asset_result = gr.Textbox(label="删除结果", interactive=False)

                # 新增：资产分配/剥离功能区
                with gr.Row():
                    with gr.Column():
                        gr.Markdown("### 分配资产到项目")
                        assign_asset_id = gr.Number(label="资产ID", precision=0)
                        assign_project_id = gr.Number(label="目标项目ID", precision=0)
                        assign_btn = gr.Button("分配资产")
                        assign_result = gr.Textbox(label="分配结果", interactive=False)

                    with gr.Column():
                        gr.Markdown("### 从项目剥离资产")
                        detach_asset_id = gr.Number(label="资产ID", precision=0)
                        detach_btn = gr.Button("剥离资产")
                        detach_result = gr.Textbox(label="剥离结果", interactive=False)


        # ===== 事件绑定 =====
        # 项目相关
        def refresh_projects_and_dropdown():
            projects, dropdown = load_projects()
            return projects, dropdown


        refresh_projects_btn.click(
            fn=refresh_projects_and_dropdown,
            outputs=[project_list, project_dropdown]
        )

        create_project_btn.click(
            fn=create_project,
            inputs=[new_project_name, new_project_desc, new_project_tags],
            outputs=[project_create_result, project_dropdown]
        ).then(
            fn=refresh_projects_and_dropdown,
            outputs=[project_list, project_dropdown]
        )


        # 资产相关
        def load_assets_with_project(type_filter, project_dd_value):
            return load_assets(type_filter=type_filter, project_id=project_dd_value)


        refresh_assets_btn.click(
            fn=load_assets_with_project,
            inputs=[filter_type, project_dropdown],
            outputs=asset_list
        )


        def save_asset_with_project(ast_type, name, desc, tags_str, data_json, thumbnail, project_dd_value):
            return save_asset(ast_type, name, desc, tags_str, data_json, thumbnail, project_dd_value)


        save_asset_btn.click(
            fn=save_asset_with_project,
            inputs=[asset_type, asset_name, asset_desc, asset_tags, asset_data, asset_thumbnail, project_dropdown],
            outputs=save_asset_result
        ).then(
            fn=load_assets_with_project,
            inputs=[filter_type, project_dropdown],
            outputs=asset_list
        )

        delete_asset_btn.click(
            fn=delete_asset,
            inputs=delete_id,
            outputs=delete_asset_result
        ).then(
            fn=load_assets_with_project,
            inputs=[filter_type, project_dropdown],
            outputs=asset_list
        )

        # 分配/剥离事件
        assign_btn.click(
            fn=assign_asset_to_project,
            inputs=[assign_asset_id, assign_project_id],
            outputs=assign_result
        ).then(
            fn=load_assets_with_project,
            inputs=[filter_type, project_dropdown],
            outputs=asset_list
        )

        detach_btn.click(
            fn=detach_asset_from_project,
            inputs=detach_asset_id,
            outputs=detach_result
        ).then(
            fn=load_assets_with_project,
            inputs=[filter_type, project_dropdown],
            outputs=asset_list
        )

        # 页面加载时自动加载项目列表和资产列表
        demo.load(
            fn=refresh_projects_and_dropdown,
            outputs=[project_list, project_dropdown]
        )
        demo.load(
            fn=load_assets_with_project,
            inputs=[filter_type, project_dropdown],
            outputs=asset_list
        )

if __name__ == "__main__":
    demo.launch(server_port=7860)