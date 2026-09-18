/** Mock Printful client. Injects candidate + district copy into POD templates. */

export type MerchProductType = "yard_sign" | "bumper_sticker" | "t_shirt";

export type MerchCandidate = {
  id: string;
  name: string;
  districtId: string | null;
  districtName: string;
  districtLevel: string | null;
};

export type PrintfulFile = {
  type: "default" | "front" | "back";
  url: string;
  filename: string;
};

export type MerchVariant = {
  id: number;
  externalId: string;
  sku: string;
  name: string;
  size: string | null;
  color: string | null;
  colorHex: string | null;
  retailPrice: number;
  currency: "USD";
  inStock: boolean;
};

export type MerchProduct = {
  id: number;
  printfulProductId: number;
  type: MerchProductType;
  name: string;
  description: string;
  design: {
    templateId: string;
    rawTemplate: string;
    rendered: string;
    headline: string;
    subline: string;
    files: PrintfulFile[];
  };
  variants: MerchVariant[];
};

export type MerchCatalog = {
  provider: "printful";
  mock: true;
  candidate: {
    id: string;
    name: string;
  };
  district: {
    id: string | null;
    name: string;
    level: string | null;
  };
  products: MerchProduct[];
};

export type MockPrintfulOrder = {
  id: string;
  status: "draft";
  provider: "printful";
  mock: true;
  candidateId: string;
  productId: number;
  variantId: number;
  item: {
    name: string;
    variantName: string;
    retailPrice: number;
    quantity: number;
    design: string;
  };
  retailCosts: {
    currency: "USD";
    subtotal: number;
    total: number;
  };
  createdAt: string;
};

type TemplateVars = {
  name: string;
  district: string;
};

type ProductBlueprint = {
  id: number;
  type: MerchProductType;
  templateId: string;
  nameTemplate: string;
  descriptionTemplate: string;
  designTemplate: string;
  headlineTemplate: string;
  sublineTemplate: string;
  variants: Array<{
    id: number;
    size: string | null;
    color: string | null;
    colorHex: string | null;
    retailPrice: number;
    skuSuffix: string;
    nameTemplate: string;
  }>;
};

const UNCONFIRMED_DISTRICT = "District TBA";

const BLUEPRINTS: ProductBlueprint[] = [
  {
    id: 616,
    type: "yard_sign",
    templateId: "yard-sign-coroplast",
    nameTemplate: "{{name}} yard sign",
    descriptionTemplate:
      "Corrugated 4mm lawn sign for the {{district}} race. Stake-ready, weatherproof, printed both sides.",
    designTemplate: "{{name}}\nFOR {{district}}",
    headlineTemplate: "{{name}}",
    sublineTemplate: "FOR {{district}}",
    variants: [
      {
        id: 61601,
        size: "18×24",
        color: "White",
        colorHex: "#fafafa",
        retailPrice: 24,
        skuSuffix: "18x24",
        nameTemplate: "{{name}} yard sign / 18×24 / White",
      },
      {
        id: 61602,
        size: "24×18",
        color: "White",
        colorHex: "#fafafa",
        retailPrice: 28,
        skuSuffix: "24x18",
        nameTemplate: "{{name}} yard sign / 24×18 / White",
      },
    ],
  },
  {
    id: 358,
    type: "bumper_sticker",
    templateId: "bumper-sticker-vinyl",
    nameTemplate: "{{name}} bumper sticker",
    descriptionTemplate:
      "Weatherproof vinyl for the {{district}} campaign. Peel, stick, and leave it on the bumper.",
    designTemplate: "{{name}} · {{district}}",
    headlineTemplate: "{{name}}",
    sublineTemplate: "{{district}}",
    variants: [
      {
        id: 35801,
        size: "3×11",
        color: "Navy",
        colorHex: "#18181b",
        retailPrice: 6,
        skuSuffix: "3x11",
        nameTemplate: "{{name}} bumper sticker / 3×11 / Navy",
      },
      {
        id: 35802,
        size: "4×15",
        color: "Navy",
        colorHex: "#18181b",
        retailPrice: 8,
        skuSuffix: "4x15",
        nameTemplate: "{{name}} bumper sticker / 4×15 / Navy",
      },
    ],
  },
  {
    id: 71,
    type: "t_shirt",
    templateId: "bella-canvas-3001",
    nameTemplate: "{{name}} campaign tee",
    descriptionTemplate:
      "Bella + Canvas 3001 staple tee. Front print with {{name}} and {{district}}.",
    designTemplate: "{{name}}\n{{district}}",
    headlineTemplate: "{{name}}",
    sublineTemplate: "{{district}}",
    variants: [
      tee(71011, "S", "White", "#fafafa", 28),
      tee(71012, "M", "White", "#fafafa", 28),
      tee(71013, "L", "White", "#fafafa", 28),
      tee(71014, "XL", "White", "#fafafa", 28),
      tee(71021, "S", "Black", "#18181b", 28),
      tee(71022, "M", "Black", "#18181b", 28),
      tee(71023, "L", "Black", "#18181b", 28),
      tee(71024, "XL", "Black", "#18181b", 28),
      tee(71031, "S", "Navy", "#1e293b", 28),
      tee(71032, "M", "Navy", "#1e293b", 28),
      tee(71033, "L", "Navy", "#1e293b", 28),
      tee(71034, "XL", "Navy", "#1e293b", 28),
    ],
  },
];

function tee(
  id: number,
  size: string,
  color: string,
  colorHex: string,
  retailPrice: number,
): ProductBlueprint["variants"][number] {
  return {
    id,
    size,
    color,
    colorHex,
    retailPrice,
    skuSuffix: `${size}-${color}`.toLowerCase(),
    nameTemplate: `{{name}} campaign tee / ${size} / ${color}`,
  };
}

export function fillTemplate(template: string, vars: TemplateVars) {
  return template.replace(/\{\{(name|district)\}\}/g, (_, key: keyof TemplateVars) => vars[key]);
}

export function merchVars(input: Pick<MerchCandidate, "name" | "districtName">): TemplateVars {
  return {
    name: input.name.trim() || "Candidate",
    district: input.districtName.trim() || UNCONFIRMED_DISTRICT,
  };
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "candidate"
  );
}

function mockFileUrl(candidateId: string, type: MerchProductType, filename: string) {
  return `https://mock.printful.local/files/${candidateId}/${type}/${filename}`;
}

export function generateCandidateMerch(input: MerchCandidate): MerchCatalog {
  const vars = merchVars(input);
  const slug = slugify(vars.name);
  const shortId = input.id.replace(/-/g, "").slice(0, 8);

  const products = BLUEPRINTS.map((blueprint) => {
    const filename = `${slug}-front.png`;
    return {
      id: blueprint.id,
      printfulProductId: blueprint.id,
      type: blueprint.type,
      name: fillTemplate(blueprint.nameTemplate, vars),
      description: fillTemplate(blueprint.descriptionTemplate, vars),
      design: {
        templateId: blueprint.templateId,
        rawTemplate: blueprint.designTemplate,
        rendered: fillTemplate(blueprint.designTemplate, vars),
        headline: fillTemplate(blueprint.headlineTemplate, vars),
        subline: fillTemplate(blueprint.sublineTemplate, vars),
        files: [
          {
            type: "front" as const,
            url: mockFileUrl(input.id, blueprint.type, filename),
            filename,
          },
        ],
      },
      variants: blueprint.variants.map((variant) => ({
        id: variant.id,
        externalId: `${shortId}-${blueprint.type}-${variant.skuSuffix}`,
        sku: `W2R-${shortId}-${blueprint.id}-${variant.skuSuffix}`.toUpperCase(),
        name: fillTemplate(variant.nameTemplate, vars),
        size: variant.size,
        color: variant.color,
        colorHex: variant.colorHex,
        retailPrice: variant.retailPrice,
        currency: "USD" as const,
        inStock: true,
      })),
    };
  });

  return {
    provider: "printful",
    mock: true,
    candidate: {
      id: input.id,
      name: vars.name,
    },
    district: {
      id: input.districtId,
      name: vars.district,
      level: input.districtLevel,
    },
    products,
  };
}

export function findMerchItem(
  products: MerchProduct[],
  productId: number,
  variantId: number,
) {
  const product = products.find((item) => item.id === productId);
  const variant = product?.variants.find((item) => item.id === variantId) ?? null;
  if (!product || !variant) return null;
  return { product, variant };
}

export function createMockPrintfulOrder(input: {
  candidate: MerchCandidate;
  product: MerchProduct;
  variant: MerchVariant;
  quantity?: number;
}): MockPrintfulOrder {
  const quantity = input.quantity && input.quantity > 0 ? Math.floor(input.quantity) : 1;
  const subtotal = input.variant.retailPrice * quantity;

  return {
    id: `pf_mock_${crypto.randomUUID()}`,
    status: "draft",
    provider: "printful",
    mock: true,
    candidateId: input.candidate.id,
    productId: input.product.id,
    variantId: input.variant.id,
    item: {
      name: input.product.name,
      variantName: input.variant.name,
      retailPrice: input.variant.retailPrice,
      quantity,
      design: input.product.design.rendered,
    },
    retailCosts: {
      currency: "USD",
      subtotal,
      total: subtotal,
    },
    createdAt: new Date().toISOString(),
  };
}
