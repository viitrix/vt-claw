import { getQrStatus } from "$lib/server/claw-client";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const rid = url.searchParams.get("rid");
  if (!rid) {
    return json({ status: "error", error: "rid is required" }, { status: 400 });
  }
  const data = await getQrStatus(rid);
  return json(data);
};
