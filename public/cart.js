// cart.js — shared cart + checkout logic for all PetPawHaven pages
// Reads any element with class "p-card" or "product-card" that has
// data-id / data-name / data-price attributes. Add products anywhere
// on any page using that pattern and this file picks them up automatically.
//
// Cart is saved to localStorage so it survives navigating between pages
// (home -> product -> back, etc). Note: this only works once the site is
// actually hosted on a real domain — it won't persist correctly if you're
// just opening the file directly or previewing it inside a chat tool, since
// browser storage is sandboxed differently there. On your live site it'll
// work exactly as expected.

const CART_STORAGE_KEY = 'petpawhaven_cart';

function loadCart(){
  try {
    const saved = localStorage.getItem(CART_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
}

function saveCart(){
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch (e) {
    // storage unavailable (private browsing, disabled storage, etc) — cart
    // just won't persist across page loads, everything else still works
  }
}

let cart = loadCart(); // [{ id, name, price, qty }]

function showToast(msg){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=> t.classList.remove('show'), 1800);
}

function getProductFromCard(cardEl){
  return {
    id: cardEl.dataset.id,
    name: cardEl.dataset.name,
    price: parseFloat(cardEl.dataset.price)
  };
}

function addToCart(product){
  const existing = cart.find(i => String(i.id) === String(product.id));
  if(existing){ existing.qty += 1; }
  else { cart.push({...product, qty:1}); }
  saveCart();
  renderCart();
  showToast('Added to cart');
}

function changeQty(id, delta){
  const item = cart.find(i => String(i.id) === String(id));
  if(!item) return;
  item.qty += delta;
  if(item.qty <= 0){ cart = cart.filter(i => String(i.id) !== String(id)); }
  saveCart();
  renderCart();
}

function cartTotal(){
  return cart.reduce((sum, i) => sum + i.price * i.qty, 0);
}

function renderCart(){
  const body = document.getElementById('cartBody');
  const totalRow = document.getElementById('cartTotalRow');
  const checkoutBtn = document.getElementById('checkoutBtn');
  const countBadge = document.getElementById('cartCount');
  if(!body) return;

  if(countBadge) countBadge.textContent = cart.reduce((n,i)=> n + i.qty, 0);

  if(cart.length === 0){
    body.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
    if(totalRow) totalRow.style.display = 'none';
    if(checkoutBtn) checkoutBtn.disabled = true;
    return;
  }

body.innerHTML = cart.map(i => `
  <div class="cart-line">
    <div>
      <div class="cart-line-name">${i.name}</div>
      <div class="qty-control">
        <button class="qty-btn" onclick="changeQty('${i.id}', -1)">−</button>
        <span class="mono">${i.qty}</span>
        <button class="qty-btn" onclick="changeQty('${i.id}', 1)">+</button>
      </div>
    </div>
    <div class="cart-line-right">
      <div class="cart-line-price">R ${(i.price * i.qty).toFixed(2)}</div>
      <button class="cart-remove-btn" onclick="removeFromCart('${i.id}')" aria-label="Remove ${i.name}">🗑</button>
    </div>
  </div>
`).join('');

  if(totalRow) totalRow.style.display = 'flex';
  const totalAmountEl = document.getElementById('cartTotalAmount');
  if(totalAmountEl) totalAmountEl.textContent = `R ${cartTotal().toFixed(2)}`;
  if(checkoutBtn) checkoutBtn.disabled = false;
}

function openCart(){ document.getElementById('cartOverlay')?.classList.add('open'); }
function closeModal(id){ document.getElementById(id)?.classList.remove('open'); }

function filterProducts(query){
  const q = query.trim().toLowerCase();
  const cards = document.querySelectorAll('.p-card');
  let visibleCount = 0;

  cards.forEach(card => {
    const name = (card.dataset.name || '').toLowerCase();
    const tag = card.querySelector('.p-tag')?.textContent.toLowerCase() || '';
    const matches = name.includes(q) || tag.includes(q);
    card.style.display = matches ? '' : 'none';
    if (matches) visibleCount++;
  });

  const noResultsEl = document.getElementById('noResults');
  if (noResultsEl) noResultsEl.style.display = (visibleCount === 0 && q !== '') ? 'block' : 'none';
}

function openQuickView(id){
  const product = (typeof PRODUCTS !== 'undefined') ? PRODUCTS[id] : null;
  if (!product) return;

  document.getElementById('qvImage').textContent = 'Product photo here';
  document.getElementById('qvTag').textContent = product.tag;
  document.getElementById('qvName').textContent = product.name;
  document.getElementById('qvDesc').textContent = product.description;
  document.getElementById('qvPrice').textContent = `R ${product.price.toFixed(2)}`;

  const addBtn = document.getElementById('qvAddBtn');
  addBtn.onclick = () => {
    addToCart({ id, name: product.name, price: product.price });
  };

  const viewLink = document.getElementById('qvViewLink');
  if (viewLink) viewLink.href = `product.html?id=${id}`;

  document.getElementById('quickViewOverlay').classList.add('open');
}

function toggleMobileMenu(){
  document.getElementById('mobileMenu')?.classList.toggle('open');
  document.getElementById('burgerBtn')?.classList.toggle('open');
}

function removeFromCart(id){
  cart = cart.filter(i => String(i.id) !== String(id));
  saveCart();
  renderCart();
}

function openCheckout(){
  closeModal('cartOverlay');
  const summary = document.getElementById('checkoutSummary');
  if(summary){
    summary.innerHTML = cart.map(i => `
      <div class="row"><span>${i.name} × ${i.qty}</span><span>R ${(i.price*i.qty).toFixed(2)}</span></div>
    `).join('') + `<div class="row total"><span>Total</span><span>R ${cartTotal().toFixed(2)}</span></div>`;
  }
  document.getElementById('checkoutOverlay')?.classList.add('open');
}

async function submitToPayFast(){
  const form = document.getElementById('checkoutForm');
  if(!form.checkValidity()){ form.reportValidity(); return; }

  const inputs = form.querySelectorAll('input, textarea');
  const [firstName, lastName, email, phone, address, city, postal] = Array.from(inputs).map(i => i.value);

  const payload = {
    items: cart.map(i => ({ productId: i.id, quantity: i.qty })),
    customer: { firstName, lastName, email, phone, address, city, postal, country: 'ZA' }
  };

  const payBtn = document.querySelector('#checkoutOverlay .btn-primary');
  payBtn.disabled = true;
  payBtn.textContent = 'Processing…';

  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if(!res.ok){
      showToast(data.error || 'Something went wrong — try again');
      payBtn.disabled = false;
      payBtn.textContent = 'Pay Now with PayFast';
      return;
    }

    // Build a hidden form from actionUrl + fields and auto-submit it to PayFast.
    const payfastForm = document.createElement('form');
    payfastForm.method = 'POST';
    payfastForm.action = data.actionUrl;
    payfastForm.style.display = 'none';

    Object.entries(data.fields).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value;
      payfastForm.appendChild(input);
    });

    document.body.appendChild(payfastForm);

    cart = [];
    saveCart();
    payfastForm.submit();

  } catch (err) {
    showToast('Network error — please try again');
    payBtn.disabled = false;
    payBtn.textContent = 'Pay Now with PayFast';
  }
}

// Wire up every "Add to Cart" button found on the current page
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.p-card, .product-card').forEach(card => {
    const btn = card.querySelector('.add-to-cart-btn');
    if (btn) btn.addEventListener('click', () => addToCart(getProductFromCard(card)));
  });

  const itemCountEl = document.getElementById('itemCount');
  if (itemCountEl) {
    const count = document.querySelectorAll('.p-card, .product-card').length;
    if (count > 0) itemCountEl.textContent = `${count} ITEM${count === 1 ? '' : 'S'} AVAILABLE`;
  }

  renderCart(); // reflect any cart saved from a previous page
});