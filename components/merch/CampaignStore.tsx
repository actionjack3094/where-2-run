"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MerchCatalog, MerchProduct, MerchVariant, MockPrintfulOrder } from "@/lib/merch";
import { formatUsd } from "@/lib/pledges";
import { cn } from "@/lib/utils";

type StoreStage = "loading" | "ready" | "error";

export function CampaignStore({ candidateId }: { candidateId: string }) {
  const [catalog, setCatalog] = useState<MerchCatalog | null>(null);
  const [stage, setStage] = useState<StoreStage>("loading");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [buyingId, setBuyingId] = useState<number | null>(null);
  const [orders, setOrders] = useState<Record<number, MockPrintfulOrder>>({});
  const [orderError, setOrderError] = useState<Record<number, string>>({});

  async function loadStore() {
    setError(null);
    setStage("loading");
    try {
      const response = await fetch(`/api/merch?candidateId=${encodeURIComponent(candidateId)}`);
      const payload = (await response.json()) as MerchCatalog & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load the campaign store.");
      }
      setCatalog(payload);
      setSelected(
        Object.fromEntries(
          payload.products.map((product) => [product.id, product.variants[0]?.id ?? 0]),
        ),
      );
      setStage("ready");
    } catch (cause) {
      setCatalog(null);
      setError(cause instanceof Error ? cause.message : "Could not load the campaign store.");
      setStage("error");
    }
  }

  useEffect(() => {
    void loadStore();
  }, [candidateId]);

  async function buyProduct(product: MerchProduct) {
    const variantId = selected[product.id];
    if (!variantId || buyingId != null) return;

    setBuyingId(product.id);
    setOrderError((current) => {
      const next = { ...current };
      delete next[product.id];
      return next;
    });

    try {
      const response = await fetch("/api/merch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          productId: product.id,
          variantId,
          quantity: 1,
        }),
      });
      const payload = (await response.json()) as { order?: MockPrintfulOrder; error?: string };
      if (!response.ok || !payload.order) {
        throw new Error(payload.error ?? "Could not place the Printful order.");
      }
      setOrders((current) => ({ ...current, [product.id]: payload.order as MockPrintfulOrder }));
    } catch (cause) {
      setOrderError((current) => ({
        ...current,
        [product.id]:
          cause instanceof Error ? cause.message : "Could not place the Printful order.",
      }));
    } finally {
      setBuyingId(null);
    }
  }

  return (
    <section className="mt-6">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">Store</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight">Campaign Store</h2>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Print-on-demand yard signs, bumper stickers, and tees generated from this candidate’s
        name and district.
      </p>

      {stage === "loading" && (
        <p className="mt-6 text-sm text-zinc-500">Syncing the Printful mock catalog…</p>
      )}

      {stage === "error" && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Store unavailable</CardTitle>
            <CardDescription>{error ?? "Could not load campaign merch."}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" onClick={() => void loadStore()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {stage === "ready" && catalog && (
        <>
          <p className="mt-4 text-xs uppercase tracking-widest text-zinc-400">
            Printful mock · {catalog.candidate.name} · {catalog.district.name}
          </p>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {catalog.products.map((product) => {
              const variantId = selected[product.id];
              const variant =
                product.variants.find((item) => item.id === variantId) ?? product.variants[0];
              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  variant={variant}
                  buying={buyingId === product.id}
                  order={orders[product.id] ?? null}
                  error={orderError[product.id] ?? null}
                  onSelectVariant={(id) =>
                    setSelected((current) => ({ ...current, [product.id]: id }))
                  }
                  onBuy={() => void buyProduct(product)}
                />
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function ProductCard({
  product,
  variant,
  buying,
  order,
  error,
  onSelectVariant,
  onBuy,
}: {
  product: MerchProduct;
  variant: MerchVariant | undefined;
  buying: boolean;
  order: MockPrintfulOrder | null;
  error: string | null;
  onSelectVariant: (variantId: number) => void;
  onBuy: () => void;
}) {
  const colors = useMemo(() => uniqueOptions(product.variants, "color"), [product.variants]);
  const sizes = useMemo(() => {
    const matching = product.variants.filter((item) =>
      variant?.color ? item.color === variant.color : true,
    );
    return uniqueOptions(matching, "size");
  }, [product.variants, variant?.color]);

  if (!variant) return null;

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="gap-3">
        <ProductMockup product={product} variant={variant} />
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            {labelFor(product.type)}
          </p>
          <CardTitle className="mt-1 text-base leading-snug">{product.name}</CardTitle>
          <CardDescription className="mt-1">{product.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="mt-auto flex flex-col gap-3">
        {colors.length > 1 && (
          <OptionRow label="Color">
            {colors.map((color) => {
              const option = product.variants.find((item) => item.color === color);
              const active = variant.color === color;
              return (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  aria-pressed={active}
                  title={color}
                  onClick={() => {
                    const next =
                      product.variants.find(
                        (item) => item.color === color && item.size === variant.size,
                      ) ?? option;
                    if (next) onSelectVariant(next.id);
                  }}
                  className={cn(
                    "h-7 w-7 rounded-full border",
                    active
                      ? "border-zinc-950 ring-2 ring-zinc-950 ring-offset-2 dark:border-zinc-50 dark:ring-zinc-50"
                      : "border-zinc-200 dark:border-zinc-700",
                  )}
                  style={{ backgroundColor: option?.colorHex ?? "#e4e4e7" }}
                />
              );
            })}
          </OptionRow>
        )}

        {sizes.length > 1 && (
          <OptionRow label="Size">
            {sizes.map((size) => {
              const option = product.variants.find(
                (item) => item.size === size && item.color === variant.color,
              );
              const active = variant.size === size;
              return (
                <Button
                  key={size}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  aria-pressed={active}
                  disabled={!option}
                  onClick={() => option && onSelectVariant(option.id)}
                >
                  {size}
                </Button>
              );
            })}
          </OptionRow>
        )}

        {sizes.length <= 1 && colors.length <= 1 && (
          <p className="text-xs uppercase tracking-widest text-zinc-400">{variant.name}</p>
        )}

        {error && <p className="text-sm text-zinc-600 dark:text-zinc-300">{error}</p>}

        {order ? (
          <div className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
            <p className="font-medium">Printful draft queued</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {formatUsd(order.retailCosts.total)} · {order.item.variantName}
            </p>
          </div>
        ) : (
          <Button type="button" onClick={onBuy} disabled={buying || !variant.inStock}>
            {buying ? "Sending to Printful…" : `Buy · ${formatUsd(variant.retailPrice)}`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function OptionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function uniqueOptions(variants: MerchVariant[], key: "color" | "size") {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const variant of variants) {
    const value = variant[key];
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

function labelFor(type: MerchProduct["type"]) {
  if (type === "yard_sign") return "Yard sign";
  if (type === "bumper_sticker") return "Bumper sticker";
  return "T-shirt";
}

function ProductMockup({
  product,
  variant,
}: {
  product: MerchProduct;
  variant: MerchVariant;
}) {
  const dark = isDark(variant.colorHex);

  if (product.type === "yard_sign") {
    return (
      <div className="flex aspect-[4/3] items-end justify-center rounded-lg bg-zinc-100 px-3 pb-3 pt-4 dark:bg-zinc-900">
        <div className="flex h-full w-[88%] flex-col items-center">
          <div className="flex w-full flex-1 flex-col items-center justify-center border-4 border-zinc-950 bg-white px-2 py-2 text-center shadow-sm dark:border-zinc-50 dark:bg-zinc-50">
            <p className="text-[11px] font-semibold uppercase leading-tight tracking-tight break-words text-zinc-950">
              {product.design.headline}
            </p>
            <p className="mt-1 text-[8px] font-medium uppercase leading-snug tracking-widest break-words text-zinc-500">
              {product.design.subline}
            </p>
          </div>
          <div className="h-5 w-1.5 bg-zinc-400 dark:bg-zinc-600" />
        </div>
      </div>
    );
  }

  if (product.type === "bumper_sticker") {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-zinc-100 px-4 dark:bg-zinc-900">
        <div
          className="flex min-h-16 w-full max-w-[230px] items-center justify-center rounded-full border-2 border-zinc-700 px-3 py-2 text-center shadow-sm"
          style={{ backgroundColor: variant.colorHex ?? "#18181b" }}
        >
          <div className="min-w-0">
            <p
              className={cn(
                "text-[11px] font-semibold uppercase leading-tight tracking-wide break-words",
                dark ? "text-zinc-50" : "text-zinc-950",
              )}
            >
              {product.design.headline}
            </p>
            <p
              className={cn(
                "mt-0.5 text-[8px] uppercase leading-snug tracking-widest break-words",
                dark ? "text-zinc-300" : "text-zinc-500",
              )}
            >
              {product.design.subline}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-900">
      <div className="relative h-[78%] w-[58%]">
        <div
          className="absolute inset-x-[18%] top-0 h-[12%] rounded-t-md"
          style={{ backgroundColor: variant.colorHex ?? "#fafafa" }}
        />
        <div
          className="absolute inset-x-0 top-[10%] bottom-0 rounded-b-md border border-black/10"
          style={{ backgroundColor: variant.colorHex ?? "#fafafa" }}
        />
        <div
          className="absolute -left-[16%] top-[10%] h-[28%] w-[18%] rounded-l-md border border-black/10"
          style={{ backgroundColor: variant.colorHex ?? "#fafafa" }}
        />
        <div
          className="absolute -right-[16%] top-[10%] h-[28%] w-[18%] rounded-r-md border border-black/10"
          style={{ backgroundColor: variant.colorHex ?? "#fafafa" }}
        />
        <div className="absolute inset-x-[12%] top-[36%] text-center">
          <p
            className={cn(
              "text-[10px] font-semibold uppercase leading-tight tracking-tight break-words",
              dark ? "text-zinc-50" : "text-zinc-950",
            )}
          >
            {product.design.headline}
          </p>
          <p
            className={cn(
              "mt-0.5 text-[7px] uppercase leading-snug tracking-widest break-words",
              dark ? "text-zinc-300" : "text-zinc-500",
            )}
          >
            {product.design.subline}
          </p>
        </div>
      </div>
    </div>
  );
}

function isDark(hex: string | null) {
  if (!hex) return false;
  const value = hex.replace("#", "");
  if (value.length !== 6) return false;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}
