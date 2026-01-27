#!/usr/bin/env node

/**
 * Workspace Provisioning Worker
 * Creates workspace directories for projects with auto_provision_workspace enabled
 * 
 * Usage: node workspace-provision.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getWorkspacePath } = require(path.join(__dirname, '..', '..', '..', 'scripts', 'workspace-path'));

const WORKSPACE_ROOT = getWorkspacePath();
const DB_PATH = process.env.TASKS_DB_PATH || path.join(WORKSPACE_ROOT, 'data', 'tasks.db');

const DRY_RUN = process.argv.includes('--dry-run');

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${DRY_RUN ? '[DRY-RUN] ' : ''}${message}`);
}

function queryDb(sql, params = []) {
  const cmd = `sqlite3 "${DB_PATH}" "${sql.replace(/"/g, '\\"')}"`;
  try {
    const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    return result.trim() || null;
  } catch (e) {
    return null;
  }
}

function updateDb(sql, params = []) {
  if (DRY_RUN) {
    log(`[DRY-RUN] Would execute: ${sql}`);
    return;
  }
  // For sqlite3 CLI, we need to interpolate values directly
  const safeParams = params.map(p => {
    if (p === null || p === undefined) return 'NULL';
    return `'${String(p).replace(/'/g, "''")}'`;
  }).join(', ');
  
  const fullSql = sql.replace(/\?/g, () => safeParams.shift() || 'NULL');
  const cmd = `sqlite3 "${DB_PATH}" "${fullSql.replace(/"/g, '\\"')}"`;
  try {
    execSync(cmd, { encoding: 'utf8' });
  } catch (e) {
    // Ignore errors for updates that might not return results
  }
}

function provisionWorkspace(project) {
  const { id, name, auto_provision_workspace, workspace_path } = project;
  
  if (!auto_provision_workspace) {
    return { skipped: true, reason: 'auto_provision_workspace not enabled' };
  }
  
  // Determine workspace path
  let targetPath = workspace_path;
  
  if (!targetPath) {
    // Generate path from project name
    const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
    targetPath = path.join(WORKSPACE_ROOT, sanitizedName);
  }
  
  // Check if directory exists
  const exists = fs.existsSync(targetPath);
  
  if (exists) {
    // Update workspace_path if it was null
    if (!workspace_path && !DRY_RUN) {
      updateDb('UPDATE projects SET workspace_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [targetPath, id]);
      return { updated: true, path: targetPath };
    }
    return { skipped: true, reason: 'workspace already exists' };
  }
  
  // Create directory structure
  if (DRY_RUN) {
    log(`[DRY-RUN] Would create directory: ${targetPath}`);
    return { created: true, path: targetPath };
  }
  
  try {
    fs.mkdirSync(targetPath, { recursive: true });
    
    // Update workspace_path in database
    updateDb('UPDATE projects SET workspace_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [targetPath, id]);
    
    return { created: true, path: targetPath };
  } catch (error) {
    return { error: error.message };
  }
}

function main() {
  log('Starting workspace provisioning worker');
  
  // Get all projects with auto_provision_workspace enabled
  const result = queryDb(`
    SELECT id, name, description, github_repo_url, local_only, auto_provision_workspace, workspace_path
    FROM projects
    WHERE auto_provision_workspace = 1
    ORDER BY created_at ASC
  `);
  
  if (!result) {
    log('No projects found with auto-provisioning enabled');
    process.exit(0);
  }
  
  const lines = result.split('\n');
  const projects = lines.map(line => {
    const [id, name, description, github_repo_url, local_only, auto_provision_workspace, workspace_path] = line.split('|');
    return {
      id: parseInt(id),
      name,
      description,
      github_repo_url,
      local_only: local_only === '1',
      auto_provision_workspace: auto_provision_workspace === '1',
      workspace_path: workspace_path || null
    };
  });
  
  log(`Found ${projects.length} project(s) with auto-provisioning enabled`);
  
  let provisioned = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const project of projects) {
    log(`Processing project: ${project.name} (ID: ${project.id})`);
    
    const result = provisionWorkspace(project);
    
    if (result.created) {
      log(`  ✓ Created workspace: ${result.path}`);
      provisioned++;
    } else if (result.updated) {
      log(`  ✓ Updated workspace path: ${result.path}`);
      provisioned++;
    } else if (result.skipped) {
      log(`  ⊘ Skipped: ${result.reason}`);
      skipped++;
    } else if (result.error) {
      log(`  ✗ Error: ${result.error}`);
      errors++;
    }
  }
  
  log(`Summary: ${provisioned} created/updated, ${skipped} skipped, ${errors} errors`);
  process.exit(errors > 0 ? 1 : 0);
}

main();
