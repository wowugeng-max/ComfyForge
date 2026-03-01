# backend/core/key_tester.py
import requests
from typing import Dict, Any
import time


def test_key(provider: str, key: str) -> Dict[str, Any]:
    """测试Key的有效性，返回状态和剩余额度"""

    if provider == "Qwen":
        return test_qwen_key(key)
    elif provider == "Gemini":
        return test_gemini_key(key)
    elif provider == "Grok":
        return test_grok_key(key)
    elif provider == "Hailuo":
        return test_hailuo_key(key)
    else:
        # 通用测试：尝试调用模型列表接口
        return test_generic_key(provider, key)


def test_qwen_key(key: str) -> Dict[str, Any]:
    """测试通义千问Key"""
    try:
        url = "https://dashscope.aliyuncs.com/compatible-mode/v1/models"
        headers = {"Authorization": f"Bearer {key}"}
        response = requests.get(url, headers=headers, timeout=10)

        if response.status_code == 200:
            # 尝试查询余额（需要额外接口）
            return {"valid": True, "quota_remaining": None, "message": "Key有效"}
        else:
            return {"valid": False, "message": f"无效Key: {response.text}"}
    except Exception as e:
        return {"valid": False, "message": str(e)}


def test_gemini_key(key: str) -> Dict[str, Any]:
    """测试Gemini Key"""
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            # Gemini没有直接额度查询接口
            return {"valid": True, "quota_remaining": None, "message": "Key有效"}
        else:
            return {"valid": False, "message": f"无效Key: {response.text}"}
    except Exception as e:
        return {"valid": False, "message": str(e)}


def test_grok_key(key: str) -> Dict[str, Any]:
    """测试Grok Key"""
    try:
        url = "https://api.x.ai/v1/models"
        headers = {"Authorization": f"Bearer {key}"}
        response = requests.get(url, headers=headers, timeout=10)

        if response.status_code == 200:
            return {"valid": True, "quota_remaining": None, "message": "Key有效"}
        else:
            return {"valid": False, "message": f"无效Key: {response.text}"}
    except Exception as e:
        return {"valid": False, "message": str(e)}


def test_hailuo_key(key: str) -> Dict[str, Any]:
    """测试海螺Key（MiniMax）"""
    try:
        # MiniMax的测试接口
        url = "https://api.minimax.chat/v1/user/info"
        headers = {"Authorization": f"Bearer {key}"}
        response = requests.get(url, headers=headers, timeout=10)

        if response.status_code == 200:
            data = response.json()
            quota_remaining = data.get("data", {}).get("quota", {}).get("remaining")
            return {"valid": True, "quota_remaining": quota_remaining, "message": "Key有效"}
        else:
            return {"valid": False, "message": f"无效Key: {response.text}"}
    except Exception as e:
        return {"valid": False, "message": str(e)}


def test_generic_key(provider: str, key: str) -> Dict[str, Any]:
    """通用测试：尝试调用模型列表接口"""
    # 这里需要根据provider拼接不同的URL
    # 暂时返回未知
    return {"valid": True, "quota_remaining": None, "message": "需手动验证"}