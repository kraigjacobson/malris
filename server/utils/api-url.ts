/**
 * Get the correct Comfy API base URL based on environment
 * Uses port 3000 for both local development and internal container calls
 * The container always uses port 3000 internally, even though it's exposed as 42069 externally
 */
export function getComfyApiBaseUrl(): string {
  // Always use port 3000 for internal API calls
  // The container runs on port 3000 internally, regardless of external port mapping
  return `http://localhost:3000`
}