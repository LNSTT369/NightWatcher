import type { Env } from "./env.d";
import { NightwatcherMcpAgent } from "./mcp/agent";
import { handleCronEvent } from "./jobs/cron";
import { handleStreamConnection } from "./stream/handler";

export { SessionDO } from "./durable-objects/session";
export { NightwatcherMcpAgent };

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          timestamp: new Date().toISOString(),
          environment: env.ENVIRONMENT,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (url.pathname === "/") {
      return new Response(
        JSON.stringify({
          name: "nightwatcher",
          version: "0.1.0",
          description: "Cloudflare Workers MCP server for autonomous stock trading",
          endpoints: {
            health: "/health",
            mcp: "/mcp (via Durable Object)",
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (url.pathname.startsWith("/mcp")) {
      return NightwatcherMcpAgent.mount("/mcp", { binding: "MCP_AGENT" }).fetch(request, env, ctx);
    }

    if (url.pathname === "/stream") {
      return handleStreamConnection(request, env);
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const cronId = event.cron;
    console.log(`Cron triggered: ${cronId} at ${new Date().toISOString()}`);
    ctx.waitUntil(handleCronEvent(cronId, env));
  },
};
