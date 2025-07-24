export interface Job {
  id: string
  status: string
  job_type: string
  progress?: number
  created_at: string
  updated_at?: string
  completed_at?: string
  source_media_uuid: string
  dest_media_uuid?: string
  subject_uuid?: string
  output_uuid?: string
  parameters?: any
  error_message?: string
  // Thumbnail data (base64 encoded)
  subject_thumbnail?: string
  dest_media_thumbnail?: string
  source_media_thumbnail?: string
  output_thumbnail?: string
  // Subject data
  subject?: {
    id: string
    name: string
  }
}

export interface QueueStatus {
  queue: {
    total: number
    queued: number
    active: number
    completed: number
    failed: number
    canceled: number
    need_input: number
    is_paused: boolean
    is_processing: boolean
  }
}

export interface JobFilters {
  jobId: string
  status: string
  jobType: string
  sourceType: string // 'all', 'vid', 'source'
}