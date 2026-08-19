export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const url = new URL(request.url);

  if (request.method === "GET" || request.method === "HEAD") {
    try {
      const parts = url.pathname.split("/").filter(Boolean);
      let liveFileUrl = "";
      let originalName = "file";

      // 1. Формат вечных ссылок: /v/{file_id}/{name}
      if (parts[0] === "v" && parts.length >= 2) {
        const fileId = parts[1];
        originalName = parts.slice(2).join("_") || "file";

        const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
        const fileData = await fileRes.json();
        if (!fileData.ok) return new Response("File not found in Telegram", { status: 404 });
        liveFileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;

      // 2. Старый формат: /f/documents/file_10.png/name.png
      } else if (parts[0] === "f" && parts.length >= 3) {
        const tgFilePath = `${parts[1]}/${parts[2]}`;
        originalName = parts.slice(3).join("_") || parts[2];
        liveFileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${tgFilePath}`;

      // 3. Самый первый формат: /i/documents/file_10.png
      } else if (parts[0] === "i" && parts.length >= 2) {
        const tgFilePath = parts.slice(1).join("/");
        originalName = parts[parts.length - 1];
        liveFileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${tgFilePath}`;

      } else {
        return new Response("ShareX TG Uploader is running!", { status: 200 });
      }

      try { originalName = decodeURIComponent(originalName); } catch (e) {}

      const isVideo = /\.(mp4|webm|mov|mkv)$/i.test(originalName);
      const isHtmlRequest = request.headers.get("accept")?.includes("text/html");
      const isRaw = url.searchParams.get("raw") === "1";

      // HTML Open Graph плеер для ClickUp / Discord / браузера
      if (isVideo && isHtmlRequest && !isRaw) {
        const rawVideoUrl = `${url.origin}${url.pathname}?raw=1`;
        const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>${originalName}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta property="og:type" content="video.other">
  <meta property="og:title" content="${originalName}">
  <meta property="og:video" content="${rawVideoUrl}">
  <meta property="og:video:url" content="${rawVideoUrl}">
  <meta property="og:video:secure_url" content="${rawVideoUrl}">
  <meta property="og:video:type" content="video/mp4">
  <meta name="twitter:card" content="player">
  <meta name="twitter:player" content="${rawVideoUrl}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0e0e0e; display: flex; align-items: center; justify-content: center; height: 100vh; overflow: hidden; }
    video { max-width: 100%; max-height: 100%; outline: none; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
  </style>
</head>
<body>
  <video src="${rawVideoUrl}" controls autoplay playsinline></video>
</body>
</html>`;

        return new Response(html, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=31536000, immutable"
          }
        });
      }

      // Стриминг файла
      const clientRange = request.headers.get("range");
      const fetchHeaders = new Headers();
      if (clientRange) fetchHeaders.set("Range", clientRange);

      const tgStream = await fetch(liveFileUrl, {
        method: request.method === "HEAD" ? "HEAD" : "GET",
        headers: fetchHeaders
      });

      if (!tgStream.ok) return new Response("Error fetching file from Telegram", { status: 404 });

      let contentType = "application/octet-stream";
      const lower = originalName.toLowerCase();
      if (lower.endsWith(".mp4")) contentType = "video/mp4";
      else if (lower.endsWith(".webm")) contentType = "video/webm";
      else if (lower.endsWith(".mov")) contentType = "video/quicktime";
      else if (lower.endsWith(".png")) contentType = "image/png";
      else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) contentType = "image/jpeg";
      else if (lower.endsWith(".gif")) contentType = "image/gif";
      else if (lower.endsWith(".webp")) contentType = "image/webp";

      const safeAsciiName = originalName.replace(/[^\x20-\x7E]/g, "_");
      const encodedUtf8Name = encodeURIComponent(originalName);

      const responseHeaders = new Headers(tgStream.headers);
      responseHeaders.set("Content-Type", contentType);
      responseHeaders.set("Content-Disposition", `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodedUtf8Name}`);
      responseHeaders.set("Accept-Ranges", "bytes");
      responseHeaders.set("Cache-Control", "public, max-age=31536000, immutable");

      return new Response(request.method === "HEAD" ? null : tgStream.body, {
        status: tgStream.status,
        headers: responseHeaders
      });

    } catch (err) {
      return new Response("Error: " + err.message, { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
}
