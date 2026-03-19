'use strict';

// Topic: Creational Patterns — Singleton, Factory, Builder
// Paradigm: Mixed (OOP for Singleton/Builder, config-driven for Factory)
// Patterns addressed: duplicated instantiation, conditional creation, copy-pasted literals
// See: docs/creational-patterns.md

// --- Section 1: Singleton + Composition (ApiService) ---

class ApiService {
  /** @type {HttpClient} */
  #client;

  /**
   * @param {HttpClient} client
   * @throws {Error}
   */
  constructor(client) {
    if (!client || typeof client.get !== 'function') {
      throw new Error('ApiService requires a client with a .get(path) method');
    }
    this.#client = client;
  }

  getCart() {
    return this.#client.get('/cart');
  }

  getOrders() {
    return this.#client.get('/orders');
  }

  getProducts() {
    return this.#client.get('/products');
  }
}

/**
 * Module-level singleton instance.
 */
let apiServiceInstance = null;

/**
 * Returns the singleton ApiService instance.
 * @param {HttpClient} [client]
 * @returns {ApiService}
 * @throws {Error}
 */
const getApiService = (client) => {
  if (!apiServiceInstance) {
    if (!client) {
      throw new Error('getApiService: client is required on first call');
    }
    apiServiceInstance = new ApiService(client);
  }
  return apiServiceInstance;
};

/**
 * Replaces the singleton instance — used for testing or reconfiguration.
 * Accepts a new client, creates a fresh ApiService, and swaps the singleton.
 *
 * @param {HttpClient} client - New client to inject
 * @returns {ApiService} The new singleton instance
 */
const resetApiService = (client) => {
  apiServiceInstance = new ApiService(client);
  return apiServiceInstance;
};

// Usage:
// const client = new ApiClient({ baseUrl: 'https://api.example.com', timeout: 3000 });
// const api = getApiService(client);       // first call — creates singleton
// const cart = await api.getCart();         // delegates to client.get('/cart')
// const orders = await api.getOrders();    // delegates to client.get('/orders')
//
// const sameApi = getApiService();          // anywhere else — returns same instance
// sameApi === api;                          // true — single shared instance

// --- Section 2: Factory (Notification) ---

/**
 * Base defaults shared by all notification types.
 */
const NOTIFICATION_DEFAULTS = Object.freeze({
  timeout: 3000,
  dismissible: true,
});

/**
 * Type-specific configuration. Each entry only declares what differs
 * from NOTIFICATION_DEFAULTS — keeps the map DRY.
 * Adding a new notification type = adding one entry here.
 */
const NOTIFICATION_TYPES = Object.freeze({
  success: { icon: '✅' },
  error: { icon: '❌', timeout: 5000, retryable: true },
  warning: { icon: '⚠️', timeout: 4000 },
});

/**
 *
 * @param {string} type - Notification type key (must exist in NOTIFICATION_TYPES)
 * @param {string} message - Display message
 * @param {Object} [overrides={}] - Optional one-off overrides (e.g., { timeout: 1000 })
 * @returns {{ type: string, message: string, icon: string, timeout: number, dismissible: boolean }}
 * @throws {Error} If type is not found in NOTIFICATION_TYPES
 */
const createNotification = (type, message, overrides = {}) => {
  const typeConfig = NOTIFICATION_TYPES[type];
  if (!typeConfig) {
    throw new Error(`Unknown notification type: "${type}". Valid types: ${Object.keys(NOTIFICATION_TYPES).join(', ')}`);
  }
  return { ...NOTIFICATION_DEFAULTS, ...typeConfig, ...overrides, type, message };
};

// Usage:
// createNotification('success', 'Order placed!');
// → { timeout: 3000, dismissible: true, icon: '✅', type: 'success', message: 'Order placed!' }

// --- Section 3: Builder (Query) ---

/**
 * Valid sort directions. Used by `.sort()` validation
 * to prevent silent wrong-order results.
 */
const VALID_SORT_DIRECTIONS = Object.freeze(['asc', 'desc']);

/**
 * Builds complex query objects step-by-step through a chainable API.
 * Mutable builder (classic GoF) — internal state accumulates across calls,
 * `.build()` returns a fresh snapshot without resetting the builder.
 *
 * Sensible defaults: empty filters, page 1 / limit 20, no sort, no includes.
 * Every method returns `this` for chaining.
 *
 * @example
 * const query = new QueryBuilder()
 *   .filter('status', 'active')
 *   .filter('category', 'electronics')
 *   .paginate(1, 20)
 *   .sort('price', 'asc')
 *   .include(['variants', 'images'])
 *   .build();
 */
class QueryBuilder {
  #filters = {};
  #pagination = { page: 1, limit: 20 };
  #sort = null;
  #include = [];

  /**
   * Adds a filter key-value pair. Additive — calling multiple times
   * merges filters rather than replacing them.
   *
   * @param {string} key - Filter field name
   * @param {*} value - Filter value
   * @returns {QueryBuilder} this (for chaining)
   */
  filter(key, value) {
    this.#filters[key] = value;
    return this;
  }

  /**
   * Sets pagination parameters.
   *
   * @param {number} page - Page number (must be a positive integer)
   * @param {number} limit - Items per page (must be a positive integer)
   * @returns {QueryBuilder} this (for chaining)
   * @throws {Error} If page or limit is not a positive integer —
   *   a negative page would silently produce empty results from most APIs,
   *   and limit=0 would return nothing without any visible error.
   */
  paginate(page, limit) {
    if (!Number.isInteger(page) || page <= 0) {
      throw new Error(`page must be a positive integer, got: ${page}`);
    }
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error(`limit must be a positive integer, got: ${limit}`);
    }
    this.#pagination = { page, limit };
    return this;
  }

  /**
   * Sets sort field and direction.
   *
   * @param {string} field - Field name to sort by
   * @param {'asc' | 'desc'} direction - Sort direction
   * @returns {QueryBuilder} this (for chaining)
   * @throws {Error} If direction is not 'asc' or 'desc' —
   *   an invalid direction would silently produce unsorted or wrongly-sorted results.
   */
  sort(field, direction) {
    if (!VALID_SORT_DIRECTIONS.includes(direction)) {
      throw new Error(`sort direction must be one of [${VALID_SORT_DIRECTIONS}], got: "${direction}"`);
    }
    this.#sort = { field, direction };
    return this;
  }

  /**
   * Sets the list of relations/fields to include in the response.
   *
   * @param {string[]} fields - Array of relation names to include
   * @returns {QueryBuilder} this (for chaining)
   */
  include(fields) {
    this.#include = [...fields];
    return this;
  }

  /**
   * Returns a plain object snapshot of the current query state.
   * Shallow-copies internal state — the builder can be reused after `.build()`.
   * Calling `.build()` multiple times returns independent snapshots.
   *
   * @returns {{ filters: Object, pagination: { page: number, limit: number }, sort: { field: string, direction: string } | null, include: string[] }}
   */
  build() {
    return {
      filters: { ...this.#filters },
      pagination: { ...this.#pagination },
      sort: this.#sort ? { ...this.#sort } : null,
      include: [...this.#include],
    };
  }
}

// Usage:
// const query = new QueryBuilder()
//   .filter('status', 'active')
//   .filter('category', 'electronics')
//   .paginate(1, 20)
//   .sort('price', 'asc')
//   .include(['variants', 'images'])
//   .build();
// → { filters: { status: 'active', category: 'electronics' },
//     pagination: { page: 1, limit: 20 },
//     sort: { field: 'price', direction: 'asc' },
//     include: ['variants', 'images'] }
