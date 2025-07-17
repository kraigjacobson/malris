export function useJobActions() {
  const { confirm } = useConfirmDialog()
  const isDeletingJob = ref(false)

  const deleteJob = async (job: any, onSuccess?: () => void) => {
    if (!job) return false
    
    // Show confirmation dialog
    const confirmed = await confirm({
      title: 'Delete Job',
      message: `Are you sure you want to delete job ${job.id}? This action cannot be undone and will remove all associated data.`,
      confirmLabel: 'Delete Job',
      cancelLabel: 'Cancel',
      variant: 'error'
    })
    
    if (!confirmed) return false
    
    isDeletingJob.value = true
    try {
      await useApiFetch(`jobs/${job.id}/delete`, {
        method: 'DELETE'
      })
      
      // Call success callback if provided
      if (onSuccess) {
        onSuccess()
      }
      
      return true
      
    } catch (error) {
      console.error('Failed to delete job:', error)
      // You might want to show an error toast here
      return false
    } finally {
      isDeletingJob.value = false
    }
  }

  return {
    isDeletingJob: readonly(isDeletingJob),
    deleteJob
  }
}