const limit = 384 * 1024;
const validId = /^[a-f0-9-]{36}$/;
const noCache = { "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff" };

function json(data, status = 200) {
  return Response.json(data, { status, headers:noCache });
}

async function readRequest(request) {
  if (!/^application\/json\b/i.test(request.headers.get("Content-Type") || "")) {
    throw new Error("需要 JSON 格式。");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error("没有收到作品。");
  const decoder = new TextDecoder("utf-8", { fatal:true });
  let bytes = 0, body = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > limit) {
      await reader.cancel();
      throw new Error("作品太大，请减少一些笔迹。");
    }
    body += decoder.decode(value, { stream:true });
  }
  return JSON.parse(body + decoder.decode());
}

function validateSubmission(data, templateDefaults) {
  const { work, author, preview } = data ?? {};
  const template = work && Object.hasOwn(work, "template") ? work.template : "cat";
  const between = (v, a, b) => Number.isFinite(v) && v >= a && v <= b;
  const color = v => typeof v === "string" && /^#[\da-f]{6}$/i.test(v);
  if (typeof author !== "string" || author.length > 24 ||
      typeof work?.name !== "string" || !work.name.trim() || work.name.length > 24 ||
      work.format !== "jelly-parlor" || work.version !== 1 ||
      !templateDefaults.has(template) ||
      !["berry","mango","grape","melon","custom",templateDefaults.get(template)].includes(work.flavor) ||
      !between(work.hue, 0, 360) || !between(work.saturation, 0, 100) || !between(work.value, 0, 100) ||
      !Number.isSafeInteger(work.count) || work.count < 0 ||
      !color(work.brushColor) || !between(work.brushSize, 6, 82) ||
      !Array.isArray(work.strokes)) throw new Error("作品格式不正确。");
  for (const stroke of work.strokes) {
    if (!stroke || !color(stroke.color) || typeof stroke.erase !== "boolean" ||
        !between(stroke.width, .006, .082) ||
        !Array.isArray(stroke.points) || !stroke.points.length ||
        !stroke.points.every(p => between(p?.u, -1, 2) && between(p?.v, -1, 2))) {
      throw new Error("彩绘数据不正确。");
    }
  }
  if (typeof preview !== "string" || preview.length > 100000 ||
      !/^\/9j\/[a-z\d+/]+={0,2}$/i.test(preview)) throw new Error("无法读取作品预览。");
  return { work, author:author.trim(), preview };
}

async function api(request, env, url, templateDefaults) {
  const { pathname } = url;
  const method = request.method;
  const admin = pathname.startsWith("/api/review");
  const origin = request.headers.get("Origin");
  if (admin && origin && origin !== url.origin) return json({ error:"来源无效。" }, 403);
  if (admin && !env.isReviewer(request)) return json({ error:"请输入管理员密码。" }, 401);
  if (admin && method !== "GET" && origin !== url.origin) return json({ error:"来源无效。" }, 403);
  if (method === "OPTIONS" && !admin) return new Response(null, { status:204, headers:{
    "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type", "Access-Control-Max-Age":"600"
  } });
  const db = env.DB;
  if (pathname === "/api/works" && method === "GET") {
    const offset = Math.max(0, Math.min(20000, Number.parseInt(url.searchParams.get("offset"), 10) || 0));
    const template = url.searchParams.get("template");
    if (template !== null && !templateDefaults.has(template)) return json({ error:"找不到这个展区。" }, 400);
    const whereTemplate = template === null ? "" : " AND COALESCE(json_extract(work, '$.template'), 'cat')=?";
    const query = db.prepare(
      "SELECT id,name,author,published_at FROM works WHERE status='public'" + whereTemplate +
      " ORDER BY published_at DESC,id DESC LIMIT 25 OFFSET ?"
    );
    const { results } = await query.bind(...(template === null ? [offset] : [template, offset])).all();
    return json({ works:results.slice(0,24), more:results.length > 24 });
  }
  if (pathname === "/api/works" && method === "POST") {
    let data;
    try { data = validateSubmission(await readRequest(request), templateDefaults); }
    catch (error) { return json({ error:error instanceof SyntaxError ? "作品数据格式不正确。" : error.message }, 400); }
    const now = Date.now(), id = crypto.randomUUID();
    const ip = env.clientIp;
    const bucket = Math.floor(now / 86400000);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + ":" + bucket));
    const rateKey = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2,"0")).join("");
    const result = await db.prepare(
      "INSERT INTO works (id,name,author,work,preview,rate_key,submitted_at) " +
      "SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM works WHERE rate_key=? AND submitted_at>?)<6 " +
      "AND (SELECT COUNT(*) FROM works WHERE status='pending')<200"
    ).bind(id,data.work.name.trim(),data.author,JSON.stringify(data.work),data.preview,rateKey,now,rateKey,now-3600000).run();
    if (!result.meta.changes) return json({ error:"投稿暂时达到上限，请稍后再试。" }, 429);
    return json({ id, status:"pending" }, 201);
  }
  if (pathname === "/api/review" && method === "GET") {
    const status = url.searchParams.get("status") === "public" ? "public" : "pending";
    const offset = Math.max(0, Math.min(20000, Number.parseInt(url.searchParams.get("offset"), 10) || 0));
    const { results } = await db.prepare("SELECT id,name,author,submitted_at FROM works WHERE status=? ORDER BY submitted_at DESC,id DESC LIMIT 25 OFFSET ?").bind(status,offset).all();
    return json({ works:results.slice(0,24), more:results.length > 24 });
  }
  const [, , resource, id, part] = pathname.split("/");
  if (!validId.test(id || "") || !["works","review"].includes(resource)) return json({ error:"找不到作品。" }, 404);
  if (method === "POST" && admin && ["approve","hide"].includes(part)) {
    const [next, previous] = part === "approve" ? ["public","pending"] : ["hidden","public"];
    const result = await db.prepare("UPDATE works SET status=?, published_at=? WHERE id=? AND status=?")
      .bind(next,part === "approve" ? Date.now() : null,id,previous).run();
    return result.meta.changes ? json({ status:next }) : json({ error:"作品状态已变化，请刷新。" }, 409);
  }
  if (method !== "GET") return json({ error:"不支持此操作。" }, 405);
  if (part === "preview") {
    const row = await db.prepare("SELECT preview FROM works WHERE id=? AND (status='public' OR ?)").bind(id,Number(admin)).first();
    if (!row) return json({ error:"找不到作品。" }, 404);
    return new Response(Uint8Array.from(atob(row.preview),c=>c.charCodeAt(0)), {
      headers:{ ...noCache, "Content-Type":"image/jpeg" }
    });
  }
  if (part) return json({ error:"找不到作品。" }, 404);
  const row = await db.prepare("SELECT id,name,author,work FROM works WHERE id=? AND (status='public' OR ?)").bind(id,Number(admin)).first();
  return row ? json({ ...row, work:JSON.parse(row.work) }) : json({ error:"找不到作品。" }, 404);
}

export function createGalleryApi(templates, allowedOrigin) {
  const templateDefaults = new Map(Object.entries(templates));
  return async (request, env) => {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin && origin !== allowedOrigin) return json({ error:"来源无效。" }, 403);
    let response;
    try { response = await api(request,env,url,templateDefaults); }
    catch { response = json({ error:"展厅暂时无法连接，请稍后再试。" }, 503); }
    if (origin === allowedOrigin && !url.pathname.startsWith("/api/review")) {
      response.headers.set("Access-Control-Allow-Origin",origin);
      response.headers.set("Vary","Origin");
    }
    return response;
  };
}

