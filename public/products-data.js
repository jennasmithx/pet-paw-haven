

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
    price: 550.00,
    tag: "Feeding",
    description: "Fresh water, whenever they want it. The flowing design keeps water moving throughout the day and encourages your pet to drink more.",
    image: "images/petfountain.jpg"
  },
  "2": {
    name: "Automatic Pet Feeder",
    price: 550.00,
    tag: "Feeding",
    description: "No more worrying about missed meals. Set their feeding schedule and let the feeder take care of the rest, even when you're busy.",
    image: "images/petfeeder.jpeg"
  }
};
