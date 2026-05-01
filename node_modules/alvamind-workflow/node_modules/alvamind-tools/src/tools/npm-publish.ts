#!/usr/bin/env node

import { execSync } from 'child_process';
import * as readline from 'readline';
import chalk from 'chalk';
import * as fs from 'fs';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const [, , versionArg, commitMessageArg] = process.argv;

async function askQuestion(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

function checkGitStatus(): boolean {
  try {
    const status = execSync('git status --porcelain').toString();
    return status.length === 0;
  } catch (error) {
    return false;
  }
}

function getCurrentBranch(): string {
  return execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
}

function validatePackageJson(): void {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const requiredFields = ['name', 'version', 'description', 'main', 'types'];
  for (const field of requiredFields) {
    if (!packageJson[field]) {
      throw new Error(`Missing required field in package.json: ${field}`);
    }
  }
}

async function selectVersionType(): Promise<string> {
  if (versionArg && ['patch', 'minor', 'major'].includes(versionArg)) {
    return versionArg;
  }

  console.log(chalk.cyan('\nSelect version increment type:'));
  console.log(chalk.gray('1. patch (1.0.0 -> 1.0.1)'));
  console.log(chalk.gray('2. minor (1.0.0 -> 1.1.0)'));
  console.log(chalk.gray('3. major (1.0.0 -> 2.0.0)'));

  const answer = await askQuestion('Enter your choice (1-3): ');
  const versionMap: { [key: string]: string } = {
    '1': 'patch',
    '2': 'minor',
    '3': 'major',
  };
  return versionMap[answer] || 'patch';
}

async function getCommitMessage(version: string): Promise<string> {
  if (commitMessageArg) {
    return commitMessageArg;
  }

  const defaultMessage = `chore: release v${version}`;
  const message = await askQuestion(
    chalk.cyan(`Enter commit message (default: "${defaultMessage}"): `)
  );
  return message.trim() || defaultMessage;
}

async function publishPackage() {
  try {
    console.log(chalk.cyan('\n🔍 Running pre-publish checks...\n'));

    console.log(chalk.cyan('📋 Validating package.json...'));
    validatePackageJson();
    console.log(chalk.green('✅ package.json is valid'));

    const currentBranch = getCurrentBranch();
    if (currentBranch !== 'main' && currentBranch !== 'master') {
      console.log(chalk.yellow(`⚠️  You're on branch '${currentBranch}'.`));
    }

    console.log(chalk.cyan('\n🧹 Cleaning project...'));
    execSync('bun clean', { stdio: 'inherit' });

    console.log(chalk.cyan('\n📦 Installing dependencies...'));
    execSync('bun install', { stdio: 'inherit' });

    console.log(chalk.cyan('\n🔨 Building project...'));
    execSync('bun run build', { stdio: 'inherit' });

    try {
      console.log(chalk.cyan('\n🧪 Running tests...'));
      execSync('bun test', { stdio: 'inherit' });
      console.log(chalk.green('✅ Tests passed'));
    } catch (error) {
      console.log(chalk.yellow('⚠️  No tests found or tests failed'));
    }

    const versionType = await selectVersionType();
    console.log(chalk.cyan(`\n📝 Incrementing ${versionType} version...`));
    execSync(`npm version ${versionType} --no-git-tag-version`, { stdio: 'inherit' });

    console.log(chalk.cyan('\n🚀 Publishing to npm...'));
    execSync('npm publish', { stdio: 'inherit' });

    // Get the new version after publishing
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const newVersion = packageJson.version;
    const tagName = `v${newVersion}`;

    // Get commit message and commit changes
    const commitMessage = await getCommitMessage(newVersion);
    console.log(chalk.cyan('\n📝 Committing changes...'));
    execSync(`bun commit "${commitMessage}"`, { stdio: 'inherit' });

    // Create and push tag
    console.log(chalk.cyan('\n🏷️  Creating and pushing tag...'));
    execSync(`git tag ${tagName}`, { stdio: 'inherit' });
    execSync('git push --tags', { stdio: 'inherit' });

    console.log(chalk.green('\n✨ Package successfully published to npm!'));
    console.log(chalk.gray(`Version: ${newVersion}`));
    console.log(chalk.gray(`Tag: ${tagName}`));
    console.log(chalk.gray(`Commit: ${commitMessage}`));
  } catch (error) {
    console.error(chalk.red('\n❌ Error during publish process:'), error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

publishPackage();
