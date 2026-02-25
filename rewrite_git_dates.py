#!/usr/bin/env python3
"""
Manual Git Commit Date Rewriter
Most reliable method - creates new commits with new dates
"""

import subprocess
import random
import sys
import os
from datetime import datetime

# Distribution: 22 commits starting from Feb 25, 2026
# Pattern: 2, 3, 2, 3, 2, 3, 2, 3, 2 = 22 commits
DATES = [
    "2026-02-25",  # 2 commits
    "2026-02-26",  # 3 commits
    "2026-02-27",  # 2 commits
    "2026-02-28",  # 3 commits
    "2026-03-01",  # 2 commits
    "2026-03-02",  # 3 commits
    "2026-03-03",  # 2 commits
    "2026-03-04",  # 3 commits
    "2026-03-05",  # 2 commits
]

DISTRIBUTION = [2, 3, 2, 3, 2, 3, 2, 3, 2]  # Total = 22

def run_command(cmd):
    """Run command and return output"""
    result = subprocess.run(
        cmd, 
        shell=True, 
        capture_output=True, 
        text=True, 
        encoding='utf-8', 
        errors='ignore'
    )
    return result.stdout.strip(), result.stderr.strip(), result.returncode

def main():
    print("=== Manual Git Date Rewriter ===\n")
    
    # Verify git repo
    _, _, code = run_command("git rev-parse --git-dir")
    if code != 0:
        print("Error: Not a git repository")
        sys.exit(1)
    
    # Get info
    current_branch, _, _ = run_command("git rev-parse --abbrev-ref HEAD")
    commit_count_str, _, _ = run_command("git rev-list --count HEAD")
    commit_count = int(commit_count_str)
    
    print(f"Branch: {current_branch}")
    print(f"Commits: {commit_count}\n")
    
    expected_commits = sum(DISTRIBUTION)
    if commit_count != expected_commits:
        print(f"Warning: Expected {expected_commits} commits but found {commit_count}")
        print(f"This script is configured for exactly {expected_commits} commits")
        confirm = input("Continue anyway? (yes/no): ")
        if confirm.lower() != "yes":
            sys.exit(0)
    
    # Create backup
    backup = f"backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    print(f"Creating backup: {backup}")
    run_command(f"git branch {backup}")
    print("✓ Backup created\n")
    
    # Show distribution
    print("Distribution:")
    for date, count in zip(DATES, DISTRIBUTION):
        print(f"  {date}: {count} commits")
    print()
    
    # Generate date-times IN SEQUENTIAL ORDER
    commit_dates = []
    for date, count in zip(DATES, DISTRIBUTION):
        for _ in range(count):
            h, m, s = random.randint(9, 18), random.randint(0, 59), random.randint(0, 59)
            commit_dates.append(f"{date} {h:02d}:{m:02d}:{s:02d}")
    
    # DO NOT shuffle - keep sequential order!
    print(f"Generated {len(commit_dates)} date-times\n")
    
    # Confirm
    print("⚠ This will rewrite history!")
    confirm = input("Continue? (yes/no): ")
    if confirm.lower() != "yes":
        print("Aborted")
        sys.exit(0)
    
    print("\nCollecting commit information...")
    
    # Get all commits (newest to oldest)
    commits_raw, _, _ = run_command('git log --format="%H|||%an|||%ae|||%s"')
    if not commits_raw:
        print("Error: Could not read commits")
        sys.exit(1)
    
    commits = []
    for line in commits_raw.split('\n'):
        if '|||' in line:
            parts = line.split('|||')
            if len(parts) >= 4:
                commits.append({
                    'hash': parts[0],
                    'author': parts[1],
                    'email': parts[2],
                    'message': '|||'.join(parts[3:])  # In case message contains |||
                })
    
    # Reverse to get oldest first
    commits.reverse()
    print(f"Found {len(commits)} commits")
    
    # Get root commit (first commit in repo)
    root_hash, _, _ = run_command("git rev-list --max-parents=0 HEAD")
    print(f"\nStarting rewrite from root: {root_hash[:8]}...\n")
    
    # Create orphan branch to rebuild history
    temp_branch = f"temp-rewrite-{datetime.now().strftime('%H%M%S')}"
    
    # Checkout orphan branch
    run_command(f"git checkout --orphan {temp_branch}")
    
    # Process each commit
    for i, commit_info in enumerate(commits):
        new_date = commit_dates[i] if i < len(commit_dates) else commit_dates[-1]
        print(f"[{i+1}/{len(commits)}] {commit_info['hash'][:8]} -> {new_date}")
        
        # Checkout files from original commit
        run_command(f"git checkout {commit_info['hash']} -- .")
        
        # Stage all changes
        run_command("git add -A")
        
        # Set environment variables for git commit
        env = os.environ.copy()
        env['GIT_AUTHOR_NAME'] = commit_info['author']
        env['GIT_AUTHOR_EMAIL'] = commit_info['email']
        env['GIT_AUTHOR_DATE'] = new_date
        env['GIT_COMMITTER_NAME'] = commit_info['author']
        env['GIT_COMMITTER_EMAIL'] = commit_info['email']
        env['GIT_COMMITTER_DATE'] = new_date
        
        # Commit with original message
        message = commit_info['message'].replace('"', '\\"')
        commit_cmd = f'git commit -m "{message}"'
        subprocess.run(commit_cmd, shell=True, env=env, capture_output=True)
    
    print("\n✓ Rewrite complete!\n")
    
    # Switch back to original branch and reset to new history
    print(f"Updating {current_branch}...")
    run_command(f"git branch -f {current_branch} {temp_branch}")
    run_command(f"git checkout {current_branch}")
    run_command(f"git branch -D {temp_branch}")
    
    # Show results
    print("\nNew commit dates (all commits):")
    output, _, _ = run_command('git log --pretty=format:"%h %ad %s" --date=short')
    print(output)
    
    print("\n\n=== Success! ===")
    print(f"Backup: {backup}")
    print(f"\nTo push: git push --force origin {current_branch}")
    print(f"To restore: git reset --hard {backup}\n")

if __name__ == "__main__":
    main()
