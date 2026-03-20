'use strict';

// Topic: GRASP/SOLID + DDD — Refactored from CartManager god class
// Paradigm: OOP with DDD tactical patterns
// Patterns addressed: SRP, DIP, OCP, High Cohesion, Information Expert,
//                     Value Object, Entity, Aggregate Root
// See: docs/grasp-solid.md

// --- Section 1: Money (Value Object / DDD) ---

class Money {
  /** @type {number} */
  #amount;

  /**
   * @param {number} amount - Numeric monetary value.
   *   Must be a finite number — NaN or Infinity would silently
   *   corrupt every calculation downstream.
   */
  constructor(amount) {
    this.#amount = amount;
  }

  /**
   * Raw numeric value. Read-only access to the private field.
   * @returns {number}
   */
  get amount() {
    return this.#amount;
  }

  /**
   * Returns a new Money with the combined amount.
   * Does not mutate — key Value Object invariant.
   *
   * @param {Money} other - Another Money instance to add
   * @returns {Money} A new Money instance with the summed amount
   */
  add(other) {
    return new Money(this.#amount + other.amount);
  }

  /**
   * Formats as $X.XX. Information Expert — the value that holds
   * the amount is the right place for display formatting.
   *
   * @returns {string} Dollar-formatted string (e.g., "$9.50")
   */
  toString() {
    return `$${this.#amount.toFixed(2)}`;
  }

  /**
   * Value equality — two Money instances are equal if their amounts match.
   * Entities compare by identity; Value Objects compare by value.
   *
   * @param {Money} other - Another Money instance to compare
   * @returns {boolean}
   */
  equals(other) {
    return this.#amount === other.amount;
  }
}

// --- Section 2: Cart (Entity + Aggregate Root / DDD) ---

/**
 * Cart entity and aggregate root.
 * Identity is by `id` (entity), not by value.
 * Guards its own invariants — outside code never reaches into items directly.
 * getTotal() uses Money value object (Information Expert — cart owns its items).
 */
class Cart {
  /** @type {string} */
  #id;

  /** @type {Array<{ price: number, qty: number }>} */
  #items;

  /**
   * @param {string} id - Unique cart identifier (entity identity).
   * @param {Array<{ price: number, qty: number }>} items - Line items.
   *   Copied on construction — the aggregate root owns its children.
   */
  constructor(id, items) {
    this.#id = id;
    this.#items = [...items];
  }

  /** @returns {string} */
  get id() {
    return this.#id;
  }

  /**
   * Aggregate invariant check — used by CheckoutService before proceeding.
   * @returns {boolean}
   */
  isEmpty() {
    return this.#items.length === 0;
  }

  /**
   * Reduces items into a Money total.
   * Information Expert: the cart holds the items, so it calculates the total.
   *
   * @returns {Money} Total price as a value object
   */
  getTotal() {
    const raw = this.#items.reduce((sum, item) => sum + item.price * item.qty, 0);
    return new Money(raw);
  }
}

// --- Section 3: CartRepository ---

/**
 * Data fetching only. One reason to change: the data access layer.
 * API client is injected (DIP) — no concrete dependency inside.
 * Returns Cart entities, not raw API responses — keeps the domain model clean.
 */
class CartRepository {
  /** @type {{ getCart: function }} */
  #client;

  /**
   * @param {{ getCart: (cartId: string) => Promise<{ id: string, items: Array }> }} client
   *   Injected API client. Must have a `.getCart(cartId)` method.
   */
  constructor(client) {
    this.#client = client;
  }

  /**
   * Fetches cart data and returns a Cart entity.
   *
   * @param {string} cartId
   * @returns {Promise<Cart>} A Cart aggregate root — not raw data
   */
  async getCart(cartId) {
    const data = await this.#client.getCart(cartId);
    return new Cart(data.id, data.items);
  }
}

// --- Section 4: CartFormatter (SRP + Information Expert) ---

/**
 * Formats cart data for display. One reason to change: display format.
 * Delegates price formatting to Money.toString() — Information Expert
 * says the monetary value knows how to format itself.
 */
class CartFormatter {
  /**
   * Returns a formatted total string for display.
   *
   * @param {Cart} cart - Cart entity to format
   * @returns {string} Formatted string like "Total: $19.00"
   */
  formatTotal(cart) {
    return `Total: ${cart.getTotal().toString()}`;
  }
}

// --- Section 5: PromoValidator (OCP — Rule Chain) ---

/**
 * Validates promo codes using a chain of rule functions.
 */
class PromoValidator {
  /** @type {Array<(code: string) => { valid: boolean, reason?: string }>} */
  #rules = [];

  constructor() {
    // Default rules — each is independent and self-describing.
    this.#rules = [
      (code) => ({
        valid: code.length >= 3,
        reason: 'Code must be at least 3 characters',
      }),
      (code) => ({
        valid: code.startsWith('PROMO'),
        reason: 'Code must start with PROMO',
      }),
      (code) => ({
        valid: !code.includes('EXPIRED'),
        reason: 'Code must not contain EXPIRED',
      }),
    ];
  }

  /**
   * Extend validation without modifying existing rules (OCP).
   *
   * @param {(code: string) => { valid: boolean, reason?: string }} rule
   *   A function that takes a code string and returns a validation result.
   */
  addRule(rule) {
    this.#rules.push(rule);
  }

  /**
   * Runs all rules against the code. Collects all failures — does not
   * short-circuit, so the caller gets a complete list of what's wrong.
   *
   * @param {string} code - Promo code to validate
   * @returns {{ valid: boolean, reasons: string[] }}
   */
  validate(code) {
    const reasons = [];
    for (const rule of this.#rules) {
      const result = rule(code);
      if (!result.valid) {
        reasons.push(result.reason);
      }
    }
    return { valid: reasons.length === 0, reasons };
  }
}

// Usage:
//
// --- Basic validation ---
// const validator = new PromoValidator();
// validator.validate('PROMO25');
// → { valid: true, reasons: [] }
//
// validator.validate('PR');
// → { valid: false, reasons: ['Code must be at least 3 characters', 'Code must start with PROMO'] }
// Note: all rules run — you get every failure at once, not just the first.

// --- Section 6: CheckoutService ---

/**
 * Orchestrates the checkout flow. All dependencies injected.
 * This class has one reason to change: the checkout coordination sequence.
 * Contains zero business logic — just calls collaborators in order.
 */
class CheckoutService {
  #cartRepository;
  #orderApi;
  #logger;
  #analytics;
  #emailService;

  /**
   * @param {Object} deps - All dependencies injected via a single config object.
   * @param {{ getCart: function }} deps.cartRepository - Fetches Cart entities
   * @param {{ submitOrder: function }} deps.orderApi - Places orders
   * @param {{ log: function }} deps.logger - Logs events
   * @param {{ track: function }} deps.analytics - Tracks analytics events
   * @param {{ send: function }} deps.emailService - Sends notification emails
   */
  constructor({ cartRepository, orderApi, logger, analytics, emailService }) {
    this.#cartRepository = cartRepository;
    this.#orderApi = orderApi;
    this.#logger = logger;
    this.#analytics = analytics;
    this.#emailService = emailService;
  }

  /**
   * Executes the checkout flow in sequence:
   * 1. Fetch cart (via repository)
   * 2. Validate cart not empty (aggregate root invariant)
   * 3. Validate email exists
   * 4. Submit order
   * 5. Log
   * 6. Track analytics
   * 7. Send confirmation email
   *
   * @param {string} cartId
   * @param {{ email: string }} userDetails
   * @returns {Promise<{ id: string }>} The placed order
   * @throws {Error} If cart is empty or email is missing
   */
  async checkout(cartId, userDetails) {
    const cart = await this.#cartRepository.getCart(cartId);
    if (cart.isEmpty()) throw new Error('Cart is empty');
    if (!userDetails.email) throw new Error('Email required');
    const order = await this.#orderApi.submitOrder({ cartId, ...userDetails });
    this.#logger.log(`Order ${order.id} placed`);
    this.#analytics.track('order_placed', { orderId: order.id });
    await this.#emailService.send(userDetails.email, 'Order confirmation', order);
    return order;
  }
}

module.exports = { Money, Cart, CartRepository, CartFormatter, PromoValidator, CheckoutService };
