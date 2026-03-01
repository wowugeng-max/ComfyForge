# backend/core/key_tester.py
import requests
import time
from typing import Dict, Any, Optional

def test_key(provider: str, key: str) -> Dict[str, Any]:
    """统一测试入口，返回结果字典包含valid, quota_remaining, message等"""
    if provider == "Qwen":
        return test_qwen_key(key)
    elif provider == "Gemini":
        return test_gemini_key(key)
    elif provider == "Grok":
        return test_grok_key(key)
    elif provider == "Hailuo":
        return test_hailuo_key(key)
    elif provider == "OpenAI":
        return test_openai_key(key)
    else:
        return {"valid": False, "message": f"Unsupported provider: {provider}"}

def test_qwen_key(key: str) -> Dict[str, Any]:
    try:
        # 使用OpenAI兼容模式调用模型列表接口，可以判断Key有效性
        url = "https://dashscope.aliyuncs.com/compatible-mode/v1/models"
        headers = {"Authorization": f"Bearer {key}"}
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            # 尝试获取余额（需要额外接口，DashScope有查询余额接口）
            # 这里可以调用 dashscope 的余额接口
            quota = get_dashscope_quota(key)  # 自定义函数
            return {"valid": True, "quota_remaining": quota, "message": "有效Key"}
        else:
            return {"valid": False, "message": f"无效Key: {resp.text}"}
    except Exception as e:
        return {"valid": False, "message": str(e)}

def get_dashscope_quota(key: str) -> Optional[int]:
    """查询DashScope余额，如果无法查询返回None"""
    try:
        url = "https://dashscope.aliyuncs.com/api/v1/users/quota"
        headers = {"Authorization": f"Bearer {key}"}
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("data", {}).get("available_quota")
    except:
        pass
    return None

def test_gemini_key(key: str) -> Dict[str, Any]:
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            # Gemini没有剩余额度查询，只能返回None
            return {"valid": True, "quota_remaining": None, "message": "有效Key"}
        else:
            return {"valid": False, "message": f"无效Key: {resp.text}"}
    except Exception as e:
        return {"valid": False, "message": str(e)}

def test_grok_key(key: str) -> Dict[str, Any]:
    try:
        url = "https://api.x.ai/v1/models"
        headers = {"Authorization": f"Bearer {key}"}
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            return {"valid": True, "quota_remaining": None, "message": "有效Key"}
        else:
            return {"valid": False, "message": f"无效Key: {resp.text}"}
    except Exception as e:
        return {"valid": False, "message": str(e)}

def test_hailuo_key(key: str) -> Dict[str, Any]:
    try:
        # MiniMax 海螺API测试（假设有用户信息接口）
        url = "https://api.minimax.chat/v1/user/info"
        headers = {"Authorization": f"Bearer {key}"}
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            quota_remaining = data.get("data", {}).get("quota", {}).get("remaining")
            return {"valid": True, "quota_remaining": quota_remaining, "message": "有效Key"}
        else:
            return {"valid": False, "message": f"无效Key: {resp.text}"}
    except Exception as e:
        return {"valid": False, "message": str(e)}

def test_openai_key(key: str) -> Dict[str, Any]:
    try:
        url = "https://api.openai.com/v1/models"
        headers = {"Authorization": f"Bearer {key}"}
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            # OpenAI 没有公开余额接口，但有信用查询（需单独接口）
            # 可以通过查询账户信息获取
            return {"valid": True, "quota_remaining": None, "message": "有效Key"}
        else:
            return {"valid": False, "message": f"无效Key: {resp.text}"}
    except Exception as e:
        return {"valid": False, "message": str(e)}