## 2024-05-24 - [Path Traversal in Image Serve Route]
**Vulnerability:** The `app/api/serve-image/route.js` allowed users to provide directory traversal paths (e.g. `../../../etc/passwd`) via the `file` query parameter, resulting in the server loading and returning arbitrary files from the local filesystem.
**Learning:** Raw input strings should never be used directly in `path.join()`. In Next.js, endpoints that read files dynamically based on a query parameter are highly susceptible to Path Traversal if proper normalization or validation is missing.
**Prevention:** Always use `path.basename(filename)` to extract the intended filename and discard any `../` components, or validate against an allowed directory structure (`if (!resolvedPath.startsWith(allowedDir)) { ... }`).

## 2024-05-24 - [Hardcoded Secret in Cleanup Route]
**Vulnerability:** The `app/api/cleanup/route.js` had a hardcoded default secret (`change-this-to-a-secure-key`) that would allow an attacker to bypass authentication if `process.env.CLEANUP_API_KEY` was missing from the server environment.
**Learning:** Providing a "fallback" string for secrets creates a backdoor if deployment environments fail to set the environment variable. This allows the endpoint to become inadvertently public.
**Prevention:** Rather than using a fallback secret, an endpoint should throw an error (e.g. 500) or refuse to start if a required environment variable is not defined.
## 2024-05-24 - [Server-Side Request Forgery (SSRF) in Image Proxy Route]
**Vulnerability:** The `app/api/proxy/route.ts` endpoint blindly fetched any URL provided via the `url` query parameter. This could allow an attacker to send requests to internal server infrastructure, access cloud metadata endpoints, or scan local network resources.
**Learning:** Endpoints that fetch external resources based on user input must restrict and validate the input URL to ensure it points to an intended and safe destination, preventing SSRF.
**Prevention:** Implement strict URL validation. Check that the parsed protocol is either `http:` or `https:`. Consider implementing an allowlist of trusted domains, or a deny-list for local/private IP address ranges.
