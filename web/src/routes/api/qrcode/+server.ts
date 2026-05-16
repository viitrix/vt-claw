import { getQrcodeImage } from "$lib/server/claw-client";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const rid = url.searchParams.get("rid");
  if (!rid) {
    return json({ error: "rid is required" }, { status: 400 });
  }

  const result = await getQrcodeImage(rid);
  if (!result) {
    return json({ error: "no qrcode" }, { status: 404 });
  }

  return new Response(result.data, {
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "no-cache",
    },
  });
};
