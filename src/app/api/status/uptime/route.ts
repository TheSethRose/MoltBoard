import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { withErrorHandling, logError } from "@/lib/api-error-handler";

const execAsync = promisify(exec);

interface UptimeData {
  raw: string;
  formatted: string;
  days: number;
  hours: number;
  minutes: number;
}

// Parse uptime output like " 10:57AM  up 21 mins, 2 users, load averages: 1.33 1.31 1.29"
function parseUptime(output: string): UptimeData {
  const raw = output.trim();

  // Match patterns like: "up 21 mins", "up 2:15", "up 5 days, 3:10"
  const match = raw.match(
    /up\s+(\d+\s+(?:mins?|hours?|days?))?(?:,\s*(\d+)\s+users?)?/i,
  );

  if (!match) {
    return { raw, formatted: "Unknown", days: 0, hours: 0, minutes: 0 };
  }

  const timeStr = match[1] || "";
  let days = 0,
    hours = 0,
    minutes = 0;

  // Parse time components
  if (timeStr.includes("day")) {
    const parts = timeStr.split(/[,\s]+/);
    days = parseInt(parts[0]) || 0;
    if (parts[2]) {
      const hms = parts[2].split(":");
      hours = parseInt(hms[0]) || 0;
      minutes = parseInt(hms[1]) || 0;
    }
  } else if (timeStr.includes(":")) {
    const hms = timeStr.split(":");
    hours = parseInt(hms[0]) || 0;
    minutes = parseInt(hms[1]) || 0;
  } else if (timeStr.includes("hour")) {
    hours = parseInt(timeStr.split(/\s+/)[0]) || 0;
  } else if (timeStr.includes("min")) {
    minutes = parseInt(timeStr.split(/\s+/)[0]) || 0;
  }

  // Format for display
  let formatted = "";
  if (days > 0) formatted += `${days}d `;
  if (hours > 0) formatted += `${hours}h `;
  if (minutes > 0 || formatted === "") formatted += `${minutes}m`;

  return { raw, formatted: formatted.trim(), days, hours, minutes };
}

// GET - Fetch uptime status
export const GET = withErrorHandling(
  async (): Promise<NextResponse> => {
    try {
      const { stdout: uptime } = await execAsync("uptime");
      const uptimeData = parseUptime(uptime);

      return NextResponse.json({
        uptime: uptimeData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logError(error as Error, { route: "/api/status/uptime", method: "GET" });
      return NextResponse.json({
        uptime: {
          raw: "unavailable",
          formatted: "Unknown",
          days: 0,
          hours: 0,
          minutes: 0,
        },
        timestamp: new Date().toISOString(),
      });
    }
  },
  { context: { route: "/api/status/uptime", method: "GET" } },
);
