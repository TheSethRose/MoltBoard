#!/usr/bin/env node

/**
 * Task Completion Script
 * Completes a task with an automatic final summary work note
 *
 * Usage: node complete-task.js <task_id> [summary]
 * Example: node complete-task.js 45 "Implemented the new feature and fixed 2 bugs"
 *
 * Uses the MoltBoard API (required for user-based DB isolation).
 */

import { createInterface } from "node:readline/promises";
import apiClient from "../../../scripts/api-client.js";

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const taskId = parseInt(args[0]);

  if (isNaN(taskId)) {
    console.log("Usage: node complete-task.js <task_id> [summary]");
    console.log("");
    console.log("Completes a task with an automatic final summary work note.");
    console.log(
      "Server requires work_notes before marking a task as complete.",
    );
    process.exit(1);
  }

  // Get task info via API
  const task = await apiClient.getTask({ id: taskId });

  if (!task) {
    log(`Error: Task ${taskId} not found`);
    process.exit(1);
  }

  if (task.status === "completed") {
    log(`Task #${task.task_number} is already completed`);
    process.exit(0);
  }

  // Get summary from args or prompt
  let summary = args.slice(1).join(" ");

  if (!summary) {
    console.log(`\nTask #${task.task_number}: ${task.text}`);
    console.log("Current status:", task.status);
    console.log("");
    summary = await prompt("Enter completion summary: ");
  }

  if (!summary.trim()) {
    log("Error: Summary is required to complete a task");
    process.exit(1);
  }

  // Complete task via API (appends note + sets status)
  await apiClient.appendWorkNote(taskId, `Final Summary: ${summary}`, "system");
  await apiClient.updateTaskStatus(taskId, "completed");

  log(`✓ Task #${task.task_number} marked as complete`);
  log(`  Summary: ${summary}`);
}

void main();
