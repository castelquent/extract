import { useEffect } from 'react'
import { useUIStore } from '@/stores'

export function UpdateHandler() {
  const { setUpdateStatus, setUpdateVersion, setUpdateProgress, setUpdateError } = useUIStore()

  useEffect(() => {
    // Listen for update available
    const unsubAvailable = window.api.onUpdateAvailable((version) => {
      setUpdateStatus('available')
      setUpdateVersion(version)
    })

    // Listen for download progress
    const unsubProgress = window.api.onUpdateProgress((percent) => {
      setUpdateStatus('downloading')
      setUpdateProgress(percent)
    })

    // Listen for update downloaded
    const unsubDownloaded = window.api.onUpdateDownloaded(() => {
      setUpdateStatus('ready')
      setUpdateProgress(100)
    })

    // Listen for errors
    const unsubError = window.api.onUpdateError((error) => {
      setUpdateStatus('error')
      setUpdateError(error)
    })

    return () => {
      unsubAvailable()
      unsubProgress()
      unsubDownloaded()
      unsubError()
    }
  }, [setUpdateStatus, setUpdateVersion, setUpdateProgress, setUpdateError])

  return null
}
