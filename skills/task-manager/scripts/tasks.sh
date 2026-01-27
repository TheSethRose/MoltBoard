#!/bin/bash
# Task Manager CLI - operates on ~/workspace/todo.md
# Usage: tasks.sh <command> [args]

TODO_FILE="${TODO_FILE:-$HOME/workspace/todo.md}"

# Ensure file exists with header
init_file() {
    if [[ ! -f "$TODO_FILE" ]]; then
        cat > "$TODO_FILE" << 'EOF'
# Task Manager
# [ ] = READY | [*] = IN PROGRESS | [~] = PENDING | [x] = COMPLETED | [!] = BLOCKED

EOF
    fi
}

list_tasks() {
    init_file
    local filter="${1:-all}"
    local result=""
    case "$filter" in
        ready)        result=$(grep -E "^\- \[ \]" "$TODO_FILE" 2>/dev/null || true) ;;
        in-progress)  result=$(grep -E "^\- \[\*\]" "$TODO_FILE" 2>/dev/null || true) ;;
        pending)      result=$(grep -E "^\- \[~\]" "$TODO_FILE" 2>/dev/null || true) ;;
        completed)    result=$(grep -E "^\- \[x\]" "$TODO_FILE" 2>/dev/null || true) ;;
        blocked)      result=$(grep -E "^\- \[!\]" "$TODO_FILE" 2>/dev/null || true) ;;
        all)          result=$(grep -E "^\- \[.\]" "$TODO_FILE" 2>/dev/null || true) ;;
    esac
    [[ -n "$result" ]] && echo "$result" || echo "(no tasks)"
}

add_task() {
    init_file
    local status="${1:-ready}"
    local task="$2"
    [[ -z "$task" ]] && { echo "Error: No task provided"; exit 1; }
    
    case "$status" in
        ready)        echo "- [ ] $task" >> "$TODO_FILE" ;;
        in-progress)  echo "- [*] $task" >> "$TODO_FILE" ;;
        pending)      echo "- [~] $task" >> "$TODO_FILE" ;;
        completed)    echo "- [x] $task" >> "$TODO_FILE" ;;
        *)            echo "- [ ] $task" >> "$TODO_FILE" ;;
    esac
    echo "Added: $task"
}

complete_task() {
    local pattern="$1"
    [[ -z "$pattern" ]] && { echo "Error: No task pattern provided"; exit 1; }
    
    # Mark as completed instead of deleting
    if grep -q "$pattern" "$TODO_FILE" 2>/dev/null; then
        sed -i '' "s/^\- \[.\] \(.*$pattern.*\)/- [x] \1/" "$TODO_FILE"
        echo "Completed: $pattern"
    else
        echo "Error: Task not found"
        exit 1
    fi
}

delete_task() {
    local pattern="$1"
    [[ -z "$pattern" ]] && { echo "Error: No task pattern provided"; exit 1; }
    
    # Delete the matching line (used for completed tasks)
    if grep -q "$pattern" "$TODO_FILE" 2>/dev/null; then
        sed -i '' "/$pattern/d" "$TODO_FILE"
        echo "Deleted: $pattern"
    else
        echo "Error: Task not found"
        exit 1
    fi
}

block_task() {
    local pattern="$1"
    local reason="$2"
    [[ -z "$pattern" ]] && { echo "Error: No task pattern provided"; exit 1; }
    
    if grep -q "$pattern" "$TODO_FILE" 2>/dev/null; then
        if [[ -n "$reason" ]]; then
            sed -i '' "s/^\- \[.\] \(.*$pattern.*\)/- [!] \1 - Blocked: $reason/" "$TODO_FILE"
        else
            sed -i '' "s/^\- \[.\] \(.*$pattern.*\)/- [!] \1/" "$TODO_FILE"
        fi
        echo "Blocked: $pattern"
    else
        echo "Error: Task not found"
        exit 1
    fi
}

update_status() {
    local pattern="$1"
    local new_status="$2"
    [[ -z "$pattern" ]] && { echo "Error: No task pattern provided"; exit 1; }
    [[ -z "$new_status" ]] && { echo "Error: No status provided"; exit 1; }
    
    local status_marker=""
    case "$new_status" in
        ready)        status_marker="[ ]" ;;
        in-progress)  status_marker="[*]" ;;
        pending)      status_marker="[~]" ;;
        completed)    status_marker="[x]" ;;
        blocked)      status_marker="[!]" ;;
        *)            status_marker="[ ]" ;;
    esac
    
    if grep -q "$pattern" "$TODO_FILE" 2>/dev/null; then
        sed -i '' "s/^\- \[.\] \(.*$pattern.*\)/- $status_marker \1/" "$TODO_FILE"
        echo "Updated: $pattern -> $new_status"
    else
        echo "Error: Task not found"
        exit 1
    fi
}

count_tasks() {
    init_file
    local ready=$(grep -cE "^\- \[ \]" "$TODO_FILE" 2>/dev/null || true)
    local in_progress=$(grep -cE "^\- \[\*\]" "$TODO_FILE" 2>/dev/null || true)
    local pending=$(grep -cE "^\- \[~\]" "$TODO_FILE" 2>/dev/null || true)
    local completed=$(grep -cE "^\- \[x\]" "$TODO_FILE" 2>/dev/null || true)
    local blocked=$(grep -cE "^\- \[!\]" "$TODO_FILE" 2>/dev/null || true)
    [[ -z "$ready" ]] && ready=0
    [[ -z "$in_progress" ]] && in_progress=0
    [[ -z "$pending" ]] && pending=0
    [[ -z "$completed" ]] && completed=0
    [[ -z "$blocked" ]] && blocked=0
    echo "Ready: $ready | In Progress: $in_progress | Pending: $pending | Completed: $completed | Blocked: $blocked"
}

case "$1" in
    list)     list_tasks "$2" ;;
    add)      add_task "$2" "$3" ;;
    complete) complete_task "$2" ;;
    delete)   delete_task "$2" ;;
    block)    block_task "$2" "$3" ;;
    update)   update_status "$2" "$3" ;;
    count)    count_tasks ;;
    *)        echo "Usage: tasks.sh <list|add|complete|delete|block|update|count> [args]"; exit 1 ;;
esac
