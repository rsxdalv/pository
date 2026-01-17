# Pository GitHub Action

A GitHub Action for uploading Debian packages to a Pository instance.

## Usage

```yaml
- name: Upload to Pository
  uses: rsxdalv/pository@main
  with:
    host: ${{ secrets.POSITORY_URL }}
    api-key: ${{ secrets.POSITORY_API_KEY }}
    file: path/to/package.deb
    repo: 'default'           # optional, defaults to 'default'
    distribution: 'stable'    # optional, defaults to 'stable'
    component: 'main'         # optional, defaults to 'main'
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `host` | Yes | - | URL of your Pository instance (e.g., `https://pository.example.com`) |
| `api-key` | Yes | - | API key with write permission |
| `file` | Yes | - | Path to the Debian package file to upload |
| `repo` | No | `default` | Repository name |
| `distribution` | No | `stable` | Distribution name (e.g., stable, unstable) |
| `component` | No | `main` | Component name (e.g., main, contrib) |

## Outputs

| Output | Description |
|--------|-------------|
| `package-name` | Name of the uploaded package |
| `package-version` | Version of the uploaded package |
| `package-architecture` | Architecture of the uploaded package |

## Security Best Practices

**Always store sensitive information as GitHub secrets:**

1. Go to your repository Settings → Secrets and variables → Actions
2. Add the following secrets:
   - `POSITORY_URL`: Your Pository instance URL
   - `POSITORY_API_KEY`: Your API key with write permission

**Never hardcode URLs or API keys in your workflow files.**

## Complete Example

Here's a complete workflow that builds and publishes a Debian package:

```yaml
name: Build and Publish

on:
  release:
    types: [published]

permissions:
  contents: read

jobs:
  build-and-publish:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install build dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y devscripts debhelper dh-exec
      
      - name: Install npm dependencies
        run: npm ci
      
      - name: Build Debian package
        run: |
          dpkg-buildpackage -us -uc -b
          mkdir -p dist
          mv ../myproject_*.deb dist/
      
      - name: Upload to Pository
        id: upload
        uses: rsxdalv/pository@main
        with:
          host: ${{ secrets.POSITORY_URL }}
          api-key: ${{ secrets.POSITORY_API_KEY }}
          file: dist/*.deb
          repo: 'production'
          distribution: 'stable'
          component: 'main'
      
      - name: Show upload results
        run: |
          echo "Uploaded: ${{ steps.upload.outputs.package-name }}"
          echo "Version: ${{ steps.upload.outputs.package-version }}"
          echo "Architecture: ${{ steps.upload.outputs.package-architecture }}"
```

## Error Handling

The action will fail if:
- The host URL or API key is not provided
- The package file doesn't exist
- The upload to Pository fails (returns HTTP error code)

Check the workflow logs for detailed error messages.

## Testing

The repository includes a test workflow (`.github/workflows/test-action.yml`) that:
1. Builds a test package
2. Validates the action structure
3. Tests the action with a mock server
4. Optionally tests with a real Pository instance if secrets are configured

## Development

To test changes to the action:
1. Make your changes to `action.yml`
2. Push to a branch
3. Update your workflow to use your branch: `uses: rsxdalv/pository@your-branch`
4. Run the workflow to test

## License

MIT
