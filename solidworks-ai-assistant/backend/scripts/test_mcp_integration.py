"""
Integration test for MCP server — runs against MOCK_MODE=true Node.js server.
Usage: python scripts/test_mcp_integration.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.mcp_bridge import mcp_bridge
from app.utils.logger import setup_logging, app_logger

TEST_TOOLS = [
    ("sw_create_part", {}),
    ("sw_base_flange", {"thickness": 3.0, "direction": "blind", "depth": 100.0}),
    ("sw_flat_pattern", {}),
    ("sw_save_dxf", {"path": "/tmp/test_part.dxf"}),
    ("sw_structural_member", {"profile": "IPE100", "type": "iso"}),
    ("sw_trim_extend", {}),
    ("sw_weldment_bom", {}),
    ("sw_export_pdf", {"path": "/tmp/test_drawing.pdf"}),
]


async def main():
    setup_logging()
    app_logger.info("=== MCP Integration Tests ===")

    # Health check
    ok = await mcp_bridge.health_check()
    if not ok:
        app_logger.error(
            "MCP server not reachable. Start with: cd mcp-server && MOCK_MODE=true npm run dev"
        )
        return

    app_logger.info("MCP server reachable")

    # List tools
    tools = await mcp_bridge.list_tools()
    app_logger.info(f"Available tools: {len(tools)}")

    # Run test calls
    passed = 0
    failed = 0
    for tool_name, args in TEST_TOOLS:
        result = await mcp_bridge.execute_tool(tool_name, args)
        if result.success:
            app_logger.info(f"  ✓ {tool_name}")
            passed += 1
        else:
            app_logger.warning(f"  ✗ {tool_name}: {result.error}")
            failed += 1

    app_logger.info(f"\nResults: {passed} passed, {failed} failed / {len(TEST_TOOLS)} tests")


if __name__ == "__main__":
    asyncio.run(main())
