import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const hash = (value) => createHash("sha256").update(value).digest();
const loginWindow = 15 * 60 * 1000;
const sessionDuration = 8 * 60 * 60 * 1000;

export function createReviewAuth(db, password, publicUrl) {
  const secure = publicUrl.protocol === "https:";
  const cookieName = secure ? "__Host-jelly-review" : "jelly-review";
  const passwordHash = hash(password);
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_sessions (token TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS review_attempts (key TEXT PRIMARY KEY, bucket INTEGER NOT NULL, attempts INTEGER NOT NULL);
  `);
  const insertAttempt = db.prepare(`INSERT INTO review_attempts VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 WHERE attempts<?`);
  const getSession = db.prepare("SELECT 1 FROM review_sessions WHERE token=? AND expires_at>?");
  const addSession = db.prepare("INSERT INTO review_sessions VALUES (?, ?)");
  const removeSession = db.prepare("DELETE FROM review_sessions WHERE token=?");
  const removeExpiredSessions = db.prepare("DELETE FROM review_sessions WHERE expires_at<=?");
  const removeExpiredAttempts = db.prepare("DELETE FROM review_attempts WHERE bucket<?");
  const tokenHash = (token) => hash(token).toString("hex");
  const setCookie = (token, maxAge) => cookieName+"="+token+"; Max-Age="+maxAge+
    "; Path=/; HttpOnly; SameSite=Strict"+(secure ? "; Secure" : "");
  const response = (data, status = 200, cookie) => {
    const headers = {"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
    if (cookie) headers["Set-Cookie"] = cookie;
    return Response.json(data,{status,headers});
  };
  function sessionToken(request) {
    const cookies = request.headers.get("Cookie")?.split(";") ?? [];
    const token = cookies.find(cookie => cookie.trim().startsWith(cookieName+"="))?.trim().slice(cookieName.length+1);
    return /^[a-f0-9]{64}$/.test(token ?? "") ? token : null;
  }
  function isReviewer(request) {
    const token = sessionToken(request);
    return Boolean(token && getSession.get(tokenHash(token),Date.now()));
  }
  async function handle(request, ip) {
    if (request.headers.get("Origin") !== publicUrl.origin) return response({error:"请从审核页面登录。"},403);
    const token = sessionToken(request);
    if (request.method === "DELETE") {
      if (token) removeSession.run(tokenHash(token));
      return response({ok:true},200,setCookie("",0));
    }
    if (request.method !== "POST") return response({error:"不支持此操作。"},405);
    if (!(request.headers.get("Content-Type") ?? "").startsWith("application/json")) {
      return response({error:"需要 JSON 格式。"},415);
    }

    const now=Date.now(), bucket=Math.floor(now/loginWindow);
    removeExpiredAttempts.run(bucket-1);
    const ipKey="ip:"+tokenHash(ip)+":"+bucket;
    if (!insertAttempt.run(ipKey,bucket,5).changes ||
        !insertAttempt.run("all:"+bucket,bucket,60).changes) {
      return response({error:"尝试次数过多，请稍后再试。"},429);
    }
    const reader = request.body?.getReader();
    if (!reader) return response({error:"请输入管理员密码。"},400);
    let body, length = 0, text = "";
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const {value,done} = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 1024) {
          await reader.cancel();
          return response({error:"请求过大。"},413);
        }
        text += decoder.decode(value,{stream:true});
      }
      body = JSON.parse(text+decoder.decode());
    } catch { return response({error:"无法读取登录信息。"},400); }
    const supplied = typeof body?.password === "string" ? body.password : "";
    if (!timingSafeEqual(hash(supplied),passwordHash)) return response({error:"密码不正确。"},401);
    if (token) removeSession.run(tokenHash(token));
    removeExpiredSessions.run(now);
    const newToken = randomBytes(32).toString("hex");
    addSession.run(tokenHash(newToken),now+sessionDuration);
    return response({ok:true},200,setCookie(newToken,sessionDuration/1000));
  }
  return { isReviewer, handle };
}
