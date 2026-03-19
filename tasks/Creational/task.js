'use strict';

// Topic: Creational Patterns — Singleton, Factory, Builder
// Code characteristics:
//   - Identify duplicated object creation (Singleton candidate)
//   - Identify conditional creation buried in business logic (Factory candidate)
//   - Identify copy-pasted complex object literals (Builder candidate)
// Tasks for rewriting:
//   - Refactor ApiClient instantiation to Singleton — one shared instance
//   - Refactor getNotification to Factory — config-map with layered defaults
//   - Refactor query objects to Builder — chainable, reusable construction

// --- Problem 1: ApiClient instantiated everywhere (needs: Singleton) ---

// file: cart.service.js
const client1 = new ApiClient({ baseUrl: 'https://api.example.com', timeout: 3000 });
const cartData = await client1.get('/cart');

// file: order.service.js
const client2 = new ApiClient({ baseUrl: 'https://api.example.com', timeout: 3000 });
const orderData = await client2.get('/orders');

// file: product.service.js
const client3 = new ApiClient({ baseUrl: 'https://api.example.com', timeout: 3000 });
const products = await client3.get('/products');

// --- Problem 2: Conditional object creation in business logic (needs: Factory) ---

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

// --- Problem 3: Complex query object copy-pasted everywhere (needs: Builder) ---

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
