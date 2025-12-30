```
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ffffff', 'primaryTextColor': '#000000', 'primaryBorderColor': '#000000', 'lineColor': '#000000', 'secondaryColor': '#ffffff', 'tertiaryColor': '#ffffff', 'mainBkg': '#ffffff', 'nodeBorder': '#000000', 'clusterBkg': '#ffffff', 'clusterBorder': '#000000'}}}%%
graph LR
    User[User Client] -- REST --> GitAuth[Git Auth Service]
    
    subgraph "Git Auth Layer"
    GitAuth -- 1. Fetch Tree --> GH[GitHub API]
    GitAuth -- 2. Init Meta --> DB[(MySQL)]
    GitAuth -- 3. Queue File --> K1[Kafka: repo-files-processing]
    end
    
    subgraph "Parser Layer"
    K1 --> RepoParser[Repo Parser Service]
    RepoParser -- 4. Fetch Content --> GH
    RepoParser -- 5. Store Content --> DB
    RepoParser -- 6. Queue Content --> K2[Kafka: repo-files-with-content]
    end
    
    classDef service fill:#fff,stroke:#000,stroke-width:2px;
    classDef db fill:#fff,stroke:#000,stroke-width:2px;
    classDef kafka fill:#fff,stroke:#000,stroke-width:2px;
    
    class GitAuth,RepoParser service;
    class DB db;
    class K1,K2 kafka;
    ```



```
%%{init: {'theme': 'base', 'themeVariables': {
  'primaryColor': '#ffffff',
  'primaryTextColor': '#000000',
  'primaryBorderColor': '#000000',
  'lineColor': '#000000'
}}}%%

flowchart TD
    User[User Client]

    subgraph GitAuthLayer["Git Auth Service – Responsibility"]
        A1[Receive REST request]
        A2[Fetch repo tree<br/>from GitHub]
        A3[Initialize repo metadata<br/>in MySQL]
        A4[Publish file metadata<br/>to Kafka]
    end

    subgraph ParserLayer["Repo Parser Service – Responsibility"]
        P1[Consume file metadata<br/>from Kafka]
        P2[Fetch file content<br/>from GitHub]
        P3[Store file content<br/>in MySQL]
        P4[Publish enriched content<br/>to Kafka]
    end

    GH[GitHub API]
    DB[(MySQL)]
    K1[Kafka<br/>repo-files-processing]
    K2[Kafka<br/>repo-files-with-content]

    User -->|REST| A1
    A1 --> A2
    A2 --> GH
    GH --> A2

    A2 --> A3
    A3 --> DB

    A3 --> A4
    A4 --> K1

    K1 --> P1
    P1 --> P2
    P2 --> GH
    GH --> P2

    P2 --> P3
    P3 --> DB

    P3 --> P4
    P4 --> K2
```
