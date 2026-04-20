// @vitest-environment jsdom
import type { ReactNode } from "react"
import type { Entitlements } from "@/types/entitlements"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FREE_ENTITLEMENTS } from "@/types/entitlements"
import { AccountPage } from "../index"

vi.mock("../../../components/page-layout", () => ({
  PageLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const useSessionMock = vi.fn()

vi.mock("@/utils/auth/auth-client", () => ({
  authClient: {
    useSession: () => useSessionMock(),
    signOut: vi.fn().mockResolvedValue({}),
  },
}))

const useEntitlementsMock = vi.fn()

vi.mock("@/hooks/use-entitlements", () => ({
  useEntitlements: (userId: string | null) => useEntitlementsMock(userId),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRO_ENTITLEMENTS: Entitlements = {
  tier: "pro",
  features: ["pdf_translate", "vocab_unlimited"],
  quota: {
    ai_translate: { used: 50, limit: 200 },
    vocab: { used: 10, limit: 100 },
  },
  expiresAt: "2099-01-01T00:00:00.000Z",
}

const EXPIRED_PRO_ENTITLEMENTS: Entitlements = {
  tier: "pro",
  features: [],
  quota: {},
  expiresAt: "2020-01-01T00:00:00.000Z",
}

function renderWithProviders(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const store = createStore()

  return render(
    <JotaiProvider store={store}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </JotaiProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("accountPage", () => {
  beforeEach(() => {
    useSessionMock.mockReset()
    useEntitlementsMock.mockReset()
    vi.stubGlobal("open", vi.fn())
  })

  it("renders signInPrompt and no upgrade button when anonymous", () => {
    useSessionMock.mockReturnValue({ data: null, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })

    renderWithProviders(<AccountPage />)

    expect(screen.getByText("billing.account.signInPrompt")).toBeInTheDocument()
    expect(screen.queryByText("billing.upgrade.cta")).not.toBeInTheDocument()
  })

  it("renders skeleton while loading", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1", email: "test@example.com" } }, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: true, isFromCache: false })

    renderWithProviders(<AccountPage />)

    expect(document.querySelector("[data-slot='skeleton']")).toBeInTheDocument()
  })

  it("renders Free badge and upgrade CTA for free user", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1", email: "test@example.com" } }, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })

    renderWithProviders(<AccountPage />)

    expect(screen.getByText("billing.tier.free")).toBeInTheDocument()
    expect(screen.getByText("billing.upgrade.cta")).toBeInTheDocument()
  })

  it("opens pricing URL with source=options-account when free user clicks upgrade", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1", email: "test@example.com" } }, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })

    renderWithProviders(<AccountPage />)

    fireEvent.click(screen.getByText("billing.upgrade.cta"))

    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("source=options-account"),
      "_blank",
      "noopener,noreferrer",
    )
  })

  it("renders Pro badge and expiry date and manage plan button for pro user", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1", email: "test@example.com" } }, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: PRO_ENTITLEMENTS, isLoading: false, isFromCache: false })

    renderWithProviders(<AccountPage />)

    expect(screen.getByText("billing.tier.pro")).toBeInTheDocument()
    expect(screen.getByText("billing.account.managePlan")).toBeInTheDocument()
    // expiry date should be visible
    expect(screen.getByText(/2099/)).toBeInTheDocument()
  })

  it("renders quota progress bars for pro user", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1", email: "test@example.com" } }, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: PRO_ENTITLEMENTS, isLoading: false, isFromCache: false })

    renderWithProviders(<AccountPage />)

    // Two quota buckets => two progress bars
    const progressBars = document.querySelectorAll("[data-slot='progress']")
    expect(progressBars.length).toBe(2)
  })

  it("renders expired copy and re-up CTA when expiresAt is in the past", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1", email: "test@example.com" } }, isPending: false })
    // Hook returns FREE_ENTITLEMENTS for expired tier (fail-closed), but
    // we pass the raw expired entitlements to test the page's own expired-date logic
    useEntitlementsMock.mockReturnValue({ data: EXPIRED_PRO_ENTITLEMENTS, isLoading: false, isFromCache: false })

    renderWithProviders(<AccountPage />)

    expect(screen.getByText("billing.expiry.expired")).toBeInTheDocument()
    // Should also show an upgrade CTA since isPro returns false for expired
    expect(screen.getByText("billing.upgrade.cta")).toBeInTheDocument()
  })

  it("calls authClient.signOut when sign out button is clicked", async () => {
    const { authClient } = await import("@/utils/auth/auth-client")
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1", email: "test@example.com" } }, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })

    renderWithProviders(<AccountPage />)

    fireEvent.click(screen.getByText("billing.account.signOut"))

    expect(authClient.signOut).toHaveBeenCalled()
  })
})
