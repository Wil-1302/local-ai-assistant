import { config } from "./config.js";
import { Logger } from "./logging/logger.js";
import { ToolRegistry } from "./tools/registry.js";
import { Agent } from "./agent/loop.js";
import { Repl } from "./cli/repl.js";
import { ReadFileTool } from "./tools/files/read.js";
import { ListDirectoryTool } from "./tools/files/list.js";
import { ListProcessesTool } from "./tools/processes/list.js";
import { ReadLogTool } from "./tools/logs/read.js";
import { MemoryStatusTool } from "./tools/system/memory.js";
import { DiskUsageTool } from "./tools/system/disk.js";
import { SystemInfoTool } from "./tools/system/info.js";
import { SystemctlStatusTool } from "./tools/system/systemctl.js";
import { JournalctlTool } from "./tools/system/journalctl.js";
import { OpenPortsTool } from "./tools/system/ports.js";
import { NetworkInterfacesTool } from "./tools/system/interfaces.js";
import { NetworkRoutesTool } from "./tools/system/routes.js";
import { RestartServiceTool } from "./tools/actions/restart_service.js";
import { KillProcessTool } from "./tools/actions/kill_process.js";
import { PingHostTool } from "./tools/network/ping_host.js";
import { DnsLookupTool } from "./tools/network/dns_lookup.js";
import { HttpHeadCheckTool } from "./tools/network/http_head_check.js";
import { WriteFileTool } from "./tools/files/write.js";
import { EditFileTool } from "./tools/files/edit.js";
import { RunCommandTool } from "./tools/execution/run_command.js";
import { ScanProjectTool } from "./tools/project/scan.js";

async function main(): Promise<void> {
  const logger = new Logger(config.logPath);
  logger.session("start");

  const tools = new ToolRegistry();
  tools.register(new ReadFileTool());
  tools.register(new ListDirectoryTool());
  tools.register(new ListProcessesTool());
  tools.register(new ReadLogTool());
  tools.register(new MemoryStatusTool());
  tools.register(new DiskUsageTool());
  tools.register(new SystemInfoTool());
  tools.register(new SystemctlStatusTool());
  tools.register(new JournalctlTool());
  tools.register(new OpenPortsTool());
  tools.register(new NetworkInterfacesTool());
  tools.register(new NetworkRoutesTool());
  tools.register(new RestartServiceTool());
  tools.register(new KillProcessTool());
  tools.register(new PingHostTool());
  tools.register(new DnsLookupTool());
  tools.register(new HttpHeadCheckTool());
  tools.register(new WriteFileTool());
  tools.register(new EditFileTool());
  tools.register(new RunCommandTool());
  tools.register(new ScanProjectTool());

  const agent = new Agent(logger, tools);
  const repl = new Repl(agent, logger, tools);

  repl.start();
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Fatal: ${msg}`);
  process.exit(1);
});
