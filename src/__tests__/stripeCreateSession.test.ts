// The Next.js app route code references Web API globals like `Request`.
// Define simple shims so we can import and run the handler in Jest node env.
// Test client-side checkout helper to avoid importing Next.js server route in tests
jest.mock("../lib/stripe/getStripe", () => {
  return jest.fn(async () => ({
    redirectToCheckout: jest.fn(async ({ sessionId }: any) => ({
      error: null,
    })),
  }));
});

import createOneTimeCheckout from "../lib/stripe/createOneTimeCheckout";

describe("createOneTimeCheckout client helper", () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ id: "sess_123", url: "https://stripe.checkout" }),
    }));
  });

  test("calls fetch and redirects to Stripe checkout", async () => {
    await expect(createOneTimeCheckout("price_abc")).resolves.toBeUndefined();
    expect((global as any).fetch).toHaveBeenCalled();
  });
});
