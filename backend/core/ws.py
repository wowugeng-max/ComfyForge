# backend/core/ws.py
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # 记录所有活跃的节点连接: { "node_id": WebSocket }
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        print(f"🔗 [WS] 节点 {client_id} 建立连接成功！")

    def disconnect(self, websocket: WebSocket, client_id: str):
        if client_id in self.active_connections:
            # 🌟 核心防误杀：严格对比内存地址，确保存储的Socket就是当前断开的这个，才允许删除！
            if self.active_connections[client_id] == websocket:
                del self.active_connections[client_id]
                print(f"🛑 [WS] 节点 {client_id} 已安全断开")

    async def send_message(self, message: dict, client_id: str):
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json(message)
                # 打印成功日志，方便我们追踪！
                if message.get("type") == "result":
                    print(f"✅ [WS] 成功将最终产物推包至节点 {client_id}")
            except Exception as e:
                print(f"⚠️ [WS] 发送消息至 {client_id} 失败: {e}")
        else:
            print(f"⚠️ [WS] 丢包警告：找不到节点 {client_id} 的连接！(活跃列表: {list(self.active_connections.keys())})")

manager = ConnectionManager()