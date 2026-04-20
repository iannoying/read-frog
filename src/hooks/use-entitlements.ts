import type { Entitlements } from "@/types/entitlements"
import { useQuery } from "@tanstack/react-query"
import { useSetAtom } from "jotai"
import { useEffect } from "react"
import { EntitlementsSchema, FREE_ENTITLEMENTS, isPro } from "@/types/entitlements"
import { entitlementsAtom } from "@/utils/atoms/entitlements"
import { fetchEntitlementsFromBackend } from "@/utils/billing/fetch-entitlements"
import { readCachedEntitlements, writeCachedEntitlements } from "@/utils/db/dexie/entitlements"
import { logger } from "@/utils/logger"

/** Reject cache rows older than this to prevent perpetually-stale entitlements. */
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface UseEntitlementsResult {
  data: Entitlements
  isLoading: boolean
  isFromCache: boolean
}

interface EntitlementsQueryResult {
  data: Entitlements
  isFromCache: boolean
}

async function queryEntitlements(userId: string): Promise<EntitlementsQueryResult> {
  try {
    const raw = await fetchEntitlementsFromBackend()
    const value = EntitlementsSchema.parse(raw)
    await writeCachedEntitlements(userId, value)
    return { data: value, isFromCache: false }
  }
  catch (error) {
    logger.warn("[billing] getEntitlements failed, falling back to cache", error)
    const cached = await readCachedEntitlements(userId)
    if (cached !== null) {
      const ageMs = Date.now() - cached.updatedAt.getTime()
      const isExpired = ageMs >= MAX_CACHE_AGE_MS
      const isTierValid = cached.value.tier === "free" || isPro(cached.value)
      if (!isExpired && isTierValid) {
        return { data: cached.value, isFromCache: true }
      }
    }
    return { data: FREE_ENTITLEMENTS, isFromCache: false }
  }
}

/**
 * Returns the current user's entitlements.
 *
 * - When `userId` is `null` (user not signed in), returns FREE_ENTITLEMENTS
 *   synchronously without firing any network request.
 * - When `userId` is provided, fetches from the backend (5-min staleTime).
 *   On success the result is written to Dexie and the Jotai atom.
 *   On any error the hook falls back to the Dexie offline cache; if that also
 *   misses it returns FREE_ENTITLEMENTS. Both fallback paths are fail-closed
 *   (no paid features granted).
 */
export function useEntitlements(
  userId: string | null,
): UseEntitlementsResult {
  const setEntitlements = useSetAtom(entitlementsAtom)

  const query = useQuery({
    queryKey: ["entitlements", userId] as const,
    enabled: userId !== null,
    staleTime: 5 * 60_000,
    queryFn: ({ queryKey: [, uid] }) => queryEntitlements(uid as string),
    // Suppress the global QueryCache toast — we handle errors with cache fallback.
    meta: { suppressToast: true },
  })

  // Sync successful fetch result into the global Jotai atom — only when the
  // data comes directly from the backend (not a cache fallback).
  useEffect(() => {
    if (query.data != null && !query.data.isFromCache) {
      setEntitlements(query.data.data)
    }
  }, [query.data, setEntitlements])

  if (userId === null) {
    return { data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false }
  }

  if (query.isLoading) {
    return { data: FREE_ENTITLEMENTS, isLoading: true, isFromCache: false }
  }

  return {
    data: query.data?.data ?? FREE_ENTITLEMENTS,
    isLoading: false,
    isFromCache: query.data?.isFromCache ?? false,
  }
}
