import express, { type Request, type Response } from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Anything under /api that is not a real route is a bug, not a page request. */
function apiNotFound(_req: Request, res: Response) {
  res.status(404).json({ ok: false, code: "not_found" });
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Do not advertise the framework.
  app.disable("x-powered-by");

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

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
