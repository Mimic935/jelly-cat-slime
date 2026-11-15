import { createServer } from "node:http";
import { isIP } from "node:net";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createGalleryApi } from "./worker.mjs";
import { createReviewAuth } from "./review-auth.mjs";

const port = Number(process.env.PORT ?? 8789);
const publicUrl = new URL(process.env.GALLERY_PUBLIC_URL ?? "http://127.0.0.1:"+port);
const loopback = new Set(["127.0.0.1","::1","::ffff:127.0.0.1"]);
if (publicUrl.protocol !== "https:" && !["127.0.0.1","localhost","[::1]"].includes(publicUrl.hostname)) {
  throw new Error("GALLERY_PUBLIC_URL must use HTTPS for public hosting.");
}
const password = process.env.REVIEW_PASSWORD;
if (!password) throw new Error("Set REVIEW_PASSWORD as a private environment variable.");
const pagesOrigin = new URL(process.env.GITHUB_PAGES_ORIGIN ?? "https://hujinyao935-byte.github.io").origin;
const configuredDb = process.env.GALLERY_DB ?? ".jelly-data/gallery.sqlite";
const dbPath = configuredDb === ":memory:" ? configuredDb : resolve(configuredDb);
if (dbPath !== ":memory:") mkdirSync(dirname(dbPath),{recursive:true});
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name='works' AND type='table'").get()) {
  db.exec("BEGIN;"+readFileSync(new URL("./drizzle/0000_gallery.sql",import.meta.url),"utf8")+"COMMIT;");
}
const auth = createReviewAuth(db,password,publicUrl);
const pages = readFileSync(new URL("../index.html",import.meta.url));
const catalog = JSON.parse(readFileSync(new URL("./templates.json",import.meta.url),"utf8"));
const templates = {cat:"berry"};
for (const [id,template] of Object.entries(catalog)) templates[id]=template.defaultFlavor;
const serveApi = createGalleryApi(templates,pagesOrigin);
const dbBinding = {
  prepare(sql) {
    const statement = db.prepare(sql);
    return {bind(...values) {
      return {
        all:() => ({results:statement.all(...values)}),
        first:() => statement.get(...values),
        run:() => ({meta:statement.run(...values)})
      };
    }};
  }
};

function clientIp(req) {
  const peer = req.socket.remoteAddress ?? "unknown";
  if (process.env.GALLERY_TRUST_PROXY !== "1" || !loopback.has(peer)) return peer;
  const forwarded = req.headers["x-forwarded-for"]?.split(",").at(-1).trim();
  return isIP(forwarded ?? "") ? forwarded : peer;
}

createServer(async (req,res) => {
  try {
    const url = new URL(req.url,publicUrl);
    if (url.origin !== publicUrl.origin) { res.writeHead(400).end(); return; }
    if (["GET","HEAD"].includes(req.method) && ["/","/gallery-config.js"].includes(url.pathname)) {
      const script = url.pathname === "/gallery-config.js";
      res.writeHead(200,{
        "Content-Type":script ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8",
        "Cache-Control":"no-store",
        "X-Content-Type-Options":"nosniff",
        "Referrer-Policy":"no-referrer"
      }).end(req.method === "HEAD" ? undefined : script ? "window.JELLY_GALLERY_API = location.origin;" : pages);
      return;
    }
    if (!url.pathname.startsWith("/api/")) { res.writeHead(404).end(); return; }
    const options={method:req.method,headers:req.headers};
    if (!["GET","HEAD"].includes(req.method)) Object.assign(options,{body:req,duplex:"half"});
    const request=new Request(url,options);
    const ip = clientIp(req);
    const response = url.pathname === "/api/review/session"
      ? await auth.handle(request,ip)
      : await serveApi(request,{DB:dbBinding,clientIp:ip,isReviewer:auth.isReviewer});
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (res.headersSent) res.end();
    else res.writeHead(500,{"Content-Type":"application/json; charset=utf-8"}).end('{"error":"展厅暂时无法连接。"}');
  }
}).listen(port,process.env.BIND_HOST ?? "127.0.0.1",()=>console.log("Gallery listening on port "+port));
