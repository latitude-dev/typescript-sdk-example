import "dotenv/config";
import express from "express";
import { generateWikipediaArticleStream } from "./sdk-gateway.js";
import { generateWikipediaArticleStream as generateWikipediaArticleStreamTelemetry } from "./sdk-telemetry.js";

const app = express();
app.use(express.json());

const ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});

app.options("/generate-wikipedia-article", (_req, res) => {
  res.sendStatus(200);
});

app.post("/generate-wikipedia-article", async (req, res) => {
  const body = req.body as { input?: string };
  const input = typeof body?.input === "string" ? body.input : "";

  if (!input) {
    res.status(400).send("Missing or invalid 'input'");
    return;
  }

  const useGateway = process.env.USE_LATITUDE_GATEWAY === "true";

  if (useGateway) {
    const stream = generateWikipediaArticleStream(input);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    stream.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const lines = text.split("\n");
      const ssePayload = lines.map((line) => `data: ${line}`).join("\n") + "\n\n";
      res.write(ssePayload);
    });
    stream.on("end", () => res.end());
    stream.on("error", (err) => {
      if (!res.writableEnded) res.status(500).end(String(err?.message ?? err));
    });
    return;
  }

  try {
    const stream = await generateWikipediaArticleStreamTelemetry(input);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");

    stream.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      res.write(text);
    });
    stream.on("end", () => res.end());
    stream.on("error", (err) => {
      if (!res.writableEnded) res.status(500).end(String(err?.message ?? err));
    });
  } catch (err) {
    res.status(500).send(String(err instanceof Error ? err.message : err));
  }
});

const PORT = Number(process.env.PORT) || 8000;
app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});
