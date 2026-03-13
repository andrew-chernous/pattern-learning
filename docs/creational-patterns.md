# Creational Patterns: Singleton, Factory, Builder

## Why
- Object creation is duplicated and scattered — every file just does `new ApiClient()` like it's a free buffet
- Conditional object creation is buried in business logic instead of being isolated
- Complex objects are assembled inline making them impossible to reuse or test

---

## Code to Refactor

### ❌ Problem 1 — ApiClient instantiated everywhere (needs: Singleton)

```js
// file: cart.service.js
const client1 = new ApiClient({ baseUrl: 'https://api.example.com', timeout: 3000 });
const cartData = await client1.get('/cart');

// file: order.service.js
const client2 = new ApiClient({ baseUrl: 'https://api.example.com', timeout: 3000 });
const orderData = await client2.get('/orders');

// file: product.service.js
const client3 = new ApiClient({ baseUrl: 'https://api.example.com', timeout: 3000 });
const products = await client3.get('/products');
```

### ❌ Problem 2 — Conditional object creation in business logic (needs: Factory)

```js
function getNotification(type, message) {
  let notification;
  if (type === 'success') {
    notification = { type: 'success', message, icon: '✅', timeout: 3000 };
  } else if (type === 'error') {
    notification = { type: 'error', message, icon: '❌', timeout: 5000 };
  } else if (type === 'warning') {
    notification = { type: 'warning', message, icon: '⚠️', timeout: 4000 };
  }
  return notification;
}

const n1 = getNotification('success', 'Order placed!');
const n2 = getNotification('error', 'Payment failed!');
```

### ❌ Problem 3 — Complex query object copy-pasted everywhere (needs: Builder)

```js
const query1 = {
  filters: { status: 'active', category: 'electronics' },
  pagination: { page: 1, limit: 20 },
  sort: { field: 'price', direction: 'asc' },
  include: ['variants', 'images'],
};

const query2 = {
  filters: { status: 'active', category: 'clothing' },
  pagination: { page: 1, limit: 20 },
  sort: { field: 'price', direction: 'asc' },
  include: ['variants', 'images'],
};
```

---

## Implementation Steps

1. Refactor `ApiClient` instantiation to **Singleton** — one shared instance, configured once
2. Refactor `getNotification` conditional logic to **Factory** — clean creation per type
3. Refactor inline query objects to **Builder** — chainable, reusable query construction
4. Cover each refactored piece with unit tests

---

## Doneness Criteria

- [ ] `ApiClient` is instantiated exactly once across the entire app
- [ ] Factory hides all `if/else` — adding a new notification type requires zero changes to existing code
- [ ] Builder allows constructing any query variant without copy-pasting object literals
- [ ] Unit tests prove no behavior regression
