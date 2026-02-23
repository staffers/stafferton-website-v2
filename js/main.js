// ---- SCROLL ANIMATIONS ----
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => {
        entry.target.classList.add('visible');
      }, entry.target.dataset.delay || 0);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.fade-up').forEach((el, i) => {
  const siblings = el.parentElement.querySelectorAll('.fade-up');
  const idx = Array.from(siblings).indexOf(el);
  el.dataset.delay = idx * 80;
  observer.observe(el);
});

// ---- NAV SCROLL ----
const nav = document.querySelector('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 40);
});

// ---- MOBILE NAV ----
const toggle = document.querySelector('.nav-mobile-toggle');
const links = document.querySelector('.nav-links');
if (toggle) {
  toggle.addEventListener('click', () => {
    links.classList.toggle('open');
  });
}

// Close mobile nav on link click
document.querySelectorAll('.nav-links a').forEach(a => {
  a.addEventListener('click', () => links.classList.remove('open'));
});

// ---- FAQ ----
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

// ---- PRICING TOGGLE ----
const pricingToggle = document.querySelector('.toggle-switch');
const prices = {
  starter: { monthly: '50', yearly: '40' },
  pro: { monthly: '90', yearly: '72' }
};

if (pricingToggle) {
  pricingToggle.addEventListener('click', () => {
    pricingToggle.classList.toggle('active');
    const yearly = pricingToggle.classList.contains('active');
    document.getElementById('price-starter').textContent = yearly ? prices.starter.yearly : prices.starter.monthly;
    document.getElementById('price-pro').textContent = yearly ? prices.pro.yearly : prices.pro.monthly;
  });
}

// ---- COUNTER ANIMATION ----
function animateCounter(el, target, suffix = '%') {
  let start = 0;
  const end = parseInt(target);
  const duration = 1500;
  const increment = end / (duration / 16);

  const timer = setInterval(() => {
    start += increment;
    if (start >= end) {
      el.textContent = end + suffix;
      clearInterval(timer);
    } else {
      el.textContent = Math.floor(start) + suffix;
    }
  }, 16);
}

const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting && !entry.target.dataset.counted) {
      entry.target.dataset.counted = true;
      const target = entry.target.dataset.target;
      const suffix = entry.target.dataset.suffix || '%';
      animateCounter(entry.target, target, suffix);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.count-up').forEach(el => counterObserver.observe(el));

// ---- CONTACT FORM ----
const contactForm = document.getElementById('contact-form');
if (contactForm) {
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = contactForm.querySelector('.form-submit');
    btn.textContent = 'Sent! ✓';
    btn.style.background = '#4CAF50';
    setTimeout(() => {
      btn.textContent = 'Send Message';
      btn.style.background = '';
      contactForm.reset();
    }, 3000);
  });
}
