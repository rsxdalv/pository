import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";

const GITHUB_JWKS_URI = "https://token.actions.githubusercontent.com/.well-known/jwks";
const GITHUB_ISSUER   = "https://token.actions.githubusercontent.com";

export interface GitHubOidcClaims {
  repository: string;            // e.g. "rsxdalv/gh-stats-tts-webui"
  repository_visibility: string; // "public" | "private" | "internal"
  ref: string;                   // e.g. "refs/heads/main"
  event_name: string;            // e.g. "push"
  actor: string;
  sha: string;
  workflow: string;
  sub: string;
  iss: string;
  aud: string | string[];
  [key: string]: unknown;
}

let _client: ReturnType<typeof jwksRsa> | null = null;

function getClient(): ReturnType<typeof jwksRsa> {
  if (!_client) {
    _client = jwksRsa({
      jwksUri: GITHUB_JWKS_URI,
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }
  return _client;
}

export function verifyGitHubOIDC(token: string, audience: string): Promise<GitHubOidcClaims> {
  return new Promise((resolve, reject) => {
    const client = getClient();
    const getKey: jwt.GetPublicKeyOrSecret = (header, callback) => {
      client.getSigningKey(header.kid!, (err, key) => {
        if (err) return callback(err);
        callback(null, key!.getPublicKey());
      });
    };

    jwt.verify(
      token,
      getKey,
      { issuer: GITHUB_ISSUER, audience, algorithms: ["RS256"] },
      (err, decoded) => {
        if (err) return reject(err);
        resolve(decoded as GitHubOidcClaims);
      }
    );
  });
}
