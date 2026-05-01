#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

const projectDir = process.cwd();

async function cleanProject() {
  const chalk = (await import('chalk')).default;
  const foldersToDelete = [
    '.bun',
    '.turbo',
    '.eslintcache',
    '.parcel-cache',
    'node_modules',
    '.next',
    '.cache',
    'dist',
    'build',
    'coverage',
    '.vite',
  ];
  const filesToDelete = [
    'bun.lockb',
    'yarn.lock',
    'package-lock.json',
    'pnpm-lock.yaml',
    '.DS_Store',
  ];

  let deletedCount = 0;

  try {
    for (const folder of foldersToDelete) {
      const fullPath = path.join(projectDir, folder);
      if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`${chalk.green('✓')} Deleted folder: ${chalk.cyan(folder)}`);
        deletedCount++;
      }
    }

    for (const file of filesToDelete) {
      const fullPath = path.join(projectDir, file);
      if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath, { force: true });
        console.log(`${chalk.green('✓')} Deleted file: ${chalk.cyan(file)}`);
        deletedCount++;
      }
    }

    const generatedDirs = await findGeneratedDirs('.');
    for (const dir of generatedDirs) {
      const fullPath = path.join(projectDir, dir);
      if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`${chalk.green('✓')} Deleted generated dir: ${chalk.cyan(dir)}`);
        deletedCount++;
      }
    }

    console.log(chalk.green(`\n✨ Cleaning completed! ${deletedCount} items deleted`));
  } catch (error) {
    console.error(chalk.red('Error during cleaning:'), error);
    process.exit(1);
  }
}

async function findGeneratedDirs(dir: string): Promise<string[]> {
  const entries = fs.readdirSync(path.join(projectDir, dir), { withFileTypes: true });
  let generatedDirs: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'generated') {
        generatedDirs.push(fullPath);
      }
      generatedDirs = [...generatedDirs, ...(await findGeneratedDirs(fullPath))];
    }
  }
  return generatedDirs;
}

cleanProject().catch((error) => {
  console.error(chalk.red('Fatal Error:'), error);
  process.exit(1);
});
