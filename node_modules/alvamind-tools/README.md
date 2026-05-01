# 🔥 alvamind-tools: Your CLI Power-Up for TypeScript Projects 🚀

![alvamind-tools Banner](https://placehold.co/1000x300/00aaff/fff?text=alvamind-tools)

Hey there, code slingers! 👋 Welcome to `alvamind-tools`, your new go-to arsenal for supercharging your TypeScript projects. We're talking automation, documentation, and clean-up – all in one slick package. Think of it as your AI sidekick for common dev tasks. 🤖

## ✨ Features & Benefits: Why You Need This

This ain't your grandma's CLI toolset. Here's why `alvamind-tools` is a game-changer:

### 1. ✍️ Auto Source Code Documentation with `generate-source`

*   **AI-Powered Markdown Magic:** Generates a markdown file of your entire codebase, perfect for documentation or sharing. No more copy-pasting code snippets! 🧙‍♂️
*   **Project Name Magic:** Automatically includes the project name at the top, so you know exactly what you're looking at. 🏷️
*   **Comment Slayer:** Strips out those pesky single-line and multi-line comments, keeping your docs clean and focused on the code. 🧹
*   **Customizable Include/Exclude:** Fine-tune what's included and excluded with regex-powered arguments. Perfect for keeping those test files out of your docs. ✂️
*   **Line Count Wizardry:** Tells you the total lines of code in your project, because who doesn't love some data? 📊
*   **Blank Line Removal:** Optionally remove all blank lines from the generated Markdown file for a cleaner look. 🧼
*   **Why This is Lit:** Imagine having a up-to-date source code documentation generated every time before you commit. Save you precious time.

### 2. 🚀 Git Automation with `commit`

*   **Git Init Power:** Initializes a git repository if none exists. 🎛️
*   **GitHub Repo Creation:** If `gh` is installed, creates a GitHub repository for you if none exists, asks for public or private. ➕
*   **Commit & Push in One Go:**  A single command to add all changes, commit with a message, and push to your remote. No more remembering git commands! 💨
*   **Safety First:** Checks for changes before committing. If no changes, it'll push existing commits. 🛡️
*  **Set Upstream:** Asks if you want to set the upstream branch. ⬆️
*   **User-Friendly Prompts:** Error if commit message is missing. Ain't no sneaky commits going on here! 🚫
*   **Why This is Lit:** It's like having your own personal git butler. Makes the entire commit process seamless.

        ```bash
      Starting commit process...
      Changed directory to: /path/to/your/project
      No git repository found. Initializing...
      Git repository initialized.
      Checking for remote repository...
      No remote repository found. Creating...
      Create a public or private repository? (public/private): private
      Created private repository: your-project-name on github.
      No changes to commit.
      Existing commits pushed successfully.
      Do you want to set the upstream? (yes/no): yes
      Setting upstream...
      Upstream set successfully.
      Changes committed and pushed successfully.
       ```

### 3. 🧹  One-Click Project Cleaning with `clean`

*   **Deep Clean Mastery:**  Clears out all those pesky build directories, cache folders, lock files, and other junk you don't need. 🗑️
*   **Generated Dir Destroyer:** Automatically finds and deletes all directories named "generated" from the entire project. 💪
*   **Why This is Lit:** Imagine starting fresh with a clean slate. Perfect for when you just need to nuke everything and start fresh.

### 4. 📂 Smart File Splitting with `split`

* **Marker-Based Splitting:** Splits a single file into multiple files based on marker comments. 🔄
* **Path Preservation:** Maintains the original file structure as specified in the markers. 📁
* **Custom Output Directory:** Optionally specify where the split files should go. 📍
* **Multiple Markers Support:** Use different markers for different file types or directories. 🎯
* **Why This is Lit:** Perfect for when you need to break down a large file into a proper project structure. No more manual copy-pasting!

### 5. ⚙️ Add Example Scripts with `add-json-script`

* **Adds Example Scripts:** Adds example scripts to your `package.json` file for all available tools.
* **User Confirmation:** Asks for user confirmation before adding the scripts.
* **Why This is Lit:** Makes it easy to get started with all the available tools by adding working example scripts to your project.

      ```bash
      # Example file content:
      // src/models/user.ts
      export interface User {
        id: string;
        name: string;
      }

      // src/controllers/user.ts
      import { User } from '../models/user';
      export class UserController {
        // ...
      }

      # Command to split:
      split all-in-one.ts "src/" ./output
      ```

## 🛠️ How to Use: Getting Started

1.  **Install:**

    ```bash
    npm install alvamind-tools -g
    ```
2.  **Generate Source Code Doc:**

    ```bash
    generate-source --output=source.md --exclude=dist/,README.md,*.test.ts --remove-blank-lines
    # or with npm run
    npm run source
    ```

    This will create a `source.md` file with your source code (excluding the `dist` folder, `README.md` and test files), and remove all blank lines.

3.  **Commit Your Changes:**

    ```bash
    commit "Your commit message here"
    # or with npm run
    npm run commit "Your commit message here"
    ```

    This will stage all changes, commit with the message, and push to remote. It also checks if you have `gh` installed to create a new repo.
4.  **Clean Your Project:**
    ```bash
    clean
    # or with npm run
    npm run clean
    ```
    This will clean all the junk out.

5. **Split Your Files:**
   ```bash
   split-code source=all-in-one.ts markers=src/,custom/ outputDir=./output
   # or with npm run
   npm run split your-file.ts "src/,custom/" ./output
   ```
   This will split your file based on marker comments into separate files.

6. **Add Example Scripts:**
   ```bash
   add-json-script
   # or with npm run
   npm run add-json-script
   ```
   This will add example scripts to your package.json file.

## ⚙️ Configuration: Tweak it Your Way

The magic is in the details! Here's how you can customize each tool:

### `generate-source` Options:

*   `--output`:  Specify the output filename (default: `source-code.md`).
    ```bash
    generate-source --output=my-awesome-docs.md
    ```
*   `--include`:  Comma-separated list of file endings to include, even if they're in default exclude regex.
    ```bash
    generate-source --include=route.ts
    ```
*   `--exclude`:  Comma-separated list of paths or regex patterns to exclude.
    ```bash
    generate-source --exclude=dist/,node_modules/,*.test.ts
     generate-source --exclude="/.*\.test\.ts$/"
    ```
*  *Regex exclude example*
    ```bash
       generate-source --exclude="/.*\.route\.ts$/,/.*\.test\.ts$/"
    ```
*   `--remove-blank-lines`:  Remove all blank lines from the generated Markdown file.
    ```bash
    generate-source --remove-blank-lines
    ```

###  `commit` Options:
    *   No option, all you need is a message after the command
    ```bash
    commit "feat: added new feature"
    ```

###  `clean` Options:
    *  No options, it does everything for you.
    ```bash
    clean
    ```

### `split` Options:
* `[singleFilePath]`: Path to the file you want to split
* `[markers]`: Comma-separated list of markers to look for
* `[outputDirPath]`: (Optional) Where to output the split files
  ```bash
  split all-in-one.ts "src/,custom/" ./output
  ```

## 🧠 AI & the Future of `alvamind-tools`

We're not stopping here! We're constantly thinking about how AI can make our tools even better:

*   **Intelligent Documentation:** Imagine an AI that can automatically generate code comments and README.md based on your source code.
*   **AI-Powered Code Analysis:** Get suggestions on code improvements, detect potential bugs, and more.
*   **Automated Refactoring:** Let AI take care of the heavy lifting of code refactoring.
*   **Personalized Recommendations:** Based on your project setup, our AI would suggest which tools to use.

## 🗺️ Roadmap: What's Next?

*   **[✅] v1.0.0:** Initial release with `generate-source` and `commit` tools
*   **[✅] v1.0.1:** Added include and exclude arguments.
*   **[✅] v1.0.2:** Added clean functionality
*   **[✅] v1.0.3:** Added git init and github repo creation on commit command.
*   **[✅] v1.0.5:** Added split-files functionality
*   **[✅] v1.0.6:** Added add-json-script functionality
*   **[✅] v1.0.7:** Added remove-blank-lines functionality
*   **[ ] v1.1.0:**  Automated commit message generation using AI.
*   **[ ] v1.2.0:**  Enhanced documentation with AI-powered code summarization.
*   **[ ] v1.3.0:**  Integration with common CI/CD pipelines.

## 💖 Support & Donation: Fuel Our Development

If `alvamind-tools` makes your life easier, consider showing some love! You can help us keep developing by:

*   **Starring the Repo:** Head to our GitHub and give us a star! ⭐
*   **Contributing Code:**  See a way to make it better? Fork and send us a pull request! 🛠️
*   **Donating:** Buy us a coffee via [PayPal](https://paypal.me/alvamind). ☕
*   **Sharing:** Spread the word with fellow devs! 🗣️

## 🤝 Contribution: Join the Squad

We're an open-source project, and we welcome contributors! Whether you're a coding pro or just getting started, there's a place for you in our squad. To contribute:

1.  **Fork the Repo:** Create your own copy on GitHub.
2.  **Make Changes:** Add your magic and test your code.
3.  **Create a Pull Request:** Let us know your changes are ready for review!
4.  **Review:** After review, your code will be merged!

## 📜 License

`alvamind-tools` is released under the MIT License. Do what you want with it, no worries! 🤘

## 🤔 Questions?

Have a question or need help? Open an issue on our GitHub page, and we'll get back to you. 💬

<br>
<br>

***

_Built with passion by the Alvamind Team_ 💖
