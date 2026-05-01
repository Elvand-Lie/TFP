#!/usr/bin/env node

import * as readline from 'readline';
import { execSync } from 'child_process';
import * as chalk from 'chalk';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

async function askQuestion(query: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(query, resolve);
    });
}

async function postInstall() {
    try {
        // Welcome message
        console.log('\n' + '='.repeat(80));
        console.log(chalk.cyan.bold(`
    🚀 Welcome to Alvamind Tools! 🛠️
    `));
        console.log(chalk.white(`A powerful collection of development workflow automation tools:`));

        // Tool descriptions
        console.log(chalk.gray(`
    📝 generate-source  - Generate comprehensive source code documentation
    🔄 commit          - Streamlined git commit and push with repository setup
    🧹 clean           - Clean up project directories and generated files
    ✂️  split-code      - Split large code files into organized modules
    📦 publish-npm     - Automated npm package publishing workflow
    `));

        // Add scripts offer
        console.log(chalk.yellow(`
    Would you like to add example scripts to your package.json? 
    This will add convenient npm commands for all tools above.
    `));
        console.log(chalk.gray(`
    Example scripts that will be added:
    • npm run source        → generate source code documentation
    • npm run commit       → commit and push changes
    • npm run clean        → clean project folders
    • npm run split-code   → split combined code files
    • npm run publish-npm  → publish to npm
    `));

        // Ask for confirmation
        const answer = await askQuestion(chalk.cyan('Add these scripts to package.json? (y/N): '));

        if (answer.toLowerCase() === 'y') {
            console.log(chalk.cyan('\n🔧 Adding scripts to package.json...'));

            try {
                execSync('npx alvamind-tools add-json-script', { stdio: 'inherit' });
                console.log(chalk.green('\n✅ Scripts added successfully!'));
                console.log(chalk.white('\n📘 Quick Start:'));
                console.log(chalk.gray(`
    1. Run ${chalk.cyan('npm run source')} to generate documentation
    2. Use ${chalk.cyan('npm run commit "your message"')} for git operations
    3. Try ${chalk.cyan('npm run clean')} to cleanup project
    4. Split code with ${chalk.cyan('npm run split-code')}
    5. Publish with ${chalk.cyan('npm run publish-npm')}
        `));
            } catch (error) {
                console.error(chalk.red('\n❌ Error adding scripts:', error));
            }
        } else {
            console.log(chalk.yellow('\nℹ️  Scripts not added. You can add them later using:'));
            console.log(chalk.cyan('npx alvamind-tools add-json-script'));
        }

        // Final instructions
        console.log(chalk.white('\n📚 Documentation:'));
        console.log(chalk.gray('Visit: https://github.com/alvamind/alvamind-tools#readme'));

        console.log('\n' + '='.repeat(80) + '\n');

    } catch (error) {
        console.error(chalk.red('Error during post-install:', error));
    } finally {
        rl.close();
    }
}

postInstall();