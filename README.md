# Trace Extractor

Trace Extractor is a tool for extracting and converting Cursor conversations to Markdown or JSON. It consists of a Cursor extension and a command-line interface (CLI).

## Installation

There are two ways to install the extension:

### 1. From VSIX File

1.  Run `npm run build` to create the `trace-extractor-1.0.0.vsix` file.
2.  Open the Command Palette in Cursor (`Cmd+Shift+P` or `Ctrl+Shift+P`).
3.  Run the "Extensions: Install from VSIX..." command.
4.  Select the generated `.vsix` file.
5.  Reload Cursor to complete the installation.

### 2. Using NPM (Recommended)

1. Run `npm install` to install dependencies.
2. Run `npm run install-extension` to build and install the extension directly into Cursor.

### CLI

The CLI is automatically installed when you install the Cursor extension. You can also install it globally using npm:

```bash
npm install -g .
```

## Usage

### Cursor Extension

1.  Open the Command Palette in Cursor (`Cmd+Shift+P` or `Ctrl+Shift+P`).
2.  Choose one of the available commands:
    - **"Trace Extractor: Export Conversation to Markdown"** - Export as formatted Markdown
    - **"Trace Extractor: Export Conversation to JSON"** - Export as raw JSON data
3.  Select the conversation you want to export from the list.
4.  The exported file will open in a new tab.

**Quick Start**: Use `Cmd+Shift+P` (or `Ctrl+Shift+P` on Windows/Linux) to open the Command Palette, then search for "Trace Extractor" to see both export options.

### CLI

The CLI provides the same functionality as the Cursor extension, but it can be run from the command line.

#### Interactive Mode
```bash
trace-extractor
```

This will launch an interactive prompt that allows you to select a conversation and choose between Markdown or JSON format.

#### Direct JSON Export
```bash
trace-extractor --json
```

This will directly export conversations as JSON files without the format selection prompt.

**Output**: Files are saved in the `exported-conversations` directory in your project's root directory.

## Output Formats

- **Markdown**: Human-readable format with formatted tool calls, thinking blocks, and clean conversation flow
- **JSON**: Raw conversation data including all tool calls, parameters, results, thinking blocks, and metadata for programmatic access
