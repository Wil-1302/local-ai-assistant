import http from "http";
import { config } from "../config.js";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatOptions {
  model?: string;
}

export async function* chat(
  messages: Message[],
  options: ChatOptions = {}
): AsyncGenerator<string> {
  const model = options.model ?? config.model;

  const body = JSON.stringify({ model, messages, stream: true });
  const response = await request(body);

  for await (const line of readLines(response)) {
    if (!line.trim()) continue;
    const data = JSON.parse(line) as {
      message?: { content?: string };
      done?: boolean;
    };
    if (data.message?.content) {
      yield data.message.content;
    }
    if (data.done) break;
  }
}

function request(body: string): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: config.ollamaHost,
        port: config.ollamaPort,
        path: "/api/chat",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Ollama responded with status ${res.statusCode}`));
          return;
        }
        resolve(res);
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function* readLines(
  stream: http.IncomingMessage
): AsyncGenerator<string> {
  let buffer = "";
  for await (const chunk of stream) {
    buffer += (chunk as Buffer).toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      yield line;
    }
  }
  if (buffer) yield buffer;
}
