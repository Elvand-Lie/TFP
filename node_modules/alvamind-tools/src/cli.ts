#!/usr/bin/env node

import chalk from 'chalk';

const showHelp = () => {
  console.log(`
${chalk.bold.blue('Alvamind Tools')} - CLI utilities for code generation and git automation

${chalk.bold('Usage:')}
  ${chalk.cyan()} ${chalk.green('<command>')} [options]

${chalk.bold('Commands:')}
  ${chalk.green('alvamind')}          Show this
  ${chalk.green('generate-source')}   Generate source code documentation
  ${chalk.green('commit')}            Automate git commits
  ${chalk.green('clean')}             Clean project files
  ${chalk.green('split-code')}        Split code files
  ${chalk.green('publish-npm')}       Publish to npm
  ${chalk.green('add-json-script')}   Add scripts to package.json

${chalk.bold('Examples:')}

${chalk.bold('1. Generate Source Code Documentation:')}
   $ ${chalk.cyan('generate-source')} --include=src/,scripts/ --exclude=tests/ --output=docs.md
   $ ${chalk.cyan('generate-source')} --preserve-blank-lines --preserve-comments

   ${chalk.yellow('Options:')}
   --include=<paths>         Comma-separated list of paths to include
   --exclude=<paths>         Comma-separated list of paths to exclude
   --output=<filename>       Output filename (default: source-code.md)
   --preserve-blank-lines    Preserve blank lines in output
   --preserve-comments       Preserve comments in output

${chalk.bold('2. Commit Changes:')}
   $ ${chalk.cyan('commit')} "feat: add new feature"
   $ ${chalk.cyan('commit')} "fix: resolve bug in login"

   ${chalk.gray('- Automatically initializes git repository if needed')}
   ${chalk.gray('- Creates .gitignore if missing')}
   ${chalk.gray('- Creates GitHub repository if gh CLI is installed')}
   ${chalk.gray('- Commits and pushes changes')}

${chalk.bold('3. Clean Project:')}
   $ ${chalk.cyan('clean')}

   ${chalk.gray('Removes common development artifacts:')}
   ${chalk.gray('- node_modules, dist, build directories')}
   ${chalk.gray('- Lock files (package-lock.json, yarn.lock, etc.)')}
   ${chalk.gray('- Cache directories (.cache, .parcel-cache, etc.)')}
   ${chalk.gray('- Generated directories')}

${chalk.bold('4. Split Code Files:')}
   $ ${chalk.cyan('split-code')} source=combined.ts markers=src/,lib/ outputDir=./output

   ${chalk.yellow('Options:')}
   source=<file>     Source file to split
   markers=<paths>   Comma-separated list of path markers
   outputDir=<path>  Output directory for split files

${chalk.bold('5. Publish to NPM:')}
   $ ${chalk.cyan('publish-npm')} patch "fix: update dependencies"
   $ ${chalk.cyan('publish-npm')} minor "feat: add new feature"

   ${chalk.yellow('Arguments:')}
   First:   Version type (patch|minor|major)
   Second:  Commit message (optional)

${chalk.bold('Options:')}
  --help, -h        Show this help message
  --version, -v     Show version number

${chalk.italic('For more detailed information about a specific command, run:')}
  ${chalk.cyan('alvamind')} ${chalk.green('<command>')} --help
`);
};

const showVersion = () => {
  const packageJson = require('../package.json');
  console.log(chalk.bold(`v${packageJson.version}`));
};

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  showHelp();
} else if (args.includes('--version') || args.includes('-v')) {
  showVersion();
} else {
  console.log(
    chalk.red(`Unknown command. Run '${chalk.cyan('alvamind --help')}' for usage information.`)
  );
}
