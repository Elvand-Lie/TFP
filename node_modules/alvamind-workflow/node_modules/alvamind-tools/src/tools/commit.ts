#!/usr/bin/env node

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import chalk from 'chalk';

// Add default gitignore content
const defaultGitignore = `# Dependencies
/node_modules
/.pnp
.pnp.js

# Testing
/coverage

# Production
/build
/dist

# Misc
.DS_Store
.env.local
.env.development.local
.env.test.local
.env.production.local

# Debug logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity`;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const projectDir = process.cwd();
const projectName = path.basename(projectDir);
const args = process.argv.slice(2);
const commitMessage = args.join(' ');

async function askQuestion(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function isGhInstalled(): Promise<boolean> {
  try {
    execSync('gh --version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

// Add function to create gitignore
function createGitignore() {
  const gitignorePath = path.join(projectDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    console.log(chalk.yellow('ℹ️  Creating default .gitignore file...'));
    fs.writeFileSync(gitignorePath, defaultGitignore);
    console.log(chalk.green('✅ Created .gitignore file'));
  }
}

async function commitAndPush() {
  if (!commitMessage) {
    console.error(chalk.red('❌ Commit message is required.'));
    process.exit(1);
  }

  try {
    console.log(chalk.cyan('🚀 Starting commit process...'));
    process.chdir(projectDir);
    console.log(chalk.gray(`📂 Working in: ${projectDir}`));

    // Check if .git exists
    const isNewRepo = !fs.existsSync(path.join(projectDir, '.git'));
    if (isNewRepo) {
      console.log(chalk.yellow('⚠️  No git repository found. Initializing...'));
      execSync('git init', { stdio: 'inherit' });
      console.log(chalk.green('✅ Git repository initialized.'));

      // Create .gitignore for new repositories
      createGitignore();
    }

    // Check for .gitignore even in existing repositories
    createGitignore();

    // Stage and commit changes first
    const status = execSync('git status --porcelain').toString();
    if (!status) {
      console.log(chalk.yellow('ℹ️  No changes to commit.'));
      process.exit(0);
    }

    console.log(chalk.cyan('📝 Staging all changes...'));
    execSync('git add .', { stdio: 'inherit' });
    console.log(chalk.cyan('💾 Committing changes...'));
    execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });

    // Now check for gh and create remote repository if needed
    if (await !isGhInstalled()) {
      console.log(
        chalk.yellow('⚠️  GitHub CLI (gh) is not installed. Skipping remote repository creation.')
      );
    } else {
      console.log(chalk.cyan('🔍 Checking for remote repository...'));
      try {
        execSync('gh repo view', { stdio: 'ignore' });
        console.log(chalk.green('✅ Remote repository found.'));
      } catch (error) {
        console.log(chalk.yellow('⚠️  No remote repository found. Creating...'));
        const makePrivate = await askQuestion(chalk.cyan('Make repository private? (y/n): '));
        const repoType = makePrivate.toLowerCase() === 'y' ? 'private' : 'public';
        execSync(`gh repo create ${projectName} --${repoType} --source=. --push`, {
          stdio: 'inherit',
        });
        console.log(chalk.green(`✅ Created ${repoType} repository: ${projectName} on GitHub`));
      }
    }

    // Push changes
    try {
      execSync('git rev-parse --abbrev-ref --symbolic-full-name @{u}', { stdio: 'ignore' });
      console.log(chalk.cyan('⬆️  Pushing changes...'));
      execSync('git push', { stdio: 'inherit' });
    } catch (error) {
      const remoteName = 'origin';
      const branchName = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
      console.log(chalk.cyan(`⬆️  Setting upstream and pushing to ${remoteName}/${branchName}...`));
      execSync(`git push --set-upstream ${remoteName} ${branchName}`, { stdio: 'inherit' });
    }

    console.log(chalk.green('✅ Changes committed and pushed successfully!'));
  } catch (error) {
    console.error(chalk.red('❌ Error during commit and push:'), error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

commitAndPush();
