```
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ffffff', 'primaryTextColor': '#000000', 'primaryBorderColor': '#000000', 'lineColor': '#000000', 'secondaryColor': '#ffffff', 'tertiaryColor': '#ffffff', 'mainBkg': '#ffffff', 'nodeBorder': '#000000', 'clusterBkg': '#ffffff', 'clusterBorder': '#000000'}}}%%
sequenceDiagram
    participant User
    participant API as git_auth API
    participant Queue as Task Queue
    participant GH as GitHub API
    participant DB as MySQL (repo DB)
    participant Kafka as Kafka (repo-files-processing)

    User->>API: GET /repo?owner=...&repo=...
    API->>Queue: Request GitHub Tree
    activate Queue
    Queue->>GH: Get Default Branch
    GH-->>Queue: main
    Queue->>GH: Get Recursive Tree
    GH-->>Queue: File Tree JSON
    deactivate Queue
    
    API-->>User: 202 Accepted (Processing Started)
    
    rect rgb(255, 255, 255)
    note right of API: Background Process
    API->>DB: Create Table {repo_name}
    loop For each interesting file
        API->>DB: Insert metadata (status='pending')
        API->>Kafka: Produce Message
        note right of Kafka: { path, sha, repo, owner }
    end
    API->>DB: Close Connection
    end
```



```
%%{init: {'theme': 'base', 'themeVariables': {
  'primaryColor': '#ffffff',
  'primaryTextColor': '#000000',
  'primaryBorderColor': '#000000',
  'lineColor': '#000000'
}}}%%

flowchart TD
    User[User]
    API[git_auth API]
    Queue[Task Queue]
    GH[GitHub API]
    DB[(MySQL<br/>Repo DB)]
    Kafka[Kafka<br/>repo-files-processing]

    User -->|GET /repo?owner&repo| API

    API -->|Request GitHub Tree| Queue
    Queue -->|Get default branch| GH
    GH -->|main| Queue
    Queue -->|Get recursive tree| GH
    GH -->|File Tree JSON| Queue

    Queue -->|Tree ready| API
    API -->|202 Accepted| User

    subgraph Background_Process [Background Process]
        API -->|Create repo table| DB

        API --> Loop{For each interesting file}
        Loop -->|Insert metadata<br/>status=pending| DB
        Loop -->|Produce message| Kafka
        Kafka -->|"{path, sha, repo, owner}"| Kafka

        Loop -->|All files processed| DB
        DB -->|Close connection| API
    end
```


