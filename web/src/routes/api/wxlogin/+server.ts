import { startWxLogin } from "$lib/server/claw-client";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ url }) => {
  const role = url.searchParams.get("role") || "";
  const data = await startWxLogin(role);
  return json(data);
};
