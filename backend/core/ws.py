# backend/core/ws.py
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # 记录所有活跃的节点连接: { "node_id": WebSocket }
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        print(f"🔗 [WS] 节点 {client_id} 已连接")

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            print(f"🛑 [WS] 节点 {client_id} 已断开")

    async def send_message(self, message: dict, client_id: str):
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json(message)
            except Exception as e:
                print(f"⚠️ [WS] 发送消息至 {client_id} 失败: {e}")

manager = ConnectionManager()