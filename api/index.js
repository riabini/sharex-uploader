export const config = {
  runtime: 'edge', // Включаем быстрый Edge-движок
};

export default async function handler(request) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;
  const url = new URL(request.url);

  // 1. Просмотр файла в браузере (GET-запрос)
  if (request.method === "GET") {
    try {
      const parts = url.pathname.split("/").filter(Boolean);
      let fileId = "";
      let originalName = "file";

      if (parts[0] === "v" && parts.length >= 3) {
        fileId = parts[1];
        originalName = parts.slice(2).join("_");
      } else if (parts[0] === "f" || parts[0] === "i") {
        const tgFilePath = parts.slice(1, 3).join("/");
        originalName = parts.slice(3).join("_") || parts[parts.length - 1];
        return await fetchAndServe(`https://api.telegram.org/file/bot${BOT_TOKEN}/${tgFilePath}`, originalName);
      } else {
        return new Response("ShareX TG Uploader is running!", { status: 200 });
      }

      try { originalName = decodeURIComponent(originalName); } catch (e) {}

      // Динамический запрос свежего пути по вечному file_id
      const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
      const fileData = await fileRes.json();

      if (!fileData.ok) {
        return new Response("Файл не найден в Telegram", { status: 404 });
      }

      const liveFileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
      return await fetchAndServe(liveFileUrl, originalName);

    } catch (err) {
      return new Response("GET Error: " + err.message, { status: 500 });
    }
  }

  // 2. Загрузка из ShareX (POST-запрос)
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

      // Возвращаем вечную ссылку на домене Vercel
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

// Вспомогательная функция отдачи файла
async function fetchAndServe(tgFileUrl, originalName) {
  const fileStream = await fetch(tgFileUrl);
  if (!fileStream.ok) return new Response("Ошибка загрузки из Telegram", { status: 404 });

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
