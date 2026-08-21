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
    image: "images/petfountain.jpeg",
    stock: "in"
  },
  "2": {
    name: "Automatic Pet Feeder",
    price: 660.00,
    tag: "Feeding",
    description: "No more worrying about missed meals. Set their feeding schedule and let the feeder take care of the rest, even when you're busy.",
    image: "images/petfeeder.jpeg",
    stock: "in"
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
  },
  stock: "in"
}
,
"4": {
  name: "Interactive Vibrating Cat Ball",
  price: 160.00,
  tag: "Toys & Play",
  description: "Turn your cat's hunting instinct into playtime. This vibrating ball senses motion and reacts with gentle buzzing and rolling the moment your cat taps it, keeping them engaged solo or with you around. USB-rechargeable, quiet motor, and a tough outer shell built to survive enthusiastic pouncing and the odd fall off the couch.",
  image: "images/catball01.jpeg",
  images: [
    "images/catball01.jpeg",
    "images/catball02.jpeg",
    "images/catball03.jpeg",
    "images/catball04.jpeg",
    "images/catball05.jpeg"
  ],
  colors: ["Blue", "Pink"],
  colorImages: {
    "Blue": "images/catball02.jpeg",
    "Pink": "images/catball03.jpeg"
  },
  stock: "in"
}
,
"5": {
  name: "Pet Steam Brush",
  price: 160.00,
  tag: "Grooming & Care",
  description: "Warm steam meets soft bristles to loosen tangles, lift loose fur, and gently massage your pet's coat as you brush — safe for both cats and dogs. The steam opens up the coat so grooming goes faster and feels better for them, with far less tugging than a dry brush and noticeably less fur left around the house.",
  image: "images/steambrush01.jpeg",
  images: [
    "images/steambrush01.jpeg",
    "images/steambrush02.jpeg",
    "images/steambrush03.jpeg",
    "images/steambrush04.jpeg",
    "images/steambrush05.jpeg"
  ],
  colors: ["White", "Beige"],
  colorImages: {
    "White": "images/steambrush01.jpeg",
    "Beige": "images/steambrush02.jpeg"
  },
  stock: "in"
}
};
