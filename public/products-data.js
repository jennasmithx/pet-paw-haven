

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
    price: 420.00,
    tag: "Feeding",
    description: "Fresh water, whenever they want it. The flowing design keeps water moving throughout the day and encourages your pet to drink more.",
    image: "images/petfountain.jpeg"
  },
  "2": {
    name: "Automatic Pet Feeder",
    price: 660.00,
    tag: "Feeding",
    description: "No more worrying about missed meals. Set their feeding schedule and let the feeder take care of the rest, even when you're busy.",
    image: "images/petfeeder.jpeg"
  },
"3": {
  name: "Pet Water Fountain",
  price: 360.00,
  tag: "Hydration",
  description: "A convenient flowing water fountain designed to keep your pet's water fresh and encourage healthy hydration throughout the day.",
  image: "images/petfountain01.jpeg",
  images: [
    "images/petfountain01.jpeg",
    "images/petfountain02.jpeg",
    "images/petfountain03.jpeg",
    "images/petfountain04.jpeg"
  ],
  colors: ["White", "Blue", "Pink"],
  colorImages: {
    "White": "images/petfountain01.jpeg",
    "Blue": "images/petfountain02.jpeg",
    "Pink": "images/petfountain03.jpeg"
  }
}
};
o
