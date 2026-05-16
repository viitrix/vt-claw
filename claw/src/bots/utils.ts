import { TIMEZONE } from "../config.js";

export function formatLocalTime(utcIso: string, timezone: string): string {
  const date = new Date(utcIso);
  return date.toLocaleString("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function escapeXml(s: string): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatMessages(content: string, type: string): string {
  const displayTime = formatLocalTime(new Date().toISOString(), TIMEZONE);
  return `<message time="${escapeXml(displayTime)}" type='${type}'>${escapeXml(content)}</message>`;
}
