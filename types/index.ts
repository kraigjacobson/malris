// Shape of a media record as consumed by the display components (MediaItem,
// CropModal). Only the fields those components actually read are required-ish;
// the rest are optional since different endpoints hydrate different subsets.
export interface MediaItemData {
  uuid: string
  type: string // 'image' | 'video'
  purpose?: string // 'source' | 'dest' | 'output' | ...
  filename?: string
  width?: number | null
  height?: number | null
  duration?: number | null
  favorite?: boolean
  rating?: number | null
  job_id?: string | null
  thumbnail?: string | null // pre-resolved URL/base64 (server-provided)
  thumbnail_uuid?: string | null
  subject_thumbnail_uuid?: string | null
  updated_at?: string
  [key: string]: any // tolerate extra fields from search results
}

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