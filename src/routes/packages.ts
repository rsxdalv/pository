import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { StorageService, PackageLocation, DebControlMeta } from "../services/storage.js";
import {
  validateDebianPackage,
  sanitizePath,
  isValidPackageName,
  isValidVersion,
  isValidArchitecture,
} from "../services/debian-validator.js";
import { ApiKeyService } from "../services/api-keys.js";
import { Logger } from "../utils/logger.js";
import { Config } from "../config.js";
import { isOidcAllowed } from "../services/oidc-scope.js";

interface PackageParams {
  repo: string;
  distribution: string;
  component: string;
  architecture: string;
  name: string;
  version: string;
}

interface ListQuery {
  repo?: string;
  distribution?: string;
  component?: string;
  architecture?: string;
  name?: string;
  version?: string;
}

export function registerPackageRoutes(
  app: FastifyInstance,
  storage: StorageService,
  apiKeyService: ApiKeyService,
  logger: Logger,
  config: Config
): void {
  // Upload package
  app.post<{ Body: { repo?: string; distribution?: string; component?: string; architecture?: string } }>(
    "/api/v1/packages",
    {
      preHandler: async (request, reply) => {
        if (request.oidcClaims) {
          // OIDC authenticated — scope check deferred until package name is known
          return;
        }
        if (!request.apiKey) {
          reply.code(401).send({ error: "Authentication required" });
          return;
        }
        if (!apiKeyService.hasPermission(request.apiKey, "write")) {
          reply.code(403).send({ error: "Write permission required" });
          return;
        }
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const parts = request.parts();
        let fileBuffer: Buffer | null = null;
        let repo = "default";
        let distribution = "stable";
        let component = "main";
        let architecture = "";
        let filename = "";

        for await (const part of parts) {
          if (part.type === "file") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            fileBuffer = Buffer.concat(chunks);
            filename = part.filename;
          } else {
            const value = part.value as string;
            switch (part.fieldname) {
              case "repo":
                repo = value;
                break;
              case "distribution":
                distribution = value;
                break;
              case "component":
                component = value;
                break;
              case "architecture":
                architecture = value;
                break;
            }
          }
        }

        if (!fileBuffer) {
          reply.code(400).send({ error: "No file uploaded" });
          return;
        }

        if (fileBuffer.length > config.maxUploadSize) {
          reply.code(413).send({ error: "File too large" });
          return;
        }

        // Validate Debian package
        const validation = await validateDebianPackage(fileBuffer);
        if (!validation.valid) {
          reply.code(400).send({ error: validation.error });
          return;
        }

        // Extract package info from control or filename
        let pkgName = "";
        let pkgVersion = "";
        let pkgArch = architecture;

        if (validation.control) {
          pkgName = validation.control.Package || "";
          pkgVersion = validation.control.Version || "";
          pkgArch = validation.control.Architecture || architecture;
        }

        // Try to extract from filename if not in control
        if (!pkgName || !pkgVersion) {
          const match = filename.match(/^(.+?)_(.+?)_(.+?)\.deb$/);
          if (match) {
            pkgName = pkgName || match[1];
            pkgVersion = pkgVersion || match[2];
            pkgArch = pkgArch || match[3];
          }
        }

        if (!pkgName) {
          reply.code(400).send({ error: "Could not determine package name" });
          return;
        }

        if (!pkgVersion) {
          reply.code(400).send({ error: "Could not determine package version" });
          return;
        }

        // Sanitize and validate
        repo = sanitizePath(repo);
        distribution = sanitizePath(distribution);
        component = sanitizePath(component);
        pkgName = sanitizePath(pkgName);
        pkgVersion = sanitizePath(pkgVersion);
        pkgArch = sanitizePath(pkgArch || "all");

        if (!isValidPackageName(pkgName)) {
          reply.code(400).send({ error: "Invalid package name" });
          return;
        }

        if (!isValidVersion(pkgVersion)) {
          reply.code(400).send({ error: "Invalid package version" });
          return;
        }

        if (!isValidArchitecture(pkgArch)) {
          reply.code(400).send({ error: "Invalid architecture" });
          return;
        }

        // Check if repo is allowed
        if (
          config.allowedRepos.length > 0 &&
          !config.allowedRepos.includes(repo)
        ) {
          reply.code(403).send({ error: "Repository not allowed" });
          return;
        }

        // Per-identity authorization
        if (request.oidcClaims) {
          // OIDC path: check package name against repo identity
          const authz = isOidcAllowed(request.oidcClaims, pkgName, config);
          if (!authz.allowed) {
            reply.code(403).send({ error: "OIDC authorization denied", detail: authz.reason });
            return;
          }
        } else {
          // API key path: check repo/distribution-level permission
          if (
            !apiKeyService.hasPermission(
              request.apiKey!,
              "write",
              repo,
              distribution
            )
          ) {
            reply.code(403).send({ error: "No permission for this repository" });
            return;
          }
        }

        const loc: PackageLocation = {
          repo,
          distribution,
          component,
          architecture: pkgArch,
          name: pkgName,
          version: pkgVersion,
        };

        // Carry across useful control fields so the apt Packages index is
        // accurate.  All apt VersionHash-relevant fields (Depends, Pre-Depends,
        // Conflicts, Breaks, Replaces) must be stored so the repo entry matches
        // what dpkg records in /var/lib/dpkg/status.  If the built-in parser
        // returned nothing (xz/zstd control.tar), storePackage() will fall back
        // to dpkg-deb automatically.
        const controlExtra: Partial<DebControlMeta> = {};
        if (validation.control) {
          const c = validation.control;
          if (c.Description) controlExtra.description = c.Description;
          if (c["Multi-Arch"]) controlExtra.multiArch = c["Multi-Arch"];
          if (c.Maintainer) controlExtra.maintainer = c.Maintainer;
          if (c["Pre-Depends"]) controlExtra.preDepends = c["Pre-Depends"];
          if (c.Depends) controlExtra.depends = c.Depends;
          if (c.Suggests) controlExtra.suggests = c.Suggests;
          if (c.Conflicts) controlExtra.conflicts = c.Conflicts;
          if (c.Breaks) controlExtra.breaks = c.Breaks;
          if (c.Replaces) controlExtra.replaces = c.Replaces;
          if (c.Provides) controlExtra.provides = c.Provides;
          if (c.Homepage) controlExtra.homepage = c.Homepage;
          if (c.Section) controlExtra.section = c.Section;
          if (c.Priority) controlExtra.priority = c.Priority;
          const installedSizeRaw = c["Installed-Size"];
          if (installedSizeRaw) {
            const parsed = parseInt(installedSizeRaw, 10);
            if (!isNaN(parsed)) controlExtra.installedSize = parsed;
          }
        }

        const identity = request.oidcClaims
          ? `oidc:${request.oidcClaims.repository}`
          : request.apiKey!.id;

        const metadata = await storage.storePackage(
          loc,
          fileBuffer,
          identity,
          controlExtra
        );

        logger.access({
          action: "upload",
          keyId: identity,
          ip: request.ip,
          path: `${repo}/${distribution}/${component}/${pkgArch}/${pkgName}/${pkgVersion}`,
        });

        reply.code(201).send(metadata);
      } catch (error) {
        logger.error("Upload error", { error: String(error) });
        reply.code(500).send({ error: "Internal server error" });
      }
    }
  );

  // List packages
  app.get<{ Querystring: ListQuery }>(
    "/api/v1/packages",
    {
      preHandler: async (request, reply) => {
        if (!request.apiKey) {
          reply.code(401).send({ error: "Authentication required" });
          return;
        }
        if (!apiKeyService.hasPermission(request.apiKey, "read")) {
          reply.code(403).send({ error: "Read permission required" });
          return;
        }
      },
    },
    async (request, reply) => {
      const { repo, distribution, component, architecture, name, version } =
        request.query;

      const packages = storage.listPackages({
        repo,
        distribution,
        component,
        architecture,
        name,
        version,
      });

      reply.send({ packages });
    }
  );

  // Get package metadata
  app.get<{ Params: PackageParams }>(
    "/api/v1/packages/:repo/:distribution/:component/:architecture/:name/:version",
    {
      preHandler: async (request, reply) => {
        if (!request.apiKey) {
          reply.code(401).send({ error: "Authentication required" });
          return;
        }
        if (!apiKeyService.hasPermission(request.apiKey, "read")) {
          reply.code(403).send({ error: "Read permission required" });
          return;
        }
      },
    },
    async (request, reply) => {
      const params = request.params;
      const loc: PackageLocation = {
        repo: sanitizePath(params.repo),
        distribution: sanitizePath(params.distribution),
        component: sanitizePath(params.component),
        architecture: sanitizePath(params.architecture),
        name: sanitizePath(params.name),
        version: sanitizePath(params.version),
      };

      const metadata = storage.getPackageMetadata(loc);
      if (!metadata) {
        reply.code(404).send({ error: "Package not found" });
        return;
      }

      reply.send(metadata);
    }
  );

  // Download package file
  app.get<{ Params: { distribution: string; component: string; architecture: string; filename: string } }>(
    "/repo/:distribution/:component/:architecture/:filename",
    {
      preHandler: async (request, reply) => {
        // Downloads may be public or require auth depending on config
        // For MVP, we'll require auth
        if (!request.apiKey) {
          reply.code(401).send({ error: "Authentication required" });
          return;
        }
        if (!apiKeyService.hasPermission(request.apiKey, "read")) {
          reply.code(403).send({ error: "Read permission required" });
          return;
        }
      },
    },
    async (request, reply) => {
      const { distribution, component, architecture, filename } = request.params;

      // Parse filename: name_version.deb
      const match = filename.match(/^(.+?)_(.+?)\.deb$/);
      if (!match) {
        reply.code(400).send({ error: "Invalid filename format" });
        return;
      }

      const [, name, version] = match;

      const loc: PackageLocation = {
        repo: "default", // Default repo for this endpoint
        distribution: sanitizePath(distribution),
        component: sanitizePath(component),
        architecture: sanitizePath(architecture),
        name: sanitizePath(name),
        version: sanitizePath(version),
      };

      const filePath = storage.getPackageFile(loc);
      if (!filePath) {
        reply.code(404).send({ error: "Package not found" });
        return;
      }

      const metadata = storage.getPackageMetadata(loc);

      logger.access({
        action: "download",
        keyId: request.apiKey?.id || "anonymous",
        ip: request.ip,
        path: `${loc.repo}/${distribution}/${component}/${architecture}/${name}/${version}`,
      });

      reply.header("Content-Type", "application/vnd.debian.binary-package");
      reply.header(
        "Content-Disposition",
        `attachment; filename="${name}_${version}_${architecture}.deb"`
      );
      if (metadata?.sha256) {
        reply.header("X-Checksum-Sha256", metadata.sha256);
      }

      const { createReadStream } = await import("node:fs");
      const stream = createReadStream(filePath);
      return reply.send(stream);
    }
  );

  // Delete package
  app.delete<{ Params: PackageParams }>(
    "/api/v1/packages/:repo/:distribution/:component/:architecture/:name/:version",
    {
      preHandler: async (request, reply) => {
        if (!request.apiKey) {
          reply.code(401).send({ error: "Authentication required" });
          return;
        }
        if (!apiKeyService.hasPermission(request.apiKey, "admin")) {
          reply.code(403).send({ error: "Admin permission required" });
          return;
        }
      },
    },
    async (request, reply) => {
      const params = request.params;
      const loc: PackageLocation = {
        repo: sanitizePath(params.repo),
        distribution: sanitizePath(params.distribution),
        component: sanitizePath(params.component),
        architecture: sanitizePath(params.architecture),
        name: sanitizePath(params.name),
        version: sanitizePath(params.version),
      };

      const deleted = storage.deletePackage(loc);
      if (!deleted) {
        reply.code(404).send({ error: "Package not found" });
        return;
      }

      logger.access({
        action: "delete",
        keyId: request.apiKey!.id,
        ip: request.ip,
        path: `${loc.repo}/${loc.distribution}/${loc.component}/${loc.architecture}/${loc.name}/${loc.version}`,
      });

      reply.code(204).send();
    }
  );
}
