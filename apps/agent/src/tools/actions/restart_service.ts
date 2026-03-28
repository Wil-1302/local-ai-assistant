import { execFile } from "child_process";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const AUTH_REQUIRED =
  "Interactive authentication required";
const HELP_MSG =
  "El agente no tiene privilegios para reiniciar este servicio sin TTY. " +
  "Opciones: (1) ejecuta el agente con sudo, " +
  "(2) agrega una regla sudoers: `<usuario> ALL=(root) NOPASSWD: /bin/systemctl restart <servicio>`, " +
  "o (3) configura una regla polkit para tu usuario.";

function runSystemctl(service: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      "systemctl",
      ["--no-ask-password", "restart", service],
      { timeout: 10_000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(Object.assign(err, { stderr }));
        } else {
          resolve({ stdout, stderr });
        }
      }
    );
  });
}

export class RestartServiceTool implements Tool {
  readonly name = "restart_service";
  readonly description =
    "Restart a systemd service with mandatory user confirmation (systemctl restart <service>)";

  async execute(
    args: Record<string, string>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const service = args["service"]?.trim();
    if (!service) {
      return { output: "", error: "Missing required argument: service" };
    }

    if (!ctx.confirm) {
      return { output: "", error: "This action requires an interactive session" };
    }

    const confirmed = await ctx.confirm(
      `¿Deseas reiniciar el servicio "${service}"? (yes/no)`
    );

    if (!confirmed) {
      return { output: "Acción cancelada." };
    }

    try {
      await runSystemctl(service);
      return { output: `Servicio "${service}" reiniciado correctamente.` };
    } catch (err) {
      const stderr: string = (err as { stderr?: string }).stderr ?? "";
      if (stderr.includes(AUTH_REQUIRED) || stderr.includes("authentication") || stderr.includes("polkit") || stderr.includes("Authorization")) {
        return { output: "", error: `Sin permisos para reiniciar "${service}". ${HELP_MSG}` };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { output: "", error: `systemctl restart ${service}: ${msg}` };
    }
  }
}
