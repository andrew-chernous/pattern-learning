'use strict';

// Topic: GRASP/SOLID + DDD — Audit and Refactor the God Object
// Code characteristics:
//   - God class with 5+ reasons to change (SRP violation)
//   - Concrete dependencies hardcoded in constructor (DIP violation)
//   - Conditional validation requires editing to extend (OCP violation)
//   - Unrelated responsibilities grouped together (Low Cohesion — GRASP)
//   - Logic assigned to wrong class (Information Expert — GRASP)
// Tasks for rewriting:
//   - Split CartManager into focused single-responsibility classes
//   - Inject all dependencies via constructor (DIP)
//   - Extract promo validation into a rule chain (OCP)
//   - Introduce Money value object and Cart entity/aggregate root (DDD)

// --- God Class: CartManager does everything ---

// LOW COHESION (GRASP): This class groups cart loading, calculation,
// formatting, promo validation, and checkout — five unrelated concerns.
// High cohesion means each class groups only things that naturally belong together.
class CartManager {
  constructor() {
    // DIP violation — concrete dependencies instantiated directly.
    // Impossible to swap for testing or replace with a different provider.
    // Fix: inject via constructor parameters.
    this.api = new CommerceToolsApiClient();
    this.logger = new ConsoleLogger();
    this.analytics = new GoogleAnalytics();
    // DIP violation + BUG — emailService is used in checkout() but never
    // initialized here. Undeclared dependency that will throw at runtime.
  }

  async loadCart(cartId) {
    // SRP violation — data fetching mixed with logging and analytics tracking.
    // Three reasons to change: API contract, log format, analytics provider.
    // INFORMATION EXPERT (GRASP) — logging/analytics belong to cross-cutting
    // concerns, not to the data-fetching method.
    this.logger.log('Loading cart...');
    const cart = await this.api.getCart(cartId);
    this.analytics.track('cart_loaded', { cartId });
    return cart;
  }

  calculateTotal(items) {
    // SRP violation — calculating AND formatting in one method.
    // Two reasons to change: pricing logic vs. display format.
    // INFORMATION EXPERT (GRASP) — formatting belongs to whatever
    // owns the monetary value (a Money value object), not to CartManager.
    const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    return `$${total.toFixed(2)}`; // formatting mixed with calculation
  }

  validatePromoCode(code) {
    // OCP violation — must edit this method to add every new validation rule.
    // Open/Closed says: open for extension, closed for modification.
    // Fix: extract into a rule chain where adding a rule = adding a class/function.
    if (code.length < 3) return false;
    if (!code.startsWith('PROMO')) return false;
    if (code.includes('EXPIRED')) return false;
    return true;
  }

  async checkout(cartId, userDetails) {
    // SRP violation — five responsibilities in one method:
    //   1. Data fetching (getCart)
    //   2. Validation (empty cart, missing email)
    //   3. Order submission (submitOrder)
    //   4. Logging + analytics (log, track)
    //   5. Notification (emailService.send)
    // Each is a separate reason to change.
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
