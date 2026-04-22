# C++ Draft to Index

A tool to parse and index C++ standard draft documents.

## ⚠️ HEAVILY WORK IN PROGRESS

**This project is still in very early development.** The implementation is incomplete, APIs are unstable, and functionality is subject to change. Use at your own risk.

## Overview

This project aims to extract structured information from C++ Committee draft papers and generate searchable indices. It includes:

- **C++ Lexer** - Tokenizes C++ source code
- **C++ Parser** - Parses C++ syntax 
- **C++ Preprocessor** - Handles C++ preprocessing directives
- **LaTeX Support** - Parses LaTeX documentation (used in C++ drafts)
- **Document Processing** - Processes C++ standard draft documents

## Project Structure

```
src/
├── cpp/              # C++ language parsing
│   ├── lexer.ts     # Tokenization
│   ├── parser.ts    # Syntax parsing
│   ├── pp.ts        # Preprocessor
│   ├── latex.ts     # LaTeX parsing
│   └── index.ts
├── latex.ts         # General LaTeX utilities
├── types.ts         # Type definitions
└── main.ts          # Entry point

deps/draft/          # C++ draft documents and papers
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh)

### Installation

```bash
# Install dependencies
bun install
```

### Running

```bash
# Build/run the main script
bun run src/main.ts
```


## Contributing

This is a very early-stage project. If you'd like to contribute, please be aware that the architecture and APIs are likely to change significantly.

## License

[To be determined]
