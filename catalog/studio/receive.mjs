// Fresh Market 3D — dev-only receiver for the photo studio. Writes posted data URLs under catalog/.
// Run: node catalog/studio/receive.mjs   (listens on http://localhost:8099, localhost only)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ALLOWED = /^(catalog\/(photos\/[a-z0-9-]+\.jpg|brand\/logo\.png)|docs\/screenshots\/[a-z0-9-]+\.jpg)$/;

http
  .createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:8080");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    if (req.method === "OPTIONS") return res.end();
    if (req.method !== "POST" || req.url !== "/save") return (res.statusCode = 404), res.end();
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const { path: rel, dataUrl } = JSON.parse(body);
        if (!ALLOWED.test(rel)) throw new Error("path not allowed: " + rel);
        const b64 = String(dataUrl).split(",")[1];
        const out = path.join(ROOT, rel);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, Buffer.from(b64, "base64"));
        console.log("saved", rel, Math.round(fs.statSync(out).size / 1024) + " KB");
        res.end("ok");
      } catch (e) {
        res.statusCode = 400;
        res.end(String(e));
      }
    });
  })
  .listen(8099, "127.0.0.1", () => console.log("photo receiver on http://localhost:8099, root", ROOT));
