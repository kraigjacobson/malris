/**
 * Enhanced System Status Types
 * Defines all possible states for the various system components
 */

// RunPod Worker Status
export type RunPodWorkerStatus = 
  | 'healthy'      // Worker is responding and available
  | 'unhealthy'    // Worker is not responding or has errors
  | 'unknown'      // Status hasn't been checked yet

// ComfyUI Status  
export type ComfyUIStatus =
  | 'healthy'      // ComfyUI is responding normally
  | 'unhealthy'    // ComfyUI has issues or not responding
  | 'unknown'      // Status hasn't been checked yet

// ComfyUI Processing Status
export type ComfyUIProcessingStatus =
  | 'idle'         // No jobs running or queued in ComfyUI
  | 'processing'   // ComfyUI is actively processing jobs
  | 'queued'       // ComfyUI has jobs queued but not processing
  | 'unknown'      // Processing status unknown

// Auto Processing Status
export type AutoProcessingStatus =
  | 'enabled'      // Auto processing is enabled and running
  | 'disabled'     // Auto processing is disabled
  | 'paused'       // Auto processing is temporarily paused due to errors

// Overall System Health
export type SystemHealth =
  | 'healthy'      // All systems operational
  | 'degraded'     // Some issues but still functional
  | 'unhealthy'    // Major issues affecting functionality
  | 'unknown'      // Health status unknown

// Detailed status interface
export interface SystemStatus {
  // Timestamp of last update
  timestamp: string
  
  // Overall system health
  systemHealth: SystemHealth
  
  // Individual component statuses
  runpodWorker: {
    status: RunPodWorkerStatus
    message: string
    lastChecked: string
    responseTime?: number
  }
  
  comfyui: {
    status: ComfyUIStatus
    message: string
    lastChecked: string
    responseTime?: number
    version?: string
  }
  
  comfyuiProcessing: {
    status: ComfyUIProcessingStatus
    runningJobs: number
    queuedJobs: number
    lastChecked: string
  }
  
  autoProcessing: {
    status: AutoProcessingStatus
    message: string
    lastToggled: string
    intervalActive: boolean
  }
  
  // Database job counts
  jobCounts: {
    total: number
    queued: number
    active: number
    completed: number
    failed: number
    canceled: number
    needInput: number
  }
}

// WebSocket message types
export type SystemStatusEvent = 
  | 'status_update'        // Full status update
  | 'runpod_status_change' // RunPod worker status changed
  | 'comfyui_status_change' // ComfyUI status changed
  | 'processing_status_change' // Processing status changed
  | 'auto_processing_toggle'   // Auto processing enabled/disabled
  | 'job_counts_update'    // Job counts changed

export interface WebSocketMessage {
  type: SystemStatusEvent
  data: SystemStatus | Partial<SystemStatus>
  timestamp: string
}

// Status change notification
export interface StatusChangeNotification {
  component: 'runpod' | 'comfyui' | 'processing' | 'auto_processing' | 'jobs'
  previousStatus: string
  newStatus: string
  message: string
  timestamp: string
}