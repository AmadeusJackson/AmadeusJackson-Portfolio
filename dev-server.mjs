import { createReadStream, existsSync, watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "8000", 10);
const clients = new Set();

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

const reloadClient = `
<script>
  (() => {
    const source = new EventSource("/__live-reload");
    source.addEventListener("reload", () => window.location.reload());
  })();
</script>`;

function getFilePath(url) {
  const pathname = decodeURIComponent(new URL(url, `http://${host}:${port}`).pathname);
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(root, `.${normalize(requestedPath)}`);

  if (!filePath.startsWith(root)) {
    return null;
  }

  return filePath;
}

async function serveHtml(filePath, response) {
  const html = await readFile(filePath, "utf8");
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
  });
  response.end(html.replace("</body>", `${reloadClient}</body>`));
}

function sendReload() {
  for (const client of clients) {
    client.write("event: reload\ndata: now\n\n");
  }
}

watch(root, { recursive: true }, (_eventType, filename) => {
  if (!filename || filename.includes(".git")) {
    return;
  }

  sendReload();
});

createServer(async (request, response) => {
  if (request.url === "/__live-reload") {
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Connection": "keep-alive",
      "Content-Type": "text/event-stream",
    });
    response.write("\n");
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return;
  }

  const filePath = getFilePath(request.url || "/");

  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  if (extname(filePath) === ".html") {
    await serveHtml(filePath, response);
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": mimeTypes.get(extname(filePath)) || "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}).listen(port, host, () => {
  console.log(`Portfolio dev server running at http://${host}:${port}/`);
});
