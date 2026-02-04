# CodeAtlas Repo Parser Service

The **Repo Parser Service** is the reliable engine behind CodeAtlas's code analysis. It consumes file events from Kafka, fetches raw content, generates Abstract Syntax Trees (ASTs), and prepares graph data for visualization.

## Features
- **Kafka Consumer**: Listens for `repo-files-processing` events to process files asynchronously.
- **AST Generation**: Uses `web-tree-sitter` to parse code and generate ASTs.
- **AI Integration**: leverages Google GenAI for advanced analysis (if configured).
- **Data Persistence**: Updates MySQL with parsed content and interacts with Neo4j (planned) for graph data.
- **Recovery**: Includes a queue worker for failover and recovery.

## Tech Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Parsing**: `web-tree-sitter`, `@babel/parser`, `acorn`
- **Messaging**: Kafka (`kafkajs`)
- **Database**: MongoDB, MySQL, Redis

## How It Works
1. **Consumption**: Listens to the `repo-files-processing` Kafka topic.
2. **Processing**: Fetches raw file content from GitHub (if not already present).
3. **Analysis**: Generates ASTs to understand code structure (functions, classes, imports).
4. **Storage**: Updates the database with structural data for the frontend to render.

## Getting Started

### Prerequisites
- Node.js
- Kafka, MongoDB, MySQL, Redis

### Installation
1. Navigate to the directory:
   ```bash
   cd repo_parser
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Service
Start the server:
```bash
npm start
```
For development:
```bash
npm run dev
```

The service runs on port **5001** by default.
