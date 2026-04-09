"""
Bridge between Python backend and Node.js MCP server.
The MCP server runs bare-metal on Windows with SolidWorks.
Communication is plain HTTP JSON — not MCP stdio.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import httpx

from app.config import get_settings
from app.models import MCPToolResult
from app.utils.logger import get_logger

logger = get_logger("ctm.mcp_bridge")
settings = get_settings()


class MCPConnectionError(Exception):
    pass


class MCPBridge:
    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=settings.mcp_server_url,
                timeout=settings.mcp_timeout,
            )
        return self._client

    async def health_check(self) -> bool:
        """Returns True if MCP server is reachable and SolidWorks is connected."""
        try:
            resp = await self._get_client().get("/health", timeout=5.0)
            return resp.status_code == 200
        except Exception:
            return False

    async def list_tools(self) -> List[Dict]:
        """Returns list of available SolidWorks tool definitions."""
        try:
            resp = await self._get_client().get("/tools")
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.warning(f"MCP list_tools failed: {e}")
            return []

    async def execute_tool(
        self,
        tool_name: str,
        args: Dict[str, Any],
    ) -> MCPToolResult:
        """
        Call a SolidWorks tool via the MCP server.

        POST /execute  { "tool": tool_name, "args": args }
        Returns MCPToolResult — never raises (errors are captured in result).
        """
        try:
            logger.info(f"MCP execute: {tool_name} args={list(args.keys())}")
            resp = await self._get_client().post(
                "/execute",
                json={"tool": tool_name, "args": args},
            )
            body = resp.json()

            if resp.status_code == 200 and "result" in body:
                return MCPToolResult(
                    tool_name=tool_name,
                    success=True,
                    result=body["result"],
                )
            else:
                error = body.get("error", f"HTTP {resp.status_code}")
                logger.warning(f"MCP tool '{tool_name}' error: {error}")
                return MCPToolResult(tool_name=tool_name, success=False, error=error)

        except httpx.ConnectError:
            msg = "MCP server unreachable — SolidWorks non connecté."
            logger.warning(msg)
            return MCPToolResult(tool_name=tool_name, success=False, error=msg)
        except Exception as e:
            logger.error(f"MCP unexpected error: {e}")
            return MCPToolResult(tool_name=tool_name, success=False, error=str(e))

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()


# Singleton
mcp_bridge = MCPBridge()
