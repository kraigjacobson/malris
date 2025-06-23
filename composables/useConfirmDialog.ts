// Global state - shared across all components
const globalState = {
  isOpen: ref(false),
  title: ref(''),
  message: ref(''),
  confirmLabel: ref('Confirm'),
  cancelLabel: ref('Cancel'),
  variant: ref<'primary' | 'error' | 'warning' | 'info'>('primary')
}

let globalResolveFn: (value: boolean) => void

export function useConfirmDialog() {
  const confirm = (options: {
    title?: string
    message?: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: 'primary' | 'error' | 'warning' | 'info'
  } = {}) => {
    console.log('confirm called with options:', options)
    
    globalState.title.value = options.title || 'Confirm Action'
    globalState.message.value = options.message || 'Are you sure you want to proceed?'
    globalState.confirmLabel.value = options.confirmLabel || 'Confirm'
    globalState.cancelLabel.value = options.cancelLabel || 'Cancel'
    globalState.variant.value = options.variant || 'primary'
    
    globalState.isOpen.value = true
    console.log('Modal should be open now, isOpen:', globalState.isOpen.value)
    
    return new Promise<boolean>((resolve) => {
      globalResolveFn = resolve
    })
  }

  const handleConfirm = () => {
    console.log('handleConfirm called')
    globalResolveFn(true)
    globalState.isOpen.value = false
  }

  const handleCancel = () => {
    console.log('handleCancel called')
    globalResolveFn(false)
    globalState.isOpen.value = false
  }

  return {
    isOpen: globalState.isOpen,
    title: globalState.title,
    message: globalState.message,
    confirmLabel: globalState.confirmLabel,
    cancelLabel: globalState.cancelLabel,
    variant: globalState.variant,
    confirm,
    handleConfirm,
    handleCancel
  }
}