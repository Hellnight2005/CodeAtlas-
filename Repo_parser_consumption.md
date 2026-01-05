```
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ffffff', 'primaryTextColor': '#000000', 'primaryBorderColor': '#000000', 'lineColor': '#000000', 'secondaryColor': '#ffffff', 'tertiaryColor': '#ffffff', 'mainBkg': '#ffffff', 'nodeBorder': '#000000', 'clusterBkg': '#ffffff', 'clusterBorder': '#000000'}}}%%
flowchart TD
    KafkaIn[Kafka: repo-files-processing] -->|Consume| Consumer[Repo Parser Consumer]
    Consumer -->|1. Parse Event| Process[processFile()]
    
    subgraph Execution
    Process -->|2. Request Content| GH[GitHub API]
    GH -->|Return Raw Content| Process
    
    Process -->|3. Update DB| DB[(MySQL: repo DB)]
    DB -->|Update raw_content| DB
    
    Process -->|4. Push Enriched Data| KafkaOut[Kafka: repo-files-with-content]
    end
    
    KafkaOut --> Next[Next Service / AST Generation]
```


```
%%{init: {'theme': 'base', 'themeVariables': {
  'primaryColor': '#ffffff',
  'primaryTextColor': '#000000',
  'primaryBorderColor': '#000000',
  'lineColor': '#000000'
}}}%%

flowchart TD
    KIn[Kafka Topic<br/>repo-files-processing]

    subgraph ParserConsumer["Repo Parser Consumer – Responsibility"]
        C1[Consume file event]
        C2[Parse event payload]
        C3[Request file content]
        C4[Persist raw content]
        C5[Publish enriched file event]
    end

    GH[GitHub API]
    DB[(MySQL Repo DB)]
    KOut["Kafka Topic<br/>repo-files-with-content"]
    Next["Next Service<br/>(AST Generation, Analysis)"]

    KIn --> C1
    C1 --> C2
    C2 --> C3

    C3 --> GH
    GH --> C3

    C3 --> C4
    C4 --> DB

    C4 --> C5
    C5 --> KOut

    KOut --> Next
```