import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { variationFinish, type ProductVariation, type ProductVariationAttribute } from "@/data/products";
import { Plus, Search, Trash2 } from "lucide-react";

const inputClass = "w-full border border-white/15 bg-[#090a0b] px-3 py-2.5 text-sm text-white outline-none focus:border-[#ff5a36]";
const presets: Record<string, string[]> = {
  Color: ["Matte Black", "Iced White"],
  Bend: ["Traditional", "Compact"],
  Rise: ["No Rise", "10mm rise"],
  "Hard case": ["No case", "With hard case"],
};

function suggestedColor(value: string) {
  const color = value.toLowerCase();
  if (color.includes("black")) return "#111111";
  if (color.includes("graphite")) return "#303238";
  if (color.includes("white")) return "#f2f0e8";
  if (color.includes("gray") || color.includes("grey") || color.includes("silver")) return "#929598";
  if (color.includes("purple") || color.includes("violet")) return "#a855f7";
  if (color.includes("yellow")) return "#facc15";
  if (color.includes("green")) return "#16a34a";
  if (color.includes("red")) return "#ef4444";
  if (color.includes("pink")) return "#ec4899";
  if (color.includes("blue")) return "#2563eb";
  if (color.includes("orange")) return "#f97316";
  return "#888888";
}

function cleanAttributes(attributes: ProductVariationAttribute[]) {
  const names = new Set<string>();
  return attributes.flatMap(attribute => {
    const name = attribute.name.trim();
    const key = name.toLowerCase();
    if (!name || names.has(key)) return [];
    names.add(key);
    const options = [...new Map(attribute.options.map(option => option.trim()).filter(Boolean).map(option => [option.toLowerCase(), option])).values()];
    const colors = name.toLowerCase().includes("color")
      ? Object.fromEntries(options.map(option => [option, attribute.colors?.[option] ?? suggestedColor(option)]))
      : undefined;
    return options.length ? [{ name, options, ...(colors ? { colors } : {}) }] : [];
  });
}

function combinations(attributes: ProductVariationAttribute[]): ProductVariation[] {
  if (!attributes.length) return [{ finish: "Standard", values: {} }];
  if (attributes.some(attribute => !attribute.name.trim() || !attribute.options.length)) return [];
  let rows: Record<string, string>[] = [{}];
  for (const attribute of attributes) {
    if (rows.length * attribute.options.length > 100) return [];
    rows = rows.flatMap(row => attribute.options.map(option => ({ ...row, [attribute.name]: option })));
  }
  return rows.map(values => ({ finish: variationFinish(attributes, values), values }));
}

function stockSeed(
  variant: ProductVariation,
  attributes: ProductVariationAttribute[],
  currentVariations: ProductVariation[],
  finishStock: Record<string, number>,
  reserved: Record<string, number>,
  used: Set<string>
) {
  if (attributes.length === 0) {
    const standard = currentVariations.find(item => item.finish === variant.finish);
    return standard ? finishStock[standard.finish] ?? 0 : 0;
  }
  const exact = currentVariations.find(item => item.finish === variant.finish);
  if (exact) return finishStock[exact.finish] ?? 0;
  const source = currentVariations.find(item =>
    !used.has(item.finish) &&
    Object.keys(item.values).length > 0 &&
    Object.entries(item.values).every(([name, value]) => variant.values[name] === value)
  );
  if (!source) return 0;
  used.add(source.finish);
  return Math.max(0, (finishStock[source.finish] ?? 0) - (reserved[source.finish] ?? 0));
}

export default function VariationEditorDialog({
  open,
  onOpenChange,
  attributes: initialAttributes,
  variations: currentVariations,
  finishStock,
  finishReservedStock,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attributes: ProductVariationAttribute[];
  variations: ProductVariation[];
  finishStock: Record<string, number>;
  finishReservedStock: Record<string, number>;
  onSave: (attributes: ProductVariationAttribute[], variations: ProductVariation[], stock: Record<string, number>) => void;
}) {
  const [attributes, setAttributes] = useState<ProductVariationAttribute[]>(initialAttributes);
  const [stockDraft, setStockDraft] = useState<Record<string, string>>({});
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  const [choiceDrafts, setChoiceDrafts] = useState<Record<number, string>>({});
  const [variationSearch, setVariationSearch] = useState("");
  const [basicColorsPrice, setBasicColorsPrice] = useState("");
  const [premiumColorPrice, setPremiumColorPrice] = useState("");
  const [premiumColor, setPremiumColor] = useState("");
  const [bulkPriceMessage, setBulkPriceMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setAttributes(initialAttributes);
    setStockDraft({});
    setPriceDraft({});
    setChoiceDrafts({});
    setVariationSearch("");
    setBasicColorsPrice("");
    setPremiumColorPrice("");
    setPremiumColor("");
    setBulkPriceMessage("");
  }, [open, initialAttributes]);

  const cleaned = useMemo(() => cleanAttributes(attributes), [attributes]);
  const colorAttribute = cleaned.find(attribute => attribute.name.toLowerCase().includes("color"));
  const premiumColorValue = colorAttribute?.options.includes(premiumColor)
    ? premiumColor
    : colorAttribute?.options.find(option => option.trim().toLowerCase() === "matte black") ?? colorAttribute?.options[0] ?? "";
  const generated = useMemo(() => combinations(cleaned), [cleaned]);
  const generatedTooMany = cleaned.reduce((total, attribute) => total * Math.max(attribute.options.length, 1), 1) > 100;
  const invalidStock = generated.some(variant => {
    const raw = stockDraft[variant.finish];
    if (raw === undefined) return false;
    const quantity = Number(raw);
    return !/^\d+$/.test(raw) || !Number.isSafeInteger(quantity) || quantity < (finishReservedStock[variant.finish] ?? 0);
  });
  const invalidPrice = generated.some(variant => {
    const raw = priceDraft[variant.finish];
    if (raw === undefined) return false;
    const amount = Number(raw);
    const cents = Math.round(amount * 100);
    return !/^\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isSafeInteger(cents) || cents < 0 || cents > 2147483647;
  });
  const defaultStock = useMemo(() => {
    const used = new Set<string>();
    return Object.fromEntries(generated.map(variant => [
      variant.finish,
      stockSeed(variant, cleaned, currentVariations, finishStock, finishReservedStock, used),
    ]));
  }, [cleaned, currentVariations, finishReservedStock, finishStock, generated]);
  const defaultPrices = useMemo(() => Object.fromEntries(generated.map(variant => {
    const exact = currentVariations.find(item => item.finish === variant.finish);
    const source = exact ?? currentVariations.find(item =>
      Object.keys(item.values).length > 0 &&
      Object.entries(item.values).every(([name, value]) => variant.values[name] === value)
    );
    return [variant.finish, source?.pricePhpCents ?? 0];
  })), [currentVariations, generated]);
  const visibleVariations = useMemo(() => {
    const query = variationSearch.trim().toLowerCase();
    if (!query) return generated;
    return generated.filter(variant => `${variant.finish} ${Object.entries(variant.values).map(([name, value]) => `${name} ${value}`).join(" ")}`.toLowerCase().includes(query));
  }, [generated, variationSearch]);

  const applyColorPrice = (group: "basic" | "premium") => {
    if (!colorAttribute) return;
    const raw = group === "basic" ? basicColorsPrice : premiumColorPrice;
    const amount = Number(raw);
    const cents = Math.round(amount * 100);
    if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isSafeInteger(cents) || cents < 0 || cents > 2147483647) {
      setBulkPriceMessage("Enter a valid price with up to two decimal places.");
      return;
    }
    const matching = generated.filter(variant => group === "premium"
      ? variant.values[colorAttribute.name] === premiumColorValue
      : variant.values[colorAttribute.name] !== premiumColorValue);
    if (!matching.length) {
      setBulkPriceMessage("There are no matching combinations for this price group.");
      return;
    }
    setPriceDraft(current => ({
      ...current,
      ...Object.fromEntries(matching.map(variant => [variant.finish, (cents / 100).toFixed(2)])),
    }));
    setBulkPriceMessage(`${group === "premium" ? premiumColorValue : "Basic colors"} price applied to ${matching.length} combination${matching.length === 1 ? "" : "s"}.`);
  };

  const updateAttribute = (index: number, update: Partial<ProductVariationAttribute>) => {
    setAttributes(current => current.map((attribute, i) => i === index ? { ...attribute, ...update } : attribute));
  };
  const addAttribute = (name: string, options: string[]) => {
    if (attributes.some(attribute => attribute.name.trim().toLowerCase() === name.toLowerCase())) return;
    setAttributes(current => [...current, { name, options }]);
  };
  const addChoice = (index: number) => {
    const choice = choiceDrafts[index]?.trim();
    if (!choice) return;
    const attribute = attributes[index];
    const isColor = attribute.name.toLowerCase().includes("color");
    updateAttribute(index, {
      options: [...attribute.options, choice],
      ...(isColor ? { colors: { ...attribute.colors, [choice]: suggestedColor(choice) } } : {}),
    });
    setChoiceDrafts(current => ({ ...current, [index]: "" }));
  };
  const save = () => {
    if (!generated.length || generatedTooMany || invalidStock || invalidPrice) return;
    const pricedVariations = generated.map(variant => ({
      ...variant,
      pricePhpCents: priceDraft[variant.finish] === undefined
        ? defaultPrices[variant.finish] ?? 0
        : Math.round(Number(priceDraft[variant.finish]) * 100),
    }));
    const nextStock = { ...finishStock };
    if (cleaned.length === 0) {
      for (const finish of Object.keys(nextStock)) {
        if (finish === "Standard") continue;
        const reserved = finishReservedStock[finish] ?? 0;
        if (reserved > 0) nextStock[finish] = reserved;
        else delete nextStock[finish];
      }
      const raw = stockDraft.Standard;
      nextStock.Standard = raw === undefined
        ? (defaultStock.Standard ?? 0)
        : Math.max(heldNumber(raw), finishReservedStock.Standard ?? 0);
      onSave(cleaned, pricedVariations, nextStock);
      onOpenChange(false);
      return;
    }
    const usedSources = new Set<string>();
    for (const variant of generated) {
      const exact = currentVariations.find(item => item.finish === variant.finish);
      const source = exact ?? currentVariations.find(item =>
        !usedSources.has(item.finish) && Object.keys(item.values).length > 0 &&
        Object.entries(item.values).every(([name, value]) => variant.values[name] === value)
      );
      if (source && source.finish !== variant.finish) {
        usedSources.add(source.finish);
        const held = finishReservedStock[source.finish] ?? 0;
        nextStock[source.finish] = held;
      }
      const raw = stockDraft[variant.finish];
      nextStock[variant.finish] = raw === undefined ? (defaultStock[variant.finish] ?? 0) : Math.max(heldNumber(raw), finishReservedStock[variant.finish] ?? 0);
    }
    const activeFinishes = new Set(generated.map(variant => variant.finish));
    for (const finish of Object.keys(nextStock)) {
      if (activeFinishes.has(finish)) continue;
      const reserved = finishReservedStock[finish] ?? 0;
      if (reserved > 0) nextStock[finish] = reserved;
      else delete nextStock[finish];
    }
    onSave(cleaned, pricedVariations, nextStock);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] w-[calc(100vw-1rem)] max-w-[900px] gap-0 overflow-y-auto rounded-none border-white/15 bg-[#101113] p-0 text-white lg:w-[calc(100vw-4rem)] lg:max-w-[1400px]">
        <DialogHeader className="border-b border-white/10 px-5 py-6 text-left sm:px-8">
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-[#ff5a36]">Catalog setup</p>
          <DialogTitle className="mt-1 font-display text-4xl uppercase sm:text-5xl">Build your options</DialogTitle>
          <DialogDescription className="max-w-2xl text-sm leading-6 text-white/45">Add the choices shoppers can make, then set a price and stock for every combination below.</DialogDescription>
        </DialogHeader>

        <div className="space-y-7 px-5 py-6 sm:px-8">
          <section className="space-y-3">
            <div><h3 className="text-sm font-bold text-white">1. Add product options</h3><p className="mt-1 text-xs text-white/40">Choose a preset or create your own.</p></div>
            <div className="flex flex-wrap gap-2">
            {Object.entries(presets).map(([name, options]) => (
              <button key={name} type="button" onClick={() => addAttribute(name, options)} disabled={attributes.some(attribute => attribute.name.trim().toLowerCase() === name.toLowerCase())} className="inline-flex min-h-10 items-center gap-2 border border-white/15 px-3 text-[10px] font-bold uppercase tracking-[.1em] text-white/70 transition hover:border-[#ff5a36] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"><Plus size={13} className="text-[#ff5a36]" />{name}</button>
            ))}
            <button type="button" onClick={() => addAttribute("Custom option", ["Option 1"])} className="inline-flex min-h-10 items-center gap-2 border border-white/15 px-3 text-[10px] font-bold uppercase tracking-[.1em] text-white/70 transition hover:border-[#ff5a36] hover:text-white"><Plus size={13} className="text-[#ff5a36]" />Custom</button>
            </div>
          </section>

          <div className="space-y-3">
            {attributes.map((attribute, index) => (
              <section key={index} className="overflow-hidden border border-white/10 bg-white/[.02]">
                <div className="flex items-center justify-between border-b border-white/10 bg-white/[.025] px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/40">Option {String(index + 1).padStart(2, "0")}</p>
                  <button type="button" onClick={() => setAttributes(current => current.filter((_, i) => i !== index))} className="inline-flex min-h-9 items-center gap-2 px-2 text-[10px] font-bold uppercase tracking-[.1em] text-white/40 transition hover:text-red-300" aria-label={`Remove ${attribute.name} option`}><Trash2 size={14} />Remove</button>
                </div>
                <div className="grid gap-5 p-4 sm:p-5">
                  <label className="grid max-w-sm gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-white/45">Option name<input value={attribute.name} onChange={event => updateAttribute(index, { name: event.target.value })} className={inputClass} placeholder="e.g. Bend" /></label>
                  <div className="grid min-w-0 gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-white/45">
                    <div className="flex flex-wrap items-baseline justify-between gap-1"><span>Available choices</span><span className="text-[10px] font-medium normal-case tracking-normal text-white/35">{attribute.options.length} added · shoppers select one</span></div>
                    <div className="flex min-h-14 flex-wrap items-center gap-2 border border-white/15 bg-[#090a0b] p-3">
                    {attribute.options.map((option, optionIndex) => (
                      <span key={`${option}-${optionIndex}`} className="inline-flex max-w-full items-center gap-2 border border-white/15 bg-[#1b1c1f] px-3 py-2 text-xs normal-case tracking-normal text-white/85">
                        {attribute.name.toLowerCase().includes("color") && <>
                          <input
                            type="color"
                            value={attribute.colors?.[option] ?? suggestedColor(option)}
                            onChange={event => updateAttribute(index, { colors: { ...attribute.colors, [option]: event.target.value } })}
                            className="size-8 shrink-0 cursor-pointer border-0 bg-transparent p-0"
                            title={`Choose ${option} color`}
                            aria-label={`Choose ${option} color`}
                          />
                          <span className="font-mono text-[10px] uppercase text-white/45">{attribute.colors?.[option] ?? suggestedColor(option)}</span>
                        </>}
                        <span className="break-words">{option}</span>
                        <button type="button" onClick={() => updateAttribute(index, { options: attribute.options.filter((_, i) => i !== optionIndex) })} className="grid size-5 shrink-0 place-items-center text-white/40 transition hover:bg-white/10 hover:text-red-300" aria-label={`Remove ${option}`}><Trash2 size={12} /></button>
                      </span>
                    ))}
                    {attribute.options.length === 0 && <span className="px-1 text-xs normal-case tracking-normal text-white/35">No choices yet. Add one below.</span>}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={choiceDrafts[index] ?? ""}
                      onChange={event => setChoiceDrafts(current => ({ ...current, [index]: event.target.value }))}
                      onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addChoice(index); } }}
                      className={`${inputClass} min-w-0 flex-1`}
                      placeholder="Type a choice name"
                      aria-label={`New choice for ${attribute.name}`}
                    />
                    <button type="button" onClick={() => addChoice(index)} disabled={!choiceDrafts[index]?.trim()} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border border-white/20 px-4 text-[10px] font-bold uppercase tracking-[.12em] text-white/70 transition hover:border-[#ff5a36] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"><Plus size={14} />Add choice</button>
                    </div>
                  </div>
                </div>
              </section>
            ))}
            {!attributes.length && <p className="border border-dashed border-white/15 p-6 text-sm leading-6 text-white/45">No options added. This item will have one standard variation. Add an option above if shoppers need to choose a style, color, or fit.</p>}
          </div>

          {colorAttribute && <section className="border border-white/10 bg-white/[.015]">
            <div className="border-b border-white/10 px-4 py-4 sm:px-5">
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#ff5a36]">Quick pricing</p>
              <h3 className="mt-1 text-base font-bold text-white">Set prices by color</h3>
              <p className="mt-1 text-xs leading-5 text-white/45">Apply one price to all basic colors, then set a separate price for a premium color. You can still adjust any combination below.</p>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-2 sm:p-5">
              <div className="space-y-3 border border-white/10 bg-black/20 p-4">
                <div><p className="text-sm font-bold text-white">Basic colors</p><p className="mt-1 text-xs text-white/40">Applies to every color except the premium color selected alongside.</p></div>
                <div className="flex flex-wrap gap-2">
                  <label className="min-w-[150px] flex-1 text-[9px] font-bold uppercase tracking-[.1em] text-white/40">Price (PHP)<input type="number" min="0" max="21474836.47" step="0.01" inputMode="decimal" value={basicColorsPrice} onChange={event => setBasicColorsPrice(event.target.value)} placeholder="e.g. 650.00" className={`${inputClass} mt-1`} /></label>
                  <button type="button" onClick={() => applyColorPrice("basic")} className="self-end border border-white/20 px-4 py-3 text-[10px] font-black uppercase tracking-[.1em] text-white transition hover:border-[#ff5a36] hover:text-[#ff5a36]">Apply to basics</button>
                </div>
              </div>
              <div className="space-y-3 border border-[#ff5a36]/25 bg-[#ff5a36]/[.03] p-4">
                <div><p className="text-sm font-bold text-white">Premium color</p><p className="mt-1 text-xs text-white/40">Choose the color with its own price.</p></div>
                <div className="flex flex-wrap gap-2">
                  <label className="min-w-[135px] flex-1 text-[9px] font-bold uppercase tracking-[.1em] text-white/40">Color<select value={premiumColorValue} onChange={event => setPremiumColor(event.target.value)} className={`${inputClass} mt-1`} aria-label="Choose premium color">{colorAttribute.options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
                  <label className="min-w-[135px] flex-1 text-[9px] font-bold uppercase tracking-[.1em] text-white/40">Price (PHP)<input type="number" min="0" max="21474836.47" step="0.01" inputMode="decimal" value={premiumColorPrice} onChange={event => setPremiumColorPrice(event.target.value)} placeholder="e.g. 750.00" className={`${inputClass} mt-1`} /></label>
                  <button type="button" onClick={() => applyColorPrice("premium")} className="self-end border border-[#ff5a36]/60 px-4 py-3 text-[10px] font-black uppercase tracking-[.1em] text-white transition hover:bg-[#ff5a36] hover:text-black">Apply premium</button>
                </div>
              </div>
            </div>
            {bulkPriceMessage && <p role="status" className={`px-5 pb-4 text-xs ${bulkPriceMessage.startsWith("Enter") || bulkPriceMessage.startsWith("There") ? "text-amber-200" : "text-emerald-300"}`}>{bulkPriceMessage}</p>}
          </section>}

          <div className="border border-white/10">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 bg-white/[.03] px-4 py-4 sm:px-5">
              <div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#ff5a36]">2. Review inventory</p><h3 className="mt-1 text-base font-bold text-white">Variation stock</h3><p className="mt-1 text-xs text-white/40">Set on-hand quantities for every combination.</p></div>
              <span className="text-[10px] font-bold uppercase tracking-[.12em] text-white/35">Up to 100 combinations</span>
            </div>
            {generatedTooMany ? <p className="p-5 text-sm text-amber-200">This creates more than 100 combinations. Reduce the number of choices before saving.</p> : generated.length ? (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <label className="relative min-w-[190px] flex-1 sm:max-w-xs">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                    <input value={variationSearch} onChange={event => setVariationSearch(event.target.value)} className={`${inputClass} pl-9`} placeholder="Find a combination" aria-label="Find a variation combination" />
                  </label>
                  <span className="text-xs tabular-nums text-white/45">{visibleVariations.length} of {generated.length} combinations</span>
                </div>
                <div className="max-h-[42vh] overflow-auto">
                  {visibleVariations.map(variant => {
                    const reserved = finishReservedStock[variant.finish] ?? 0;
                    const seeded = defaultStock[variant.finish] ?? 0;
                    return <div key={variant.finish} className="space-y-3 border-b border-white/[.07] px-4 py-3 last:border-b-0">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold leading-5 text-white">{variant.finish === "Standard" && !Object.keys(variant.values).length ? "Standard item" : variant.finish}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {Object.entries(variant.values).map(([name, value]) => {
                            const attribute = cleaned.find(item => item.name === name);
                            return <span key={name} className="inline-flex items-center gap-1.5 rounded-sm bg-white/[.04] px-2 py-1 text-[9px] uppercase tracking-[.06em] text-white/55">
                              {attribute?.colors?.[value] && <span className="size-2 shrink-0 rounded-full border border-white/20" style={{ backgroundColor: attribute.colors[value] }} />}
                              <span className="text-white/35">{name}:</span><span>{value}</span>
                            </span>;
                          })}
                        </div>
                      </div>
                      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 sm:gap-3">
                        <label className="min-w-0 text-[9px] font-bold uppercase tracking-[.1em] text-white/40">Price (PHP)<input aria-label={`Price for ${variant.finish} in PHP`} type="number" min="0" max="21474836.47" step="0.01" inputMode="decimal" value={priceDraft[variant.finish] ?? ((defaultPrices[variant.finish] ?? 0) / 100).toFixed(2)} onChange={event => setPriceDraft(current => ({ ...current, [variant.finish]: event.target.value }))} className={`${inputClass} mt-1`} /></label>
                        <label className="min-w-0 text-[9px] font-bold uppercase tracking-[.1em] text-white/40">On hand<input aria-label={`On hand stock for ${variant.finish}`} type="number" min={reserved} max={2147483647} step="1" value={stockDraft[variant.finish] ?? seeded} onChange={event => setStockDraft(current => ({ ...current, [variant.finish]: event.target.value }))} className={`${inputClass} mt-1`} /></label>
                        <p className="whitespace-nowrap pb-3 text-[10px] text-white/45">Reserved <span className="font-bold tabular-nums text-white/75">{reserved}</span></p>
                      </div>
                    </div>;
                  })}
                  {visibleVariations.length === 0 && <p className="px-4 py-8 text-center text-sm text-white/40">No combinations match “{variationSearch}”.</p>}
                </div>
              </div>
            ) : <p className="p-5 text-sm text-white/40">Add an option with one or more choices, or remove all options to make this a single-variation item.</p>}
          </div>
          {invalidPrice && <p className="text-xs text-red-300">Enter a valid non-negative price with up to two decimal places for each combination.</p>}
          <p className="text-xs leading-5 text-white/40">Each combination has its own price and stock. New combinations inherit a matching variation’s values when possible; reserved units stay attached to their original variation until those orders close.</p>
        </div>

        <DialogFooter className="flex-row justify-end gap-2 border-t border-white/10 px-5 py-4 sm:px-7">
          <button type="button" onClick={() => onOpenChange(false)} className="border border-white/15 px-4 py-3 text-[10px] font-bold uppercase tracking-[.13em] text-white/65 hover:text-white">Cancel</button>
          <button type="button" onClick={save} disabled={!generated.length || generatedTooMany || invalidStock || invalidPrice} className="bg-[#ff5a36] px-5 py-3 text-[10px] font-black uppercase tracking-[.13em] text-black disabled:opacity-40">Save variations</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function heldNumber(value: string) {
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : 0;
}
