import express, { type Request, type Response } from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { captureRawBody, createLogisticsRouter, LOGISTICS_ROUTES_VERSION } from "./routes/logistics";
import { describeBigateConfig, getBigateConfig, isProduction } from "./bigate/config";
import { isBigateError } from "./bigate/errors";
import type { Logger } from "./bigate/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * JSON log lines. The integration writes structured records so a log aggregator
 * can filter on `kind` and `awb` without parsing prose.
 */
const logger: Logger = {
  info: (fields, message) => console.log(JSON.stringify({ level: "info", message, ...fields })),
  warn: (fields, message) => console.warn(JSON.stringify({ level: "warn", message, ...fields })),
  error: (fields, message) => console.error(JSON.stringify({ level: "error", message, ...fields })),
};

/** Webhook bodies are small; a large one is an attack, not a real event. */
const JSON_BODY_LIMIT = "256kb";

/** Anything under /api that is not a real route is a bug, not a page request. */
function apiNotFound(_req: Request, res: Response) {
  res.status(404).json({ ok: false, code: "not_found" });
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Do not advertise the framework.
  app.disable("x-powered-by");

  // Exactly one proxy in front of this process. Without this, Express treats
  // X-Forwarded-For as caller-controlled, and the webhook's IP allowlist and rate
  // limit could both be bypassed with a spoofed header. Set it to the number of
  // proxies actually in front of the app.
  app.set("trust proxy", 1);

  // Mounted before the static handler so API paths are never answered with
  // index.html by the SPA catch-all below.
  app.use(
    "/api",
    express.json({
      limit: JSON_BODY_LIMIT,
      // Keeps the raw bytes available for HMAC verification of webhooks. Re-
      // serialising the parsed body would change key order and whitespace, and
      // the digest would no longer match.
      verify: captureRawBody,
    }),
  );
  app.use("/api", createLogisticsRouter({ logger }));
  app.use("/api", apiNotFound);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  // Report logistics configuration at boot. A missing Bigate integration is not
  // fatal: the storefront does not depend on it, so the server still starts and
  // the operator is told exactly what is wrong.
  logLogisticsStatus(logger);

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

function logLogisticsStatus(target: Logger): void {
  try {
    const config = getBigateConfig();
    target.info({ routes_version: LOGISTICS_ROUTES_VERSION, ...describeBigateConfig(config) }, "Bigate integration configured");
    // Warning rather than an error, and only for the mode that actually needs a
    // secret: ip_only deliberately has none and stands on the allowlist instead.
    if (config.webhookAuth.mode !== "ip_only" && config.webhookSecret === null) {
      target.error({}, "BIGATE_WEBHOOK_SECRET is not set: the tracking webhook will answer 503 and refuse every event");
    }
  } catch (error) {
    const message = isBigateError(error) ? error.userMessage : "The Bigate integration could not be read from the environment.";
    // Loud in production, quiet in development where nobody is shipping parcels.
    if (isProduction()) target.error({}, message);
    else target.warn({ detail: message }, "Bigate integration not configured (development)");
  }
}

startServer().catch(console.error);
