/**
 * Where a rider sends the money. Read once here so the cart and the order detail
 * page show the same account details instead of drifting apart.
 */
export const paymentDetails = {
  gcashName: import.meta.env.VITE_GCASH_ACCOUNT_NAME || "Set VITE_GCASH_ACCOUNT_NAME",
  gcashNumber: import.meta.env.VITE_GCASH_ACCOUNT_NUMBER || "Set VITE_GCASH_ACCOUNT_NUMBER",
  gcashQr: import.meta.env.VITE_GCASH_QR_IMAGE_URL || "",
  bankName: import.meta.env.VITE_BANK_NAME || "Set VITE_BANK_NAME",
  bankAccountName: import.meta.env.VITE_BANK_ACCOUNT_NAME || "Set VITE_BANK_ACCOUNT_NAME",
  bankAccountNumber: import.meta.env.VITE_BANK_ACCOUNT_NUMBER || "Set VITE_BANK_ACCOUNT_NUMBER",
};
