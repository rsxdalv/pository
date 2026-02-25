#!/usr/bin/env node
// MCP server exposing helpers to generate a GitHub Actions workflow
// that uses rsxdalv/pository@main to push Debian packages to Pository and to
// print gh-secret commands for required secrets.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'pository-action-mcp',
  version: '0.1.0'
});

const workflowSchema = z.object({
  workflowName: z.string().optional(),
  workflowFile: z.string().optional(),
  packagePath: z.string().optional(),
  repo: z.string().optional(),
  distribution: z.string().optional(),
  component: z.string().optional(),
  hostSecret: z.string().optional(),
  apiKeySecret: z.string().optional()
});

server.registerTool(
  'generate_github_workflow',
  {
    description: 'Generate a GitHub Actions workflow that uses rsxdalv/pository@main to push a Debian package to Pository.',
    inputSchema: workflowSchema
  },
  async (input: z.infer<typeof workflowSchema>) => {
    const workflowName = input.workflowName?.trim() || 'Upload Debian package to Pository';
    const workflowFile = input.workflowFile?.trim() || '.github/workflows/push-to-pository.yml';
    const packagePath = input.packagePath?.trim() || 'dist/*.deb';
    const repo = input.repo?.trim() || 'default';
    const distribution = input.distribution?.trim() || 'stable';
    const component = input.component?.trim() || 'main';
    const hostSecret = input.hostSecret?.trim() || 'POSITORY_URL';
    const apiKeySecret = input.apiKeySecret?.trim() || 'POSITORY_API_KEY';

    const workflowYaml = `name: ${workflowName}

on:
  workflow_dispatch:
    inputs:
      package_path:
        description: Debian package path (glob or file)
        required: true
        default: ${packagePath}

jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Upload to Pository
        id: upload
        uses: rsxdalv/pository@main
        with:
          host: \${{ secrets.${hostSecret} }}
          api-key: \${{ secrets.${apiKeySecret} }}
          file: \${{ inputs.package_path }}
          repo: ${repo}
          distribution: ${distribution}
          component: ${component}

      - name: Show upload results
        run: |
          echo "Packages uploaded: \${{ steps.upload.outputs.packages-uploaded }}"
          echo "Last package name: \${{ steps.upload.outputs.package-name }}"
          echo "Last package version: \${{ steps.upload.outputs.package-version }}"
          echo "Last package arch: \${{ steps.upload.outputs.package-architecture }}"
`;

    const content = [
      { type: 'text' as const, text: `Add to ${workflowFile}:\n\n${workflowYaml.trim()}` }
    ];

    return { content };
  }
);

const secretSchema = z.object({
  hostSecret: z.string().optional(),
  apiKeySecret: z.string().optional(),
  env: z.string().optional(),
  org: z.string().optional()
});

server.registerTool(
  'gh_secret_commands',
  {
    description: 'Print gh CLI commands to set Pository secrets for the workflow.',
    inputSchema: secretSchema
  },
  async (input: z.infer<typeof secretSchema>) => {
    const hostSecret = input.hostSecret?.trim() || 'POSITORY_URL';
    const apiKeySecret = input.apiKeySecret?.trim() || 'POSITORY_API_KEY';
    const env = input.env?.trim();
    const org = input.org?.trim();

    const scopeFlag = env ? `--env ${env}` : org ? `--org ${org}` : '';
    const prefix = scopeFlag ? `gh secret set <SECRET_NAME> ${scopeFlag}` : 'gh secret set <SECRET_NAME>';

    const lines = [
      `${prefix.replace('<SECRET_NAME>', hostSecret)} --body "https://pository.example.com"`,
      `${prefix.replace('<SECRET_NAME>', apiKeySecret)} --body "<api-key-with-write-access>"`
    ];

    const details = env
      ? `Targets environment: ${env}`
      : org
        ? `Targets organization: ${org}`
        : 'Targets repository secrets';

    const content = [
      { type: 'text' as const, text: `${details}\n${lines.join('\n')}` }
    ];

    return { content };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('pository-action-mcp server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
