"""Real-time WebSocket Hub for broadcasting database and ALPR event changes to frontend clients."""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("alpr.realtime")


class RealtimeConnectionManager:
    """Manages active WebSocket connections and broadcasts events."""

    def __init__(self) -> None:
        self.active_connections: List[WebSocket] = []
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Store reference to the running asyncio event loop."""
        self._loop = loop

    async def connect(self, websocket: WebSocket) -> None:
        """Accept new WebSocket connection and track it."""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"[Realtime] Client connected. Total active: {len(self.active_connections)}")

        # Send initial handshake message
        try:
            await websocket.send_json(
                {
                    "event": "handshake",
                    "data": {
                        "status": "connected",
                        "active_clients": len(self.active_connections),
                        "server_time": datetime.now(timezone.utc).isoformat(),
                    },
                }
            )
        except Exception:
            pass

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove disconnected WebSocket client."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"[Realtime] Client disconnected. Total active: {len(self.active_connections)}")

    async def broadcast(self, event: str, data: Any) -> None:
        """Broadcast an event payload to all connected WebSocket clients."""
        if not self.active_connections:
            return

        payload = {
            "event": event,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        dead_connections: List[WebSocket] = []
        for connection in list(self.active_connections):
            try:
                await connection.send_json(payload)
            except Exception as e:
                logger.debug(f"[Realtime] Failed to send to a client: {e}")
                dead_connections.append(connection)

        # Cleanup dead sockets
        for dead in dead_connections:
            if dead in self.active_connections:
                self.active_connections.remove(dead)

    def broadcast_sync(self, event: str, data: Any) -> None:
        """Thread-safe synchronous wrapper to broadcast an event from background threads."""
        try:
            if self._loop and self._loop.is_running():
                asyncio.run_coroutine_threadsafe(self.broadcast(event, data), self._loop)
            else:
                # Try getting the current running loop if available
                loop = asyncio.get_event_loop()
                if loop and loop.is_running():
                    asyncio.run_coroutine_threadsafe(self.broadcast(event, data), loop)
        except Exception as e:
            # Non-blocking: Fail silently if event loop isn't active (e.g. CLI scripts)
            logger.debug(f"[Realtime] broadcast_sync skipped: {e}")


# Singleton instance shared across the entire application
realtime_manager = RealtimeConnectionManager()

