# CodeAtlas Frontend

The **CodeAtlas Frontend** is the user interface for the CodeAtlas platform, built to visualize repository structures and provide an interactive code exploration experience. It leverages **Next.js** for performance and SEO, and **ReactFlow** for rendering complex dependency graphs.

## Features
- **Repository Visualization**: Interactive graphs representing file dependencies and structures using ReactFlow.
- **Dashboard**: Centralized view of synced repositories and their status.
- **Authentication**: Seamless integration with the GitAuth service for user sessions.
- **Responsive Design**: Modern UI built with TailwindCSS.

## Tech Stack
- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Styling**: [TailwindCSS v4](https://tailwindcss.com/)
- **State/Graph**: [ReactFlow](https://reactflow.dev/)
- **Icons**: Lucide React
- **Language**: TypeScript

## Getting Started

### Prerequisites
- Node.js (v20 or later)
- npm or yarn

### Installation
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application
Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000` (or `3001` if configured).

## Key Components
- **Dashboard**: `src/app/dashboard` - Main user view after login.
- **FileTree**: `src/components/dashboard/FileTree.tsx` - Displays the folder structure of the repo.
- **Graph View**: Visualizes the AST and file relationships.

## Environment Variables
Ensure you have the necessary environment variables set in `.env.local` (if applicable), such as backend API URLs.
