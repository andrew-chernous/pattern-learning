'use strict';

// Topic: SoC, SRP, code characteristics, V8
// Tasks for rewriting:
//   - Apply optimizations of computing resources: processor, memory
//   - Minimize cognitive complexity
//   - Respect SRP and SoC
//   - Improve readability (understanding), reliability
//   - Optimize for maintainability, reusability, flexibility
//   - Make code testable
//   - Implement simple unittests without frameworks
// Additional tasks:
//   - Try to implement in multiple paradigms: OOP, FP, procedural, mixed
//   - Prepare load testing and trace V8 deopts

// Create Iterator for given dataset with Symbol.asyncIterator
// Use for..of to iterate it and pass data to Basket
// Basket is limited to certain amount
// After iteration ended Basket should return Thenable
// to notify us with final list of items, total and
// escalated errors


class PurchaseIterator {
  #items;
  #index;

  constructor(items) {
    this.#items = items;
    this.#index = 0;
  }

  static create(items) {
    return new PurchaseIterator(items);
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  async next() {
    const index = this.#index++;
    if (index < this.#items.length) {
      return { done: false, value: this.#items[index] };
    }
    return { done: true, value: undefined };
  }
}

class Basket {
  #items;
  #errors;
  #total;
  #limit;
  #callback;

  constructor({ limit }, callback) {
    this.#items = [];
    this.#errors = [];
    this.#total = 0;
    this.#limit = limit;
    this.#callback = callback;
  }

  add(item) {
    if (this.#total + item.price > this.#limit) {
      this.#errors.push({ item, message: `Price ${item.price} exceeds limit` });
      return;
    }
    this.#items.push(item);
    this.#total += item.price;
  }

  end() {
    const result = this.#finalize();
    this.#callback(result.items, result.total);
    return { then: (resolve) => resolve(result) };
  }

  #finalize() {
    return {
      items: [...this.#items],
      total: this.#total,
      errors: [...this.#errors],
    };
  }
}

const purchase = [
  { name: 'Laptop', price: 1500 },
  { name: 'Mouse', price: 25 },
  { name: 'Keyboard', price: 100 },
  { name: 'HDMI cable', price: 10 },
  { name: 'Bag', price: 50 },
  { name: 'Mouse pad', price: 5 },
];

const main = async () => {
  const goods = PurchaseIterator.create(purchase);
  const basket = new Basket({ limit: 1050 }, (items, total) => {
    console.log(total);
  });
  for await (const item of goods) {
    basket.add(item);
  }
  const { items, total, errors } = await basket.end();
  console.log('Items:', items.map((i) => `${i.name}(${i.price})`));
  console.log('Total:', total);
  console.log('Errors:', errors.map((e) => ({ item: `${e.item.name}(${e.item.price})`, message: e.message })));
};