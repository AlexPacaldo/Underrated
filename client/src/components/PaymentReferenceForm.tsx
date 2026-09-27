/**
 * Design direction: Technical Drop Editorial — manual payment details, shared so the cart and the order page quote the same accounts.
 */
import { Banknote, QrCode } from "lucide-react";
import { paymentDetails } from "@/lib/paymentDetails";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { ManualPaymentMethod } from "@/lib/manualOrders";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const inputClass = "h-11 rounded-none border-white/20 bg-[#151719] text-sm text-white placeholder:text-white/30";

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

  return (
    <>
      <Select value={paymentMethod} onValueChange={(value) => onPaymentMethodChange(value as ManualPaymentMethod)}>
        <SelectTrigger className="h-11 rounded-none border-white/20 bg-[#151719] text-xs text-white"><SelectValue /></SelectTrigger>
        <SelectContent className="rounded-none border-white/15 bg-[#151719] text-white">
          <SelectItem value="gcash_qr" className="focus:bg-[#ff5a36] focus:text-black">GCash QR</SelectItem>
          <SelectItem value="bank_transfer" className="focus:bg-[#ff5a36] focus:text-black">Bank transfer</SelectItem>
        </SelectContent>
      </Select>

      {paymentMethod === "gcash_qr" ? (
        <div className="grid gap-3 border border-white/10 p-4">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/55"><QrCode size={14} className="text-[#ff5a36]" />GCash details</p>
          {paymentDetails.gcashQr ? <img src={paymentDetails.gcashQr} alt="GCash QR code" className="mx-auto aspect-square max-h-44 border border-white/10 object-contain" /> : null}
          <div className="grid gap-1 text-xs text-white/60">
            <span>Name: <strong className="text-white">{paymentDetails.gcashName}</strong></span>
            <span>Number: <strong className="text-white">{paymentDetails.gcashNumber}</strong></span>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 border border-white/10 p-4 text-xs text-white/60">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/55"><Banknote size={14} className="text-[#ff5a36]" />Bank details</p>
          <span>Bank: <strong className="text-white">{paymentDetails.bankName}</strong></span>
          <span>Name: <strong className="text-white">{paymentDetails.bankAccountName}</strong></span>
          <span>Account: <strong className="text-white">{paymentDetails.bankAccountNumber}</strong></span>
        </div>
      )}

      <p className="text-xs leading-relaxed text-white/50">Pay the exact PHP total of <span className="font-bold text-white">{formatMoney(totalCents / 100, "PHP", 1)}</span>, then send the reference below. The converted estimate is for display only; verification uses the PHP order total.</p>
      <Input value={referenceNumber} onChange={(event) => onReferenceNumberChange(event.target.value)} placeholder="Transaction reference number" className={inputClass} />
      <Input value={payerName} onChange={(event) => onPayerNameChange(event.target.value)} placeholder="Payer name, optional" className={inputClass} />
      <Textarea value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="Notes, optional" className="min-h-20 rounded-none border-white/20 bg-[#151719] text-sm text-white placeholder:text-white/30" />
    </>
  );
}
