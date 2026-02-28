import gradio as gr
import requests
import json

def create_form(asset_name, asset_desc, asset_tags, asset_thumbnail, project_dropdown):
    with gr.Column() as col:
        core_prompt_id = gr.Number(label="核心提示词资产ID", precision=0)
        image_ids = gr.Textbox(label="图片资产ID (逗号分隔)")
        lora_id = gr.Number(label="LoRA资产ID", precision=0, value=None)
        variants_json = gr.Textbox(label="变体提示词资产ID (JSON)", lines=3, value="{}")
        save_btn = gr.Button("保存 Character 资产")
        save_result = gr.Textbox(label="保存结果", interactive=False)

        def save(name, desc, tags, thumbnail, project_id,
                 core_prompt_id, image_ids, lora_id, variants_json):
            # 处理图片ID列表
            image_id_list = [int(x.strip()) for x in image_ids.split(",") if x.strip()]
            # 处理变体 JSON
            variants = json.loads(variants_json) if variants_json.strip() else {}
            data = {
                "core_prompt_asset_id": core_prompt_id,
                "image_asset_ids": image_id_list,
                "variants": variants
            }
            if lora_id:
                data["lora_asset_id"] = lora_id

            tags_list = [t.strip() for t in tags.split(",") if t.strip()]
            payload = {
                "type": "character",
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
                    core_prompt_id, image_ids, lora_id, variants_json],
            outputs=save_result
        )
    return col