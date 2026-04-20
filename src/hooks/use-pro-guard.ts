import type { FeatureKey } from "@/types/entitlements"
import { useCallback, useState } from "react"
import { useEntitlements } from "@/hooks/use-entitlements"
import { hasFeature } from "@/types/entitlements"
import { authClient } from "@/utils/auth/auth-client"

interface UseProGuardResult {
  /** Returns true if feature is granted; false otherwise (and side-effect: open upgrade dialog). */
  guard: (feature: FeatureKey, options?: { source?: string }) => boolean
  /** Dialog state + props to spread into <UpgradeDialog />. */
  dialogProps: {
    open: boolean
    onOpenChange: (open: boolean) => void
    source?: string
  }
}

export function useProGuard(): UseProGuardResult {
  const session = authClient.useSession()
  const userId = session?.data?.user?.id ?? null
  const { data } = useEntitlements(userId)

  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<string | undefined>(undefined)

  const guard = useCallback(
    (feature: FeatureKey, options?: { source?: string }): boolean => {
      if (hasFeature(data, feature)) {
        return true
      }
      setSource(options?.source)
      setOpen(true)
      return false
    },
    [data],
  )

  return {
    guard,
    dialogProps: {
      open,
      onOpenChange: setOpen,
      source,
    },
  }
}
