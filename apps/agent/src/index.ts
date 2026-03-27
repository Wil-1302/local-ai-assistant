import { config } from "./config.js";
import { Logger } from "./logging/logger.js";
import { ToolRegistry } from "./tools/registry.js";
import { Agent } from "./agent/loop.js";
import { Repl } from "./cli/repl.js";
import { ReadFileTool } from "./tools/files/read.js";
import { ListDirectoryTool } from "./tools/files/list.js";
import { ListProcessesTool } from "./tools/processes/list.js";

async function main(): Promise<void> {
  const logger = new Logger(config.logPath);
  logger.session("start");

  const tools = new ToolRegistry();
  tools.register(new ReadFileTool());
  tools.register(new ListDirectoryTool());
  tools.register(new ListProcessesTool());

  const agent = new Agent(logger, tools);
  const repl = new Repl(agent, logger, tools);

  repl.start();
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Fatal: ${msg}`);
  process.exit(1);
});
