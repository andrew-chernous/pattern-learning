# GRASP & SOLID: Audit and Refactor the God Object

## Why
- God objects are doing the work of five engineers — high coupling, zero cohesion, maximum suffering
- Modules directly depend on concrete implementations instead of abstractions — replacing anything is a full-day ordeal
- These violations are blocking the path to a maintainable, scalable architecture

---

## Code to Refactor

### ❌ God Class — CartManager does everything

```js
// Violations to find and annotate before touching any code:
// - SRP: class has at least 5 different reasons to change
// - DIP: concrete dependencies instantiated inside constructor
// - OCP: validatePromoCode must be edited to add new rules
// - Low Cohesion (GRASP): unrelated responsibilities grouped in one class
// - Information Expert (GRASP): formatting logic doesn't belong here

class CartManager {
  constructor() {
    // DIP violation — direct concrete dependency, impossible to swap or mock
    this.api = new CommerceToolsApiClient();
    this.logger = new ConsoleLogger();
    this.analytics = new GoogleAnalytics();
  }

  async loadCart(cartId) {
    this.logger.log('Loading cart...');
    const cart = await this.api.getCart(cartId);
    this.analytics.track('cart_loaded', { cartId });
    return cart;
  }

  calculateTotal(items) {
    // SRP violation — calculating AND formatting in one method
    const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    return `$${total.toFixed(2)}`; // formatting mixed with calculation
  }

  validatePromoCode(code) {
    // OCP violation — must edit this method to add every new rule
    if (code.length < 3) return false;
    if (!code.startsWith('PROMO')) return false;
    if (code.includes('EXPIRED')) return false;
    return true;
  }

  async checkout(cartId, userDetails) {
    // SRP violation — fetching + validation + submission + notification + logging
    const cart = await this.api.getCart(cartId);
    if (!cart.items.length) throw new Error('Cart is empty');
    if (!userDetails.email) throw new Error('Email required');
    const order = await this.api.submitOrder({ cartId, ...userDetails });
    this.logger.log(`Order ${order.id} placed`);
    this.analytics.track('order_placed', { orderId: order.id });
    await this.emailService.send(userDetails.email, 'Order confirmation', order);
    return order;
  }
}
```

---

## Implementation Steps

1. **Annotate first** — add a comment above each method/line identifying which GRASP/SOLID principle is violated and why
2. **Split `CartManager`** into focused single-responsibility classes:
   - `CartRepository` — data fetching only
   - `CartCalculator` — total calculation only
   - `CartFormatter` — formatting only
   - `PromoValidator` — promo code validation
   - `CheckoutService` — orchestrates checkout flow
3. **Inject all dependencies** via constructor — no `new ConcreteClass()` inside business logic
4. **Extract promo validation** into a rule chain (OCP) — adding a new rule = adding a new class, not editing existing ones
5. **Write tests before refactoring** to lock current behavior, verify they still pass after

---

## Doneness Criteria

- [ ] `CartManager` no longer exists as a god object
- [ ] Each new class has exactly one reason to change
- [ ] Zero `new ConcreteClass()` calls inside business logic — all injected
- [ ] Adding a new promo validation rule requires zero edits to existing code
- [ ] All tests pass before and after refactoring
- [ ] Each violation is documented as a comment in the original code before refactoring begins
