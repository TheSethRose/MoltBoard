"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, Copy, Check } from "lucide-react";

interface UptimeData {
  raw: string;
  formatted: string;
  days: number;
  hours: number;
  minutes: number;
}

interface SystemHealth {
  moltbot: string;
  git: string;
  uptime: UptimeData;
}

interface SessionInfo {
  sessionId: string;
  startTime: string;
  pid: number;
}

interface MemoryUsage {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
}

interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

interface StatusData {
  tasks: TaskLite[];
  health: SystemHealth;
  session: SessionInfo;
  memory: MemoryUsage;
  tokens?: TokenUsage;
  timestamp: string;
}

interface MetricPoint {
  date: string;
  tasks_completed: number;
  tasks_created: number;
}

interface MetricsData {
  history: MetricPoint[];
  today: {
    date: string;
    completed: number;
    total: number;
  };
}

import { TaskLite } from "@/types/task";

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Copy feedback state
  const [copiedSessionId, setCopiedSessionId] = useState(false);

  // Individual refresh states
  const [refreshingUptime, setRefreshingUptime] = useState(false);

  // Individual health data with loading states
  const [uptimeData, setUptimeData] = useState<UptimeData | null>(null);
  const [gitStatus, setGitStatus] = useState<string | null>(null);
  const [databaseStatus, setDatabaseStatus] = useState<{
    status: string;
    count: number;
  } | null>(null);
  const [metricsData, setMetricsData] = useState<MetricsData | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
      setError(null);
      setLastUpdate(new Date());

      // Initialize individual health data
      setUptimeData(json.health.uptime);
      setGitStatus(json.health.git);
      // We'll initialize database status separately
    } catch (e) {
      setError(String(e));
    }
  };

  const fetchUptime = async () => {
    setRefreshingUptime(true);
    try {
      const res = await fetch("/api/status/uptime");
      if (!res.ok) throw new Error("Failed to fetch uptime");
      const json = await res.json();
      setUptimeData(json.uptime);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setRefreshingUptime(false);
    }
  };

  const copySessionId = async () => {
    if (!data?.session?.sessionId) return;
    try {
      await navigator.clipboard.writeText(data.session.sessionId);
      setCopiedSessionId(true);
      setTimeout(() => setCopiedSessionId(false), 2000);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  };

  useEffect(() => {
    // Parallelize initial data fetches
    Promise.all([
      fetch("/api/status").then((res) => {
        if (!res.ok) throw new Error("Status fetch failed");
        return res.json();
      }),
      fetch("/api/status/database").then((res) => {
        if (!res.ok) throw new Error("Database status fetch failed");
        return res.json();
      }),
      fetch("/api/metrics").then((res) => {
        if (!res.ok) throw new Error("Metrics fetch failed");
        return res.json();
      }),
    ])
      .then(([statusData, dbData, metrics]) => {
        setData(statusData);
        setUptimeData(statusData.health.uptime);
        setGitStatus(statusData.health.git);
        setDatabaseStatus({
          status: dbData.database,
          count: dbData.tasksCount,
        });
        setMetricsData(metrics);
        setError(null);
        setLastUpdate(new Date());
      })
      .catch((e) => {
        setError(String(e));
      });

    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const statusCounts = {
    ready: data?.tasks?.filter((t) => t.status === "ready").length || 0,
    inProgress:
      data?.tasks?.filter((t) => t.status === "in-progress").length || 0,
    completed: data?.tasks?.filter((t) => t.status === "completed").length || 0,
    blocked: data?.tasks?.filter((t) => t.status === "blocked").length || 0,
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          System Status
        </h1>
        <p
          className="text-sm text-muted-foreground mt-1 font-inter"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          Updated: {lastUpdate.toLocaleTimeString()}
        </p>
      </header>

      {/* Bento Grid Layout for System Metrics */}
      <div className="grid grid-cols-4 grid-rows-[auto_auto_auto] gap-3">
        {/* Hero Card - System Health Overview (spans 2 cols, 2 rows) */}
        <Card className="col-span-2 row-span-2 bg-card border-border">
          <CardContent className="py-4 px-5 h-full">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm font-semibold text-foreground font-inter">
                  System Health
                </p>
                <p className="text-xs text-muted-foreground font-inter">
                  Core metrics overview
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={fetchUptime}
                  disabled={refreshingUptime}
                >
                  <RefreshCw
                    className={`h-3 w-3 ${refreshingUptime ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>
            </div>

            {/* Uptime prominently displayed */}
            <div className="mb-4">
              <p className="text-xs text-muted-foreground font-inter mb-1">
                Uptime
              </p>
              <p
                className="text-3xl font-bold text-foreground font-inter"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {uptimeData?.formatted ||
                  data?.health?.uptime?.formatted ||
                  "—"}
              </p>
            </div>

            {/* Git & Database status in a row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    gitStatus === "clean"
                      ? "bg-green-500/20 text-green-400 border-green-500/30 font-inter"
                      : gitStatus === "not a repo"
                        ? "bg-red-500/20 text-red-400 border-red-500/30 font-inter"
                        : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 font-inter"
                  }
                >
                  {gitStatus || data?.health?.git || "—"}
                </Badge>
                <span className="text-xs text-muted-foreground font-inter">
                  Git
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    databaseStatus?.status === "connected"
                      ? "bg-green-400"
                      : "bg-red-400"
                  }`}
                />
                <span className="text-sm text-foreground font-inter">
                  {databaseStatus?.status === "connected"
                    ? `${databaseStatus.count} tasks`
                    : databaseStatus?.status || "—"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Session ID Card */}
        <Card className="bg-card border-border">
          <CardContent className="py-3 px-4">
            <div className="flex justify-between items-start mb-2">
              <p className="text-xs text-muted-foreground font-inter">
                Session
              </p>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={copySessionId}
                disabled={!data?.session?.sessionId || copiedSessionId}
                aria-label={
                  copiedSessionId ? "Session ID copied" : "Copy Session ID"
                }
              >
                {copiedSessionId ? (
                  <Check size={14} className="text-green-400" />
                ) : (
                  <Copy size={14} />
                )}
              </Button>
            </div>
            <p
              className="text-sm font-mono text-foreground font-inter truncate"
              style={{ fontVariantNumeric: "tabular-nums" }}
              title={data?.session?.sessionId || undefined}
            >
              {data?.session?.sessionId?.slice(0, 8) || "—"}...
            </p>
          </CardContent>
        </Card>

        {/* PID Card */}
        <Card className="bg-card border-border">
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground mb-1 font-inter">PID</p>
            <p
              className="text-xl font-semibold text-foreground font-inter"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {data?.session?.pid || "—"}
            </p>
          </CardContent>
        </Card>

        {/* Start Time Card */}
        <Card className="bg-card border-border">
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground mb-1 font-inter">
              Started
            </p>
            <p
              className="text-sm text-foreground font-inter"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {data?.session?.startTime
                ? new Date(data.session.startTime).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </p>
          </CardContent>
        </Card>

        {/* Memory Usage Card */}
        {data?.memory && (
          <Card className="col-span-2 row-span-1 bg-card border-border">
            <CardContent className="py-4 px-4">
              <div className="flex justify-between items-center mb-3">
                <p className="text-xs text-muted-foreground font-inter">
                  Memory Usage
                </p>
                <p
                  className="text-xs text-muted-foreground font-inter"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatBytes(data.memory.heapUsed)} /{" "}
                  {formatBytes(data.memory.heapTotal)}
                </p>
              </div>
              <Progress
                value={data.memory.heapUsed}
                max={data.memory.heapTotal}
                className="h-3"
              />
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  RSS: {formatBytes(data.memory.rss)}
                </span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  External: {formatBytes(data.memory.external)}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Task Summary - Bento Box Style */}
        <Card className="col-span-2 row-span-1 bg-card border-border">
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground mb-3 font-inter">
              Task Status
            </p>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2 rounded bg-green-500/10">
                <p
                  className="text-xl font-bold text-green-400 font-inter"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {statusCounts.ready}
                </p>
                <p className="text-[10px] text-muted-foreground font-inter">
                  Ready
                </p>
              </div>
              <div className="p-2 rounded bg-blue-500/10">
                <p
                  className="text-xl font-bold text-blue-400 font-inter"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {statusCounts.inProgress}
                </p>
                <p className="text-[10px] text-muted-foreground font-inter">
                  In Progress
                </p>
              </div>
              <div className="p-2 rounded bg-emerald-500/10">
                <p
                  className="text-xl font-bold text-emerald-400 font-inter"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {statusCounts.completed}
                </p>
                <p className="text-[10px] text-muted-foreground font-inter">
                  Done
                </p>
              </div>
              <div className="p-2 rounded bg-red-500/10">
                <p
                  className="text-xl font-bold text-red-400 font-inter"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {statusCounts.blocked}
                </p>
                <p className="text-[10px] text-muted-foreground font-inter">
                  Blocked
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Token Usage (if available) - spans remaining space */}
        {data?.tokens && (
          <Card className="col-span-2 row-span-1 bg-card border-border">
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground mb-2 font-inter">
                Token Usage
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground font-inter">
                    Input
                  </p>
                  <p
                    className="text-lg font-semibold text-foreground font-inter"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {data.tokens.input.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-inter">
                    Output
                  </p>
                  <p
                    className="text-lg font-semibold text-foreground font-inter"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {data.tokens.output.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-inter">
                    Total
                  </p>
                  <p
                    className="text-lg font-semibold text-foreground font-inter"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {data.tokens.total.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Historical Metrics */}
        {metricsData && metricsData.history.length > 0 && (
          <Card className="col-span-2 row-span-1 bg-card border-border">
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground mb-3 font-inter">
                Task History (7 days)
              </p>
              <div className="flex items-end gap-1 h-16">
                {metricsData.history.map((point, i) => {
                  const maxCompleted = Math.max(
                    ...metricsData.history.map((p) => p.tasks_completed),
                    1,
                  );
                  const height = (point.tasks_completed / maxCompleted) * 100;
                  return (
                    <div
                      key={i}
                      className="flex-1 flex flex-col items-center gap-1"
                    >
                      <div
                        className="w-full bg-emerald-500/60 rounded-t transition-all"
                        style={{ height: `${Math.max(height, 4)}%` }}
                        title={`${point.date}: ${point.tasks_completed} completed`}
                      />
                      <span className="text-[7px] text-muted-foreground">
                        {new Date(point.date).toLocaleDateString("en-US", {
                          weekday: "short",
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Today: {metricsData.today.completed}/{metricsData.today.total}{" "}
                done
              </p>
            </CardContent>
          </Card>
        )}

        {/* Error Card */}
        {error && (
          <Card className="col-span-4 bg-card border-border">
            <CardContent className="py-4">
              <p className="text-destructive font-inter" role="alert">
                Error: {error}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
