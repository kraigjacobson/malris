/**
 * Get the correct API base URL based on the type of call
 * For malris internal calls: use localhost:3003 (malris internal port)
 * For comfy-docker calls: use comfyui-runpod-worker:8000 (comfy-docker internal port)
 */
export function getComfyApiBaseUrl(): string {
  // This function is used for malris internal API calls (like processing toggle)
  // Use the malris internal port
  return `http://localhost:3003`
}

export function getComfyWorkerUrl(): string {
  // This function is used for comfy-docker worker calls
  // Use the comfy-docker container name and internal port
  return process.env.COMFYUI_WORKER_URL || 'http://comfyui-runpod-worker:8000'
}