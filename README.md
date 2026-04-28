# C++ Draft to Index

A tool to parse and index C++ standard draft documents.

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

## License

Apache-2.0
