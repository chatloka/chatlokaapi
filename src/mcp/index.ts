import { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod/v4"

export function createMcpServer(env: { DB: D1Database }) {
  const server = new McpServer({
    name: "chatloka",
    version: "1.0.0",
  })

  server.registerTool(
    "get_licenses",
    {
      description: "Get all licenses from the Chatloka license system. Returns a list of all licenses with their details including purchase code, domain, status, buyer info, and timestamps.",
      inputSchema: z.object({}),
    },
    async () => {
      const { results } = await env.DB.prepare(
        "SELECT id, purchase_code, license_type, domain, buyer_email, buyer_name, status, activated_at, last_validated_at, created_at, updated_at FROM licenses ORDER BY created_at DESC"
      ).all()

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2),
          },
        ],
      }
    }
  )

  return server
}
