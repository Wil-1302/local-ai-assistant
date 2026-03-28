import { execFile } from "child_process";
import { config } from "../../config.js";
import type { Tool, ToolContext, ToolResult } from "../types.js";

/**
 * Validates that a service name contains only characters safe for use as a
 * systemctl argument. This is defense-in-depth: the allowlist check runs first,
 * but this guard ensures the execFile call never receives a malformed string.
 */
const SAFE_SERVICE_NAME = /^[a-zA-Z0-9@:._-]+$/;

function runRestart(service: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      "sudo",
      ["systemctl", "restart", service],
      { timeout: 15_000 },
      (err, _stdout, stderr) => {
        if (err) reject(Object.assign(err, { stderr }));
        else resolve();
      }
    );
  });
}

export class RestartServiceTool implements Tool {
  readonly name = "restart_service";
  readonly description =
    "Restart a systemd service. Requires the service to be in ALLOWED_RESTART_SERVICES " +
    "and a matching sudoers NOPASSWD rule. Always asks for user confirmation.";

  async execute(
    args: Record<string, string>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const service = args["service"]?.trim();
    if (!service) {
      return { output: "", error: "Missing required argument: service" };
    }

    // Layer 1: allowlist — fast rejection before any system call
    if (!config.allowedRestartServices.has(service)) {
      const allowed = [...config.allowedRestartServices];
      const hint =
        allowed.length > 0
          ? `Servicios permitidos: ${allowed.join(", ")}`
          : "La lista ALLOWED_RESTART_SERVICES está vacía en .env";
      return { output: "", error: `"${service}" no está en la allowlist. ${hint}` };
    }

    // Layer 2: format — reject any name that could be misinterpreted by the shell
    // or by systemctl itself (e.g. paths, flags, shell metacharacters)
    if (!SAFE_SERVICE_NAME.test(service)) {
      return { output: "", error: `Nombre de servicio inválido: "${service}"` };
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
      await runRestart(service);
      return { output: `Servicio "${service}" reiniciado correctamente.` };
    } catch (err) {
      const stderr: string = (err as { stderr?: string }).stderr ?? "";
      // sudo error: not in sudoers or NOPASSWD not configured
      if (stderr.includes("sudoers") || stderr.includes("not allowed") || stderr.includes("password")) {
        return {
          output: "",
          error:
            `sudo no autorizado para "${service}". ` +
            `Agrega la regla en /etc/sudoers.d/local-ai-agent:\n` +
            `  ${process.env["USER"] ?? "tu_usuario"} ALL=(root) NOPASSWD: /usr/bin/systemctl restart ${service}`,
        };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { output: "", error: `systemctl restart ${service}: ${msg}` };
    }
  }
}
