# C++ Draft to Index

A tool to parse and index C++ standard draft documents.

## ⚠️ HEAVILY WORK IN PROGRESS

**This project is still in very early development.** The implementation is incomplete, APIs are unstable, and functionality is subject to change. Use at your own risk.

TODO:
- class member and nested declarations
- enumerators

## Overview

This project aims to extract structured information from C++ Committee draft papers and generate searchable indices. It includes:

- **Synopsis extraction** - Extract source codes from LaTeX-written C++ drafts
- **C++ Preprocessor** - Handles C++ preprocessing directives
- **C++ Lexer** - Tokenizes C++ source code
- **C++ Parser** - Parses C++ syntax 

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
# Fetch the latest C++ Standard draft source
git submodule update --remote --init
# Build/run the main script
bun run src/main.ts
```

## Contributing

This is a very early-stage project. If you'd like to contribute, please be aware that the architecture and APIs are likely to change significantly.

## License

Apache-2.0
