## 2024-05-24 - [Path Traversal in Image Serve Route]
**Vulnerability:** The `app/api/serve-image/route.js` allowed users to provide directory traversal paths (e.g. `../../../etc/passwd`) via the `file` query parameter, resulting in the server loading and returning arbitrary files from the local filesystem.
**Learning:** Raw input strings should never be used directly in `path.join()`. In Next.js, endpoints that read files dynamically based on a query parameter are highly susceptible to Path Traversal if proper normalization or validation is missing.
**Prevention:** Always use `path.basename(filename)` to extract the intended filename and discard any `../` components, or validate against an allowed directory structure (`if (!resolvedPath.startsWith(allowedDir)) { ... }`).

## 2024-05-24 - [Hardcoded Secret in Cleanup Route]
**Vulnerability:** The `app/api/cleanup/route.js` had a hardcoded default secret (`change-this-to-a-secure-key`) that would allow an attacker to bypass authentication if `process.env.CLEANUP_API_KEY` was missing from the server environment.
**Learning:** Providing a "fallback" string for secrets creates a backdoor if deployment environments fail to set the environment variable. This allows the endpoint to become inadvertently public.
**Prevention:** Rather than using a fallback secret, an endpoint should throw an error (e.g. 500) or refuse to start if a required environment variable is not defined.
