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
  // Hint: call async function without await
  for await (const item of goods) {
    basket.add(item);
  }
  // Hint: Add const { items, total, errors } = await basket.end();
};

main();