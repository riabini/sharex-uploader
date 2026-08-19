export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const url = new URL(request.url);

  // Разрешаем GET и HEAD запросы для ботов предпросмотра
  if (request.method === "GET" || request.method === "HEAD") {
    try {
      const parts = url.pathname.split("/").filter(Boolean);
      let fileId = "";
      let originalName = "video.mp4";

      if (parts[0] === "v" && parts.length >= 2) {
        fileId = parts[1];
        originalName = parts.slice(2).join("_") || "video.mp4";
      } else {
        return new Response("ShareX TG Uploader is running!", { status: 200 });
      }

      try { originalName = decodeURIComponent(originalName); } catch (e) {}

      // Запрашиваем путь к файлу у Telegram
      const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
      const fileData = await fileRes.json();

      if (!fileData.ok) {
        return new Response("File not found in Telegram", { status: 404 });
      }

      const liveFileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;

      // Пробрасываем Range для перемотки и потокового видео
      const clientRange = request.headers.get("range");
      const fetchHeaders = new Headers();
      if (clientRange) {
        fetchHeaders.set("Range", clientRange);
      }

      const tgStream = await fetch(liveFileUrl, {
        method: request.method === "HEAD" ? "HEAD" : "GET",
        headers: fetchHeaders
      });

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
