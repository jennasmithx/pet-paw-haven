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
    ? `<div class="reviews-summary"><strong class="review-stars">${stars(Math.round(data.average))}</strong> ${data.average} out of 5 (${data.count} review${data.count === 1 ? '' : 's'})</div>`
    : `<div class="reviews-summary">No reviews yet — be the first!</div>`;

  const list = data.reviews.map(r => `
    <div class="review-item">
      <div><span class="review-stars">${stars(r.rating)}</span> <strong>${escapeHtml(r.customer_name)}</strong></div>
      ${r.comment ? `<p>${escapeHtml(r.comment)}</p>` : ''}
      <small>${new Date(r.created_at).toLocaleDateString()}</small>
    </div>
  `).join('');

  container.innerHTML = `
    ${summary}
    <div class="reviews-list">${list}</div>
    <button id="write-review-btn">Write a Review</button>
    <form id="review-form" style="display:none;">
      <input type="text" id="rev-name" placeholder="Your name" required>
      <input type="email" id="rev-email" placeholder="Email used for your order" required>
      <select id="rev-rating" required>
        <option value="">Rating</option>
        <option value="5">5 - Excellent</option>
        <option value="4">4 - Good</option>
        <option value="3">3 - Average</option>
        <option value="2">2 - Poor</option>
        <option value="1">1 - Terrible</option>
      </select>
      <textarea id="rev-comment" placeholder="Your review (optional)"></textarea>
      <button type="submit">Submit Review</button>
      <p id="review-error" style="display:none;"></p>
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
