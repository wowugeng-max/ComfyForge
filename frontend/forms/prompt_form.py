import gradio as gr
import requests

def create_form(asset_name, asset_desc, asset_tags, asset_thumbnail, project_dropdown):
    with gr.Column() as col:
        content = gr.Textbox(label="提示词内容", lines=3)
        negative = gr.Textbox(label="负面提示词 (可选)", lines=2)
        save_btn = gr.Button("保存 Prompt 资产")
        save_result = gr.Textbox(label="保存结果", interactive=False)

        def save(name, desc, tags, thumbnail, project_id, content, negative):
            # 构造 data
            data = {"content": content}
            if negative:
                data["negative"] = negative
            # 处理标签
            tags_list = [t.strip() for t in tags.split(",") if t.strip()]
            payload = {
                "type": "prompt",
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
            inputs=[asset_name, asset_desc, asset_tags, asset_thumbnail, project_dropdown, content, negative],
            outputs=save_result
        )
    return col