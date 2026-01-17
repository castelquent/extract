import { useEffect } from 'react'
import { useUIStore } from '@/stores'
import { UnsavedChangesModal } from '@/pages/Editor/UnsavedChangesModal'

export function WindowCloseHandler() {
  const pendingClose = useUIStore((state) => state.pendingClose)
  const setPendingClose = useUIStore((state) => state.setPendingClose)

  useEffect(() => {
    // Écouter l'événement du main process
    const cleanup = window.api.onCheckUnsavedChanges(() => {
      // Lire la valeur actuelle du store au moment de l'événement
      const { hasUnsavedChanges } = useUIStore.getState()

      if (hasUnsavedChanges) {
        // Afficher le modal
        setPendingClose(true)
      } else {
        // Pas de changements, fermer directement
        window.api.confirmClose()
      }
    })

    return cleanup
  }, [setPendingClose])

  const handleSave = async () => {
    const { onSaveCallback } = useUIStore.getState()
    if (onSaveCallback) {
      await onSaveCallback()
    }
    setPendingClose(false)
    window.api.confirmClose()
  }

  const handleDiscard = () => {
    setPendingClose(false)
    window.api.confirmClose()
  }

  const handleCancel = () => {
    setPendingClose(false)
    window.api.cancelClose()
  }

  return (
    <UnsavedChangesModal
      open={pendingClose}
      onSave={handleSave}
      onDiscard={handleDiscard}
      onCancel={handleCancel}
    />
  )
}
