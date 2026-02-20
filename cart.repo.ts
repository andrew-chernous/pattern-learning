// ═══════════════════════════════════════════════════════════════════════
// CART DOMAIN — FULL ARCHITECTURE OVERVIEW
// ═══════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────
// FILE STRUCTURE
// ───────────────────────────────────────────────────────────────────────

// cart/
// ├── cart.repo.ts                        ← ⚠️ GOD FILE (~900 lines)
// ├── constants.ts
// ├── types.ts
// ├── utils/
// │   ├── calculate-line-items-weight.ts
// │   └── tax-utils.ts
// ├── mappers/
// │   └── custom-fields.ts
// └── client/
//     └── graphql-client.ts
//
// product/
// └── mappers/
//     ├── attributes.ts
//     └── price.ts
//
// custom-object/
// └── custom-object.repo.ts


// [1] MODULE-LEVEL SINGLETON — no DI, untestable
const client = graphqlClient();
// ⚠️ Problem: impossible to swap/mock in tests without module mocking


// [2] GRAPHQL DEFINITIONS — 15 query/mutation definitions inline
const CreateCartMutation = graphql(...)
const GetActiveCustomerCartQuery = graphql(...)
const GetActiveCustomerCartAsAssociateQuery = graphql(...)
const GetCartByIdQuery = graphql(...)
const AddItemToCartMutation = graphql(...)          // reused for contract items too
const SetContactInformation = graphql(...)
const SetBillingAddressMutation = graphql(...)
const DeleteCartMutation = graphql(...)
const CreateCartWithLineItemsMutation = graphql(...)
const ChangeItemsQuantityMutation = graphql(...)
const RemoveItemFromCartMutation = graphql(...)
const MergeCartMutation = graphql(...)
const SetDeliveryShippingMethodsMutation = graphql(...)
const AddDiscountCodeMutation = graphql(...)
const RemoveDiscountCodeMutation = graphql(...)
const SetExternalTaxMutation = graphql(...)
const SetTaxDisabledMutation = graphql(...)
// ⚠️ Problem: query definitions mixed with business logic, no separation


// [3] MAPPERS — tightly coupled to GraphQL fragment types
function reshapeCart(fragment: GraphQLFragment, locale: Locale): Cart {
    // - iterates lineItems
    // - calls reshapeProductAttributes()
    // - calls reshapePrice()
    // - calculates weight via calculateLineItemsWeight()
    // - calculates subtotal inline        ← ⚠️ business logic inside mapper
    // - calls extractContractMetadata()
    // - calls reshapeOrderFields()
    // - calls reshapeShippingFields()
    // - parses deliveryRoutes JSON        ← ⚠️ data parsing inside mapper
}
// ⚠️ Problem: coupled to GraphQLFragment — cannot unit test with plain objects

function extractContractMetadata(customFieldsRaw): ContractMetadata | undefined {
    // reads: contract (Reference), contractYear, contractLineNumber, pricePerLb
    // expands: referencedResource.value → { contractNumber, customerNumber }
}
// ⚠️ Problem: lives in cart.repo.ts, should be in cart.mappers.ts

function extractOrderCustomFields(customFieldsRaw, locale): Partial<Cart> {
    // reads: vatNumber, deliveryPlanType, billingAddressSameAsShipping
    // parses: deliveryRoutes → JSON.parse() with try/catch inline
}
// ⚠️ Problem: JSON parsing + field extraction mixed together


// [4] BUSINESS RULES — embedded inside repo methods
export const addContractLineItemToCart = async (params) => {
    // Contract key generation — BUSINESS RULE inside repo:
    const lineItemKey = `contract-${params.contractYear}-${params.contractNumber}-${params.lineNumber}-${params.lineItemKeySuffix}`
    // ⚠️ Problem: key generation strategy is a business rule, not a repo concern

    // Quantity update vs new add — BUSINESS RULE inside repo:
    const existingLineItem = params.cartLineItems?.find(li => li.key === lineItemKey)
    if (existingLineItem) { /* update quantity */ } else { /* add new */ }
    // ⚠️ Problem: upsert logic belongs to domain/service layer
}

export const addItemToCart = async (params) => {
    // Pre-add shipping target clearing — CT WORKAROUND inside repo:
    const matchingLineItem = params.lineItems?.find(...)
    if (matchingLineItem?.shippingDetails?.targets?.length > 0) {
        actions.push({ setLineItemShippingDetails: { targets: [] } })
    }
    // ⚠️ Problem: CT-specific workaround embedded in business method
}

export const setDeliveryShippingMethods = async (params) => {
    // ⚠️ Problem: 6 responsibilities in ONE method:
    // 1. write DeliveryPlan to CustomObject (external side effect)
    // 2. add/update MAIN_SHIPPING_ADDRESS in itemShippingAddresses
    // 3. diff existing vs expected shipping methods → remove stale
    // 4. add new custom shipping methods per delivery
    // 5. set line item shipping targets
    // 6. set deliveryPlanType + deliveryRoutes custom fields
}


// [5] IMPLICIT REPOSITORY OBJECT — no explicit interface satisfaction
export const cartRepo: CartRepository = {

    // ── READ ──────────────────────────────────────────
    getCustomerActiveCart,  // by customerId, optional associate+BU context
    getCartById,            // by id


    // ── LIFECYCLE ─────────────────────────────────────
    createCart,                    // creates empty cart (taxMode: ExternalAmount, shippingMode: Multiple)
    deleteCart,                    // hard delete
    recreateCartWithBusinessUnit,  // clone lineItems into new BU cart → delete old cart
    mergeCart,                     // anonymous cart → customer cart


    // ── LINE ITEMS ────────────────────────────────────
    addItemToCart,              // spot item (+ CT shipping targets workaround)
    addContractLineItemToCart,  // contract item (external price + metadata + key dedup)
    changeItemQuantity,         // works for both spot and contract (externalPrice optional)
    removeItemFromCart,


    // ── DISCOUNTS: LINE ITEM LEVEL ────────────────────
    // ⚠️ No method — CT applies CartDiscount rules server-side automatically
    // Data shape in LineItem:
    //   item.price.discounted                              — discounted unit price
    //   item.discountedPricePerQuantity[]
    //     └─ quantity: number
    //     └─ discountedPrice.value: Money
    //     └─ discountedPrice.includedDiscounts[]
    //           └─ discountedAmount: Money
    //           └─ discount: { id, key, name }


    // ── DISCOUNTS: CART LEVEL (via code) ─────────────
    addDiscountCode,    // POST discount code → cart
    removeDiscountCode, // DELETE discount code from cart
    // Data shape in Cart:
    //   cart.discountCodes[]
    //     └─ discountCodeRef: { id }
    //     └─ state: DiscountCodeState
    //     └─ discountCode: { id, code, name, cartDiscounts[] }
    //   cart.discountOnTotalPrice
    //     └─ discountedAmount: Money
    //     └─ includedDiscounts[]
    //           └─ discountRef: { id }
    //           └─ discountedAmount: Money
    //           └─ discount: { id, key, name }


    // ── DISCOUNTS: SHIPPING LEVEL ─────────────────────
    // ⚠️ No method — CT applies shipping discounts server-side automatically
    // Data shape in Cart:
    //   cart.shipping[]
    //     └─ shippingInfo.discountedPrice
    //           └─ value: Money
    //           └─ includedDiscounts[]
    //                 └─ discountedAmount: Money
    //                 └─ discount: { id, key, name }


    // ── ADDRESS & CONTACT ─────────────────────────────
    setCartContactInformation,
    // sets: shippingAddress (add or update by key) + customerEmail + vatNumber
    // ⚠️ Problem: fetches cart internally to check address existence (extra network call)

    setBillingAddress,
    // sets: billingAddress + billingAddressSameAsShipping custom field
    // ⚠️ Problem: MAIN_SHIPPING_ADDRESS_KEY check duplicated vs setDeliveryShippingMethods


    // ── SHIPPING & DELIVERY ───────────────────────────
    setDeliveryShippingMethods,
    // ⚠️ See [4] above — 6 responsibilities


    // ── TAX ───────────────────────────────────────────
    setExternalTax,   // per lineItem + per shippingMethod + cartTotal (Vertex integration)
    setTaxDisabled,   // taxMode → Disabled (US/CA)
};


// ───────────────────────────────────────────────────────────────────────
// SUPPORTING FILES — PROBLEMS
// ───────────────────────────────────────────────────────────────────────

// cart/utils/calculate-line-items-weight.ts
function calculateLineItemsWeight(lineItems: LineItem[]): number { ... }
// ⚠️ Problem: called inside reshapeCart — utility tangled with mapper


// cart/utils/tax-utils.ts
function createExternalTaxRate(params): ExternalTaxRate { ... }
function mapTaxPortionToExternal(portion, currencyCode): ExternalTaxPortion { ... }
// ⚠️ Problem: ExternalTaxRate shape duplicated inline in setExternalTax actions array


// cart/mappers/custom-fields.ts
function reshapeOrderFields(fields: RawCustomField[], locale): OrderCustomFields { ... }
function reshapeShippingFields(fields: RawCustomField[], locale): ShippingCustomFields { ... }
// ⚠️ Problem: return types not exported — consumers must infer shape


// product/mappers/attributes.ts
function reshapeProductAttributes(attributesRaw, locale): Record<string, unknown> { ... }
// ⚠️ Problem: Record<string, unknown> — type unsafety leaks downstream
//             item.variant.attributes?.weightLbs accessed without type guarantee


// product/mappers/price.ts
const productPriceFragment = graphql(...)  // ← imported in cart.repo.ts but NEVER USED
function reshapePrice(rawPrice): LineItemPrice { ... }
// ⚠️ Problem: dead import of productPriceFragment in cart.repo.ts


// custom-object/custom-object.repo.ts
function writeCustomObject({ container, key, value: unknown }): ActionResult<{ id: string }> { ... }
// ⚠️ Problem: value typed as unknown — no schema/validation before write
// ⚠️ Problem: cart.id used as CustomObject key — couples cart lifecycle to delivery plan lifecycle


// client/graphql-client.ts
function graphqlClient(): { query, mutation } { ... }
// ⚠️ Problem: instantiated at module level in cart.repo.ts — singleton, untestable, no DI
// ⚠️ Problem: no retry / timeout abstraction visible at call sites


// constants.ts
const MAIN_SHIPPING_ADDRESS_KEY: string
// ⚠️ Problem: address key logic (add vs update) duplicated in:
//             setCartContactInformation + setDeliveryShippingMethods independently


// ───────────────────────────────────────────────────────────────────────
// DISCOUNT LEVELS SUMMARY
// ───────────────────────────────────────────────────────────────────────

// LEVEL 1 — Line Item (automatic, server-side)
//   LineItem.price.discounted
//   LineItem.discountedPricePerQuantity[].discountedPrice.includedDiscounts[]

// LEVEL 2 — Cart total (via discount code, managed)
//   Cart.discountCodes[]
//   Cart.discountOnTotalPrice.includedDiscounts[]

// LEVEL 3 — Shipping (automatic, server-side)
//   Cart.shipping[].shippingInfo.discountedPrice.includedDiscounts[]

// ⚠️ All 3 levels share the same IncludedDiscount shape:
//   { discountedAmount: Money, discount: { id, key, name } }
//   BUT: no shared abstraction, no unified discount reader, no aggregation utility


// ───────────────────────────────────────────────────────────────────────
// LINE ITEM TYPES — TWO KINDS, ONE REPO
// ───────────────────────────────────────────────────────────────────────

// SPOT item:
//   - no key
//   - price from CT price book
//   - inventory checked
//   - CT merges quantities automatically (with workaround for shipping targets)

// CONTRACT item:
//   - key = `contract-{year}-{number}-{line}-{suffix?}`
//   - externalPrice (cents, from contract lookup)
//   - inventoryMode: None
//   - custom fields: contract ref, contractYear, contractLineNumber, pricePerLb
//   - upsert logic: find by key → update quantity OR add new

// ⚠️ Problem: two fundamentally different item types handled by two separate methods
//             with no shared abstraction, no type discriminator, no strategy pattern


// ───────────────────────────────────────────────────────────────────────
// ERROR HANDLING — DUPLICATED PATTERN
// ───────────────────────────────────────────────────────────────────────

// Every repo method repeats this inline:
if (result.error?.networkError) return Err(domainError('NETWORK_ERROR', ...))
if (result.error?.graphQLErrors) return Err(domainError('BAD_INPUT', ...))
if (!result.data?.updateCart) return Err(domainError('UNKNOWN', ...))
return Ok(reshapeCart(result.data.updateCart, locale))

// ⚠️ Problem: error mapping logic duplicated 14+ times
//             no shared error handler / result mapper utility
