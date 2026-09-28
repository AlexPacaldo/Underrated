/**
 * Design direction: Technical Drop Editorial — manual payment details, shared so the cart and the order page quote the same accounts.
 */
import { Banknote, ExternalLink, QrCode, Wallet } from "lucide-react";
import { paymentDetails } from "@/lib/paymentDetails";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { ManualPaymentMethod } from "@/lib/manualOrders";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const inputClass = "h-11 rounded-none border-white/20 bg-[#151719] text-sm text-white placeholder:text-white/30";

const headingClass = "flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/55";

/**
 * Where to send the money, per method. Split out of the form because there are
 * now three methods and the inline two-branch conditional it replaced could not
 * hold a third.
 *
 * Every method is manual: the customer pays on their own app or site, then types
 * the transaction reference below. Nothing here confirms a payment happened, so
 * staff still verify each one by hand.
 */
function MethodDetails({ method, totalLabel }: { method: ManualPaymentMethod; totalLabel: string }) {
  if (method === "gcash_qr") {
    return (
      <div className="grid gap-3 border border-white/10 p-4">
        <p className={headingClass}><QrCode size={14} className="text-[#ff5a36]" />GCash details</p>
        {paymentDetails.gcashQr ? <img src={paymentDetails.gcashQr} alt="GCash QR code" className="mx-auto aspect-square max-h-44 border border-white/10 object-contain" /> : null}
        <div className="grid gap-1 text-xs text-white/60">
          <span>Name: <strong className="text-white">{paymentDetails.gcashName}</strong></span>
          <span>Number: <strong className="text-white">{paymentDetails.gcashNumber}</strong></span>
        </div>
      </div>
    );
  }

  if (method === "paypal") {
    return (
      <div className="grid gap-3 border border-white/10 p-4">
        <p className={headingClass}><Wallet size={14} className="text-[#ff5a36]" />PayPal</p>
        {paymentDetails.paypalLink ? (
          <>
            <p className="text-xs leading-relaxed text-white/60">Pay <strong className="text-white">{totalLabel}</strong> on PayPal, then enter the PayPal transaction id below so we can match it.</p>
            <a href={paymentDetails.paypalLink} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 border border-white/15 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/60 transition hover:border-[#ff5a36] hover:text-[#ff5a36]">Open PayPal <ExternalLink size={13} /></a>
          </>
        ) : (
          // Deliberately not a link to nowhere. An unset VITE_PAYPAL_LINK is a
          // deployment mistake, and a dead button would read as a broken store
          // rather than an unconfigured one.
          <p className="text-xs leading-relaxed text-[#ff5a36]">PayPal is not set up on this store yet. Please use GCash or bank transfer instead.</p>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-2 border border-white/10 p-4 text-xs text-white/60">
      <p className={headingClass}><Banknote size={14} className="text-[#ff5a36]" />Bank details</p>
      <span>Bank: <strong className="text-white">{paymentDetails.bankName}</strong></span>
      <span>Name: <strong className="text-white">{paymentDetails.bankAccountName}</strong></span>
      <span>Account: <strong className="text-white">{paymentDetails.bankAccountNumber}</strong></span>
    </div>
  );
}

type PaymentReferenceFormProps = {
  totalCents: number;
  paymentMethod: ManualPaymentMethod;
  onPaymentMethodChange: (method: ManualPaymentMethod) => void;
  referenceNumber: string;
  onReferenceNumberChange: (value: string) => void;
  payerName: string;
  onPayerNameChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
};

export default function PaymentReferenceForm({
  totalCents,
  paymentMethod,
  onPaymentMethodChange,
  referenceNumber,
  onReferenceNumberChange,
  payerName,
  onPayerNameChange,
  note,
  onNoteChange,
}: PaymentReferenceFormProps) {
  const { formatMoney } = useCurrency();
  // The PHP order total, which is what staff verify against. Every method has to
  // be paid in this amount, whatever currency the customer's own app shows.
  const totalLabel = formatMoney(totalCents / 100, "PHP", 1);

  return (
    <>
      <Select value={paymentMethod} onValueChange={(value) => onPaymentMethodChange(value as ManualPaymentMethod)}>
        <SelectTrigger className="h-11 rounded-none border-white/20 bg-[#151719] text-xs text-white"><SelectValue /></SelectTrigger>
        <SelectContent className="rounded-none border-white/15 bg-[#151719] text-white">
          <SelectItem value="gcash_qr" className="focus:bg-[#ff5a36] focus:text-black">GCash QR</SelectItem>
          <SelectItem value="bank_transfer" className="focus:bg-[#ff5a36] focus:text-black">Bank transfer</SelectItem>
          <SelectItem value="paypal" className="focus:bg-[#ff5a36] focus:text-black">PayPal</SelectItem>
        </SelectContent>
      </Select>

      <MethodDetails method={paymentMethod} totalLabel={totalLabel} />

      <p className="text-xs leading-relaxed text-white/50">Pay the exact PHP total of <span className="font-bold text-white">{totalLabel}</span>, then send the reference below. The converted estimate is for display only; verification uses the PHP order total.</p>
      <Input value={referenceNumber} onChange={(event) => onReferenceNumberChange(event.target.value)} placeholder="Transaction reference number" className={inputClass} />
      <Input value={payerName} onChange={(event) => onPayerNameChange(event.target.value)} placeholder="Payer name, optional" className={inputClass} />
      <Textarea value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="Notes, optional" className="min-h-20 rounded-none border-white/20 bg-[#151719] text-sm text-white placeholder:text-white/30" />
    </>
  );
}
