## 2024-05-24 - [Path Traversal in Image Serve Route]
**Vulnerability:** The `app/api/serve-image/route.js` allowed users to provide directory traversal paths (e.g. `../../../etc/passwd`) via the `file` query parameter, resulting in the server loading and returning arbitrary files from the local filesystem.
**Learning:** Raw input strings should never be used directly in `path.join()`. In Next.js, endpoints that read files dynamically based on a query parameter are highly susceptible to Path Traversal if proper normalization or validation is missing.
**Prevention:** Always use `path.basename(filename)` to extract the intended filename and discard any `../` components, or validate against an allowed directory structure (`if (!resolvedPath.startsWith(allowedDir)) { ... }`).

## 2024-05-24 - [Hardcoded Secret in Cleanup Route]
**Vulnerability:** The `app/api/cleanup/route.js` had a hardcoded default secret (`change-this-to-a-secure-key`) that would allow an attacker to bypass authentication if `process.env.CLEANUP_API_KEY` was missing from the server environment.
**Learning:** Providing a "fallback" string for secrets creates a backdoor if deployment environments fail to set the environment variable. This allows the endpoint to become inadvertently public.
**Prevention:** Rather than using a fallback secret, an endpoint should throw an error (e.g. 500) or refuse to start if a required environment variable is not defined.

## 2024-05-24 - [Overly Permissive CORS in Proxy Route]
**Vulnerability:** The `app/api/proxy/route.ts` used `Access-Control-Allow-Origin: '*'`, allowing any website to make cross-origin requests to this endpoint.
**Learning:** Using a wildcard for CORS origin can expose sensitive endpoints to unauthorized cross-origin access and potential data leakage.
**Prevention:** Restrict `Access-Control-Allow-Origin` to specific, trusted origins (e.g., using `process.env.NEXT_PUBLIC_SITE_URL`) or omit the header entirely if not needed.
