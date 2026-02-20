# Cart Domain — Architecture Overview

> ⚠️ **Audit documents.** These files describe the current state of the cart domain, its known problems, and the full discount system architecture. They are **not production code** — they are structured notes for engineering review and refactoring planning.

---

## Files

### `cart.repo.ts`

A full architecture overview of the Cart domain repository (~900 lines god file).

Covers:

- **Module structure** — file layout, dependency map
- **GraphQL definitions** — all 15+ query/mutation definitions living inline
- **Mappers** — `reshapeCart`, `extractContractMetadata`, `extractOrderCustomFields` with known coupling issues
- **Business rules** — contract line item key generation, upsert logic, CT-specific workarounds embedded directly in repo methods
- **Repo surface** — full `cartRepo` object: read, lifecycle, line items, discounts, address/contact, shipping, tax methods
- **Supporting files** — known issues in `tax-utils.ts`, `custom-fields.ts`, `custom-object.repo.ts`, `graphql-client.ts`
- **Discount levels summary** — all 3 discount levels with data shapes
- **Line item types** — SPOT vs CONTRACT item differences
- **Error handling** — duplicated pattern across 14+ repo methods

### `discount.md.ts`

Deep dive into the discount system architecture across all three levels.

Covers:

- **Shared `IncludedDiscount` shape** — used across all levels, no shared abstraction
- **Level 1 — Line Item discounts** — server-side CT CartDiscount rules, `discountedPricePerQuantity` breakdown
- **Level 2 — Cart total discounts** — discount codes, `DiscountCodeState`, `discountOnTotalPrice`
- **Level 3 — Shipping discounts** — per-shipping entry `discountedPrice`, custom method edge cases
- **Repo methods** — `addDiscountCode` / `removeDiscountCode` with error handling gaps
- **Subtotal calculation** — inline logic in `reshapeCart`, known inaccuracies
- **Missing utilities** — `getTotalLineItemDiscounts`, `getTotalShippingDiscount`, `getTotalCartDiscount`, `getAllAppliedDiscountNames`, unified `DiscountSummary` type

---

## Known Problem Areas

| Area | Problem |
|---|---|
| `cart.repo.ts` | God file — ~900 lines, no separation of concerns |
| GraphQL definitions | Inline with business logic, not co-located with queries |
| Mappers | Coupled to GraphQL fragment types, contain business logic |
| `setDeliveryShippingMethods` | 6 responsibilities in one method |
| Error handling | Duplicated `if (result.error...)` pattern in 14+ places |
| Discount aggregation | 3 levels, 1 shared shape, 0 unified abstraction |
| `graphqlClient` | Module-level singleton — not injectable, not testable |
| `customObject.repo` | `value: unknown` — no schema validation before write |
| Subtotal calc | Uses `price.discounted` (unit level), ignores `discountedPricePerQuantity` (batch level) |

---

## Discount Levels Quick Reference

```
Level 1 — Line Item    lineItem.discountedPricePerQuantity[].discountedPrice.includedDiscounts[]
Level 2 — Cart Total   cart.discountOnTotalPrice.includedDiscounts[]
Level 3 — Shipping     cart.shipping[n].shippingInfo.discountedPrice.includedDiscounts[]
```

All three levels share the `IncludedDiscount` shape:

```ts
type IncludedDiscount = {
  discountedAmount: Money;
  discount: { id: string; key?: string | null; name?: string | null } | null;
};
```

---

## Purpose of These Documents

These files were created to:

1. Provide a **shared understanding** of the current cart domain state before refactoring
2. Serve as an **audit baseline** — every `⚠️ Problem` comment is a tracked issue
3. Guide **extraction work** — splitting the god file into focused modules (`cart.service.ts`, `cart.mappers.ts`, `discount.utils.ts`, etc.)
4. Document **CT-specific behaviors** (shipping targets workaround, external tax, custom shipping methods) that are easy to lose during rewrites
