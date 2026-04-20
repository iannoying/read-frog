import type { ReactNode } from "react"
import type { FeatureKey } from "@/types/entitlements"
import { useEntitlements } from "@/hooks/use-entitlements"
import { hasFeature } from "@/types/entitlements"
import { authClient } from "@/utils/auth/auth-client"

interface ProGateProps {
  feature: FeatureKey
  fallback: ReactNode
  children: ReactNode
  /** Optional: render children even while loading (opt-in to optimistic UX) */
  optimistic?: boolean
}

export function ProGate({ feature, fallback, children, optimistic = false }: ProGateProps) {
  const session = authClient.useSession()
  const userId = session?.data?.user?.id ?? null
  const { data, isLoading } = useEntitlements(userId)

  if (isLoading && !optimistic) {
    return fallback
  }

  if (hasFeature(data, feature)) {
    return children
  }

  return fallback
}
