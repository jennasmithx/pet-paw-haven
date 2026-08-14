-- PetPaw Haven database schema
-- Paste this whole file into your SQL editor and run it once.

CREATE TABLE products (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  price         NUMERIC(10,2) NOT NULL,
  is_available  BOOLEAN NOT NULL DEFAULT true,
  image_url     TEXT,
  description   TEXT,
  category      TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE orders (
  id                    SERIAL PRIMARY KEY,
  customer_first_name   TEXT NOT NULL,
  customer_last_name    TEXT NOT NULL,
  email                 TEXT NOT NULL,
  phone                 TEXT NOT NULL,
  address               TEXT NOT NULL,
  city                  TEXT NOT NULL,
  postal_code           TEXT NOT NULL,
  total                 NUMERIC(10,2) NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending_payment',
    -- 'pending_payment' | 'paid' | 'failed' | 'shipped'
  payfast_payment_id    TEXT,
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE order_items (
  id                  SERIAL PRIMARY KEY,
  order_id            INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id          INTEGER NOT NULL REFERENCES products(id),
  quantity            INTEGER NOT NULL,
  price_at_purchase   NUMERIC(10,2) NOT NULL
);

-- Demo product to match the storefront
INSERT INTO products (name, price, is_available, category, description)
VALUES (
  'Automatic Pet Feeder',
  449.00,
  true,
  'Feeding',
  "No more worrying about missed meals. Set their feeding schedule and let the feeder take care of the rest, even when you're busy."
);
