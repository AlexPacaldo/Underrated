/**
 * PayPal payment QR displayed at checkout and on pending order details.
 */
const configuredPaypalQr = import.meta.env.VITE_PAYPAL_QR_IMAGE?.trim() || "";

export const paymentDetails = {
  /** Public image path, usually a file stored in the app's public directory. */
  paypalQrImage:
    configuredPaypalQr || (import.meta.env.DEV ? "/paypal-qr-demo.svg" : ""),
  paypalQrIsDemo: !configuredPaypalQr && import.meta.env.DEV,
};
