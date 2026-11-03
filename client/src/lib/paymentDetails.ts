/**
 * Where a rider sends the money. Read once here so the cart and the order detail
 * page show the same account details instead of drifting apart.
 */
export const paymentDetails = {
  /**
   * Where the customer goes to actually pay by PayPal. Empty means the store has
   * not set one, which checkout reports instead of linking to nowhere.
   */
  paypalLink: import.meta.env.VITE_PAYPAL_LINK || "",
};
