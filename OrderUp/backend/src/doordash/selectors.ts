// Centralized selectors for doordash.com.
// These are the ONLY place DOM coupling lives. The live site changes;
// Task 14 (live verification) confirms and corrects them. When a step
// breaks in the future, fix it here and re-run the dry-run verification.
export const SEL = {
  // Each store result is a link wrapping the whole card (name + rating + eta).
  // The `[data-anchor-id="StoreCard"]` tags sit on inner pieces that don't hold
  // the name, so we target the link and match it by visible text instead.
  storeCard: 'a[href*="/store/"]',
  itemSearchCard: '[data-testid="menu-item-search-result"], [data-anchor-id="MenuItem"]',
  itemName: '[data-testid="item-name"], h3',
  itemDescription: '[data-testid="item-description"], p',
  itemPrice: '[data-testid="item-price"]',
  itemStoreName: '[data-testid="item-store-name"]',
  itemStoreRating: '[data-testid="item-store-rating"]',
  itemStoreEta: '[data-testid="item-store-eta"]',
  itemModalQuantityUp: '[data-testid="quantity-stepper-increment"]',
  itemModalAddToCart: '[data-testid="add-to-cart-button"]',
  cartOpenButton: '[data-testid="order-cart-button"]',
  cartLine: '[data-testid="order-cart-item"]',
  cartLineName: '[data-testid="order-cart-item-name"]',
  cartLineQuantity: '[data-testid="order-cart-item-quantity"]',
  cartLinePrice: '[data-testid="order-cart-item-price"]',
  cartStoreName: '[data-testid="cart-store-name"]',
  cartSubtotal: '[data-testid="cart-subtotal"]',
  cartFees: '[data-testid="cart-fees-total"]',
  cartTotal: '[data-testid="cart-total"]',
  checkoutButton: '[data-testid="checkout-button"]',
  placeOrderButton: '[data-testid="place-order-button"]',
} as const;
