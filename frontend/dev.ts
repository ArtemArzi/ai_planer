import index from "./index.html";
import { resolve } from "path";

const BACKEND_BASE_URL = "http://127.0.0.1:3000";
const DIST_DIR = resolve(import.meta.dir, "dist");

function isBackendPath(pathname: string): boolean {
  return (
    pathname === "/health" ||
    pathname.startsWith("/me") ||
    pathname.startsWith("/tasks") ||
    pathname.startsWith("/folders") ||
    pathname.startsWith("/files") ||
    pathname.startsWith("/media") ||
    pathname.startsWith("/google") ||
    pathname.startsWith("/webhook")
  );
}

Bun.serve({
  port: 5173,
  routes: {
    "/": index,
    "/dist/*": async (req) => {
      const url = new URL(req.url);
      const filePath = resolve(DIST_DIR, url.pathname.replace("/dist/", ""));
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file, {
          headers: { "Content-Type": "text/css" },
        });
      }
      return new Response("Not Found", { status: 404 });
    },
  },
  fetch(req) {
    const url = new URL(req.url);

    if (!isBackendPath(url.pathname)) {
      return new Response("Not Found", { status: 404 });
    }

    const headers = new Headers(req.headers);
    headers.delete("host");

    return fetch(`${BACKEND_BASE_URL}${url.pathname}${url.search}`, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
    });
  },
});
