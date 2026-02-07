# CodeAtlas GitAuth Service

The **GitAuth Service** acts as the gateway for authentication and repository synchronization in CodeAtlas. It handles user authentication via GitHub, manages sessions, and triggers the synchronization process by fetching repository metadata and publishing events to Kafka.

## Features
- **GitHub OAuth**: Secure login using Passport.js with GitHub strategy.
- **Session Management**: Persistent sessions using MongoDB (`connect-mongo`).
- **Repository Sync**: Fetches file trees and metadata from the GitHub API.
- **Event Publishing**: Publishes `repo-files-processing` events to Kafka for the parser service.
- **Logging**: Centralized logging with Pino and Loki support.

## Tech Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (Sessions), MySQL (Metadata), Redis (Caching)
- **Message Broker**: Kafka
- **Authentication**: Passport.js

## API Routes
- **`/auth/github`**: Initiates GitHub OAuth flow.
- **`/auth/github/callback`**: Callback URL for GitHub OAuth.
- **`/api/github/repo`**: Endpoint to trigger repository synchronization.
- **`/health`**: Health check endpoint.

## Getting Started

### Prerequisites
- Node.js
- MongoDB, MySQL, Redis, and Kafka running locally or accessible via network.

### Installation
1. Navigate to the directory:
   ```bash
   cd git_auth
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Configuration
Create a `.env` file with the following:
```env
MONGO_URI=mongodb://localhost:27017/git_auth
SESSION_SECRET=your_secret
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
KAFKA_BROKERS=localhost:9092
```

### Running the Service
Start the server:
```bash
npm start
```
```bash
npm run dev
```

## 📚 Documentation & Blog
Follow our journey and read detailed documentation in our **Document Week Blog**:
- [**CodeAtlas Series on Hashnode**](https://projectlog.hashnode.dev/series/code-atlas)
