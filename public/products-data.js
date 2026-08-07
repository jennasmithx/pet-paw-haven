// products-data.js — the single source of truth for product details
// (name, price, tag, description) used across index.html, products.html,
// product.html, and the quick-view modal. Add a new product here once;
// every page that references its id picks it up automatically.
//
// The "id" key must match the real id of that product row in your
// Supabase products table (see schema.sql).

const PRODUCTS = {
  "1": {
    name: "Premium Pet Water Fountain",
    price: 449.00,
    tag: "Feeding",
    description: "A weighted stoneware bowl with a raised ridge pattern that slows fast eaters naturally — no plastic inserts, dishwasher safe, finished in matte charcoal.",
  },
  "2": {
    name: "Automatic Pet Feeder",
    price: 449.00,
    tag: "Feeding",
    description: "A weighted stoneware bowl with a raised ridge pattern that slows fast eaters naturally — no plastic inserts, dishwasher safe, finished in matte charcoal.",
  }
};