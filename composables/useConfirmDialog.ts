// Global state - shared across all components
const globalState = {
  isOpen: ref(false),
  title: ref(''),
  message: ref(''),
  confirmLabel: ref('Confirm'),
  alternateLabel: ref(''),
  cancelLabel: ref('Cancel'),
  variant: ref<'primary' | 'error' | 'warning' | 'info'>('primary'),
  items: ref<Array<{ label: string; items: Array<string> }>>([]),
  alternateItems: ref<Array<{ label: string; items: Array<string> }>>([])
}

let globalResolveFn: (value: 'confirm' | 'alternate' | 'cancel') => void

export function useConfirmDialog() {
  const confirm = (
    options: {
      title?: string
      message?: string
      confirmLabel?: string
      alternateLabel?: string
      cancelLabel?: string
      variant?: 'primary' | 'error' | 'warning' | 'info'
      items?: Array<{ label: string; items: Array<string> }>
      alternateItems?: Array<{ label: string; items: Array<string> }>
    } = {}
  ) => {
    console.log('confirm called with options:', options)

    globalState.title.value = options.title || 'Confirm Action'
    globalState.message.value = options.message || 'Are you sure you want to proceed?'
    globalState.confirmLabel.value = options.confirmLabel || 'Confirm'
    globalState.alternateLabel.value = options.alternateLabel || ''
    globalState.cancelLabel.value = options.cancelLabel || 'Cancel'
    globalState.variant.value = options.variant || 'primary'
    globalState.items.value = options.items || []
    globalState.alternateItems.value = options.alternateItems || []

    globalState.isOpen.value = true
    console.log('Modal should be open now, isOpen:', globalState.isOpen.value)

    return new Promise<'confirm' | 'alternate' | 'cancel'>(resolve => {
      globalResolveFn = resolve
    })
  }

  const handleConfirm = () => {
    console.log('handleConfirm called')
    globalResolveFn('confirm')
    globalState.isOpen.value = false
    globalState.items.value = []
    globalState.alternateItems.value = []
    globalState.alternateLabel.value = ''
  }

  const handleAlternate = () => {
    console.log('handleAlternate called')
    globalResolveFn('alternate')
    globalState.isOpen.value = false
    globalState.items.value = []
    globalState.alternateItems.value = []
    globalState.alternateLabel.value = ''
  }

  const handleCancel = () => {
    console.log('handleCancel called')
    globalResolveFn('cancel')
    globalState.isOpen.value = false
    globalState.items.value = []
    globalState.alternateItems.value = []
    globalState.alternateLabel.value = ''
  }

  return {
    isOpen: globalState.isOpen,
    title: globalState.title,
    message: globalState.message,
    confirmLabel: globalState.confirmLabel,
    alternateLabel: globalState.alternateLabel,
    cancelLabel: globalState.cancelLabel,
    variant: globalState.variant,
    items: globalState.items,
    alternateItems: globalState.alternateItems,
    confirm,
    handleConfirm,
    handleAlternate,
    handleCancel
  }
}
