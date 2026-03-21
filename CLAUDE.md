# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is ComfyForge

A visual AI workflow builder — users compose AI/image/video processing pipelines on a node-graph canvas and the backend executes them as a DAG. Think ComfyUI but self-hosted and extensible to any LLM/image/video provider.

## Commands

### Backend
```bash
# Activate virtualenv (Windows)
.venv/Scripts/activate

# Install dependencies
pip install -r requirements.txt

# Start backend (port 8000)
python run_backend.py
```

### Frontend
```bash
cd frontend-react

# Install dependencies
npm install

# Dev server (port 5173, proxies /api → localhost:8000 including WebSocket)
npm run dev

# Production build (type-checks then bundles)
npm run build

# Lint
npm run lint
```

No test suite is currently configured.

## Architecture

### Full-Stack Communication
- Frontend at `:5173`, backend at `:8000`
- Vite proxy forwards all `/api/*` requests (including WebSocket `ws:true`) to the backend — no CORS issues in dev
- Long-running generation tasks use WebSocket (`/api/ws/{client_id}`) for streaming results back to nodes
- Short/sync calls use Axios over HTTP

### Backend (`backend/`)

| Layer | Path | Purpose |
|---|---|---|
| Entry point | `app.py` | FastAPI app, lifespan hooks, all in-line routes for tasks/generate/interrupt/WebSocket |
| API routers | `api/` | REST endpoints: assets, projects, keys, providers, models, suggestions, recommendation_rules |
| Core | `core/` | DAG execution, adapters, routing, WebSocket manager |
| Models | `models/` | SQLAlchemy ORM (SQLite at `data/comfyforge.db`) |

**Adapter system** (`backend/core/adapters/`): Each AI provider is an adapter subclassing `base.py`. The `AdapterFactory` routes by `Provider.service_type` and `Provider.api_format` from the DB:
- `service_type == "comfyui"` → `comfyui.py` (local ComfyUI engine)
- `service_type == "llm"` + `api_format == "openai_compatible"` → `universal_proxy.py`
- Fallback: look up by provider ID in `ProviderRegistry`

To add a new provider, create an adapter in `core/adapters/`, register it with `@ProviderRegistry.register(...)`, and import it in `factory.py`.

**Task lifecycle** (`app.py`):
- `POST /api/generate` with `client_id` → spawns `asyncio.create_task`, stores in `active_tasks[client_id]`
- `POST /api/interrupt/{client_id}` → calls `adapter.interrupt()` then `task.cancel()` to hard-kill the coroutine
- Results pushed over WebSocket via `backend/core/ws.py` `ConnectionManager`

**Key routing** (`core/router.py`): `KeyRouter` selects the best API key by strategy (cost/speed/balanced/random) and records per-call metrics (latency EMA, quota).

### Frontend (`frontend-react/src/`)

| Path | Purpose |
|---|---|
| `pages/Canvas/index.tsx` | Main canvas page — hosts ReactFlow, DAG engine tick, global run/stop/resume |
| `stores/canvasStore.ts` | Zustand store: nodes, edges, undo/redo history, `nodeRunStatus`, `isGlobalRunning` |
| `components/nodes/` | Node components: `GenerateNode`, `DisplayNode`, `LoadAssetNode`, `ComfyUIEngineNode` |
| `api/` | Axios API clients per domain (projects, keys, models, providers) |
| `router.tsx` | React Router routes |

**DAG execution engine** (lives entirely in the frontend, `Canvas/index.tsx`):
- A `useEffect` keyed on `[isGlobalRunning, nodeRunStatus, nodes, edges]` acts as a tick loop
- Each tick: for every `idle` node, checks if all upstream nodes are `success` → if so, sets status to `running` and injects `_runSignal: Date.now()` into node data
- Each node component watches `_runSignal` change and fires its own `POST /api/generate` call
- Nodes report back by calling `setNodeStatus(id, 'success' | 'error')` in `canvasStore`
- **Smart resume**: `smartResetNodeStatus` keeps `success` nodes and resets others to `idle`, then the engine propagates their output downstream before restarting

**Node data flow**:
- Connecting an edge immediately propagates upstream `result`/`asset.data`/`incoming_data` to the downstream node's `incoming_data`
- `DisplayNode` and `LoadAssetNode` are passive (they don't call the API but participate in DAG topology)

**Four node types**:
- `generate` — calls `POST /api/generate`, streams result via WebSocket
- `display` — renders images/text received via `incoming_data`
- `loadAsset` — loads a saved asset from the asset library as context
- `comfyUIEngine` — dispatches to a local ComfyUI instance

### State management pattern
`canvasStore` (Zustand, no Immer middleware) holds all canvas state. `updateNodeData(id, partialData)` merges into `node.data`. History (undo/redo) is a manual snapshot stack saved before mutations.
