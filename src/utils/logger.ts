import fs from "node:fs";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

export class Logger {
  private logPath: string;
  private logFile: string;
  private stream: fs.WriteStream | null = null;

  constructor(logPath: string) {
    this.logPath = logPath;
    this.logFile = path.join(logPath, "pository.log");
    this.initStream();
  }

  private initStream(): void {
    if (!fs.existsSync(this.logPath)) {
      fs.mkdirSync(this.logPath, { recursive: true });
    }
    this.stream = fs.createWriteStream(this.logFile, { flags: "a" });
  }

  private log(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    };
    const line = JSON.stringify(entry);
    this.stream?.write(line + "\n");
    
    // Also log to console
    if (level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log("error", message, meta);
  }

  access(meta: Record<string, unknown>): void {
    this.log("info", "access", meta);
  }

  close(): void {
    this.stream?.end();
  }
}
