import { fetchRoles } from "$lib/server/claw-client";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const channel = url.searchParams.get("channel") || "";
  const data = await fetchRoles(channel);
  return json(data);
};
