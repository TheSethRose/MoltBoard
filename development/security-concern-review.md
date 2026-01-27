# Clawdbot Malware Injection

Clawdbot can inject malware into your code. This attack is difficult for experienced engineers to detect.

## How the Attack Works

Clawdbot implements code pull requests to solve application issues. An attacker can use a GitHub issue with an invisible payload (via malicious Markdown Link to payload URL) to install a backdoor.

### Attack Steps

- The attacker submits a GitHub issue.
- A jailbreak prompt is hidden inside a URL hyperlink.
- This prompt is invisible to humans but visible to LLMs.
- The maintainer assigns the task to Clawdbot.
- Clawdbot reads the jailbreak in the GitHub issue.
- The attacker hijacks the Clawdbot agent.
- Clawdbot plants a backdoor in a lock file.
- Engineers often overlook lock files during code reviews.
- The malicious URL in the lock file executes attacker commands.

## Security Implications

AI agents are not just tools. They can act as corruptible insider agents that work against you.
