#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import glob from 'glob';

const projectDir = process.cwd();

interface GenerateOptions {
  outputFilename: string;
  includePatterns: string[];
  excludePatterns: string[];
  removeBlankLines: boolean;
  removeComments: boolean;
}

async function generateSourceCodeMarkdown(options: GenerateOptions) {
  const {
    outputFilename = 'source-code.md',
    includePatterns = [],
    excludePatterns = [],
    removeBlankLines = true,
    removeComments = true,
  } = options;

  const projectName = path.basename(projectDir);

  console.log(chalk.cyan.bold('\n📝 Generating Source Code Doc'));
  console.log(chalk.dim('=====================================\n'));
  console.log(chalk.dim(`Current working directory: ${projectDir}`));
  const defaultExcludedPatterns = [
    '**/node_modules/**',
    '**/dist/**',
    '**/.git/**',
    '**/generate-source.ts',
    '**/.zed-settings.json',
    '**/.vscode/settings.json',
    '**/package-lock.json',
    '**/bun.lockb',
    '**/build/**',
    outputFilename,
  ];

  const singleLineCommentRegex = /^\s*\/\/.*$/gm;
  const multiLineCommentRegex = /\/\*[\s\S]*?\*\//g;

  function getMatchingFiles(): string[] {
    const allFiles: string[] = [];

    // Convert patterns like "*.route.ts" to "**/*.route.ts" to match in all directories
    const processedExcludePatterns = excludePatterns.map((pattern) =>
      pattern.startsWith('*') && !pattern.startsWith('**') ? `**/${pattern}` : pattern
    );

    if (includePatterns.length > 0) {
      includePatterns.forEach((pattern) => {
        const matches = glob.sync(pattern.includes('*') ? pattern : `**/${pattern}`, {
          cwd: projectDir,
          ignore: [...defaultExcludedPatterns, ...processedExcludePatterns],
          nodir: true,
        });
        allFiles.push(...matches);
      });
    } else {
      const matches = glob.sync('**/*', {
        cwd: projectDir,
        ignore: [...defaultExcludedPatterns, ...processedExcludePatterns],
        nodir: true,
      });
      allFiles.push(...matches);
    }

    return [...new Set(allFiles)];
  }

  console.log(chalk.yellow('🔍 Scanning...'));
  const matchingFiles = getMatchingFiles();

  const directories = [
    ...new Set(matchingFiles.map((file) => path.dirname(file)).filter((dir) => dir !== '.')),
  ];

  console.log(
    chalk.green(
      `✓ Found ${chalk.bold(matchingFiles.length)} files in ${chalk.bold(directories.length)} dirs\n`
    )
  );

  let output = `# Project: ${projectName}\n\n`;

  output += `## 📁 Dir Structure:\n${directories
    .map((dir) => {
      // Get files for this directory
      const dirFiles = matchingFiles.filter((file) => path.dirname(file) === dir);

      // Return directory with its files indented
      return `- ${dir}/\n${dirFiles.map((file) => `  • ${path.basename(file)}`).join('\n')}`;
    })
    .join('\n')}\n\n`;

  const rootFiles = matchingFiles.filter((file) => path.dirname(file) === '.');
  if (rootFiles.length > 0) {
    output += `- ./\n${rootFiles.map((file) => `  • ${file}`).join('\n')}\n`;
  }

  output += `## 🚫 Excludes:\n${[...defaultExcludedPatterns, ...excludePatterns]
    .map((p) => `- ${p}`)
    .join('\n')}\n\n`;

  output += `## 📁 Dir Structure:\n${directories.map((p) => `- ${p}`).join('\n')}\n\n`;

  output += '## 💻 Code:\n====================\n\n';

  let totalLines = 0;
  let processedFiles = 0;

  console.log(chalk.yellow('📋 Processing...'));

  for (const file of matchingFiles) {
    process.stdout.write(
      `\r${chalk.dim(`Processing: ${processedFiles}/${matchingFiles.length} files`)}`
    );

    output += `// ${file}\n`;
    let content = fs.readFileSync(path.join(projectDir, file), 'utf-8');

    if (removeComments) {
      content = content.replace(multiLineCommentRegex, '');
      content = content.replace(singleLineCommentRegex, '');
    }

    if (removeBlankLines) {
      content = content
        .split('\n')
        .filter((line) => line.trim() !== '')
        .join('\n');
    } else {
      content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
    }

    const lines = content.split('\n');
    totalLines += lines.length;
    output += content + '\n\n';

    processedFiles++;
  }

  process.stdout.write('\r' + ' '.repeat(60) + '\r');

  const outputPath = path.join(projectDir, outputFilename);

  console.log(chalk.dim(`• Output Path: ${chalk.cyan(outputPath)}`));
  try {
    fs.writeFileSync(outputPath, output);
    console.log(chalk.green('\n✨ Doc gen success!'));
    console.log(chalk.dim('────────────────────────────────────'));
    console.log(chalk.white(`📊 Stats:`));
    console.log(chalk.dim(`• Output: ${chalk.cyan(outputFilename)}`));
    console.log(chalk.dim(`• Files: ${chalk.cyan(matchingFiles.length)}`));
    console.log(chalk.dim(`• Dirs: ${chalk.cyan(directories.length)}`));
    console.log(chalk.dim(`• LOC: ${chalk.cyan(totalLines)}`));
    console.log(
      chalk.dim(`• Blank lines: ${chalk.cyan(removeBlankLines ? 'Removed' : 'Preserved')}`)
    );
    console.log(chalk.dim(`• Comments: ${chalk.cyan(removeComments ? 'Removed' : 'Preserved')}`));
    console.log(chalk.dim('────────────────────────────────────\n'));
  } catch (error) {
    console.error(chalk.red('\n❌ Doc gen fail:'));
    console.error(chalk.dim(error));
    process.exit(1);
  }
}

function parseArgs(args: string[]): GenerateOptions {
  const options: GenerateOptions = {
    outputFilename: 'source-code.md',
    includePatterns: [],
    excludePatterns: [],
    removeBlankLines: true,
    removeComments: true,
  };

  try {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg.startsWith('--output=')) {
        options.outputFilename = arg.split('=')[1];
      } else if (arg.startsWith('--include=')) {
        options.includePatterns = arg
          .split('=')[1]
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p);
      } else if (arg.startsWith('--exclude=')) {
        options.excludePatterns = arg
          .split('=')[1]
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p);
      } else if (arg === '--preserve-blank-lines') {
        options.removeBlankLines = false;
      } else if (arg === '--preserve-comments') {
        options.removeComments = false;
      }
    }
  } catch (error) {
    console.log(chalk.red('\n❌ Args error:'));
    console.log(chalk.dim(error));
    console.log(chalk.yellow('\nUsage:'));
    console.log(
      chalk.dim(
        'generate-source --include=main.test.ts,test.interface.ts --exclude=dist/,build/ --output=docs.md\n'
      )
    );
    process.exit(1);
  }

  return options;
}

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
  console.log(chalk.cyan.bold('\n📘 Source Doc Gen'));
  console.log(chalk.dim('====================================='));
  console.log(chalk.white('\nUsage:'));
  console.log(chalk.dim('  generate-source [options]'));
  console.log(chalk.white('\nOptions:'));
  console.log(chalk.dim('  --include=<paths>         Include paths, comma separated'));
  console.log(chalk.dim('  --exclude=<paths>         Exclude paths, comma separated'));
  console.log(chalk.dim('  --output=<filename>       Output file (default: source-code.md)'));
  console.log(chalk.dim('  --preserve-blank-lines    Keep blank lines'));
  console.log(chalk.dim('  --preserve-comments       Keep comments'));
  console.log(chalk.white('\nExamples:'));
  console.log(chalk.dim('  generate-source --include=src/,scripts/'));
  console.log(chalk.dim('  generate-source --exclude=tests/,temp/'));
  console.log(chalk.dim('  generate-source --include=src/ --exclude=src/tests --output=docs.md'));
  console.log(
    chalk.dim('  generate-source --include=src/ --preserve-blank-lines --preserve-comments\n')
  );
  process.exit(0);
}

const options = parseArgs(args);

generateSourceCodeMarkdown(options).catch((err) => {
  console.log(chalk.red('\n❌ Doc gen fail:'));
  console.log(chalk.dim(err));
  process.exit(1);
});
