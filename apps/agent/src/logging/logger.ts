import fs from "fs";
import path from "path";

type LogLevel = "info" | "warn" | "error" | "debug";

export class Logger {
  private logPath: string;

  constructor(logPath: string) {
    this.logPath = logPath;
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
  }

  private write(level: LogLevel, message: string): void {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level.toUpperCase().padEnd(5)}] ${message}\n`;
    fs.appendFileSync(this.logPath, line);
  }

  info(message: string): void {
    this.write("info", message);
  }

  warn(message: string): void {
    this.write("warn", message);
  }

  error(message: string, err?: unknown): void {
    const detail =
      err instanceof Error
        ? `: ${err.message}`
        : err != null
          ? `: ${String(err)}`
          : "";
    this.write("error", `${message}${detail}`);
  }

  debug(message: string): void {
    this.write("debug", message);
  }

  session(event: "start" | "end"): void {
    this.write("info", `Session ${event}`);
  }
}
