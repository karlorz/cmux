# CMUX CLI

An interactive command-line interface for CMUX that uses Stack Auth for authentication and displays your environments.

## Features

- Stack Auth authentication via browser
- Lists all environments for your team
- Built with Ink for a beautiful terminal UI
- Uses the generated OpenAPI client for type-safe API calls

## Setup

1. Copy `.env.example` to `.env` and fill in your Stack Auth credentials:

```bash
cp .env.example .env
```

2. Edit `.env` with your Stack Auth configuration:

```env
NEXT_PUBLIC_APP_URL=http://localhost:9779
NEXT_PUBLIC_STACK_PROJECT_ID=your-stack-project-id
NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY=your-publishable-client-key
TEAM_SLUG_OR_ID=personal
```

3. Install dependencies (from the root of the monorepo):

```bash
bun install
```

## Usage

Run the CLI:

```bash
bun run dev
```

Or run directly:

```bash
bun run index.tsx
```

## Authentication Flow

The CLI uses Stack Auth's OAuth flow:

1. The CLI starts a local HTTP server on port 31954
2. You're prompted to open a URL in your browser
3. After authenticating in the browser, you're redirected back to the CLI
4. The CLI receives an authorization code and exchanges it for tokens
5. The refresh token is used to get an access token for API calls

## Architecture

- `index.tsx` - Main CLI application with Ink UI
- `stack-auth.ts` - Stack Auth authentication helper
- Uses `@cmux/www-openapi-client` for type-safe API calls

## Development

The CLI is built with:

- **Bun** - JavaScript runtime and package manager
- **Ink** - React for interactive CLI applications
- **React** - UI framework
- **@cmux/www-openapi-client** - Generated API client from Hono routes
