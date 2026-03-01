# frontend/forms/workflow_form.py
import gradio as gr
import requests
import json

def create_form(asset_name, asset_desc, asset_tags, asset_thumbnail, project_dropdown):
    with gr.Column() as col:
        gr.Markdown("#### 工作流 JSON")
        workflow_json = gr.Code(
            label="工作流定义",
            language="json",
            lines=15,
            value=json.dumps({
                "3": {
                    "class_type": "CheckpointLoaderSimple",
                    "inputs": {"ckpt_name": "v1-5-pruned-emaonly.ckpt"}
                },
                "4": {
                    "class_type": "CLIPTextEncode",
                    "inputs": {"text": "a beautiful landscape", "clip": ["3", 1]}
                }
            }, indent=2)
        )
        gr.Markdown("#### 参数定义（可选）")
        parameters_json = gr.Code(
            label="参数定义 (JSON)",
            language="json",
            lines=8,
            value=json.dumps({
                "positive_prompt": {
                    "node_id": "4",
                    "field": "inputs/text"
                },
                "negative_prompt": {
                    "node_id": "5",
                    "field": "inputs/text"
                }
            }, indent=2)
        )
        thumbnail_node = gr.Textbox(
            label="缩略图节点 ID（可选）",
            placeholder="例如：9"
        )
        save_btn = gr.Button("保存 Workflow 资产")
        save_result = gr.Textbox(label="保存结果", interactive=False)

        def save(name, desc, tags, thumbnail, project_id,
                 workflow_json_str, parameters_json_str, thumbnail_node):
            try:
                workflow_data = json.loads(workflow_json_str)
            except json.JSONDecodeError as e:
                return f"工作流 JSON 解析失败: {e}"
            try:
                parameters = json.loads(parameters_json_str) if parameters_json_str.strip() else {}
            except json.JSONDecodeError as e:
                return f"参数定义 JSON 解析失败: {e}"

            data = {
                "workflow_json": workflow_data,
                "parameters": parameters
            }
            if thumbnail_node:
                data["thumbnail_node_id"] = thumbnail_node

            tags_list = [t.strip() for t in tags.split(",") if t.strip()]
            payload = {
                "type": "workflow",
                "name": name,
                "description": desc,
                "tags": tags_list,
                "data": data,
                "thumbnail": thumbnail if thumbnail else None,
                "project_id": project_id
            }
            try:
                resp = requests.post("http://localhost:8000/api/assets/", json=payload)
                if resp.status_code == 200:
                    return f"资产保存成功，ID: {resp.json().get('id')}"
                else:
                    return f"保存失败: {resp.text}"
            except Exception as e:
                return f"请求异常: {e}"

        save_btn.click(
            fn=save,
            inputs=[asset_name, asset_desc, asset_tags, asset_thumbnail, project_dropdown,
                    workflow_json, parameters_json, thumbnail_node],
            outputs=save_result
        )
    return col