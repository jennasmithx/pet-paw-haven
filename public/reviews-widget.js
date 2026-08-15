// Drop this script on any product page and call initReviews('YOUR-SKU', 'container-id')
// Requires a <div id="container-id"></div> on the page.

async function initReviews(productSku, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '<p>Loading reviews...</p>';

  try {
    const res = await fetch(`/api/reviews?sku=${encodeURIComponent(productSku)}`);
    const data = await res.json();
    renderReviews(container, productSku, data);
  } catch (err) {
    container.innerHTML = '<p>Could not load reviews right now.</p>';
  }
}

function renderReviews(container, sku, data) {
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

  const summary = data.count
    ? `<div class="reviews-summary"><strong>${stars(Math.round(data.average))}</strong> ${data.average} out of 5 (${data.count} review${data.count === 1 ? '' : 's'})</div>`
    : `<div class="reviews-summary">No reviews yet — be the first!</div>`;

  const list = data.reviews.map(r => `
    <div class="review-item" style="border-top:1px solid #eee; padding:12px 0;">
      <div>${stars(r.rating)} <strong>${escapeHtml(r.customer_name)}</strong></div>
      ${r.comment ? `<p>${escapeHtml(r.comment)}</p>` : ''}
      <small style="color:#888;">${new Date(r.created_at).toLocaleDateString()}</small>
    </div>
  `).join('');

  container.innerHTML = `
    ${summary}
    <div class="reviews-list">${list}</div>
    <button id="write-review-btn" style="margin-top:12px;">Write a Review</button>
    <form id="review-form" style="display:none; margin-top:12px;">
      <input type="text" id="rev-name" placeholder="Your name" required style="display:block; margin-bottom:8px; width:100%;">
      <input type="email" id="rev-email" placeholder="Email used for your order" required style="display:block; margin-bottom:8px; width:100%;">
      <select id="rev-rating" required style="display:block; margin-bottom:8px;">
        <option value="">Rating</option>
        <option value="5">5 - Excellent</option>
        <option value="4">4 - Good</option>
        <option value="3">3 - Average</option>
        <option value="2">2 - Poor</option>
        <option value="1">1 - Terrible</option>
      </select>
      <textarea id="rev-comment" placeholder="Your review (optional)" style="display:block; margin-bottom:8px; width:100%;"></textarea>
      <button type="submit">Submit Review</button>
      <p id="review-error" style="color:red; display:none;"></p>
    </form>
  `;

  const btn = container.querySelector('#write-review-btn');
  const form = container.querySelector('#review-form');
  btn.addEventListener('click', () => { form.style.display = 'block'; btn.style.display = 'none'; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = container.querySelector('#review-error');
    errorEl.style.display = 'none';

    const payload = {
      product_sku: sku,
      customer_name: container.querySelector('#rev-name').value,
      email: container.querySelector('#rev-email').value,
      rating: parseInt(container.querySelector('#rev-rating').value, 10),
      comment: container.querySelector('#rev-comment').value
    };

    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (!res.ok) {
      errorEl.textContent = result.error || 'Something went wrong.';
      errorEl.style.display = 'block';
      return;
    }

    initReviews(sku, container.id); // reload list to show the new review immediately
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
