#!/usr/bin/env node
/**
 * THE BRIDGE: `npx pavel-editor-bridge` (or `node bin/bridge.mjs`) in a project.
 *
 * Without it, every edit ends in a clipboard and needs a human to paste it
 * somewhere. With it, the panel's button becomes APPLY TO CODE: the report is
 * POSTed here, written into .pavel-editor/ next to the code, and printed to this
 * terminal, where the coding agent watching it picks it up immediately.
 *
 * It does NOT write to source files. That is the one thing a tool like this must
 * not do behind someone's back: it cannot know whether a value belongs in a base
 * rule, a media query, a token, or a Tailwind class, and guessing wrong silently
 * rewrites a stylesheet. It hands over a precise instruction; applying it stays a
 * decision someone makes.
 *
 * Zero dependencies, listens on 127.0.0.1 only, serves nothing but the editor
 * bundle and the report endpoint.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PAVEL_EDITOR_PORT ?? 7331);
const CWD = process.cwd();
const OUT = path.join(CWD, ".pavel-editor");
const BUNDLE = path.join(HERE, "..", "dist", "pavel-editor.js");

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

// Private Network Access: a page on https reaching 127.0.0.1 is a "private
// network request" and Chrome preflights it, so the permissive headers have to
// be on every response including OPTIONS.
const cors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Access-Control-Max-Age", "86400");
};

const server = http.createServer((req, res) => {
  cors(res);
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (url.pathname === "/ping") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, tool: "pavel-editor-bridge", cwd: CWD }));
    return;
  }

  // the bundle, served locally: no CDN, no cache to purge, always this build
  if (url.pathname === "/pavel-editor.js") {
    fs.readFile(BUNDLE, (err, buf) => {
      if (err) {
        res.writeHead(404).end("no dist/pavel-editor.js — run `bun run build` in the editor repo");
        return;
      }
      res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" });
      res.end(buf);
    });
    return;
  }

  if (url.pathname === "/report" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 4_000_000) req.destroy();
    });
    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400).end("bad json");
        return;
      }
      const report = String(payload.report ?? "");
      if (!report.trim()) {
        res.writeHead(400).end("empty report");
        return;
      }
      fs.mkdirSync(OUT, { recursive: true });
      const file = path.join(OUT, `report-${stamp()}.md`);
      const header = [
        `# PAVEL EDITOR report`,
        ``,
        `- page: ${payload.url ?? "unknown"}`,
        `- received: ${new Date().toISOString()}`,
        `- changes: ${payload.count ?? "?"}`,
        ``,
        "```",
      ].join("\n");
      fs.writeFileSync(file, `${header}\n${report}\n\`\`\`\n`);
      // also the plain latest, so a watcher has one stable path to read
      fs.writeFileSync(path.join(OUT, "latest.md"), `${header}\n${report}\n\`\`\`\n`);
      process.stdout.write(`\n${"═".repeat(72)}\nPAVEL EDITOR · ${payload.count ?? "?"} change(s) from ${payload.url ?? "?"}\nwritten to ${path.relative(CWD, file)}\n${"═".repeat(72)}\n${report}\n`);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, file: path.relative(CWD, file) }));
    });
    return;
  }

  res.writeHead(404).end("pavel-editor-bridge: /ping, /report, /pavel-editor.js");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`port ${PORT} is busy — another bridge is probably already running (PAVEL_EDITOR_PORT=nnnn to change)`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`PAVEL EDITOR bridge on http://127.0.0.1:${PORT}`);
  console.log(`  reports land in ${path.relative(CWD, OUT) || ".pavel-editor"}/ and print here`);
  console.log(`  inject the editor with:  <script src="http://127.0.0.1:${PORT}/pavel-editor.js"></script>`);
  console.log(`  the panel's button becomes APPLY TO CODE while this is up.`);
});
