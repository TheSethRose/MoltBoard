#!/usr/bin/env node

/**
 * Task Completion Script
 * Completes a task with an automatic final summary work note
 * 
 * Usage: node complete-task.js <task_id> [summary]
 * Example: node complete-task.js 45 "Implemented the new feature and fixed 2 bugs"
 * 
 * If no summary provided, prompts for one interactively.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DB_PATH = process.env.TASKS_DB_PATH || path.join(process.env.HOME, 'workspace/data/tasks.db');

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function queryDb(sql) {
  try {
    const result = execSync(`sqlite3 "${DB_PATH}" "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' });
    return result.trim() || null;
  } catch (e) {
    return null;
  }
}

function updateDb(sql, params = []) {
  const safeParams = params.map(p => {
    if (p === null || p === undefined) return 'NULL';
    return `'${String(p).replace(/'/g, "''")}'`;
  }).join(', ');
  
  const fullSql = sql.replace(/\?/g, () => safeParams.shift() || 'NULL');
  const cmd = `sqlite3 "${DB_PATH}" "${fullSql.replace(/"/g, '\\"')}"`;
  try {
    execSync(cmd, { encoding: 'utf8' });
  } catch (e) {
    // Ignore errors for updates
  }
}

function main() {
  const args = process.argv.slice(2);
  const taskId = parseInt(args[0]);
  
  if (isNaN(taskId)) {
    console.log('Usage: node complete-task.js <task_id> [summary]');
    console.log('');
    console.log('Completes a task with an automatic final summary work note.');
    console.log('Server requires work_notes before marking a task as complete.');
    process.exit(1);
  }

  // Get task info
  const taskResult = queryDb(`
    SELECT id, task_number, text, status, work_notes FROM tasks WHERE id = ${taskId}
  `);

  if (!taskResult) {
    log(`Error: Task ${taskId} not found`);
    process.exit(1);
  }

  const [id, taskNum, text, status, workNotesJson] = taskResult.split('|');
  
  if (status === 'completed') {
    log(`Task #${taskNum} is already completed`);
    process.exit(0);
  }

  // Get summary from args or prompt
  let summary = args.slice(1).join(' ');
  
  if (!summary) {
    console.log(`\nTask #${taskNum}: ${text}`);
    console.log('Current status:', status);
    console.log('');
    summary = await prompt('Enter completion summary: ');
  }

  if (!summary.trim()) {
    log('Error: Summary is required to complete a task');
    process.exit(1);
  }

  // Create final summary note
  const finalNote = {
    id: require('crypto').randomUUID(),
    content: `Final Summary: ${summary}`,
    author: 'system' as const,
    timestamp: new Date().toISOString(),
  };

  // Get existing work_notes and prepend final summary
  const existingNotes = workNotesJson ? JSON.parse(workNotesJson) : [];
  const updatedNotes = [finalNote, ...existingNotes];

  // Update task: set status to completed and update work_notes
  updateDb(`
    UPDATE tasks SET status = 'completed', work_notes = '${JSON.stringify(updatedNotes).replace(/'/g, "''")}', updated_at = CURRENT_TIMESTAMP WHERE id = ${taskId}
  `);

  log(`✓ Task #${taskNum} marked as complete`);
  log(`  Summary: ${summary}`);
  log(`  Work notes: ${updatedNotes.length} total`);
}

main();
