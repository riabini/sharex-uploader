export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;
  const url = new URL(request.url);

  // 1. GET: Просмотр картинок и видео
  if (request.method === "GET") {
    try {
      const parts = url.pathname.split("/").filter(Boolean);

      let fileId = "";
      let originalName = "file";

      // Поддержка ссылок вида /v/{file_id}/{name} и /api/v/{file_id}/{name}
      if (parts[0] === "v" && parts.length >= 2) {
        fileId = parts[1];
        originalName = parts.slice(2).join("_") || "file";
      } else if (parts[0] === "api" && parts[1] === "v" && parts.length >= 3) {
        fileId = parts[2];
        originalName = parts.slice(3).join("_") || "file";
      } else {
        return new Response("ShareX TG Uploader is running on Vercel!", { status: 200 });
      }

      try { originalName = decodeURIComponent(originalName); } catch (e) {}

      // Запрашиваем актуальный путь к файлу у Telegram
      const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
      const fileData = await fileRes.json();

      if (!fileData.ok) {
        return new Response("File not found in Telegram", { status: 404 });
      }

      const liveFileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
      return await fetchAndServe(liveFileUrl, originalName);

    } catch (err) {
      return new Response("GET Error: " + err.message, { status: 500 });
    }
  }

  // 2. POST: Загрузка из ShareX
  if (request.method === "POST") {
    try {
      const formData = await request.formData();
      formData.set("chat_id", CHAT_ID);

      const file = formData.get("document") || formData.get("photo") || formData.get("file");
      let originalName = file && file.name ? file.name : "upload.png";

      if (file) {
        formData.delete("photo");
        formData.delete("file");
        formData.set("document", file);
      }

      // Отправляем в Telegram
      const sendRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
        method: "POST",
        body: formData
      });
      const sendData = await sendRes.json();
      if (!sendData.ok) return new Response("TG Error: " + JSON.stringify(sendData), { status: 400 });

      let fileId = null;
      if (sendData.result.document) fileId = sendData.result.document.file_id;
      else if (sendData.result.video) fileId = sendData.result.video.file_id;
      else if (sendData.result.animation) fileId = sendData.result.animation.file_id;

      // Формируем вечную ссылку
      const permanentUrl = `${url.origin}/v/${fileId}/${encodeURIComponent(originalName)}`;

      return new Response(permanentUrl, {
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });

    } catch (err) {
      return new Response("POST Error: " + err.message, { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
}

// Отдача файла с предпросмотром в браузере
async function fetchAndServe(tgFileUrl, originalName) {
  const fileStream = await fetch(tgFileUrl);
  if (!fileStream.ok) return new Response("TG download error", { status: 404 });

  let contentType = "application/octet-stream";
  const lower = originalName.toLowerCase();
  if (lower.endsWith(".mp4")) contentType = "video/mp4";
  else if (lower.endsWith(".webm")) contentType = "video/webm";
  else if (lower.endsWith(".mov")) contentType = "video/quicktime";
  else if (lower.endsWith(".mkv")) contentType = "video/x-matroska";
  else if (lower.endsWith(".png")) contentType = "image/png";
  else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) contentType = "image/jpeg";
  else if (lower.endsWith(".gif")) contentType = "image/gif";
  else if (lower.endsWith(".webp")) contentType = "image/webp";

  const safeAsciiName = originalName.replace(/[^\x20-\x7E]/g, "_");
  const encodedUtf8Name = encodeURIComponent(originalName);

  return new Response(fileStream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodedUtf8Name}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
