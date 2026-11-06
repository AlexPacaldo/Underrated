/**
 * PayPal payment details shared by the cart and the order page.
 */
import { Wallet } from "lucide-react";
import { paymentDetails } from "@/lib/paymentDetails";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const inputClass =
  "h-11 rounded-none border-white/20 bg-[#151719] text-sm text-white placeholder:text-white/30";
export const paypalAvailable = Boolean(paymentDetails.paypalQrImage);

const headingClass =
  "flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/55";

type PaymentReferenceFormProps = {
  totalCents: number;
  displayCurrency?: string;
  fxRate?: number;
  referenceNumber: string;
  onReferenceNumberChange: (value: string) => void;
  payerName: string;
  onPayerNameChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
};

export default function PaymentReferenceForm({
  totalCents,
  displayCurrency,
  fxRate,
  referenceNumber,
  onReferenceNumberChange,
  payerName,
  onPayerNameChange,
  note,
  onNoteChange,
}: PaymentReferenceFormProps) {
  const { currency, formatMoney } = useCurrency();
  const paymentCurrency = displayCurrency ?? currency;
  const totalLabel = formatMoney(totalCents / 100, paymentCurrency, fxRate);

  return (
    <>
      <div className="grid gap-3 border border-white/10 p-4">
        <p className={headingClass}>
          <Wallet size={14} className="text-[#ff5a36]" />
          Pay with PayPal
        </p>
        {paypalAvailable ? (
          <>
            {paymentDetails.paypalQrIsDemo ? (
              <p className="border border-amber-300/25 bg-amber-300/[.06] p-3 text-center text-[10px] font-bold uppercase tracking-[.1em] text-amber-200">
                Demo preview only — this sample QR code cannot accept payment
              </p>
            ) : null}
            <p className="text-center text-xs leading-relaxed text-white/60">
              {paymentDetails.paypalQrIsDemo ? (
                "Your PayPal QR code will appear here."
              ) : (
                <>
                  Scan this code with PayPal to send{" "}
                  <strong className="text-white">{totalLabel}</strong>.
                </>
              )}
            </p>
            <div className="mx-auto w-full max-w-60 bg-white p-3">
              <img
                src={paymentDetails.paypalQrImage}
                alt="PayPal payment QR code"
                className="aspect-square w-full object-contain"
              />
            </div>
            <p className="text-center text-[10px] leading-5 text-white/40">
              {paymentDetails.paypalQrIsDemo
                ? "Replace the demo image with your real PayPal QR code before accepting payments."
                : "Use another device to scan this code, then enter your PayPal transaction ID below."}
            </p>
          </>
        ) : (
          <p className="text-xs leading-relaxed text-[#ff5a36]">
            PayPal QR code is not configured on this store yet. Please contact
            the store for help before making a payment.
          </p>
        )}
      </div>

      <p className="text-xs leading-relaxed text-white/50">
        Pay the exact {paymentCurrency} total of{" "}
        <span className="font-bold text-white">{totalLabel}</span>. We’ll verify
        the PayPal transaction before preparing your order.
      </p>
      <Input
        value={referenceNumber}
        onChange={event => onReferenceNumberChange(event.target.value)}
        placeholder="PayPal transaction ID"
        className={inputClass}
      />
      <Input
        value={payerName}
        onChange={event => onPayerNameChange(event.target.value)}
        placeholder="PayPal account name, optional"
        className={inputClass}
      />
      <Textarea
        value={note}
        onChange={event => onNoteChange(event.target.value)}
        placeholder="Note, optional"
        className="min-h-20 rounded-none border-white/20 bg-[#151719] text-sm text-white placeholder:text-white/30"
      />
    </>
  );
}
