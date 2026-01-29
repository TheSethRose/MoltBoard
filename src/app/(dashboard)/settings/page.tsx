"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useArchiveSettings } from "@/hooks/use-archive-settings";

export default function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useArchiveSettings();

  const daysOldValue = useMemo(
    () => String(settings.daysOld ?? 30),
    [settings.daysOld],
  );

  return (
    <div className="h-full flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-card-foreground">Settings</h1>
        <p className="text-muted-foreground">
          Manage MoltBoard preferences and automation.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Task Archiving</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="archive-days">Retention window (days)</Label>
            <Input
              id="archive-days"
              type="number"
              min={0}
              value={daysOldValue}
              onChange={(e) => {
                const next = Number(e.target.value);
                updateSettings({
                  daysOld: Number.isFinite(next) ? Math.max(0, next) : 0,
                });
              }}
              className="max-w-[200px]"
            />
            <p className="text-xs text-muted-foreground">
              Completed tasks older than this will be archived when you run the
              archive action.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="archive-soft"
              type="checkbox"
              checked={settings.archiveOnly}
              onChange={(e) =>
                updateSettings({ archiveOnly: e.target.checked })
              }
              className="rounded border-gray-300"
            />
            <Label htmlFor="archive-soft">Soft archive (recommended)</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            When disabled, archived tasks are permanently deleted.
          </p>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => resetSettings()}
            >
              Reset to defaults
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
