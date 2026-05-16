import { error } from "@sveltejs/kit";
import { readFile, stat } from "node:fs/promises";
import { join, normalize } from "node:path";
import { existsSync } from "node:fs";
import { getShareFolder } from "$lib/server/claw-client.js";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

function getContentType(filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

export async function GET({ params }: { params: { path: string } }) {
  const segments = params.path.split("/");
  if (segments.length < 2) {
    error(400, "Invalid path");
  }

  const userId = segments[0];
  const relativePath = segments.slice(1).join("/");

  const baseDir = await getShareFolder(userId);
  if (!baseDir) {
    error(404, "User folder not found");
  }

  const filePath = join(baseDir, relativePath);

  // prevent path traversal
  if (!normalize(filePath).startsWith(normalize(baseDir))) {
    error(403, "Forbidden");
  }

  if (!existsSync(filePath)) {
    error(404, "File not found");
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      error(400, "Not a file");
    }

    const data = await readFile(filePath);
    const contentType = getContentType(filePath);

    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(data.length),
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (e) {
    console.error(e);
    error(500, "Failed to read file");
  }
}
