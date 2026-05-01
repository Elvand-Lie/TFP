#!/usr/bin/env node

// split-files.ts
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

interface FileSection {
  filePath: string;
  start: number;
  end: number;
  content: string;
  created: boolean;
}

function splitFile(singleFilePath: string, markers: string[], outputDirPath?: string): void {
  if (!fs.existsSync(singleFilePath)) {
    console.error(chalk.red(`Error: File not found: ${singleFilePath}`));
    process.exit(1);
  }

  const fileContent = fs.readFileSync(singleFilePath, 'utf-8');
  const fileSections: FileSection[] = [];

  // Find all file markers and their positions
  markers.forEach((marker) => {
    const fileRegex = new RegExp(`\\/\\/ ${marker}(.*?\\.ts)`, 'g');
    let match;
    while ((match = fileRegex.exec(fileContent)) !== null) {
      const filePath = match[1].trim();
      const start = match.index;
      fileSections.push({
        filePath,
        start,
        end: start, // Will be updated later
        content: '',
        created: false,
      });
    }
  });

  // Sort sections by their start position
  fileSections.sort((a, b) => a.start - b.start);

  // Set the end position for each section
  for (let i = 0; i < fileSections.length; i++) {
    const currentSection = fileSections[i];
    const nextSection = fileSections[i + 1];

    // If there's a next section, set end to the start of next section
    // Otherwise, set it to the end of file
    currentSection.end = nextSection ? nextSection.start : fileContent.length;

    // Extract content from after the marker line to the start of next section
    const markerLineEnd = fileContent.indexOf('\n', currentSection.start) + 1;
    currentSection.content = fileContent.substring(markerLineEnd, currentSection.end).trim();
  }

  // Create files for each section
  fileSections.forEach((section) => {
    const { filePath, content } = section;
    const fileDir = outputDirPath
      ? path.resolve(outputDirPath, path.dirname(filePath))
      : path.resolve(path.dirname(filePath));
    const fileName = path.basename(filePath);
    const fullFilePath = path.join(fileDir, fileName);

    // Create directory if it doesn't exist
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }

    // Write file content
    fs.writeFileSync(fullFilePath, content);
    console.log(chalk.green(`Created: ${chalk.bold(fullFilePath)}`));
  });

  if (fileSections.length === 0 && fileContent.length > 0) {
    console.log(chalk.yellow('No marker path found in the file.'));
  }

  if (fileSections.length > 0) {
    console.log(chalk.cyan('\nFiles splitted successfully! ✨\n'));
    const openCommand =
      process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    console.log(chalk.blue(`You can open the files with ${chalk.bold('CTRL+Click')}`));
  }
}

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error(
    chalk.red('Usage: split source=<filePath> markers=<marker1,marker2,...> [outputDir=<path>]')
  );
  console.error(
    chalk.yellow('Example: split source=all-in-one.ts markers=src/,custom/ outputDir=./output')
  );
  process.exit(1);
}

// Parse named arguments
const parsedArgs: { [key: string]: string } = {};
args.forEach((arg) => {
  const [key, value] = arg.split('=');
  if (key && value) {
    parsedArgs[key] = value;
  }
});

if (!parsedArgs.source || !parsedArgs.markers) {
  console.error(chalk.red('Error: source and markers parameters are required'));
  console.error(
    chalk.yellow('Example: split source=all-in-one.ts markers=src/,custom/ outputDir=./output')
  );
  process.exit(1);
}

const singleFilePath = parsedArgs.source;
const markers = parsedArgs.markers.split(',');
const outputDirPath = parsedArgs.outputDir;

splitFile(singleFilePath, markers, outputDirPath);
