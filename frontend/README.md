# Pository Frontend

A modern, professional dashboard for managing your Pository Debian package repository.

## Features

- **Overview Dashboard**: Real-time metrics, storage statistics, and system health monitoring
- **Package Management**: Browse, filter, and delete packages with a powerful data table
- **API Key Management**: Create and manage authentication keys with role-based access
- **Real-time Updates**: Automatic data refresh using SWR for up-to-date information
- **Dark Theme**: Professional dark UI inspired by modern developer tools
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## Prerequisites

- Node.js 20 or higher
- A running Pository backend instance (see main README)
- An API key with appropriate permissions

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure the API URL (optional):
   ```bash
   cp .env.example .env.local
   # Edit .env.local to set NEXT_PUBLIC_API_URL if needed
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3001](http://localhost:3001) in your browser

5. Enter your Pository API key when prompted

## Configuration

### Environment Variables

- `NEXT_PUBLIC_API_URL`: The URL of your Pository backend (default: `http://localhost:3000`)

### API Key Storage

The API key is stored securely in your browser's localStorage. It is only sent to the Pository API and never shared with any other service.

To clear your stored API key, open your browser's developer console and run:
```javascript
localStorage.removeItem('pository_api_key')
```

## Dashboard Sections

### Overview

The overview page provides:
- Total package count and storage usage
- Request metrics and system health status
- Visual charts showing request distribution and storage by repository
- Repository statistics and architecture distribution

### Packages

The packages page allows you to:
- View all packages in your repository
- Filter by repository, distribution, component, architecture, or name
- See detailed metadata for each package
- Delete packages (requires admin permissions)

### API Keys

The API keys page enables you to:
- View all API keys (admin only)
- Create new keys with different permission levels (read/write/admin)
- Delete existing keys
- View key metadata and creation dates

## Building for Production

```bash
npm run build
npm start
```

The production build will be optimized and ready to deploy.

## Tech Stack

- **Next.js 16**: React framework with App Router
- **React 19**: UI library
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **Recharts**: Data visualization
- **SWR**: Data fetching and caching

## Development

The frontend runs on port 3001 by default to avoid conflicts with the backend on port 3000.

### Key Files

- `app/page.tsx`: Main dashboard with tab navigation
- `components/overview.tsx`: Overview dashboard component
- `components/packages.tsx`: Package management component
- `components/api-keys.tsx`: API key management component
- `lib/api.ts`: API client and type definitions
- `lib/api-key-context.tsx`: API key state management

## Security Notes

- Always use HTTPS in production
- Store API keys securely
- Use read-only keys when full access is not required
- Regularly rotate admin keys
- Review API key usage in the backend logs

## License

MIT
