/**
 * Composable for formatting delete preview data for confirm dialogs
 * Provides consistent formatting across all delete operations
 */

interface MediaRecord {
  uuid: string
  filename: string
  type: string
  purpose: string
  relatedTo: string
  subjectName: string
}

interface Job {
  id: string
  jobType: string
  status: string
  createdAt: Date
  subjectName: string
}

interface DeletePreviewData {
  targetJob?: {
    id: string
    jobType: string
    status: string
    createdAt: Date
    subjectName: string
  }
  targetMedia?: {
    uuid: string
    filename: string
    type: string
    purpose: string
    subjectName: string
  }
  willDelete: {
    mediaRecords: MediaRecord[]
    jobs: Job[]
  }
  totalMediaRecords?: number
  totalJobs?: number
}

export const useDeletePreview = () => {
  /**
   * Format job delete preview for confirm dialog
   * Separates items by what each button will delete
   */
  const formatJobDeletePreview = (preview: DeletePreviewData, jobId: string) => {
    if (!preview.targetJob) {
      throw new Error('Target job is required for job delete preview')
    }

    // Separate "this" records from "all" records
    // "Delete This" only deletes output media created by this job, NOT the dest media
    const thisJobMedia = preview.willDelete.mediaRecords.filter(m => m.relatedTo === jobId)
    const allOtherMedia = preview.willDelete.mediaRecords.filter(m => m.relatedTo !== jobId)

    console.log('🔍 Delete Preview Debug:', {
      allMediaRecords: preview.willDelete.mediaRecords,
      thisJobMedia,
      allOtherMedia,
      jobId
    })

    const items = []
    const hasAssociatedRecords = allOtherMedia.length > 0 || preview.willDelete.jobs.length > 0

    // Section 1: "Delete This" button will delete these items
    const thisItems = [`Job ID: ${jobId}`, `Subject: ${preview.targetJob.subjectName} | Type: ${preview.targetJob.jobType} | Status: ${preview.targetJob.status}`]

    if (thisJobMedia.length > 0) {
      thisJobMedia.forEach(m => {
        thisItems.push(m.purpose === 'dest' ? `  ${m.filename} (${m.purpose})` : `  ${m.subjectName} - ${m.filename} (${m.purpose})`)
      })
    }

    items.push({
      label: `"Delete This" will remove:`,
      items: thisItems
    })

    // Section 2: "Delete All" button will delete everything (only show if there are associated records)
    if (hasAssociatedRecords) {
      const allItems = []

      // Add the target job
      allItems.push(`1 Job: ${jobId.substring(0, 8)}... - ${preview.targetJob.subjectName} - ${preview.targetJob.jobType} - ${preview.targetJob.status}`)

      // Add this job's media
      thisJobMedia.forEach(m => {
        allItems.push(m.purpose === 'dest' ? `  ${m.filename} (${m.purpose})` : `  ${m.subjectName} - ${m.filename} (${m.purpose})`)
      })

      // Add associated jobs
      if (preview.willDelete.jobs.length > 0) {
        allItems.push(`${preview.willDelete.jobs.length} Related Job(s):`)
        preview.willDelete.jobs.forEach(j => {
          allItems.push(`  ${j.id.substring(0, 8)}... - ${j.subjectName} - ${j.jobType} - ${j.status}`)
        })
      }

      // Add associated media
      if (allOtherMedia.length > 0) {
        allItems.push(`${allOtherMedia.length} Related Media Record(s):`)
        allOtherMedia.forEach(m => {
          allItems.push(m.purpose === 'dest' ? `  ${m.filename} (${m.purpose})` : `  ${m.subjectName} - ${m.filename} (${m.purpose})`)
        })
      }

      items.push({
        label: `"Delete All" will remove:`,
        items: allItems
      })
    }

    return {
      items,
      hasAssociatedRecords,
      thisJobMediaCount: thisJobMedia.length
    }
  }

  /**
   * Format media delete preview for confirm dialog
   * Separates items by what each button will delete
   */
  const formatMediaDeletePreview = (preview: DeletePreviewData, cascade: boolean) => {
    if (!preview.targetMedia) {
      throw new Error('Target media is required for media delete preview')
    }

    const items = []

    if (cascade) {
      // For cascade delete, separate "this" vs "all associated"
      const otherMediaRecords = preview.willDelete.mediaRecords.filter(m => m.uuid !== preview.targetMedia?.uuid)

      // Section 1: "Delete This" will delete just the target media
      const thisItems = [`1 Media: ${preview.targetMedia.filename} (${preview.targetMedia.purpose || 'N/A'})`]

      items.push({
        label: `"Delete This" will remove:`,
        items: thisItems
      })

      // Section 2: "Delete All" will delete everything
      if (otherMediaRecords.length > 0 || preview.willDelete.jobs.length > 0) {
        const allItems = []

        // Add target media
        allItems.push(`1 Media: ${preview.targetMedia.filename} (${preview.targetMedia.purpose || 'N/A'})`)

        // Add associated jobs
        if (preview.willDelete.jobs.length > 0) {
          allItems.push(`${preview.willDelete.jobs.length} Related Job(s):`)
          preview.willDelete.jobs.forEach(j => {
            allItems.push(`  ${j.id.substring(0, 8)}... - ${j.subjectName} - ${j.jobType} - ${j.status}`)
          })
        }

        // Add other media records
        if (otherMediaRecords.length > 0) {
          allItems.push(`${otherMediaRecords.length} Related Media Record(s):`)
          otherMediaRecords.forEach(m => {
            allItems.push(m.purpose === 'dest' ? `  ${m.filename} (${m.purpose})` : `  ${m.subjectName} - ${m.filename} (${m.purpose})`)
          })
        }

        items.push({
          label: `"Delete All" will remove:`,
          items: allItems
        })
      }
    } else {
      // For non-cascade delete, just show what will be deleted
      const deleteItems = [`1 Media: ${preview.targetMedia.filename} (${preview.targetMedia.purpose || 'N/A'})`]

      if (preview.willDelete.jobs.length > 0) {
        deleteItems.push(`${preview.willDelete.jobs.length} Related Job(s):`)
        preview.willDelete.jobs.forEach(j => {
          deleteItems.push(`  ${j.id.substring(0, 8)}... - ${j.subjectName} - ${j.jobType} - ${j.status}`)
        })
      }

      items.push({
        label: `This will remove:`,
        items: deleteItems
      })
    }

    return {
      items
    }
  }

  return {
    formatJobDeletePreview,
    formatMediaDeletePreview
  }
}
