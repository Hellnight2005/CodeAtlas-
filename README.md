# CodeAtlas

**CodeAtlas** is a comprehensive tool designed to visualize and explore the architecture of your codebase. By turning flat file structures into interactive dependency graphs, it helps developers understand complex projects faster.

## 🚀 Why CodeAtlas?
Navigating large codebases can be overwhelming. CodeAtlas parses your repository, understands the relationships between files (imports, classes, functions), and presents them in an interactive graph. Whether you are onboarding new developers or refactoring legacy code, CodeAtlas gives you the map you need.

## 🏗️ Architecture & Pipeline
CodeAtlas is built as a microservices architecture:

1.  **Frontend**: A Next.js application that provides the dashboard and graph visualization.
2.  **GitAuth Service**: Manages specific GitHub authentication, user sessions, and triggers the initial repository sync.
3.  **Repo Parser Service**: The heavy lifter that consumes file events, parses code to generate ASTs (Abstract Syntax Trees), and builds the relationship graph.

### The Pipeline Flow
1.  **User Selects Repo**: The user picks a repository in the Frontend.
2.  **Sync Trigger**: Frontend calls **GitAuth**, which fetches the file tree from GitHub and pushes events to **Kafka**.
3.  **Processing**: **Repo Parser** consumes these events, fetches raw code, and generates ASTs.
4.  **Graph Generation**: The parsed data is structured into nodes and edges (saved to databases like Neo4j/MySQL) and returned to the Frontend for rendering.

## 📂 Project Structure
```
CodeAtlas-
├── frontend/         # Next.js User Interface
├── git_auth/         # Authentication & Sync Orchestrator
├── repo_parser/      # AST Parsing & Analysis Engine
├── uml_diagrams/     # Architecture diagrams (PlantUML)
└── README.md         # This file
```

## 🛠️ Usage

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+)
- [Docker](https://www.docker.com/) (recommended for running databases like Kafka, MySQL, Redis, Neo4j)

### Quick Start
Each service is independently managed. Please refer to their respective READMEs for detailed setup:

- [**Frontend Instructions**](./frontend/README.md)
- [**GitAuth Service Instructions**](./git_auth/README.md)
- [**Repo Parser Instructions**](./repo_parser/README.md)

### Running Locally (Manual)
1.  Start your infrastructure (Kafka, MySQL, Redis, Mongo).
2.  Start the **GitAuth** service (Port 3000/Default).
3.  Start the **Repo Parser** service (Port 5001).
4.  Start the **Frontend** (Port 3001).
5.  Navigate to `http://localhost:3001` and login with GitHub.

## 🤝 Contributing
We welcome contributions to CodeAtlas! Whether it's reporting a bug, suggesting a feature, or writing code, your help is appreciated.

### 🐛 Reporting Issues
If you find a bug or have a feature request, please check the [existing issues](https://github.com/Hellnight2005/CodeAtlas-/issues) first to see if it has already been reported.

If not, please open a new issue using one of our templates:
- **[Bug Report](https://github.com/Hellnight2005/CodeAtlas-/issues/new?template=bug_report.md)**: For reporting errors or unexpected behavior.
- **[Feature Request](https://github.com/Hellnight2005/CodeAtlas-/issues/new?template=feature_request.md)**: For proposing new features or improvements.

### 🛠️ Development
Please check the individual service directories for specific setup and contribution guidelines:
- [Frontend Guide](./frontend/README.md)
- [GitAuth Guide](./git_auth/README.md)
- [Repo Parser Guide](./repo_parser/README.md)

## 📚 Documentation & Blog
Follow our journey and read detailed documentation in our **Document Week Blog**:
- [**CodeAtlas Series on Hashnode**](https://projectlog.hashnode.dev/series/code-atlas)
