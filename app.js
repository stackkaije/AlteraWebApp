const tg = window.Telegram?.WebApp;
const API_URL = window.ALTERA_API_URL ||
  "https://bot-1789213141-7968-kaydzhe-mind.bothost.tech";
const $ = (id) => document.getElementById(id);
const catalogNode = $("catalog");
const statusNode = $("status");
const checkoutNode = $("checkout");
const quantityNode = $("quantity");
let categories = [];
let cart = loadCart();
let selected = null;
let quantity = 1;
let currentProductId = null;
let checkoutMode = "single";
let activePromo = null;
let depositProvider = "xrocket";
let depositPollTimer = null;
let previousCartCount = 0;
let pendingPayment = null;
let favoriteItems = [];
let checkoutReturnFocus = null;
let purchasePollTimer = null;
let purchaseExpiryTimer = null;
let currentBalance = null;
let checkoutRequestKey = null;
let xrocketChoice = null;
let toastTimeout = null;
let toastRemovalTimeout = null;

tg?.ready();
tg?.expand();
let maxVisualViewportHeight = window.visualViewport?.height || window.innerHeight;
function syncFixedPanelsWithKeyboard() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const focusedElement = document.activeElement;
  const keyboardTarget = focusedElement instanceof HTMLElement
    && (focusedElement.matches("input, textarea, select") || focusedElement.isContentEditable);
  if (!keyboardTarget && viewport.height > maxVisualViewportHeight - 80) {
    maxVisualViewportHeight = Math.max(maxVisualViewportHeight, viewport.height);
  }
  const keyboardInset = keyboardTarget && maxVisualViewportHeight - viewport.height > 120
    ? Math.max(0, maxVisualViewportHeight - viewport.height - viewport.offsetTop)
    : 0;
  document.documentElement.style.setProperty("--keyboard-offset", `${keyboardInset}px`);
}
window.visualViewport?.addEventListener("resize", syncFixedPanelsWithKeyboard);
window.visualViewport?.addEventListener("scroll", syncFixedPanelsWithKeyboard);
window.addEventListener("resize", syncFixedPanelsWithKeyboard);
document.addEventListener("focusin", syncFixedPanelsWithKeyboard);
document.addEventListener("focusout", () => requestAnimationFrame(syncFixedPanelsWithKeyboard));
syncFixedPanelsWithKeyboard();
$("checkout-close").addEventListener("click", closeCheckout);
$("quantity-minus").addEventListener("click", () => changeQuantity(-1));
$("quantity-plus").addEventListener("click", () => changeQuantity(1));
$("pay-balance").addEventListener("click", () => submitPurchase("balance"));
$("pay-xrocket").addEventListener("click", () => submitPurchase("xrocket"));
$("pay-cryptobot").addEventListener("click", () => submitPurchase("cryptobot"));
$("pay-stars").addEventListener("click", () => submitPurchase("stars"));
$("waiting-open").addEventListener("click", () => pendingPayment && openPaymentLink(pendingPayment.pay_url));
$("xrocket-choice-close").addEventListener("click", () => { $("xrocket-choice-modal").hidden = true; xrocketChoice = null; });
$("xrocket-open-choice").addEventListener("click", () => {
  $("xrocket-choice-modal").hidden = true;
  if (xrocketChoice?.payUrl) openPaymentLink(xrocketChoice.payUrl);
});
$("xrocket-qr-choice").addEventListener("click", () => {
  if (xrocketChoice && !xrocketChoice.qrShown) {
    $("xrocket-choice-qr").src = `https://quickchart.io/qr?size=220&text=${encodeURIComponent(xrocketChoice.payUrl)}`;
    $("xrocket-choice-amount").textContent = `${Number(xrocketChoice.amount || 0).toFixed(2)} USDT`;
    $("xrocket-choice-qr-panel").hidden = false;
    xrocketChoice.qrShown = true;
    $("xrocket-qr-choice").textContent = "Проверить платеж";
    return;
  }
  if (xrocketChoice?.mode === "purchase") {
    checkPurchasePayment(true);
  } else if (xrocketChoice?.mode === "deposit") {
    checkDepositPayment(true);
  }
});
$("waiting-copy").addEventListener("click", () => pendingPayment && copyText(pendingPayment.pay_url)
  .then(() => showToast("Ссылка скопирована")).catch(() => showToast("Не удалось скопировать ссылку", "error")));
$("waiting-check").addEventListener("click", () => pendingPayment && checkPurchasePayment(true));
$("product-back").addEventListener("click", () => showView("catalog-view"));
$("filters-toggle").addEventListener("click", () => {
  const toggle = $("filters-toggle");
  const panel = $("filters-panel");
  const expanded = toggle.getAttribute("aria-expanded") !== "true";
  toggle.setAttribute("aria-expanded", String(expanded));
  panel.classList.toggle("is-open", expanded);
  panel.setAttribute("aria-hidden", String(!expanded));
  panel.toggleAttribute("inert", !expanded);
});
$("tutorial-back").addEventListener("click", () => renderTutorialStep(tutorialStep - 1));
$("tutorial-next").addEventListener("click", () => {
  if (tutorialStep === tutorialSteps.length - 1) finishTutorial();
  else renderTutorialStep(tutorialStep + 1);
});
const tutorialSteps = [
  {
    title: "Разделы магазина",
    description: "Нижнее меню переключает основные разделы: Каталог — товары, Профиль — баланс и покупки, Избранное — сохранённые позиции, Корзина — выбранные товары."
  },
  {
    title: "Поиск и каталог",
    description: "Найдите товар по названию через поиск. Фильтры помогают выбрать категорию, порядок сортировки и показать только товары в наличии; кнопка ↻ обновляет список."
  },
  {
    title: "Карточка товара",
    description: "Откройте карточку, чтобы посмотреть описание, цену и наличие. Кнопка «Купить» ведёт к оформлению, а «В корзину» сохраняет товар для покупки вместе с другими."
  },
  {
    title: "Корзина",
    description: "Проверьте выбранные товары и количество, удалите лишнее и нажмите «Перейти к оплате», чтобы оформить заказ."
  },
  {
    title: "Профиль и баланс",
    description: "В профиле отображаются баланс и покупки. Там же можно пополнить баланс, выбрав сумму и способ оплаты."
  },
  {
    title: "Избранное",
    description: "Нажмите сердечко на товаре, чтобы сохранить его в избранное и быстро найти позже."
  }
];
let tutorialStep = 0;
const tutorialSeenKey = `altera-tutorial-seen-v2:${tg?.initDataUnsafe?.user?.id || "guest"}`;
function renderTutorialStep(index) {
  tutorialStep = Math.max(0, Math.min(index, tutorialSteps.length - 1));
  const step = tutorialSteps[tutorialStep];
  $("tutorial-title").textContent = step.title;
  $("tutorial-description").textContent = step.description;
  $("tutorial-step-count").textContent = `Шаг ${tutorialStep + 1} из ${tutorialSteps.length}`;
  $("tutorial-progress-fill").style.width = `${((tutorialStep + 1) / tutorialSteps.length) * 100}%`;
  $("tutorial-back").hidden = tutorialStep === 0;
  $("tutorial-next").textContent = tutorialStep === tutorialSteps.length - 1 ? "Готово" : "Далее";
}
function startTutorial() {
  renderTutorialStep(0);
  $("tutorial-modal").hidden = false;
  $("tutorial-next").focus();
}
function finishTutorial() {
  $("tutorial-modal").hidden = true;
  localStorage.setItem(tutorialSeenKey, "true");
}
document.addEventListener("keydown", (event) => {
  if ($("tutorial-modal").hidden) return;
  if (event.key === "Escape") {
    event.preventDefault();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    $("tutorial-next").click();
  } else if (event.key === "ArrowLeft" && tutorialStep > 0) {
    event.preventDefault();
    $("tutorial-back").click();
  }
});
$("home-banner").addEventListener("click", (event) => {
  if (suppressBannerLinkClick && event.target.closest(".banner-support-link")) {
    event.preventDefault();
    suppressBannerLinkClick = false;
    return;
  }
  const button = event.target.closest("[data-banner-index]");
  if (!button) return;
  showBanner(Number(button.dataset.bannerIndex), true);
});
let activeBannerIndex = 0;
let bannerPointerStart = null;
let suppressBannerLinkClick = false;
function showBanner(index, absolute = false) {
  const slides = [...document.querySelectorAll(".banner-slide")];
  const dots = [...document.querySelectorAll(".banner-dot")];
  if (!slides.length) return;
  activeBannerIndex = absolute
    ? (index + slides.length) % slides.length
    : (activeBannerIndex + index + slides.length) % slides.length;
  slides.forEach((slide, slideIndex) => {
    const active = slideIndex === activeBannerIndex;
    slide.classList.toggle("is-active", active);
    slide.setAttribute("aria-hidden", String(!active));
    slide.toggleAttribute("inert", !active);
  });
  dots.forEach((dot, dotIndex) => {
    const active = dotIndex === activeBannerIndex;
    dot.classList.toggle("is-active", active);
    if (active) dot.setAttribute("aria-current", "true");
    else dot.removeAttribute("aria-current");
  });
}
const homeBanner = $("home-banner");
homeBanner.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)
      || event.target.closest(".banner-controls, a, button")) return;
  bannerPointerStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  homeBanner.setPointerCapture(event.pointerId);
});
homeBanner.addEventListener("pointerup", (event) => {
  if (!bannerPointerStart || bannerPointerStart.pointerId !== event.pointerId) return;
  const deltaX = event.clientX - bannerPointerStart.x;
  const deltaY = event.clientY - bannerPointerStart.y;
  bannerPointerStart = null;
  if (Math.abs(deltaX) < 45 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
  showBanner(deltaX < 0 ? 1 : -1);
  suppressBannerLinkClick = true;
  setTimeout(() => { suppressBannerLinkClick = false; }, 500);
});
homeBanner.addEventListener("pointercancel", () => { bannerPointerStart = null; });
setInterval(() => {
  if (!document.hidden && $("catalog-view").classList.contains("active-view")) showBanner(1);
}, 8000);
$("cart-checkout").addEventListener("click", () => openCartCheckout());
$("cart-bar-open").addEventListener("click", () => openCartCheckout());
$("refresh-catalog").addEventListener("click", () => {
  haptic("light");
  loadCatalog();
  showToast("Каталог обновляется");
});
$("promo-apply").addEventListener("click", () => applyPromo($("promo-input"), $("promo-status")));
$("checkout-promo-apply").addEventListener("click", () => applyPromo($("checkout-promo"), $("checkout-promo-status")));
$("search").addEventListener("input", renderCatalog);
$("category-filter").addEventListener("change", renderCatalog);
$("sort").addEventListener("change", renderCatalog);
$("stock-filter").addEventListener("change", renderCatalog);
$("popular-queries").addEventListener("click", (event) => {
  const button = event.target.closest("[data-query]");
  if (button) { $("search").value = button.dataset.query; renderCatalog(); }
});
$("reset-filters").addEventListener("click", () => {
  $("search").value = "";
  $("category-filter").value = "all";
  $("sort").value = "default";
  $("stock-filter").value = "all";
  saveCatalogFilters();
  renderCatalog();
});
$("history-date-filter").addEventListener("change", loadHistory);
$("favorites-sort").addEventListener("change", loadFavorites);
$("favorites-stock-filter").addEventListener("change", loadFavorites);
$("cart-clear").addEventListener("click", () => {
  if (!cart.length || !window.confirm("Очистить корзину?")) return;
  cart = [];
  saveCart();
  renderCart();
  showToast("Корзина очищена");
});
$("favorites-buy-all").addEventListener("click", () => {
  const available = favoriteItems.filter((item) => item.stock > 0);
  if (!available.length) return showToast("В избранном нет товаров в наличии", "error");
  available.forEach((item) => addToCart(item.id));
  showView("cart-view");
  showToast("Доступные товары добавлены в корзину");
});
$("success-close").addEventListener("click", closeSuccess);
$("success-history").addEventListener("click", () => { closeSuccess(); showView("history-view"); });
document.querySelectorAll(".amount-option").forEach((button) => button.addEventListener("click", () => {
  $("deposit-amount").value = button.dataset.amount;
  document.querySelectorAll(".amount-option").forEach((option) => option.classList.toggle("active", option === button));
}));
$("deposit-amount").addEventListener("input", () => {
  const amount = Number($("deposit-amount").value);
  document.querySelectorAll(".amount-option").forEach((option) => {
    option.classList.toggle("active", Number(option.dataset.amount) === amount && Number.isFinite(amount));
  });
});
document.querySelectorAll(".provider-option").forEach((button) => button.addEventListener("click", () => {
  depositProvider = button.dataset.provider;
  document.querySelectorAll(".provider-option").forEach((option) => option.classList.toggle("active", option === button));
  const providerName = { xrocket: "xRocket", cryptobot: "CryptoBot", stars: "Telegram Stars" }[depositProvider] || "xRocket";
  $("deposit-submit").textContent = `Пополнить через ${providerName}`;
}));
$("deposit-submit").addEventListener("click", startDeposit);
document.body.addEventListener("click", async (event) => {
  const rippleTarget = event.target.closest("button:not([disabled]), .card");
  if (rippleTarget && !rippleTarget.classList.contains("tab") && !rippleTarget.classList.contains("settings-button")) {
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    const rect = rippleTarget.getBoundingClientRect();
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    rippleTarget.appendChild(ripple);
    setTimeout(() => ripple.remove(), 550);
  }
  const copyButton = event.target.closest("[data-copy]");
  if (!copyButton) return;
  copyText(copyButton.dataset.copy)
    .then(() => showToast("Ссылка скопирована"))
    .catch(() => showToast("Не удалось скопировать ссылку", "error"));
});
document.body.addEventListener("click", (event) => {
  const retry = event.target.closest("[data-retry]");
  if (!retry) return;
  if (retry.dataset.retry === "history") loadHistory();
  if (retry.dataset.retry === "favorites") loadFavorites();
  if (retry.dataset.retry === "catalog") loadCatalog();
});
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));
$("p2p-create-toggle").addEventListener("click", () => {
  showToast("Отдел на доработке, ещё немного и он откроется.");
});
$("p2p-cancel-create").addEventListener("click", () => {
  $("p2p-listing-form").reset();
  $("p2p-listing-form").hidden = true;
  $("p2p-form-status").textContent = "";
});
$("p2p-refresh").addEventListener("click", loadMarketplace);
$("p2p-listing-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('[type="submit"]');
  const status = $("p2p-form-status");
  button.disabled = true;
  status.textContent = "Публикуем объявление...";
  try {
    await waitForTelegramInitData();
    await api("/api/p2p/listings", {
      method: "POST",
      body: JSON.stringify({
        title: $("p2p-title-input").value,
        description: $("p2p-description-input").value,
        price: $("p2p-price-input").value,
        legal_goods_confirmed: $("p2p-legal-confirm").checked
      })
    });
    event.currentTarget.reset();
    event.currentTarget.hidden = true;
    status.textContent = "";
    showToast("Объявление отправлено на проверку");
    await loadMarketplace();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
document.body.addEventListener("click", async (event) => {
  const retryButton = event.target.closest("#p2p-retry");
  if (retryButton) return loadMarketplace();
  const disputeOpen = event.target.closest("[data-p2p-dispute-open]");
  if (disputeOpen) {
    const form = document.querySelector(`[data-dispute-form="${Number(disputeOpen.dataset.p2pDisputeOpen)}"]`);
    if (form) form.hidden = !form.hidden;
    return;
  }
  const listingCancel = event.target.closest("[data-p2p-cancel-listing]");
  const buyButton = event.target.closest("[data-p2p-buy]");
  const actionButton = event.target.closest("[data-p2p-action]");
  if (!listingCancel && !buyButton && !actionButton) return;
  const button = listingCancel || buyButton || actionButton;
  button.disabled = true;
  try {
    await waitForTelegramInitData();
    if (listingCancel) {
      await api("/api/p2p/deals/action", {
        method: "POST",
        body: JSON.stringify({ action: "cancel-listing", listing_id: Number(listingCancel.dataset.p2pCancelListing) })
      });
      showToast("Объявление снято");
    } else if (buyButton) {
      const key = buyButton.dataset.idempotencyKey
        || globalThis.crypto?.randomUUID?.()
        || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      buyButton.dataset.idempotencyKey = key;
      const result = await api("/api/p2p/deals", {
        method: "POST",
        body: JSON.stringify({ listing_id: Number(buyButton.dataset.p2pBuy), idempotency_key: key })
      });
      delete buyButton.dataset.idempotencyKey;
      showToast(`Оплата ${Number(result.total).toFixed(2)} USDT удерживается до подтверждения`);
    } else {
      const action = actionButton.dataset.p2pAction;
      const payload = { action, deal_id: Number(actionButton.dataset.dealId) };
      if (action.endsWith("-listing")) {
        payload.listing_id = Number(actionButton.dataset.listingId);
      } else if (action.startsWith("admin-")) {
        const note = document.querySelector(`[data-p2p-resolution-note="${payload.deal_id}"]`);
        payload.note = note?.value || "";
      }
      await api("/api/p2p/deals/action", { method: "POST", body: JSON.stringify(payload) });
      showToast(action === "confirm" ? "Получение подтверждено" : "Статус сделки обновлён");
    }
    await loadMarketplace();
  } catch (error) {
    showToast(error.message, "error");
    button.disabled = false;
  }
});
document.body.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-dispute-form]");
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    await waitForTelegramInitData();
    await api("/api/p2p/deals/action", {
      method: "POST",
      body: JSON.stringify({
        action: "dispute",
        deal_id: Number(form.dataset.disputeForm),
        reason: form.querySelector("textarea").value
      })
    });
    showToast("Спор открыт, средства остаются на удержании");
    await loadMarketplace();
  } catch (error) {
    showToast(error.message, "error");
    button.disabled = false;
  }
});
document.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") return;
  const x = (event.clientX / window.innerWidth - .5) * 16;
  const y = (event.clientY / window.innerHeight - .5) * 16;
  document.body.style.setProperty("--pointer-x", x.toFixed(2));
  document.body.style.setProperty("--pointer-y", y.toFixed(2));
}, { passive: true });
document.body.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton && !viewButton.classList.contains("tab")) showView(viewButton.dataset.view);
  const repeatButton = event.target.closest("[data-repeat-cat]");
  if (repeatButton) {
    const item = categories.find((entry) => String(entry.id) === repeatButton.dataset.repeatCat);
    if (item && item.stock > 0) { showView("catalog-view"); openCheckout(item); }
    else showToast("Товар закончился", "error");
  }
  const favoriteButton = event.target.closest("[data-favorite-id]");
  if (favoriteButton) toggleFavorite(Number(favoriteButton.dataset.favoriteId), favoriteButton);
  const notifyButton = event.target.closest("[data-favorite-notify]");
  if (notifyButton) toggleFavoriteNotification(notifyButton);
  const orderAction = event.target.closest("[data-order-action]");
  if (orderAction) {
    if (orderAction.dataset.orderAction === "support") {
      showToast(`Напишите в поддержку бота и укажите заказ ${orderAction.dataset.orderNumber || ""}`);
    } else if (orderAction.dataset.orderAction === "receive") {
      try {
        const result = await api("/api/history/item", { method: "POST", body: JSON.stringify({ history_id: Number(orderAction.dataset.historyId) }) });
        showSuccessScreen(orderAction.dataset.orderNumber, result.item);
      } catch (error) { showToast(error.message, "error"); }
    } else if (orderAction.dataset.orderAction === "copy") {
      try {
        const result = await api("/api/history/item", { method: "POST", body: JSON.stringify({ history_id: Number(orderAction.dataset.historyId) }) });
        await copyText(result.item || "");
        showToast("Товар скопирован");
      } catch (error) { showToast(error.message, "error"); }
    }
  }
});
catalogNode.addEventListener("click", handleCatalogClick);
$("product-detail").addEventListener("click", handleCatalogClick);
$("favorites-list").addEventListener("click", handleCatalogClick);
$("catalog").addEventListener("pointermove", handleCardTilt, { passive: true });
$("catalog").addEventListener("pointerleave", resetCardTilt, { passive: true });
$("cart-list").addEventListener("click", handleCartClick);
checkoutNode.addEventListener("click", (event) => {
  if (event.target === checkoutNode) closeCheckout();
});
document.addEventListener("keydown", (event) => {
  if (checkoutNode.hidden) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeCheckout();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...checkoutNode.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
  )];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

function headers() {
  const result = { "Content-Type": "application/json" };
  const initData = getTelegramInitData();
  if (initData) result["X-Telegram-Init-Data"] = initData;
  return result;
}

function getTelegramInitData() {
  return tg?.initData || window.Telegram?.WebApp?.initData || "";
}

function openPaymentLink(url) {
  if (!url) throw new Error("Ссылка на оплату недоступна");
  if (/^https:\/\/t\.me\//i.test(url) && tg?.openTelegramLink) {
    tg.openTelegramLink(url);
    return;
  }
  if (tg?.openLink) {
    tg.openLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

async function waitForTelegramInitData(timeout = 2000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const initData = getTelegramInitData();
    if (initData) return initData;
    window.Telegram?.WebApp?.ready();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return "";
}

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Ошибка запроса");
    error.authError = data.auth_error;
    throw error;
  }
  return data;
}

async function loadMarketplace() {
  const listingsNode = $("p2p-listings");
  if (!listingsNode) return;
  $("p2p-listings-status").textContent = "Загружаем объявления...";
  try {
    const data = await api("/api/p2p");
    const money = (value) => `${Number(value || 0).toFixed(2)} USDT`;
    const sellerName = (username) => username ? `@${escapeHtml(username)}` : "Пользователь Telegram";
    listingsNode.innerHTML = data.listings.length ? data.listings.map((listing) => `
      <article class="p2p-card">
        <div class="p2p-card-top"><span>ГАРАНТ-СДЕЛКА</span><small>Продавец: ${sellerName(listing.seller)}</small></div>
        <h3>${escapeHtml(listing.title)}</h3>
        <p>${escapeHtml(listing.description)}</p>
        <div class="p2p-card-buy"><strong>${money(listing.price)}</strong>
          <button class="primary-button" type="button" data-p2p-buy="${Number(listing.id)}" ${listing.is_owner ? "disabled" : ""}>
            ${listing.is_owner ? "Ваше объявление" : `Купить · ${money(listing.buyer_total)}`}
          </button>
        </div>
        <small class="p2p-fee-note">Включая комиссию покупателя 3% · деньги удерживаются до подтверждения</small>
      </article>`).join("") : `<div class="empty-state p2p-empty-state"><strong>Пока нет объявлений</strong><span>Можно создать первое — нажмите «＋ Объявление».</span></div>`;
    $("p2p-listings-status").textContent = `Баланс: ${money(data.balance)} · комиссия покупателя ${Number(data.fee_percent)}%`;
    $("p2p-own-listings").innerHTML = data.own_listings.length ? data.own_listings.map((listing) => `
      <article class="p2p-own-card">
        <div><strong>${escapeHtml(listing.title)}</strong><span>${money(listing.price)} · ${{pending: "на проверке", active: "активно", reserved: "зарезервировано", sold: "продано", cancelled: "снято", rejected: "отклонено"}[listing.status] || escapeHtml(listing.status)}</span></div>
        ${listing.status === "active" ? `<button class="text-button" type="button" data-p2p-cancel-listing="${Number(listing.id)}">Снять</button>` : ""}
      </article>`).join("") : `<p class="muted">У вас пока нет объявлений.</p>`;
    $("p2p-deals").innerHTML = data.deals.length ? data.deals.map((deal) => {
      const isBuyer = Number(deal.buyer_id) === Number(tg?.initDataUnsafe?.user?.id);
      const statusText = {
        funded: "Оплачено · ожидается выдача продавцом",
        delivered: "Выдано · ожидается подтверждение покупателя",
        disputed: "Открыт спор · средства удерживаются",
        released: "Сделка завершена",
        refunded: "Средства возвращены покупателю"
      }[deal.status] || "Статус сделки";
      const actions = deal.status === "funded" && !isBuyer
        ? `<button class="primary-button" type="button" data-p2p-action="mark-delivered" data-deal-id="${Number(deal.id)}">Отметить как выданное</button>`
        : deal.status === "delivered" && isBuyer
          ? `<div class="p2p-deal-actions"><button class="primary-button" type="button" data-p2p-action="confirm" data-deal-id="${Number(deal.id)}">Подтвердить получение</button><button class="secondary-button" type="button" data-p2p-dispute-open="${Number(deal.id)}">Открыть спор</button></div><form class="p2p-dispute-form" data-dispute-form="${Number(deal.id)}" hidden><label><span>Что случилось?</span><textarea minlength="10" maxlength="1000" required></textarea></label><button class="secondary-button" type="submit">Отправить спор</button></form>`
          : "";
      return `<article class="p2p-deal-card">
        <div class="p2p-card-top"><span>СДЕЛКА #${Number(deal.id)}</span><small>${escapeHtml(statusText)}</small></div>
        <h3>${escapeHtml(deal.title)}</h3>
        <p>${isBuyer ? `Продавец: ${sellerName(deal.seller)}` : `Покупатель: ${sellerName(deal.buyer)}`}</p>
        <div class="p2p-deal-values"><span>Цена <strong>${money(deal.price)}</strong></span><span>Комиссия 3% <strong>${money(deal.fee)}</strong></span><span>Оплачено <strong>${money(deal.total)}</strong></span></div>
        ${deal.deadline_at && ["funded", "delivered"].includes(deal.status) ? `<small class="p2p-deadline">Срок: ${escapeHtml(new Date(deal.deadline_at).toLocaleString("ru-RU"))}</small>` : ""}
        ${deal.status === "disputed" && deal.dispute_reason ? `<p class="p2p-dispute-reason"><strong>Причина спора:</strong> ${escapeHtml(deal.dispute_reason)}</p>` : ""}
        ${actions}
      </article>`;
    }).join("") : `<p class="muted">У вас пока нет сделок.</p>`;
    $("p2p-moderation-section").hidden = !data.is_admin;
    $("p2p-moderation").innerHTML = data.admin_pending_listings?.length ? data.admin_pending_listings.map((listing) => `
      <article class="p2p-deal-card">
        <div class="p2p-card-top"><span>ПРОВЕРКА · #${Number(listing.id)}</span><small>${money(listing.price)}</small></div>
        <h3>${escapeHtml(listing.title)}</h3>
        <p>Продавец: ${sellerName(listing.seller)}</p>
        <p>${escapeHtml(listing.description)}</p>
        <div class="p2p-deal-actions"><button class="primary-button" type="button" data-p2p-action="admin-approve-listing" data-listing-id="${Number(listing.id)}">Одобрить</button><button class="secondary-button" type="button" data-p2p-action="admin-reject-listing" data-listing-id="${Number(listing.id)}">Отклонить</button></div>
      </article>`).join("") : `<p class="muted">Объявлений на проверке нет.</p>`;
    $("p2p-admin-section").hidden = !data.is_admin;
    $("p2p-admin-disputes").innerHTML = data.admin_disputes?.length ? data.admin_disputes.map((deal) => `
      <article class="p2p-deal-card">
        <div class="p2p-card-top"><span>СПОР · СДЕЛКА #${Number(deal.id)}</span><small>${money(deal.total)}</small></div>
        <h3>${escapeHtml(deal.title)}</h3>
        <p>Продавец: ${sellerName(deal.seller)} · Покупатель: ${sellerName(deal.buyer)}</p>
        <p class="p2p-dispute-reason">${escapeHtml(deal.reason)}</p>
        <label><span>Примечание к решению</span><textarea data-p2p-resolution-note="${Number(deal.id)}" minlength="5" maxlength="1000" placeholder="Кратко укажите основание решения"></textarea></label>
        <div class="p2p-deal-actions"><button class="primary-button" type="button" data-p2p-action="admin-release" data-deal-id="${Number(deal.id)}">Выплатить продавцу</button><button class="secondary-button" type="button" data-p2p-action="admin-refund" data-deal-id="${Number(deal.id)}">Вернуть покупателю</button></div>
      </article>`).join("") : `<p class="muted">Открытых споров нет.</p>`;
  } catch (error) {
    $("p2p-listings-status").textContent = `Не удалось загрузить P2P: ${error.message}`;
    listingsNode.innerHTML = `<button class="secondary-button" type="button" id="p2p-retry">Повторить</button>`;
  }
}

function showView(viewId) {
  const activeView = document.getElementById(viewId);
  if (!activeView?.classList.contains("view")) return;
  localStorage.setItem("altera-active-view", viewId);
  if (viewId !== "product-view") {
    currentProductId = null;
    localStorage.removeItem("altera-active-product");
  }
  document.querySelectorAll(".view").forEach((view) => {
    view.hidden = view.id !== viewId;
    view.classList.toggle("active-view", view.id === viewId);
  });
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewId));
  $("cart-bar").hidden = viewId !== "catalog-view" || !cart.some((line) => line.quantity > 0);
  activeView?.setAttribute("tabindex", "-1");
  activeView?.focus({ preventScroll: true });
  if (viewId === "cart-view") renderCart();
  if (viewId === "history-view") loadHistory();
  if (viewId === "profile-view") loadProfile();
  if (viewId === "favorites-view") loadFavorites();
  if (viewId === "sell-view") loadMarketplace();
}

async function openProductPage(item) {
  currentProductId = item.id;
  localStorage.setItem("altera-active-product", String(item.id));
  showView("product-view");
  const node = $("product-detail");
  node.innerHTML = `<div class="skeleton skeleton-product"></div>`;
  try {
    const data = await api(`/api/product?cat_id=${encodeURIComponent(item.id)}`);
    const product = data.product || item;
    const rating = Number(product.rating || 0);
    const reviews = product.reviews || [];
    const canReview = product.has_purchased_product === true;
    const productName = (product.name || "").toUpperCase();
    const productImage = product.group === "gy_1970" && productName.includes("ПОД ГК")
      ? `<img src="./assets/gosuslugi-key-logo.jpg" alt="Логотип Госуслуг под ГК">`
      : product.group === "gy_1970"
        ? `<img src="./assets/gosuslugi-logo.jpg" alt="Логотип Госуслуг">`
      : productName.includes("TELE2")
        ? `<img src="./assets/t2-logo.jpg" alt="Логотип T2">`
        : productName.includes("BEELINE")
          ? `<img src="./assets/beeline-logo.jpg" alt="Логотип Билайн">`
          : productName.includes("MEGAFON")
            ? `<img src="./assets/megafon-logo.jpg" alt="Логотип МегаФона">`
          : productName.includes("YOTA")
            ? `<img src="./assets/yota-logo.jpg" alt="Логотип YOTA">`
          : productName.includes("ТБАНК") || productName.includes("TBANK")
            ? `<img src="./assets/tbank-logo.jpg" alt="Логотип Т-Банка">`
          : product.group === "l0gu_1970"
          ? `<img src="./assets/mts-logo.jpg" alt="Логотип МТС">`
          : escapeHtml((product.name || "A").slice(0, 1).toUpperCase());
    node.innerHTML = `
      <div class="product-drop">
        <div class="product-drop-topline">
          <span class="product-drop-category">${escapeHtml(groupTitle(product.group || "other"))}</span>
          <span class="product-stock ${product.stock > 0 ? "is-available" : "is-empty"}">${product.stock > 0 ? `В наличии: ${product.stock}шт` : "Нет в наличии"}</span>
        </div>
        <div class="product-drop-hero">
          <div class="product-image">${productImage}</div>
          <div class="product-drop-copy">
            <h1 id="product-title">${escapeHtml(product.name)}</h1>
            <div class="product-rating">${rating ? `★ ${rating.toFixed(1)}` : "Новый товар"} <span>· ${Number(product.reviews_count || reviews.length)} отзывов</span></div>
          </div>
        </div>
        <div class="product-drop-purchase">
          <div class="product-drop-price"><span>ЦЕНА</span><strong>${Number(product.price).toFixed(2)} <small>USDT</small></strong></div>
          ${product.stock > 0 ? `<p class="product-drop-fulfillment">Моментальная выдача после оплаты</p>` : ""}
          <div class="product-actions product-drop-actions">
            <button id="product-buy" class="primary-button" ${product.stock < 1 ? "disabled" : ""}>${product.stock < 1 ? "Нет в наличии" : product.has_purchased_category === true ? "Купить снова" : "Купить сейчас"}</button>
            <button id="product-cart" class="secondary-button" ${product.stock < 1 ? "disabled" : ""}>В корзину</button>
          </div>
        </div>
      </div>
      <section class="product-section product-description-section"><h2>Описание</h2><div class="product-description is-expanded"><p>${escapeHtml(product.description || "Описание отсутствует.")}</p></div></section>
      <section class="product-section"><h2>Отзывы</h2>${reviews.length ? reviews.slice(0, 3).map((review) => `<p class="review-line">★ ${Number(review.rating)} ${escapeHtml(review.text || "")}</p>`).join("") : `<p class="muted">Отзывов пока нет.</p>`}${canReview ? `<div class="review-form"><label>Ваша оценка <select id="review-rating"><option value="5">★★★★★</option><option value="4">★★★★</option><option value="3">★★★</option><option value="2">★★</option><option value="1">★</option></select></label><textarea id="review-text" maxlength="1000" placeholder="Расскажите о товаре"></textarea><button id="review-submit" class="secondary-button" type="button">Оставить отзыв</button><p id="review-status" class="form-status"></p></div>` : `<p class="muted">Оставить отзыв можно после покупки этого товара.</p>`}</section>
      <section class="product-section"><h2>Похожие товары</h2><div class="similar-products">${categories.filter((entry) => entry.id !== product.id && entry.group === product.group).slice(0, 3).map(cardTemplate).join("") || `<p class="muted">Похожих товаров пока нет.</p>`}</div></section>`;
    $("product-buy").addEventListener("click", () => openCheckout(product));
    $("product-cart").addEventListener("click", () => { addToCart(product.id); showToast("Товар добавлен в корзину"); });
    if (canReview) $("review-submit").addEventListener("click", async () => {
      const button = $("review-submit");
      button.disabled = true;
      try {
        const result = await api("/api/reviews", { method: "POST", body: JSON.stringify({ cat_id: product.id, rating: Number($("review-rating").value), text: $("review-text").value }) });
        $("review-status").textContent = result.message;
        loadReviews(product.id);
      } catch (error) { $("review-status").textContent = error.message; }
      finally { button.disabled = false; }
    });
  } catch (error) {
    node.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderCatalog() {
  const query = $("search").value.trim().toLowerCase();
  const group = $("category-filter").value;
  const stockFilter = $("stock-filter").value;
  const sort = $("sort").value;
  saveCatalogFilters();
  let visible = categories.filter((item) =>
    (group === "all" || (item.group || "other") === group) &&
    (stockFilter !== "in-stock" || item.stock > 0) &&
    matchesSearch(item, query)
  );
  visible.sort((a, b) => {
    if (sort === "price-asc") return Number(a.price) - Number(b.price);
    if (sort === "price-desc") return Number(b.price) - Number(a.price);
    if (sort === "name") return a.name.localeCompare(b.name, "ru");
    if (sort === "stock") return Number(b.stock) - Number(a.stock);
    if (sort === "rating") return Number(b.rating) - Number(a.rating);
    return Number(a.id) - Number(b.id);
  });
  const groups = new Map();
  visible.forEach((item) => {
    const key = item.group || "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const hasActiveFilters = Boolean(query) || group !== "all" || stockFilter !== "all" || sort !== "default";
  const categoryView = group !== "all"
    ? `<section class="catalog-group"><h2 class="group-title">${escapeHtml(groupTitle(group))}</h2><div class="group-items">${visible.map(cardTemplate).join("")}</div></section>`
    : hasActiveFilters
      ? [...groups.entries()].map(([key, items]) => `
    <section class="catalog-group">
      <h2 class="group-title">${escapeHtml(groupTitle(key))}</h2>
      <div class="group-items">${items.map(cardTemplate).join("")}</div>
    </section>
  `).join("")
  : [...groups.entries()].map(([key, items]) => `
    <section class="catalog-group">
  <h2 class="group-title">${escapeHtml(groupTitle(key))}</h2>
  <div class="group-items">${items.map(cardTemplate).join("")}</div>
    </section>
  `).join("");
  catalogNode.innerHTML = visible.length ? categoryView : `<div class="empty-state catalog-empty"><span class="empty-illustration" aria-hidden="true">⌕</span><strong>Ничего не нашли</strong><span>Попробуйте изменить запрос или сбросить фильтры.</span><button class="secondary-button" data-reset-filters type="button">Сбросить фильтры</button></div>`;
  statusNode.hidden = true;
}

function matchesSearch(item, query) {
  if (!query) return true;
  const normalize = (value) => String(value || "").toLocaleLowerCase("ru-RU")
    .normalize("NFKC").replace(/[ё]/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const text = normalize(`${item.name || ""} ${item.description || ""}`);
  const words = text.split(/\s+/).filter(Boolean);
  return normalize(query).split(/\s+/).filter(Boolean).every((word) =>
    text.includes(word) || words.some((token) => fuzzyWordMatch(word, token))
  );
}
function fuzzyWordMatch(query, token) {
  if (query === token) return true;
  const distanceLimit = query.length < 5 ? 1 : Math.max(1, Math.ceil(query.length * .3));
  if (levenshtein(query, token) <= distanceLimit) return true;
  // Also accept a dropped/extra character, a common mobile keyboard typo.
  const [shorter, longer] = query.length <= token.length ? [query, token] : [token, query];
  let index = 0;
  for (const char of shorter) {
    index = longer.indexOf(char, index);
    if (index < 0) return false;
    index += 1;
  }
  return longer.length - shorter.length <= 2;
}
function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const value = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = value; }
  }
  return row[b.length];
}
function renderCatalogSkeleton(count = 6) {
  catalogNode.innerHTML = `<div class="skeleton-grid">${Array.from({ length: count }, () => `
    <article class="card skeleton-card" aria-hidden="true">
      <div class="skeleton skeleton-short"></div><div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-price"></div><div class="skeleton skeleton-buttons"></div>
    </article>`).join("")}</div>`;
    statusNode.hidden = false;
    statusNode.textContent = "Загрузка каталога...";
}

function cardTemplate(item) {
  const rating = Number(item.rating || 0);
  const reviews = Number(item.reviews_count || 0);
  const badges = (item.badges || []).slice(0, 2)
    .map((badge) => `<span class="badge">${escapeHtml(badge)}</span>`).join("");
  return `<article class="card" data-product-id="${item.id}" tabindex="0" aria-label="${escapeHtml(item.name)}" data-tilt-card>
    <div class="product-card-main">
      <div class="product-card-copy">
        <div class="card-top"><span class="pill">${escapeHtml(groupTitle(item.group || "other"))}</span><button class="favorite-button ${item.favorite ? "is-favorite" : ""}" data-favorite-id="${item.id}" aria-label="${item.favorite ? "Удалить из избранного" : "Добавить в избранное"}">${item.favorite ? "♥" : "♡"}</button></div>
        ${badges ? `<div class="badges">${badges}</div>` : ""}
        <h2>${escapeHtml(item.name)}</h2>
        <p class="description">${escapeHtml(item.description || "Моментальная выдача после оплаты")}</p>
        <div class="product-rating" aria-label="Рейтинг ${rating.toFixed(1)} из 5">${rating ? `★ ${rating.toFixed(1)}` : "Новый товар"} <span>· ${reviews} отзывов</span></div>
      </div>
    </div>
    <div class="card-bottom">
      <div class="card-price-stock"><div class="price">${Number(item.price).toFixed(2)} <small>USDT</small></div><span class="stock ${item.stock > 0 ? "stock-available" : "stock-empty"}">${item.stock > 0 ? `В наличии: ${item.stock}шт` : "Нет в наличии"}</span></div>
      <div class="card-actions">${item.stock > 0 ? `<button class="cart-add" data-id="${item.id}">В корзину</button>` : ""}<button class="buy" data-id="${item.id}" ${item.stock < 1 ? "disabled" : ""}>${item.stock < 1 ? "Нет в наличии" : "Купить"}</button></div>
    </div>
  </article>`;
}

function groupTitle(group) {
  return { l0gu_1970: "Мобильные операторы", gy_1970: "Госуслуги", tbank: "Банковские аккаунты", other: "Другие товары" }[group] || group;
}
function handleCardTilt(event) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || event.pointerType === "touch") return;
  const card = event.target.closest("[data-tilt-card]");
  const activeCard = document.querySelector(".card.is-tilting");
  if (activeCard && activeCard !== card) resetCardTilt({ target: activeCard });
  if (!card) return;
  const bounds = card.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - .5;
  const y = (event.clientY - bounds.top) / bounds.height - .5;
  card.classList.add("is-tilting");
  card.style.setProperty("--tilt-x", `${(y * -3.2).toFixed(2)}deg`);
  card.style.setProperty("--tilt-y", `${(x * 3.2).toFixed(2)}deg`);
}

function resetCardTilt(event) {
  const card = event.target.closest?.("[data-tilt-card]") || document.querySelector(".card.is-tilting");
  if (!card) return;
  card.classList.remove("is-tilting");
  card.style.removeProperty("--tilt-x");
  card.style.removeProperty("--tilt-y");
}

function handleCatalogClick(event) {
  if (event.target.closest("[data-favorite-notify]")) return;
  if (event.target.closest("[data-reset-filters]")) {
    $("reset-filters").click();
    return;
  }
  if (event.target.closest("[data-favorite-id]")) return;
  const button = event.target.closest("button[data-id]");
  const card = event.target.closest("[data-product-id]");
  const itemId = button?.dataset.id || card?.dataset.productId;
  const item = categories.find((entry) => String(entry.id) === itemId)
    || favoriteItems.find((entry) => String(entry.id) === itemId);
  if (!item) return;
  if (!button) { openProductPage(item); return; }
  if (button.classList.contains("cart-add")) {
    addToCart(item.id);
    haptic("light");
    button.classList.add("is-added");
    button.textContent = "Добавлено ✓";
    button.closest(".card")?.classList.add("cart-added");
    setTimeout(() => {
      button.classList.remove("is-added");
      button.textContent = "В корзину";
      button.closest(".card")?.classList.remove("cart-added");
    }, 1200);
    showToast("Товар добавлен в корзину");
  } else openCheckout(item);
}

function openCheckout(item) {
  checkoutReturnFocus = document.activeElement;
  checkoutRequestKey = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  selected = item;
  checkoutMode = "single";
  quantity = 1;
  $("checkout-promo").value = activePromo?.code || "";
  $("checkout-promo-status").textContent = activePromo?.message || "";
  $("quantity-controls").hidden = false;
  $("checkout-name").textContent = item.name;
  $("checkout-price").textContent = `${Number(item.price).toFixed(2)} USDT за штуку · в наличии ${item.stock}`;
  $("checkout-description").textContent = item.description || "Описание отсутствует";
  $("payment-waiting").hidden = true;
  $("payment-options").hidden = false;
  pendingPayment = null;
  loadReviews(item.id);
  checkoutNode.hidden = false;
  document.body.classList.add("checkout-open");
  updateCheckout();
  if (currentBalance === null) loadProfile().then(updateCheckout);
  requestAnimationFrame(() => $("checkout-close").focus());
}

function openCartCheckout() {
  if (!cart.length) return;
  const unavailable = cart.some((line) => {
    const item = categories.find((entry) => entry.id === line.id);
    return !item || item.stock < 1 || line.quantity > item.stock;
  });
  if (unavailable) return showToast("Уберите недоступные товары из корзины", "error");
  selected = null;
  checkoutReturnFocus = document.activeElement;
  checkoutRequestKey = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  checkoutMode = "cart";
  $("checkout-promo").value = activePromo?.code || "";
  $("checkout-promo-status").textContent = activePromo?.message || "";
  $("quantity-controls").hidden = true;
  $("checkout-name").textContent = "Ваша корзина";
  $("checkout-price").textContent = `${cart.length} ${plural(cart.length, "позиция", "позиции", "позиций")}`;
  $("checkout-description").textContent = cart.map((line) => {
    const item = categories.find((entry) => entry.id === line.id);
    return `${item?.name || "Товар"} × ${line.quantity}`;
  }).join("\n");
  $("payment-waiting").hidden = true;
  $("payment-options").hidden = false;
  pendingPayment = null;
  checkoutNode.hidden = false;
  document.body.classList.add("checkout-open");
  updateCheckout();
  if (currentBalance === null) loadProfile().then(updateCheckout);
  requestAnimationFrame(() => $("checkout-close").focus());
}

function closeCheckout() {
  if (purchasePollTimer) clearInterval(purchasePollTimer);
  if (purchaseExpiryTimer) clearInterval(purchaseExpiryTimer);
  purchasePollTimer = null;
  purchaseExpiryTimer = null;
  pendingPayment = null;
  checkoutNode.hidden = true;
  document.body.classList.remove("checkout-open");
  selected = null;
  checkoutRequestKey = null;
  if (checkoutReturnFocus?.focus) checkoutReturnFocus.focus();
  checkoutReturnFocus = null;
}

async function loadReviews(catId) {
  const node = $("checkout-reviews");
  node.innerHTML = "<span class=\"muted\">Загрузка отзывов...</span>";
  try {
    const data = await api(`/api/reviews?cat_id=${encodeURIComponent(catId)}`);
    const rating = data.count ? `★ ${Number(data.rating).toFixed(1)} · ${data.count} отзывов` : "Отзывов пока нет";
    node.innerHTML = `<strong>${rating}</strong>` + (data.reviews?.length
      ? data.reviews.slice(0, 3).map((review) => `<p>★ ${Number(review.rating)} ${escapeHtml(review.text)}</p>`).join("")
      : "");
  } catch {
    node.textContent = "Отзывы временно недоступны.";
  }
}

function changeQuantity(delta) {
  if (!selected) return;
  quantity = Math.max(1, Math.min(Number(selected.stock), quantity + delta));
  updateCheckout();
}

function checkoutLines() {
  return checkoutMode === "cart" ? cart : [{ id: selected.id, quantity }];
}

function lineTotal(item, count) {
  const subtotal = Number(item.price) * count;
  return count >= 10 ? subtotal * .8 : subtotal;
}

function baseCheckoutTotal() {
  return checkoutLines().reduce((sum, line) => {
    const item = categories.find((entry) => entry.id === line.id);
    return sum + (item ? lineTotal(item, line.quantity) : 0);
  }, 0);
}

function updateCheckout() {
  if (checkoutMode === "single") quantityNode.textContent = quantity;
  const base = baseCheckoutTotal();
  const discount = activePromo?.promo_type === "percent" ? Number(activePromo.amount) : 0;
  const total = base * (1 - discount / 100);
  $("checkout-total").textContent = `Итого: ${total.toFixed(2)} USDT`;
  const balance = Number(currentBalance);
  const hasBalance = Number.isFinite(balance);
  $("checkout-balance").textContent = hasBalance
    ? `Баланс: ${balance.toFixed(2)} USDT`
    : "Баланс: загрузка...";
  $("checkout-shortage").hidden = !hasBalance || balance >= total;
  if (hasBalance && balance < total) {
    $("checkout-shortage").textContent = `Не хватает ${(total - balance).toFixed(2)} USDT`;
  }
  $("pay-balance").disabled = hasBalance && balance < total;
}

async function applyPromo(input, output) {
  const code = input.value.trim().toUpperCase();
  if (!code) { output.textContent = "Введите промокод."; return; }
  output.textContent = "Проверяем...";
  try {
    const result = await api("/api/promo", { method: "POST", body: JSON.stringify({ code }) });
    if (result.promo_type === "fixed") {
      activePromo = null;
      output.textContent = result.message;
      input.value = "";
      loadProfile();
      showToast("Промокод применён");
      haptic("success");
      return;
    }
    activePromo = result;
    $("checkout-promo").value = code;
    $("promo-input").value = code;
    output.textContent = result.message;
    updateCheckout();
    showToast("Промокод применён");
    haptic("success");
  } catch (error) {
    output.textContent = error.message;
  }
}

function submitPurchase(payment) {
  if (!tg) { setStatus("Откройте Web App внутри Telegram для покупки."); return; }
  if (payment === "stars" && checkoutMode === "cart") {
    $("checkout-promo-status").textContent = "Telegram Stars доступны для одного товара. Для корзины используйте баланс или xRocket.";
    return;
  }
  const lines = checkoutLines();
  if (!lines.length || lines.some((line) => !categories.find((item) => item.id === line.id))) return;
  const purchaseLines = lines.map((line) => ({ id: line.id, quantity: line.quantity }));
  const amount = (baseCheckoutTotal() * (1 - (activePromo?.amount || 0) / 100)).toFixed(2);
  tg.showPopup({
    title: "Подтверждение покупки",
    message: `${checkoutMode === "cart" ? "Корзина" : selected.name}\n${amount} USDT`,
    buttons: [{ id: "confirm", type: "default", text: "Подтвердить" }, { id: "cancel", type: "cancel", text: "Отмена" }]
  }, async (buttonId) => {
    if (buttonId !== "confirm") return;
    haptic("medium");
    const payload = {
      action: "purchase",
      payment,
      idempotency_key: checkoutRequestKey
    };
    if (checkoutMode === "single") {
      // Keep the legacy fields for containers that have not restarted yet.
      payload.cat_id = Number(lines[0].id);
      payload.quantity = Number(lines[0].quantity);
      payload.items = [{ cat_id: payload.cat_id, quantity: payload.quantity }];
    } else {
      payload.items = lines.map((line) => ({
        cat_id: Number(line.id),
        quantity: Number(line.quantity)
      }));
    }
    if (activePromo?.promo_type === "percent") payload.promo_code = activePromo.code;
    const payButtons = ["pay-balance", "pay-xrocket", "pay-cryptobot", "pay-stars"]
      .map((id) => $(id)).filter(Boolean);
    payButtons.forEach((button) => {
      button.disabled = true;
      button.classList.add("is-loading");
      button.setAttribute("aria-busy", "true");
    });
    try {
      if (!await waitForTelegramInitData()) {
        $("favorites-status").hidden = false;
        throw new Error("Откройте приложение из Telegram");
      }
      const result = await api("/api/purchase", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (result.provider === "balance" && result.status === "paid") {
        applyPurchasedStock(purchaseLines);
        cart = checkoutMode === "cart" ? [] : cart;
        saveCart();
        closeCheckout();
        loadProfile();
        loadHistory();
        const itemText = (result.items || []).map((item) => item.data).join("\n");
        showSuccessScreen(result.order_number, itemText);
        haptic("success");
        return;
      }
      if (["xrocket", "cryptobot"].includes(result.provider) && result.pay_url) {
        pendingPayment = { ...result, purchaseLines };
        showPaymentWaiting(pendingPayment);
        showToast(`Счёт ${result.provider === "cryptobot" ? "CryptoBot" : "xRocket"} создан`);
        pollPurchasePayment();
        return;
      }

      if (result.provider === "stars" && result.invoice_link) {
        if (!tg.openInvoice) throw new Error("Telegram Stars недоступны в этом клиенте");
        tg.openInvoice(result.invoice_link, (invoiceStatus) => {
          if (invoiceStatus === "paid") {
            applyPurchasedStock(purchaseLines);
            closeCheckout();
            showSuccessScreen(result.order_number, "Товар будет доступен в истории покупок после подтверждения.");
            loadProfile();
            loadHistory();
            haptic("success");
          } else if (invoiceStatus === "cancelled" || invoiceStatus === "failed") {
            showToast("Оплата отменена", "error");
          }
        });
        return;
      }
      throw new Error("Сервер не вернул данные платежа");
    } catch (error) {
      showToast(error.message, "error");
      setStatus(error.message);
    } finally {
      payButtons.forEach((button) => {
        button.disabled = false;
        button.classList.remove("is-loading");
        button.removeAttribute("aria-busy");
      });
    }
  });
}

function showPaymentWaiting(result) {
  const providerName = result.provider === "cryptobot" ? "CryptoBot" : "xRocket";
  $("xrocket-choice-qr-panel").hidden = true;
  $("xrocket-qr-choice").textContent = "Оплатить через QR-код";
  $("payment-waiting").hidden = false;
  $("payment-options").hidden = true;
  $("waiting-order").textContent = result.order_number
    ? `Заказ ${result.order_number} · ${Number(result.amount || 0).toFixed(2)} USDT`
    : `Счёт ${providerName} создан`;
  $("payment-qr").src = `https://quickchart.io/qr?size=220&text=${encodeURIComponent(result.pay_url)}`;
  $("waiting-amount").textContent = `${Number(result.amount || 0).toFixed(2)} USDT`;
  $("waiting-status").textContent = "Проверяем оплату автоматически...";
  $("waiting-open").textContent = `Открыть ${providerName}`;
  $("waiting-indicator").textContent = "● Проверка каждые 4 секунды";
  const createdAt = Date.now();
  const expiresAt = createdAt + 30 * 60 * 1000;
  if (purchaseExpiryTimer) clearInterval(purchaseExpiryTimer);
  purchaseExpiryTimer = setInterval(() => {
    const remaining = Math.max(0, expiresAt - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    $("waiting-expiry").textContent = remaining
      ? `Счёт действует ещё ${minutes}:${String(seconds).padStart(2, "0")}`
      : "Срок счёта истёк";
    if (!remaining) {
      clearInterval(purchaseExpiryTimer);
      $("waiting-indicator").textContent = "● Счёт больше не принимается";
      $("waiting-check").disabled = true;
    }

  }, 1000);
  $("waiting-check").disabled = false;
  $("waiting-check").classList.remove("is-loading");
  $("waiting-expiry").textContent = "Счёт действует 30 минут";
  xrocketChoice = {
    payUrl: result.pay_url,
    amount: result.amount,
    mode: "purchase",
    provider: result.provider,
    qrShown: false,
  };
  setExternalPaymentProvider(result.provider);
  $("xrocket-choice-description").textContent = `Счёт создан на нужную сумму. Перейдите в ${providerName} или оплатите по QR-коду.`;
  $("xrocket-open-choice").textContent = `Перейти в ${providerName}`;
  $("xrocket-choice-modal").hidden = false;
  $("xrocket-open-choice").focus();
}

function setExternalPaymentProvider(provider) {
  const isCryptoBot = provider === "cryptobot";
  const name = isCryptoBot ? "CRYPTOBOT" : "XROCKET";
  const image = isCryptoBot ? "./assets/cryptobot-icon.png" : "./assets/xrocket-icon.png";
  $("external-payment-provider").innerHTML = `<img class="payment-provider-icon" src="${image}" alt=""> <span>${name}</span>`;
}

function showSuccessScreen(orderNumber, itemText) {
  closeCheckout();
  $("success-order").textContent = orderNumber ? `Заказ ${orderNumber} оплачен.` : "Заказ оплачен.";
  $("success-items").textContent = itemText || "Товар доступен в разделе «Покупки».";
  $("purchase-success").hidden = false;
  $("purchase-success").classList.remove("success-visible");
  requestAnimationFrame(() => $("purchase-success").classList.add("success-visible"));
  launchConfetti();
  $("success-close").focus();
}

function launchConfetti() {
  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  const colors = ["#7ce7d3", "#20aaf0", "#ffffff", "#f4d37c", "#9b8cff"];
  for (let index = 0; index < 34; index += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${35 + Math.random() * 30}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.setProperty("--x", `${(Math.random() - .5) * 80}vw`);
    piece.style.setProperty("--r", `${Math.round((Math.random() - .5) * 900)}deg`);
    piece.style.animationDelay = `${Math.random() * .22}s`;
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 2200);
}

function closeSuccess() {
  $("purchase-success").hidden = true;
}

async function checkPurchasePayment(manual = false) {
  if (!pendingPayment?.invoice_id) return false;
  const status = $("waiting-status");
  const checkButton = $("waiting-check");
  let terminal = false;
  if (manual) {
    status.textContent = "Проверяем оплату...";
    checkButton.disabled = true;
    checkButton.classList.add("is-loading");
  }
  try {
    const result = await api(`/api/purchase/status?invoice_id=${encodeURIComponent(pendingPayment.invoice_id)}`);
    if (result.status === "paid" || result.status === "fulfilled") {
      status.textContent = `Оплата подтверждена. Заказ ${result.order_number || ""} выдан.`;
      showToast("Оплата подтверждена");
      applyPurchasedStock(pendingPayment.purchaseLines || []);
      pendingPayment = null;
      if (purchasePollTimer) clearInterval(purchasePollTimer);
      if (purchaseExpiryTimer) clearInterval(purchaseExpiryTimer);
      loadHistory();
      loadProfile();
      haptic("success");
      return true;
    }
    if (result.status === "expired" || result.status === "cancelled") {
      status.textContent = "Счёт просрочен. Создайте новый заказ.";
      $("waiting-indicator").textContent = "● Счёт закрыт";
      $("waiting-check").disabled = true;
      if (manual) showToast("Счёт просрочен или отменён", "error");
      terminal = true;
      return true;
    }
    if (manual) {
      status.textContent = "Оплата ещё не поступила.";
      showToast("Платёж ещё не поступил");
    }
  } catch (error) {
    if (manual) {
      status.textContent = error.message;
      showToast(error.message, "error");
    }
  } finally {
    if (manual) {
      checkButton.disabled = terminal;
      checkButton.classList.remove("is-loading");
    }
  }
  return false;
}

function pollPurchasePayment() {
  let attempts = 0;
  if (purchasePollTimer) clearInterval(purchasePollTimer);
  purchasePollTimer = setInterval(async () => {
    if (!pendingPayment || ++attempts > 90) {
      clearInterval(purchasePollTimer);
      purchasePollTimer = null;
      if (pendingPayment) $("waiting-status").textContent = "Проверка остановлена. Нажмите «Проверить оплату».";
      return;
    }
    if (await checkPurchasePayment()) {
      clearInterval(purchasePollTimer);
      purchasePollTimer = null;
    }
  }, 4000);
}

function addToCart(id, count = 1) {
  const item = categories.find((entry) => entry.id === id);
  if (!item) return;
  const line = cart.find((entry) => entry.id === id);
  if (!item.stock) return showToast("Товар закончился", "error");
  if (line) line.quantity = Math.min(item.stock, line.quantity + count);
  else cart.push({ id, quantity: Math.min(item.stock, count), price: Number(item.price) });
  saveCart();
  renderCart();
  const card = document.querySelector(`[data-product-id="${id}"]`);
  card?.classList.remove("cart-added");
  requestAnimationFrame(() => card?.classList.add("cart-added"));
  showToast(`${item.name} добавлен в корзину`, "success");
  haptic("light");
}

function handleCartClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = Number(button.dataset.id);
  const line = cart.find((entry) => entry.id === id);
  const item = categories.find((entry) => entry.id === id);
  if (!line || !item) return;
  if (button.dataset.action === "plus") line.quantity = Math.min(item.stock, line.quantity + 1);
  if (button.dataset.action === "minus") line.quantity -= 1;
  if (button.dataset.action === "remove" || line.quantity < 1) cart = cart.filter((entry) => entry.id !== id);
  saveCart();
  renderCart();
}

function renderCart() {
  const list = $("cart-list");
  list.innerHTML = cart.map((line) => {
    const item = categories.find((entry) => entry.id === line.id);
    if (!item) return "";
    const unavailable = item.stock < 1;
    const priceChanged = line.price != null && Number(line.price) !== Number(item.price);
    const stockChanged = item.stock > 0 && line.quantity > item.stock;
    return `<article class="cart-line ${unavailable ? "is-unavailable" : ""}"><div><strong>${escapeHtml(item.name)}</strong><span>${Number(item.price).toFixed(2)} USDT</span>${priceChanged ? `<em class="cart-warning">Цена изменилась с ${Number(line.price).toFixed(2)} USDT</em>` : ""}${stockChanged ? `<em class="cart-warning">Доступно только ${item.stock} шт.</em>` : ""}${unavailable ? `<em class="cart-warning">Нет в наличии</em>` : ""}</div>
      <div class="cart-controls"><button data-action="minus" data-id="${item.id}" aria-label="Уменьшить количество">−</button><b class="quantity-value">${line.quantity}</b><button data-action="plus" data-id="${item.id}" ${unavailable ? "disabled" : ""} aria-label="Увеличить количество">+</button><button class="remove" data-action="remove" data-id="${item.id}">Удалить</button></div></article>`;
  }).join("");
  const hasItems = cart.length > 0;
  $("cart-clear").hidden = !hasItems;
  $("cart-empty").hidden = hasItems;
  $("cart-summary").hidden = !hasItems;
  const baseTotal = cart.reduce((sum, line) => {
    const item = categories.find((entry) => entry.id === line.id);
    return sum + (item ? Number(item.price) * line.quantity : 0);
  }, 0);
  const total = baseCartTotal();
  const savings = Math.max(0, baseTotal - total);
  $("cart-total").innerHTML = `${total.toFixed(2)} USDT`;
  $("cart-savings").textContent = `${savings.toFixed(2)} USDT`;
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  const bonusTarget = 10;
  const progress = Math.min(100, count / bonusTarget * 100);
  $("cart-progress-fill").style.width = `${progress}%`;
  $("cart-progress-label").textContent = count >= bonusTarget ? "Бонус активирован" : "До скидки 20%";
  $("cart-progress-value").textContent = count >= bonusTarget ? "−20%" : `ещё ${bonusTarget - count} ${plural(bonusTarget - count, "товар", "товара", "товаров")}`;
  $("cart-count").textContent = count;
  $("cart-count").hidden = count < 1;
  $("cart-bar").hidden = count < 1 || !$("catalog-view").classList.contains("active-view");
  $("cart-bar-count").textContent = count;
  $("cart-bar-total").textContent = `${baseCartTotal().toFixed(2)} USDT`;
  if (count !== previousCartCount) {
    const countNode = $("cart-count");
    countNode.classList.remove("count-pop");
    void countNode.offsetWidth;
    countNode.classList.add("count-pop");
    previousCartCount = count;
  }
}

function baseCartTotal() {
  return cart.reduce((sum, line) => {
    const item = categories.find((entry) => entry.id === line.id);
    return sum + (item && item.stock > 0 ? lineTotal(item, Math.min(line.quantity, item.stock)) : 0);
  }, 0);
}

async function loadProfile() {
  const initData = await waitForTelegramInitData();
  if (!initData) {
    $("profile-card").innerHTML = `<div class="empty-state">Telegram не передал данные авторизации Mini App. Закройте приложение и откройте его заново кнопкой бота.</div>`;
    $("referral-card").innerHTML = `<div class="empty-state">Нет данных авторизации Telegram.</div>`;
    return;
  }
  try {
    const data = await api("/api/profile");
    currentBalance = Number(data.balance);
    const user = data.user || {};
    if ($("recovery-setting-status")) {
      $("recovery-setting-status").textContent = data.recovery_phrase_ready
        ? "Фраза настроена и подтверждена. По соображениям безопасности повторно посмотреть её нельзя."
        : "Фраза восстановления ещё не настроена. Без неё нельзя привязать другой Telegram.";
      $("recovery-create-button").hidden = Boolean(data.recovery_phrase_ready);
    }
    const photoUrl = String(user.photo_url || "").trim();
    const avatarFallback = escapeHtml((user.first_name || user.username || "?").slice(0, 1).toUpperCase());
    const avatar = photoUrl
      ? `<img src="${escapeHtml(photoUrl)}" alt="" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>${avatarFallback}</span>`
      : avatarFallback;
    const adminBadge = data.is_admin ? `<span class="admin-badge">Admin</span>` : "";
    $("profile-card").innerHTML = `<div class="profile-main"><div class="profile-avatar">${avatar}</div><div class="profile-identity"><h3>${escapeHtml([user.first_name, user.last_name].filter(Boolean).join(" ") || "Пользователь")}</h3><div class="profile-username"><span>${user.username ? "@" + escapeHtml(user.username) : "ID " + user.id}</span>${adminBadge}</div></div></div>
      <div class="stats"><div><strong>${Number(data.balance).toFixed(2)}</strong><span>USDT на балансе</span></div><div><strong>${data.purchases || 0}</strong><span>товаров куплено</span></div><div><strong>${data.referrals?.count || 0}</strong><span>рефералов</span></div></div><p class="profile-date">Регистрация: ${formatDate(data.created_at)}</p>`;
    const referrals = data.referrals || {};
    const referralLink = referrals.link || "";
    $("referral-card").innerHTML = `<div class="profile-card-heading"><strong>Реферальная программа</strong><span>Получайте 10% с покупок друзей</span></div>
      <div class="referral-link"><code>${escapeHtml(referralLink || "Ссылка недоступна")}</code><button class="copy-button" type="button" data-copy="${escapeHtml(referralLink)}" ${referralLink ? "" : "disabled"}>Копировать</button></div>
      <div class="referral-stats"><div><strong>${Number(referrals.count || 0)}</strong><span>рефералов</span></div><div><strong>${Number(referrals.earnings || 0).toFixed(2)}</strong><span>заработано USDT</span></div></div>`;
    renderCatalog();
  } catch (error) {
    currentBalance = null;
    const authMessages = {
      init_data_missing: "Telegram не передал данные авторизации. Закройте Mini App и откройте его кнопкой в боте.",
      init_data_expired: "Данные авторизации устарели. Закройте Mini App и откройте его заново из бота.",
      signature_mismatch: "Сервер не подтвердил подпись Telegram. Перезапустите бота и API, чтобы загрузились основной бот и подключённые зеркала.",
      invalid_auth_date: "Telegram передал некорректное время авторизации. Перезапустите Mini App.",
      invalid_hash_format: "Telegram передал некорректные данные авторизации. Перезапустите Mini App.",
      duplicate_fields: "В данных авторизации повторяются поля. Закройте Mini App и откройте его заново.",
      init_data_too_large: "Данные авторизации слишком велики. Обратитесь в поддержку.",
      malformed_init_data: "Не удалось разобрать данные авторизации. Закройте Mini App и откройте его заново."
    };
    const message = error.authError
      ? authMessages[error.authError] || "Сервер не смог подтвердить авторизацию Telegram."
      : error.message;
    $("profile-card").innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    $("referral-card").innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  }
}

async function loadHistory() {
  if (!await waitForTelegramInitData()) { $("history-status").textContent = "История доступна при открытии приложения из Telegram."; return; }
  $("history-status").textContent = "Загрузка...";
  try {
    const days = $("history-date-filter").value;
    const data = await api(`/api/history?limit=100&sort=newest&status=all&days=${encodeURIComponent(days)}`);
    $("history-list").innerHTML = data.history?.length ? data.history.map((entry) => {
      const status = entry.status || "delivered";
      const method = entry.payment_method === "xrocket" ? "xRocket" : entry.payment_method === "cryptobot" ? "CryptoBot" : entry.payment_method === "stars" ? "Telegram Stars" : "Баланс";
      return `<article class="history-item"><div><strong>${escapeHtml(entry.product)}</strong><span>${escapeHtml(entry.item_preview || "Товар выдан")}</span><span class="history-meta"><b>${escapeHtml(entry.order_number || "Заказ")}</b> · ${method} · ${Number(entry.amount || 0).toFixed(2)} USDT</span></div><div class="history-actions"><time>${formatDate(entry.date)}</time><span class="order-status status-${escapeHtml(status)}">${statusLabel(status)}</span><div class="history-buttons"><button class="text-button" data-order-action="receive" data-history-id="${entry.id}" data-order-number="${escapeHtml(entry.order_number || "")}" ${status === "fulfilled" || status === "delivered" ? "" : "disabled"}>Получить товар</button><button class="text-button" data-order-action="copy" data-history-id="${entry.id}" ${status === "fulfilled" || status === "delivered" ? "" : "disabled"}>Скопировать товар</button><button class="text-button" data-repeat-cat="${entry.cat_id || ""}" ${entry.cat_id ? "" : "disabled"}>Повторить покупку</button><button class="text-button support-button" data-order-action="support" data-order-number="${escapeHtml(entry.order_number || "")}">Проблема с заказом</button></div></div></article>`;
    }).join("") : `<div class="empty-state"><span class="empty-illustration" aria-hidden="true">▤</span><strong>Покупок пока нет</strong><span>Ваши выданные товары появятся здесь.</span><button class="secondary-button" data-view="catalog-view" type="button">Перейти в каталог</button></div>`;
    $("history-status").textContent = data.history?.length ? `${data.history.length} записей` : "";
  } catch (error) { $("history-status").innerHTML = `${escapeHtml(error.message)} <button class="text-button inline-retry" type="button" data-retry="history">Повторить</button>`; }
}

async function loadFavorites() {
  if (!await waitForTelegramInitData()) {
    $("favorites-status").textContent = "Избранное доступно при открытии приложения из Telegram.";
    $("favorites-list").innerHTML = "";
    return;
  }
  $("favorites-status").hidden = false;
  $("favorites-status").textContent = "Загрузка...";
  try {
    const data = await api("/api/favorites");
    favoriteItems = data.favorites || [];
    const stockFilter = $("favorites-stock-filter").value;
    const sort = $("favorites-sort").value;
    const visible = favoriteItems.filter((item) => stockFilter !== "in-stock" || item.stock > 0).sort((a, b) => {
      if (sort === "price-asc") return Number(a.price) - Number(b.price);
      if (sort === "price-desc") return Number(b.price) - Number(a.price);
      return Number(b.id) - Number(a.id);
    });
    $("favorites-list").innerHTML = visible.length
      ? `<div class="group-items">${visible.map((item) => `${cardTemplate({...item, favorite: true, description: "Сохранённый товар"})}
        <div class="favorite-notifications">
          <button type="button" class="notification-toggle ${item.notify_price ? "active" : ""}" data-favorite-notify="price" data-id="${item.id}" aria-pressed="${item.notify_price ? "true" : "false"}">Цена ${item.notify_price ? "включена" : "выключена"}</button>
          <button type="button" class="notification-toggle ${item.notify_stock ? "active" : ""}" data-favorite-notify="stock" data-id="${item.id}" aria-pressed="${item.notify_stock ? "true" : "false"}">Наличие ${item.notify_stock ? "включено" : "выключено"}</button>
        </div>`).join("")}</div>`
      : `<div class="empty-state">Сохранённых товаров пока нет.<br>Нажмите ♡ в карточке товара.</div>`;
    $("favorites-status").hidden = visible.length > 0;
    $("favorites-status").textContent = visible.length ? "" : "Нет подходящих товаров";
  } catch (error) { $("favorites-status").hidden = false; $("favorites-status").innerHTML = `${escapeHtml(error.message)} <button class="text-button inline-retry" type="button" data-retry="favorites">Повторить</button>`; }
}

async function toggleFavorite(catId, button) {
  if (!await waitForTelegramInitData()) {
    showToast("Откройте приложение из Telegram", "error");
    return;
  }
  const isFavorite = button.classList.contains("is-favorite");
  button.disabled = true;
  try {
    await api("/api/favorites", {
      method: "POST",
      body: JSON.stringify({ cat_id: catId, remove: isFavorite }),
    });
    const item = categories.find((entry) => entry.id === catId);
    if (item) item.favorite = !isFavorite;
    button.classList.toggle("is-favorite", !isFavorite);
    button.textContent = isFavorite ? "♡" : "♥";
    button.setAttribute("aria-label", isFavorite ? "Добавить в избранное" : "Удалить из избранного");
    showToast(isFavorite ? "Удалено из избранного" : "Добавлено в избранное");
    if (document.querySelector("#favorites-view.active-view")) loadFavorites();
  } catch (error) { showToast(error.message, "error"); }
  finally { button.disabled = false; }
}

async function toggleFavoriteNotification(button) {
  if (!await waitForTelegramInitData()) {
    showToast("Откройте приложение из Telegram", "error");
    return;
  }
  const catId = Number(button.dataset.id);
  const field = button.dataset.favoriteNotify === "price" ? "notify_price" : "notify_stock";
  const currentlyEnabled = button.getAttribute("aria-pressed") === "true";
  button.disabled = true;
  try {
    await api("/api/favorites", {
      method: "POST",
      body: JSON.stringify({ cat_id: catId, [field]: !currentlyEnabled }),
    });
    button.setAttribute("aria-pressed", String(!currentlyEnabled));
    button.classList.toggle("active", !currentlyEnabled);
    button.textContent = field === "notify_price"
      ? `Цена ${!currentlyEnabled ? "включена" : "выключена"}`
      : `Наличие ${!currentlyEnabled ? "включено" : "выключено"}`;
    showToast(!currentlyEnabled ? "Уведомления включены" : "Уведомления выключены");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

function statusLabel(status) {
  return ({
    created: "Создан",
    pending: "Ожидает оплаты",
    paid: "Оплачен",
    fulfilled: "Товар выдан",
    delivered: "Товар выдан",
    failed: "Ошибка выдачи",
    refunded: "Возврат",
    cancelled: "Возврат",
    expired: "Возврат",
  })[status] || "Статус уточняется";
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function setStatus(message) { statusNode.textContent = message; }
function haptic(style = "light") { try { tg?.HapticFeedback?.impactOccurred(style); } catch {} }
function showToast(message, type = "default") {
  const container = $("toast-container");
  if (!container) return;
  clearTimeout(toastTimeout);
  clearTimeout(toastRemovalTimeout);
  const toast = container.querySelector(".toast") || document.createElement("div");
  container.querySelectorAll(".toast").forEach((existingToast) => {
    if (existingToast !== toast) existingToast.remove();
  });
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  if (!toast.isConnected) container.appendChild(toast);
  toast.classList.remove("toast-visible");
  void toast.offsetWidth;
  requestAnimationFrame(() => toast.classList.add("toast-visible"));
  toastTimeout = setTimeout(() => {
    toast.classList.remove("toast-visible");
    toastRemovalTimeout = setTimeout(() => toast.remove(), 220);
  }, 2600);
}
async function copyText(value) {
  if (!value) throw new Error("Ссылка недоступна");
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}
async function startDeposit() {
  if (!await waitForTelegramInitData()) {
    showToast("Откройте приложение из Telegram", "error");
    return;
  }
  const amount = Number($("deposit-amount").value);
  const status = $("deposit-status");
  if (!Number.isFinite(amount) || amount < 1 || amount > 10000) {
    status.textContent = "Сумма должна быть от 1 до 10000 USDT.";
    return;
  }
  const submit = $("deposit-submit");
  submit.disabled = true;
  submit.classList.add("is-loading");
  submit.setAttribute("aria-busy", "true");
  status.textContent = "Создаём счёт...";
  try {
    const result = await api("/api/deposit", {
      method: "POST",
      body: JSON.stringify({ amount: Number(amount.toFixed(2)), provider: depositProvider })
    });
    if (depositProvider === "stars") {
      if (!tg?.openInvoice || !result.invoice_link) throw new Error("Telegram Stars недоступны в этом клиенте.");
      tg.openInvoice(result.invoice_link, (invoiceStatus) => {
        if (invoiceStatus === "paid") {
          showToast(`Баланс пополнен на ${amount.toFixed(2)} USDT`);
          status.textContent = "Оплата подтверждена.";
          loadProfile();
        } else if (invoiceStatus === "cancelled" || invoiceStatus === "failed") {
          status.textContent = "Оплата отменена.";
        }
      });
    } else {
      const providerName = result.provider === "cryptobot" ? "CryptoBot" : "xRocket";
      xrocketChoice = {
        payUrl: result.pay_url,
        amount,
        invoiceId: result.invoice_id,
        mode: "deposit",
        provider: result.provider,
        qrShown: false,
      };
      $("xrocket-choice-qr-panel").hidden = true;
      $("xrocket-qr-choice").textContent = "Оплатить через QR-код";
      setExternalPaymentProvider(result.provider);
      $("xrocket-choice-description").textContent = `Счёт создан на ${amount.toFixed(2)} USDT. Перейдите в ${providerName} или оплатите по QR-коду.`;
      $("xrocket-open-choice").textContent = `Перейти в ${providerName}`;
      $("xrocket-choice-modal").hidden = false;
      status.textContent = `Ожидаем оплату ${providerName}...`;
      pollDeposit(result.invoice_id, amount);
    }
  } catch (error) {
    status.textContent = error.message;
    showToast(error.message, "error");
  } finally {
    submit.disabled = false;
    submit.classList.remove("is-loading");
    submit.removeAttribute("aria-busy");
  }
}
function pollDeposit(invoiceId, amount) {
  clearInterval(depositPollTimer);
  let attempts = 0;
  depositPollTimer = setInterval(async () => {
    if (++attempts > 90) { clearInterval(depositPollTimer); $("deposit-status").textContent = "Время ожидания истекло."; return; }
    try {
      const result = await api(`/api/deposit/status?invoice_id=${encodeURIComponent(invoiceId)}`);
      if (result.status === "paid") {
        clearInterval(depositPollTimer);
        $("deposit-status").textContent = "Оплата подтверждена.";
        showToast(`Баланс пополнен на ${amount.toFixed(2)} USDT`);
        loadProfile();
      } else if (result.status === "expired") {
        clearInterval(depositPollTimer);
        $("deposit-status").textContent = "Счёт просрочен. Создайте новый.";
      }
    } catch (error) {
      clearInterval(depositPollTimer);
      $("deposit-status").textContent = error.message;
    }
  }, 4000);
}
async function checkDepositPayment(manual = false) {
  if (!xrocketChoice?.invoiceId) return false;
  const status = $("deposit-status");
  if (manual) status.textContent = "Проверяем оплату...";
  try {
    const result = await api(`/api/deposit/status?invoice_id=${encodeURIComponent(xrocketChoice.invoiceId)}`);
    if (result.status === "paid") {
      clearInterval(depositPollTimer);
      status.textContent = "Платеж поступил. Баланс пополнен.";
      showToast(`Баланс пополнен на ${Number(xrocketChoice.amount || 0).toFixed(2)} USDT`);
      loadProfile();
      xrocketChoice = null;
      return true;
    }
    if (result.status === "expired" || result.status === "cancelled") {
      clearInterval(depositPollTimer);
      status.textContent = "Счёт просрочен или отменён. Создайте новый.";
      if (manual) showToast("Счёт просрочен или отменён", "error");
      return true;
    }
    if (manual) {
      status.textContent = "Платеж ещё не поступил.";
      showToast("Платёж ещё не поступил");
    }
  } catch (error) {
    if (manual) {
      status.textContent = error.message;
      showToast(error.message, "error");
    }
  }
  return false;
}
function plural(value, one, few, many) { const n = Math.abs(value) % 100; return (n % 10 === 1 && n !== 11) ? one : (n % 10 >= 2 && n % 10 <= 4 && (n < 10 || n >= 20)) ? few : many; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
function loadCart() { try { return JSON.parse(localStorage.getItem("altera-cart") || "[]").filter((line) => line && Number(line.id) > 0 && Number(line.quantity) > 0); } catch { return []; } }
function saveCart() { localStorage.setItem("altera-cart", JSON.stringify(cart)); }

function applyPurchasedStock(lines) {
  const purchased = new Map();
  lines.forEach((line) => {
    const id = Number(line.id);
    const count = Number(line.quantity);
    if (Number.isInteger(id) && Number.isFinite(count) && count > 0) {
      purchased.set(id, (purchased.get(id) || 0) + count);
    }
  });
  if (!purchased.size) return;
  for (const item of [...categories, ...favoriteItems]) {
    const count = purchased.get(Number(item.id));
    if (count) item.stock = Math.max(0, Number(item.stock || 0) - count);
  }
  cart = cart
    .map((line) => ({
      ...line,
      quantity: Math.max(0, line.quantity - (purchased.get(Number(line.id)) || 0)),
    }))
    .filter((line) => line.quantity > 0);
  saveCart();
  renderCatalog();
  renderCart();
  const product = categories.find((item) => item.id === currentProductId);
  if (product) {
    const inStock = Number(product.stock) > 0;
    const stockLabel = $("product-detail").querySelector(".product-stock");
    if (stockLabel) stockLabel.textContent = inStock ? `В наличии: ${product.stock}шт` : "Нет в наличии";
    const stockBadge = $("product-detail").querySelector(".product-stock-badge");
    if (stockBadge) stockBadge.hidden = inStock;
    const buyButton = $("product-buy");
    const cartButton = $("product-cart");
    if (buyButton) buyButton.disabled = !inStock;
    if (cartButton) cartButton.disabled = !inStock;
  }
  if ($("favorites-view").classList.contains("active-view")) loadFavorites();
  loadCatalog({ showLoading: false });
}

async function loadCatalog({ showLoading = true } = {}) {
  if (showLoading) renderCatalogSkeleton();
  try {
    restoreCatalogFilters();
    const data = await api("/api/catalog");
    categories = data.categories || [];
    $("product-suggestions").innerHTML = categories
      .map((item) => `<option value="${escapeHtml(item.name)}"></option>`)
      .join("");
    const popularQueries = data.popular_queries || [...categories].sort((a, b) => Number(b.reviews_count || 0) - Number(a.reviews_count || 0)).slice(0, 5).map((item) => item.name);
    $("popular-queries").innerHTML = popularQueries.map((query) => `<button type="button" class="query-chip" data-query="${escapeHtml(query)}">${escapeHtml(query)}</button>`).join("");
    const groups = [...new Set(categories.map((item) => item.group || "other"))];
    $("category-filter").innerHTML = `<option value="all">Все категории</option>` + groups.map((group) => `<option value="${escapeHtml(group)}">${escapeHtml(groupTitle(group))}</option>`).join("");
    const savedCategory = $("category-filter").dataset.savedValue;
    if (savedCategory && groups.includes(savedCategory)) $("category-filter").value = savedCategory;
    cart = cart.filter((line) => categories.some((item) => item.id === line.id));
    cart.forEach((line) => { const item = categories.find((entry) => entry.id === line.id); line.quantity = Math.min(line.quantity, item.stock); });
    cart = cart.filter((line) => line.quantity > 0);
    saveCart();
    renderCatalog();
    renderCart();
  } catch (error) {
    statusNode.hidden = false;
    statusNode.innerHTML = `Не удалось загрузить каталог. <button class="text-button inline-retry" type="button" data-retry="catalog">Повторить</button>`;
    catalogNode.innerHTML = `<div class="empty-state"><span class="empty-illustration" aria-hidden="true">!</span><strong>Не удалось загрузить товары</strong><span>${escapeHtml(error.message || "Проверьте соединение и попробуйте ещё раз.")}</span></div>`;
  }
}

let appInitialized = false;
let activeRecoveryPhrase = "";

function initializeApp() {
  $("account-gate").hidden = true;
  if (appInitialized) return;
  appInitialized = true;
  const savedView = localStorage.getItem("altera-active-view");
  const savedViewNode = savedView && document.getElementById(savedView);
  if (savedViewNode?.classList.contains("view")) showView(savedView);
  if (savedView === "product-view") $("product-detail").innerHTML = `<div class="skeleton skeleton-product"></div>`;
  loadCatalog().then(() => {
    if (savedView === "product-view") {
      const productId = Number(localStorage.getItem("altera-active-product"));
      const product = categories.find((item) => item.id === productId);
      if (product) openProductPage(product);
      else showView("catalog-view");
    }
  });
  if (savedView !== "profile-view") loadProfile();
  if (localStorage.getItem(tutorialSeenKey) !== "true") {
    window.setTimeout(startTutorial, 500);
  }
}

function showAccountChoice() {
  $("account-gate").hidden = false;
  $("account-choice").hidden = false;
  $("account-login-form").hidden = true;
  $("account-backup").hidden = true;
  $("account-recovery-close").hidden = true;
  $("account-gate-title").textContent = "Приветствуем вас в Altera.";
}

async function beginRecoverySetup() {
  $("account-gate").hidden = false;
  $("account-choice").hidden = true;
  $("account-login-form").hidden = true;
  $("account-backup").hidden = false;
  $("account-recovery-close").hidden = false;
  $("account-recovery-phrase-step").hidden = false;
  $("account-recovery-check-step").hidden = true;
  $("account-gate-title").textContent = "Сохраните фразу восстановления";
  $("account-recovery-status").textContent = "";
  $("account-recovery-continue").disabled = false;
  $("account-recovery-cancel").disabled = false;
  try {
    const data = await api("/api/account/recovery/start", { method: "POST", body: "{}" });
    activeRecoveryPhrase = data.phrase;
    $("account-recovery-words").replaceChildren(...data.phrase.split(" ").map((word) => {
      const item = document.createElement("li");
      item.textContent = word;
      return item;
    }));
  } catch (error) {
    $("account-recovery-status").textContent = error.message || "Не удалось создать фразу восстановления.";
  }
}

async function cancelRecoverySetup() {
  const closeButton = $("account-recovery-close");
  const cancelButton = $("account-recovery-cancel");
  closeButton.disabled = true;
  cancelButton.disabled = true;
  try {
    await api("/api/account/recovery/cancel", { method: "POST", body: "{}" });
    activeRecoveryPhrase = "";
    $("account-recovery-words").replaceChildren();
    $("account-recovery-answers").replaceChildren();
    $("account-recovery-form").reset();
    $("account-recovery-status").textContent = "";
    $("account-recovery-check-status").textContent = "";
    $("account-recovery-close").hidden = true;
    $("account-backup").hidden = true;
    $("account-gate").hidden = true;
  } catch (error) {
    showToast(error.message || "Не удалось отменить действие. Попробуйте ещё раз.", "error");
  } finally {
    closeButton.disabled = false;
    cancelButton.disabled = false;
  }
}

async function beginRecoveryChallenge() {
  const continueButton = $("account-recovery-continue");
  continueButton.disabled = true;
  $("account-recovery-status").textContent = "";
  try {
    const data = await api("/api/account/recovery/challenge", { method: "POST", body: "{}" });
    $("account-recovery-answers").replaceChildren(...data.positions.map((position) => {
      const wrapper = document.createElement("div");
      wrapper.className = "recovery-answer";
      const label = document.createElement("label");
      label.htmlFor = `recovery-word-${position}`;
      label.textContent = `Слово №${position}`;
      const input = document.createElement("input");
      input.id = `recovery-word-${position}`;
      input.dataset.position = String(position);
      input.autocomplete = "off";
      input.autocapitalize = "none";
      input.spellcheck = false;
      input.required = true;
      wrapper.append(label, input);
      return wrapper;
    }));
    activeRecoveryPhrase = "";
    $("account-recovery-words").replaceChildren();
    $("account-recovery-phrase-step").hidden = true;
    $("account-recovery-check-step").hidden = false;
    $("account-gate-title").textContent = "Проверьте сохранение фразы";
    $("account-recovery-check-status").textContent = "";
    $("account-recovery-cancel").disabled = false;
    document.querySelector("#account-recovery-answers input").focus();
  } catch (error) {
    $("account-recovery-status").textContent = error.message || "Не удалось перейти к проверке.";
    continueButton.disabled = false;
  }
}

$("account-login-open").addEventListener("click", () => {
  $("account-choice").hidden = true;
  $("account-login-form").hidden = false;
  if (!$("account-login-words").childElementCount) {
    $("account-login-words").replaceChildren(...Array.from({ length: 12 }, (_, index) => {
      const wrapper = document.createElement("label");
      wrapper.className = "login-recovery-word";
      const number = document.createElement("span");
      number.textContent = String(index + 1);
      const input = document.createElement("input");
      input.type = "text";
      input.name = `word-${index + 1}`;
      input.autocomplete = "off";
      input.autocapitalize = "none";
      input.spellcheck = false;
      input.maxLength = 16;
      input.setAttribute("aria-label", `Слово ${index + 1}`);
      input.required = true;
      wrapper.append(number, input);
      return wrapper;
    }));
    const inputs = [...$("account-login-words").querySelectorAll("input")];
    inputs.forEach((input, index) => {
      input.addEventListener("input", () => {
        input.value = input.value.trim().split(/\s+/).pop().toLowerCase();
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Backspace" && !input.value && index > 0) inputs[index - 1].focus();
        if ((event.key === " " || event.key === "Enter") && index < inputs.length - 1) {
          event.preventDefault();
          inputs[index + 1].focus();
        }
      });
      input.addEventListener("paste", (event) => {
        const pastedWords = event.clipboardData?.getData("text").trim().split(/\s+/) || [];
        if (pastedWords.length < 2) return;
        event.preventDefault();
        pastedWords.slice(0, 12).forEach((word, wordIndex) => {
          if (inputs[wordIndex]) inputs[wordIndex].value = word.toLowerCase();
        });
        inputs[Math.min(pastedWords.length, 11)].focus();
      });
    });
  }
  $("account-login-words").querySelector("input").focus();
});
document.querySelector("[data-account-back]").addEventListener("click", showAccountChoice);
$("recovery-create-button").addEventListener("click", beginRecoverySetup);
$("account-recovery-continue").addEventListener("click", beginRecoveryChallenge);
$("account-recovery-close").addEventListener("click", cancelRecoverySetup);
$("account-recovery-cancel").addEventListener("click", cancelRecoverySetup);
$("account-register").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await api("/api/account/register", { method: "POST", body: "{}" });
    initializeApp();
  } catch (error) {
    showToast(error.message || "Не удалось создать аккаунт.", "error");
    button.disabled = false;
  }
});
$("account-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("account-login-status");
  const button = event.currentTarget.querySelector('button[type="submit"]');
  status.textContent = "";
  button.disabled = true;
  try {
    await api("/api/account/login", {
      method: "POST",
      body: JSON.stringify({
        phrase: [...$("account-login-words").querySelectorAll("input")]
          .map((input) => input.value.trim().toLowerCase())
          .join(" ")
      })
    });
    initializeApp();
  } catch (error) {
    status.textContent = error.message || "Не удалось привязать Telegram.";
    button.disabled = false;
  }
});
$("account-copy-phrase").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(activeRecoveryPhrase);
    showToast("Фраза скопирована. Сохраните её в надёжном месте.", "success");
  } catch {
    showToast("Не удалось скопировать. Запишите фразу вручную.", "error");
  }
});
$("account-recovery-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("account-recovery-check-status");
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const answers = [...$("account-recovery-answers").querySelectorAll("input")].map((input) => ({
    position: Number(input.dataset.position),
    word: input.value
  }));
  status.textContent = "";
  button.disabled = true;
  try {
    await api("/api/account/recovery/confirm", { method: "POST", body: JSON.stringify({ answers }) });
    activeRecoveryPhrase = "";
    $("account-recovery-words").replaceChildren();
    $("recovery-setting-status").textContent = "Фраза подтверждена. Повторно посмотреть её нельзя.";
    initializeApp();
  } catch (error) {
    status.textContent = error.message || "Не удалось подтвердить фразу.";
    button.disabled = false;
  }
});

async function initializeAccountAccess() {
  if (!await waitForTelegramInitData()) {
    initializeApp();
    return;
  }
  try {
    const status = await api("/api/account/status");
    if (status.needs_choice) {
      showAccountChoice();
    } else {
      initializeApp();
    }
  } catch (error) {
    $("account-gate").hidden = false;
    $("account-choice").hidden = true;
    $("account-login-form").hidden = true;
    $("account-backup").hidden = false;
    $("account-gate-title").textContent = "Не удалось проверить аккаунт";
    $("account-recovery-status").textContent = error.message || "Проверьте соединение и перезапустите приложение.";
  }
}

initializeAccountAccess();

function saveCatalogFilters() {
  localStorage.setItem("altera-catalog-filters", JSON.stringify({
    search: $("search").value,
    category: $("category-filter").value,
    sort: $("sort").value,
    stock: $("stock-filter").value
  }));
}

function restoreCatalogFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem("altera-catalog-filters") || "{}");
    $("search").value = saved.search || "";
    $("sort").value = saved.sort || "default";
    $("stock-filter").value = saved.stock || "all";
    if (saved.category) $("category-filter").dataset.savedValue = saved.category;
  } catch {
    localStorage.removeItem("altera-catalog-filters");
  }
}
