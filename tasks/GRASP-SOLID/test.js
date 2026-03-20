'use strict';

const assert = require('node:assert/strict');
const { Money, Cart, CartRepository, CartFormatter, PromoValidator, CheckoutService } = require('./solution');

async function main() {
  // --- Test Group 1: Money (Value Object / DDD) ---

  // Creates from a numeric amount
  {
    const m = new Money(10);
    assert.strictEqual(m.amount, 10);
  }

  // .add() returns a new Money instance (immutability)
  {
    const a = new Money(10);
    const b = new Money(5.5);
    const sum = a.add(b);
    assert.strictEqual(sum.amount, 15.5);
    assert.strictEqual(a.amount, 10, 'original must not be mutated');
    assert.notStrictEqual(sum, a, 'add must return a new instance');
  }

  // .toString() formats as $X.XX
  {
    const m = new Money(9.5);
    assert.strictEqual(m.toString(), '$9.50');
  }

  // .toString() with zero
  {
    const m = new Money(0);
    assert.strictEqual(m.toString(), '$0.00');
  }

  // Equality by value, not reference
  {
    const a = new Money(7);
    const b = new Money(7);
    assert.ok(a.equals(b), 'same amount should be equal');
    assert.ok(!a.equals(new Money(8)), 'different amount should not be equal');
  }

  console.log('✓ Money tests passed');

  // --- Test Group 2: Cart (Entity + Aggregate Root / DDD) ---

  // Constructs with id and items
  {
    const cart = new Cart('cart-1', [{ price: 10, qty: 2 }]);
    assert.strictEqual(cart.id, 'cart-1');
  }

  // isEmpty() returns true when no items
  {
    const cart = new Cart('cart-2', []);
    assert.ok(cart.isEmpty());
  }

  // isEmpty() returns false with items
  {
    const cart = new Cart('cart-3', [{ price: 5, qty: 1 }]);
    assert.ok(!cart.isEmpty());
  }

  // getTotal() returns correct Money value
  {
    const cart = new Cart('cart-4', [
      { price: 10, qty: 2 },
      { price: 5, qty: 3 },
    ]);
    const total = cart.getTotal();
    assert.ok(total instanceof Money, 'getTotal must return a Money instance');
    assert.strictEqual(total.amount, 35); // (10*2) + (5*3)
  }

  // getTotal() on empty cart returns Money(0)
  {
    const cart = new Cart('cart-5', []);
    assert.strictEqual(cart.getTotal().amount, 0);
  }

  // Aggregate root — items are not directly accessible from outside
  {
    const items = [{ price: 10, qty: 1 }];
    const cart = new Cart('cart-6', items);
    items.push({ price: 999, qty: 1 }); // mutate original array
    assert.strictEqual(cart.getTotal().amount, 10, 'cart must copy items, not hold a reference');
  }

  console.log('✓ Cart tests passed');

  // --- Test Group 3: CartRepository (SRP + DIP) ---

  // Accepts injected api client (DIP)
  {
    const mockClient = { getCart: async () => ({ id: 'cart-1', items: [{ price: 10, qty: 1 }] }) };
    const repo = new CartRepository(mockClient);
    assert.ok(repo, 'should construct with injected client');
  }

  // getCart() delegates to client and returns a Cart entity
  {
    const mockClient = {
      getCart: async (cartId) => ({ id: cartId, items: [{ price: 5, qty: 2 }] }),
    };
    const repo = new CartRepository(mockClient);
    const cart = await repo.getCart('cart-99');
    assert.ok(cart instanceof Cart, 'must return a Cart entity, not raw data');
    assert.strictEqual(cart.id, 'cart-99');
    assert.strictEqual(cart.getTotal().amount, 10);
  }

  console.log('✓ CartRepository tests passed');

  // --- Test Group 4: CartFormatter (SRP + Information Expert) ---

  // Formats cart total using Money.toString()
  {
    const cart = new Cart('cart-fmt', [
      { price: 12, qty: 1 },
      { price: 3.5, qty: 2 },
    ]);
    const formatter = new CartFormatter();
    const result = formatter.formatTotal(cart);
    assert.strictEqual(result, 'Total: $19.00');
  }

  // Formats empty cart
  {
    const cart = new Cart('cart-empty', []);
    const formatter = new CartFormatter();
    assert.strictEqual(formatter.formatTotal(cart), 'Total: $0.00');
  }

  console.log('✓ CartFormatter tests passed');

  // --- Test Group 5: PromoValidator (OCP — Rule Chain) ---

  // Rejects codes shorter than 3 characters
  {
    const v = new PromoValidator();
    const result = v.validate('PR');
    assert.ok(!result.valid);
    assert.ok(result.reasons.some((r) => r.includes('3')), 'should mention length');
  }

  // Rejects codes not starting with PROMO
  {
    const v = new PromoValidator();
    const result = v.validate('DISCOUNT10');
    assert.ok(!result.valid);
    assert.ok(result.reasons.some((r) => r.includes('PROMO')), 'should mention PROMO prefix');
  }

  // Rejects codes containing EXPIRED
  {
    const v = new PromoValidator();
    const result = v.validate('PROMO_EXPIRED_2024');
    assert.ok(!result.valid);
    assert.ok(result.reasons.some((r) => r.includes('EXPIRED')), 'should mention EXPIRED');
  }

  // Accepts valid promo code
  {
    const v = new PromoValidator();
    const result = v.validate('PROMO25');
    assert.ok(result.valid);
    assert.strictEqual(result.reasons.length, 0);
  }

  // OCP proof — add a custom rule without editing existing code
  {
    const v = new PromoValidator();
    v.addRule((code) => ({
      valid: code.length <= 20,
      reason: 'Code must be 20 characters or fewer',
    }));
    const tooLong = v.validate('PROMO_' + 'X'.repeat(20));
    assert.ok(!tooLong.valid, 'custom rule should reject long codes');

    const ok = v.validate('PROMO25');
    assert.ok(ok.valid, 'existing rules should still work');
  }

  console.log('✓ PromoValidator tests passed');

  // --- Test Group 6: CheckoutService (SRP + DIP — Orchestrator) ---

  // Calls collaborators in correct order
  {
    const callOrder = [];
    const mockRepo = {
      getCart: async (cartId) => {
        callOrder.push('getCart');
        return new Cart(cartId, [{ price: 10, qty: 1 }]);
      },
    };
    const mockOrderApi = {
      submitOrder: async (data) => {
        callOrder.push('submitOrder');
        return { id: 'order-1' };
      },
    };
    const mockLogger = { log: (msg) => callOrder.push('log') };
    const mockAnalytics = { track: (evt, data) => callOrder.push('track') };
    const mockEmail = { send: async (to, subject, body) => callOrder.push('send') };

    const service = new CheckoutService({
      cartRepository: mockRepo,
      orderApi: mockOrderApi,
      logger: mockLogger,
      analytics: mockAnalytics,
      emailService: mockEmail,
    });

    await service.checkout('cart-1', { email: 'a@b.com' });
    assert.deepStrictEqual(callOrder, ['getCart', 'submitOrder', 'log', 'track', 'send']);
  }

  // Throws on empty cart
  {
    const mockRepo = {
      getCart: async () => new Cart('cart-empty', []),
    };
    const service = new CheckoutService({
      cartRepository: mockRepo,
      orderApi: {},
      logger: { log() {} },
      analytics: { track() {} },
      emailService: { send: async () => {} },
    });

    await assert.rejects(
      () => service.checkout('cart-empty', { email: 'a@b.com' }),
      { message: 'Cart is empty' }
    );
  }

  // Throws on missing email
  {
    const mockRepo = {
      getCart: async () => new Cart('cart-1', [{ price: 10, qty: 1 }]),
    };
    const service = new CheckoutService({
      cartRepository: mockRepo,
      orderApi: {},
      logger: { log() {} },
      analytics: { track() {} },
      emailService: { send: async () => {} },
    });

    await assert.rejects(
      () => service.checkout('cart-1', {}),
      { message: 'Email required' }
    );
  }

  console.log('✓ CheckoutService tests passed');
}

main().catch((err) => { console.error(err); process.exit(1); });
