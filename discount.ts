// ═══════════════════════════════════════════════════════════════════════
// CART DOMAIN — DISCOUNT SYSTEM DEEP DIVE
// Purpose: full discount architecture overview for pattern review
// ═══════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────
// SHARED SHAPE — used across ALL discount levels
// ───────────────────────────────────────────────────────────────────────

type IncludedDiscount = {
  discountedAmount: Money; // how much was discounted
  discount: {
    id: string;
    key?: string | null;
    name?: string | null;
  } | null;
};

// ⚠️ Problem: same shape used in 3 different contexts
//             but no shared abstraction / unified reader

// ───────────────────────────────────────────────────────────────────────
// LEVEL 1 — LINE ITEM DISCOUNTS
// Source: CT CartDiscount rules, applied server-side automatically
// Managed by: nobody in repo — read-only
// ───────────────────────────────────────────────────────────────────────

type LineItem = {
  id: string;
  quantity: number;

  // Unit price — may contain discounted price
  price: {
    value: Money; // original unit price
    discounted?: {
      value: Money; // discounted unit price
      discount: { id: string };
    };
  };

  // Per-quantity discount breakdown
  // CT splits discounts per quantity batch when multiple discounts apply
  discountedPricePerQuantity: Array<{
    quantity: number; // how many units at this discounted price
    discountedPrice: {
      value: Money; // effective price for this batch
      includedDiscounts: IncludedDiscount[];
    };
  }>;

  // Total price — already accounts for discounts
  totalPrice: Money;
};

// ⚠️ Problem: to get "total discount amount on line item" you must:
//   1. iterate discountedPricePerQuantity[]
//   2. iterate each .includedDiscounts[]
//   3. sum discountedAmount.centAmount
//   No utility exists for this — every consumer does it manually

// ⚠️ Problem: price.discounted and discountedPricePerQuantity
//             are two different representations of the same fact
//             no clear rule on which to use when

// ───────────────────────────────────────────────────────────────────────
// LEVEL 2 — CART TOTAL DISCOUNTS (via discount code)
// Source: discount code applied by customer
// Managed by: addDiscountCode / removeDiscountCode
// ───────────────────────────────────────────────────────────────────────

type DiscountCodeState =
  | 'MatchesCart' // code is valid and applied
  | 'DoesNotMatchCart' // code exists but conditions not met
  | 'MaxApplicationReached' // usage limit hit
  | 'ApplicationStoppedByPreviousDiscount'
  | string; // ⚠️ open string — CT may return unknown states

type DiscountCode = {
  discountCodeRef: { id: string };
  state: DiscountCodeState | null;
  discountCode: {
    id: string;
    code: string; // human-readable code e.g. "SUMMER20"
    name: string | null;
    cartDiscounts: { id: string }[] | null; // which CartDiscount rules this code activates
  } | null;
};

type DiscountOnTotalPrice = {
  discountedAmount: Money; // total cart-level discount amount
  includedDiscounts: Array<{
    discountRef: { id: string };
    discountedAmount: Money; // per-discount contribution
    discount: {
      id: string;
      key: string | null;
      name: string | null;
    } | null;
  }>;
};

type Cart = {
  // ...other fields

  // Applied discount codes (can have multiple)
  discountCodes: DiscountCode[];

  // Resulting cart-level discount
  discountOnTotalPrice: DiscountOnTotalPrice | null;
};

// ⚠️ Problem: discountCodes[] and discountOnTotalPrice are separate fields
//             no direct link between "which code caused which discount amount"
//             consumer must cross-reference discountCode.cartDiscounts[] manually

// ⚠️ Problem: state: DiscountCodeState is never surfaced as error to the user
//             in repo — caller must check state after addDiscountCode succeeds
//             no validation / state-check utility exists

// ───────────────────────────────────────────────────────────────────────
// LEVEL 3 — SHIPPING DISCOUNTS
// Source: CT CartDiscount rules targeting shipping, applied server-side
// Managed by: nobody in repo — read-only
// ───────────────────────────────────────────────────────────────────────

type ShippingInfo = {
  shippingMethodName?: string;
  price?: Money; // original shipping price
  discountedPrice?: {
    // present only when discount applied
    value: Money; // effective shipping price after discount
    includedDiscounts: IncludedDiscount[];
  };
};

type Shipping = {
  shippingKey?: string;
  shippingInfo?: ShippingInfo;
  shippingAddress?: Address;
  shippingNotes?: string;
};

// Cart has multiple shipping entries (shippingMode: Multiple)
type Cart = {
  shipping: Shipping[]; // one per delivery location + method
};

// ⚠️ Problem: to check "is shipping discounted" you must:
//   cart.shipping[n].shippingInfo?.discountedPrice !== undefined
//   No utility / no flag — pure nullability check

// ⚠️ Problem: custom shipping methods (addCustomShippingMethod) are used
//             but CT shipping discounts apply to shippingMethod-based methods
//             unclear if discounts work correctly on custom methods

// ───────────────────────────────────────────────────────────────────────
// DISCOUNT REPO METHODS — current implementation
// ───────────────────────────────────────────────────────────────────────

// addDiscountCode(params: { id, version, locale, code }) => ActionResult<Cart>
//   mutation: updateCart → addDiscountCode: { code }
//   error handling:
//     - networkError        → NETWORK_ERROR
//     - DiscountCodeNonApplicable (graphQLError) → BAD_INPUT + { errorCode, discountCodeId, reason }
//     - "not found" in message → NOT_FOUND
//     - else → UNKNOWN
// ⚠️ Problem: error detection via string.includes() on error message — fragile

// removeDiscountCode(params: { id, version, locale, discountCodeId }) => ActionResult<Cart>
//   mutation: updateCart → removeDiscountCode: { discountCode: { typeId: "discount-code", id } }
//   error handling: only networkError + missing data
// ⚠️ Problem: asymmetric error handling vs addDiscountCode

// ───────────────────────────────────────────────────────────────────────
// SUBTOTAL CALCULATION — lives inside reshapeCart
// ───────────────────────────────────────────────────────────────────────

// Current inline logic inside reshapeCart():
const subtotalCentAmount = lineItems.reduce((sum, item) => {
  const priceToUse =
    item.price.discounted?.value.centAmount ?? item.price.value.centAmount; // use discounted if exists // fallback to original
  return sum + priceToUse * item.quantity;
}, 0);

// ⚠️ Problem: subtotal uses item.price.discounted (unit level)
//             but ignores item.discountedPricePerQuantity (batch level)
//             these can differ when multiple discounts apply to different quantities

// ⚠️ Problem: subtotal calculation embedded in reshapeCart mapper
//             not a dedicated utility, not testable in isolation

// ⚠️ Problem: subtotal !== CT's totalPrice
//             totalPrice includes shipping + tax
//             subtotal is line items only — but the distinction is implicit

// ───────────────────────────────────────────────────────────────────────
// DISCOUNT AGGREGATION — what doesn't exist but should
// ───────────────────────────────────────────────────────────────────────

// ❌ No utility: getTotalLineItemDiscounts(lineItems) => Money
// ❌ No utility: getTotalShippingDiscount(shipping) => Money
// ❌ No utility: getTotalCartDiscount(cart) => Money
// ❌ No utility: getAllAppliedDiscountNames(cart) => string[]
// ❌ No type discriminator between automatic vs code-based discounts
// ❌ No unified DiscountSummary type aggregating all 3 levels

// ───────────────────────────────────────────────────────────────────────
// DISCOUNT FLOW SUMMARY
// ───────────────────────────────────────────────────────────────────────

//  Customer applies code
//       │
//       ▼
//  addDiscountCode() ──► CT validates ──► DiscountCodeState
//       │                                      │
//       │                               DoesNotMatchCart ──► BAD_INPUT (returned to caller)
//       │                               MatchesCart
//       ▼
//  Cart updated with:
//  ├── discountCodes[]                  (which codes are applied + state)
//  ├── discountOnTotalPrice             (cart-level discount amount)  ← LEVEL 2
//  ├── lineItems[].discountedPricePerQuantity  (per item breakdown)   ← LEVEL 1
//  └── shipping[].shippingInfo.discountedPrice (shipping breakdown)   ← LEVEL 3
//
//  All levels use IncludedDiscount shape
//  No single place aggregates the full discount picture
//
// ⚠️ Final problem: 3 levels + 1 shared shape + 0 unified abstraction
//                   every UI component reads discounts differently
