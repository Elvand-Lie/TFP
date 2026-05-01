# 🌊 Alvamind Workflow

A lightweight and flexible workflow automation library for JavaScript/TypeScript projects.

## 🎯 Introduction

Alvamind Workflow streamlines your development process by providing an elegant way to define and execute multi-step workflows. Whether you prefer YAML configurations or programmatic approaches, Alvamind makes automation simple and maintainable.

## ✨ Key Features

🔄 **Flexible Workflow Definition**
- YAML-based configuration for simple, readable workflows
- Programmatic API for dynamic workflow creation
- Mix and match approaches based on your needs

⚡ **Powerful Execution Engine**
- Real-time execution progress with timing
- Intelligent error handling and recovery
- Skippable steps for optional tasks
- Graceful interruption handling

🔀 **Conditional Execution & Dependencies**
- Execute steps based on dynamic conditions
- Type-safe dependencies between steps
- Access results from previous steps
- Skip steps when conditions aren't met

🛠️ **Developer Experience**
- TypeScript-first design
- Minimal configuration required
- Clear, colorful console output
- Comprehensive error messages

🧪 **Testing & Development**
- Test mode for dry runs
- Promise-based API
- Easy to integrate with CI/CD

## 🚀 Quick Start

### Installation

```bash
npm install alvamind-workflow
```

### Simple Example (YAML)

1. Create `workflow.yml`:
```yaml
version: "1.0"
name: "Deploy Application"
commands:
  - name: "Build Project"
    command: "npm run build"
  - name: "Run Tests"
    command: "npm test"
    skippable: true
  - name: "Deploy"
    command: "npm run deploy"
```

2. Run it:
```bash
workflow-run
```

### Programmatic Usage

```typescript
import { createWorkflow } from 'alvamind-workflow';

const workflow = createWorkflow({ name: 'CI Pipeline' })
  .execute('npm run lint', 'Lint Code')
  .execute('npm run test', 'Run Tests', true)
  .execute('npm run build', 'Build Project');

await workflow.run();
```

## 📊 Example Output

```
🐳 Executing workflow: Deploy Application
=====================================
Step 1/3: Build Project
> npm run build
 -> running... 2.5s
[1/3] ✓ Build Project 2.5s

Step 2/3: Run Tests
> npm test
 -> running... 1.2s
[2/3] ✓ Run Tests 1.2s

Step 3/3: Deploy
> npm run deploy
 -> running... 3.1s
[3/3] ✓ Deploy 3.1s
=====================================
✓ Workflow completed in 6.8s
```

## 🎛️ Advanced Features

### Conditional Execution

Define steps that only run when certain conditions are met:

```typescript
workflow
  .executeWithId("check", "node -v", "Check Node Version")
  .execute("npm run build", "Build")
  .when(ctx => ctx.getStdout("check").startsWith("v18"), "Node 18 Required")
  .execute("npm run deploy", "Deploy")
  .when(ctx => ctx.getExitCode("build") === 0, "Only deploy if build succeeds")
```

YAML configuration:

```yaml
commands:
  - name: "Check Node Version" 
    command: "node -v"
    id: "check"

  - name: "Build"
    command: "npm run build"
    condition: |
      (context) => context.getStdout("check").startsWith("v18")

  - name: "Deploy"
    command: "npm run deploy"
    condition: |
      (context) => context.getExitCode("build") === 0
```

### Dependencies Between Steps

Explicitly define step dependencies:

```typescript
workflow
  .executeWithId("deps", "npm install", "Install Dependencies")
  .executeWithId("build", "npm run build", "Build")
  .dependsOn("deps")
  .executeWithId("test", "npm test", "Test")
  .dependsOn("build")
```

YAML configuration:

```yaml
commands:
  - name: "Install Dependencies"
    command: "npm install"
    id: "deps"

  - name: "Build"
    command: "npm run build"
    id: "build"
    dependsOn: ["deps"]

  - name: "Test"
    command: "npm test"
    dependsOn: ["build"]
```

### Type-Safe Results

Access previous command results with TypeScript type safety:

```typescript
workflow
  .executeWithId<"check-version">("check-version", "node -v", "Get Version")
  .when(ctx => {
    // TypeScript knows this is valid and provides completion
    const version = ctx.getStdout("check-version");
    return version?.startsWith("v18");
  }, "Verify Version")
```

### Error Handling

```typescript
try {
  await workflow
    .execute('risky-command', 'Risky Step', true) // skippable
    .execute('must-run', 'Critical Step')         // will fail if error
    .run();
} catch (error) {
  console.error('Workflow failed:', error);
}
```

### Test Mode

```typescript
await workflow.run({ testMode: true }); // Dry run without executing commands
```

### Interactive Mode

When a command fails, the interactive mode provides options to:
1. Retry the original command
2. Enter a new command to execute
3. Skip the current step (if skippable)
4. Abort the entire workflow

## 🔧 API Reference

### `loadWorkflow(path?: string)`

Loads a workflow configuration from a YAML file.

-   `path`: (optional) Path to the YAML file. Defaults to `workflow.yml`.
-   Returns: `Promise<WorkflowConfig>`

### `runWorkflow(config: WorkflowConfig, options?: RunnerOptions)`

Executes a workflow based on the provided configuration.

-   `config`: Workflow configuration object.
-   `options`: (optional) Runner options.
    -   `testMode`: (boolean) Enable test mode to prevent actual command execution.
-   Returns: `Promise<boolean>`

### `createWorkflow(options?: WorkflowOptions)`

Creates a new programmatic workflow builder.

-   `options`: (optional) Workflow options.
    -   `name`: (string) Workflow name.
-   Returns: `WorkflowBuilder`

### `WorkflowBuilder`

A fluent interface for constructing workflows programmatically.

-   `name(name: string)`: Sets the workflow name.
-   `execute<T>(command: string, name: string, skippable?: boolean)`: Adds a command to the workflow.
-   `executeWithId<T>(id: T, command: string, name: string, skippable?: boolean)`: Adds a command with an ID for referencing.
-   `executeWith(command: string, name: string, callback: (result: { exitCode: number, stdout: string, stderr: string }) => string | undefined, skippable?: boolean)`: Adds a command with a callback.
-   `when(condition: (context: WorkflowContext) => boolean | Promise<boolean>, name: string)`: Adds a condition to the last command.
-   `dependsOn(...ids: string[])`: Defines dependencies for the last command.
-   `build()`: Builds the workflow configuration object (`WorkflowConfig`).
-   `run(options?: WorkflowOptions)`: Runs the workflow.

### `WorkflowContext`

A context object that provides access to previous command results.

-   `results`: Record of all command results.
-   `getResult(id: string)`: Gets the full result for a specific command.
-   `getStdout(id: string)`: Gets the stdout from a specific command.
-   `getExitCode(id: string)`: Gets the exit code from a specific command.
-   `getStderr(id: string)`: Gets the stderr from a specific command.

## 🤝 Contributing

We welcome contributions! Here's how you can help:

- 🐛 Report bugs by opening issues
- 💡 Propose new features
- 📝 Improve documentation
- 🔀 Submit pull requests

## 📦 What's Inside

```
alvamind-workflow/
├── src/
│   ├── cli.ts         # CLI implementation
│   ├── index.ts       # Main entry point
│   ├── runner.ts      # Execution engine
│   ├── types.ts       # TypeScript types
│   └── workflow.ts    # Workflow builder
├── test/
│   ├── api.test.ts    # API tests
│   └── conditionals.test.ts # Conditional tests
└── README.md
```

## 📄 License

MIT © Alvamind 2025

---

<p align="center">Built with ❤️ by the Alvamind team</p>