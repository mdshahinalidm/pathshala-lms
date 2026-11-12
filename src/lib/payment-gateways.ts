/**
 * Payment Gateway Registry — official Bangladeshi gateway API structures.
 *
 * Each gateway entry documents the REAL production endpoints/payload fields
 * (collected from the gateway's official developer docs) so the admin can
 * plug in live credentials and go live. mode:
 *   LIVE    → real API integration (initiatePayment → redirect/callback)
 *   SANDBOX → demo gateway screen (current simulated flow, no keys needed)
 *   OFF     → hidden from checkout
 *
 * Config JSON keys below map 1:1 to the official dashboard credentials.
 */

export interface GatewayField {
  key: string
  bn: string
  en: string
  type: 'text' | 'password' | 'textarea'
  required?: boolean
  helpBn?: string
  helpEn?: string
}

export interface GatewayCatalogEntry {
  code: string
  name: string
  isManual: boolean
  logoEmoji: string
  docsUrl: string
  fields: GatewayField[]
  endpoints?: Record<string, string>
  noteBn?: string
  noteEn?: string
}

export const GATEWAY_CATALOG: GatewayCatalogEntry[] = [
  {
    code: 'BKASH',
    name: 'bKash (Tokenized Checkout)',
    isManual: false,
    logoEmoji: '📱',
    docsUrl: 'https://developer.bka.sh/docs/tokenized-checkout-beta',
    endpoints: {
      token: '{base}/tokenized/checkout/grant',
      create: '{base}/tokenized/checkout/create',
      execute: '{base}/tokenized/checkout/execute',
      refund: '{base}/tokenized/checkout/refund',
      sandboxBase: 'https://tokenized.sandbox.bka.sh/v1.2.0',
      liveBase: 'https://tokenized.pay.bka.sh/v1.2.0',
    },
    fields: [
      { key: 'app_key', bn: 'অ্যাপ কী', en: 'App Key', type: 'text', required: true },
      { key: 'app_secret', bn: 'অ্যাপ সিক্রেট', en: 'App Secret', type: 'password', required: true },
      { key: 'username', bn: 'ইউজারনেম', en: 'Username', type: 'text', required: true },
      { key: 'password', bn: 'পাসওয়ার্ড', en: 'Password', type: 'password', required: true },
      {
        key: 'callback_url',
        bn: 'কলব্যাক URL',
        en: 'Callback URL',
        type: 'text',
        helpBn: 'পেমেন্ট শেষে bKash যেখানে ইউজারকে ফেরত পাঠাবে। খালি রাখলে সাইটের ডিফল্ট কলব্যাক ব্যবহৃত হবে।',
        helpEn: 'Where bKash redirects the user after payment. Leave empty to use the site default callback.',
      },
    ],
    noteBn: 'হেডারে username/password + বডিতে app_key যায়; mode "0011" (sale)। Create থেকে bkashURL-এ ইউজার পাঠানো হয়, কলব্যাকে paymentID দিয়ে Execute করে চূড়ান্ত করা হয়।',
    noteEn: 'username/password go in headers, app_key in body, mode "0011" (sale). User is redirected to bkashURL from Create; callback executes with paymentID.',
  },
  {
    code: 'SSLCOMMERZ',
    name: 'SSLCommerz',
    isManual: false,
    logoEmoji: '🛡️',
    docsUrl: 'https://developer.sslcommerz.com/doc/api-reference/',
    endpoints: {
      session: '{base}/gwprocess/v4/api.php',
      validation: '{base}/validator/api/validationserverAPI.php',
      sandboxBase: 'https://sandbox.sslcommerz.com',
      liveBase: 'https://securepay.sslcommerz.com',
    },
    fields: [
      { key: 'store_id', bn: 'স্টোর আইডি', en: 'Store ID', type: 'text', required: true },
      { key: 'store_passwd', bn: 'স্টোর পাসওয়ার্ড', en: 'Store Password', type: 'password', required: true },
      { key: 'currency', bn: 'কারেন্সি', en: 'Currency', type: 'text', helpBn: 'ডিফল্ট BDT', helpEn: 'Default BDT' },
      {
        key: 'callback_url',
        bn: 'সাকসেস/ফেইল URL বেস',
        en: 'Success/fail base URL',
        type: 'text',
        helpBn: 'খালি রাখলে সাইটের ডিফল্ট কলব্যাক ব্যবহৃত হবে।',
        helpEn: 'Leave empty to use the site default callback.',
      },
    ],
    noteBn: 'session API-তে tran_id, total_amount, cus_name ইত্যাদি পোস্ট করে GatewayPageURL পাওয়া যায়; সাকসেসে val_id দিয়ে Order Validation API-তে যাচাই করতে হয়।',
    noteEn: 'POST tran_id, total_amount, cus_name etc. to the session API → GatewayPageURL; verify val_id via the Order Validation API on success.',
  },
  {
    code: 'ROCKET',
    name: 'Rocket (DBBL)',
    isManual: false,
    logoEmoji: '🚀',
    docsUrl: 'https://www.dutchbanglabank.com/e-commerce/',
    fields: [
      {
        key: 'aggregator',
        bn: 'অ্যাগ্রিগেটর কনফিগ (JSON)',
        en: 'Aggregator config (JSON)',
        type: 'textarea',
        required: true,
        helpBn: 'Rocket সরাসরি API দেয় না — SSLCommerz-এর মতো অ্যাগ্রিগেটরের ক্রেডেনশিয়াল এখানে JSON আকারে দিন।',
        helpEn: 'Rocket has no direct API — paste aggregator credentials (e.g. SSLCommerz) here as JSON.',
      },
    ],
    noteBn: 'অ্যাগ্রিগেটরের মাধ্যমে Rocket চালু হয় (সাধারণত SSLCommerz স্টোরে rocket_enable=true)।',
    noteEn: 'Rocket is enabled through an aggregator (typically SSLCommerz store with rocket_enable=true).',
  },
  {
    code: 'MANUAL',
    name: 'ম্যানুয়াল পেমেন্ট (Invoice)',
    isManual: true,
    logoEmoji: '🧾',
    docsUrl: '',
    fields: [
      { key: 'bkash_number', bn: 'bKash নম্বর', en: 'bKash number', type: 'text' },
      { key: 'nagad_number', bn: 'Nagad নম্বর', en: 'Nagad number', type: 'text' },
      { key: 'rocket_number', bn: 'Rocket নম্বর', en: 'Rocket number', type: 'text' },
      { key: 'bank_info', bn: 'ব্যাংক অ্যাকাউন্ট তথ্য', en: 'Bank account info', type: 'textarea' },
    ],
    noteBn: 'স্টুডেন্ট ইনভয়েস নম্বরকে রেফারেন্স ধরে টাকা পাঠাবে, তারপর ট্রানজেকশন আইডি জমা দেবে; অ্যাডমিন অর্ডার পেজ থেকে যাচাই করে অ্যাপ্রুভ করলেই কোর্স আনলক।',
    noteEn: 'Student sends money using the invoice number as reference, submits the transaction id; the admin verifies and approves from the Orders page to unlock the course.',
  },
]

export function findCatalog(code: string): GatewayCatalogEntry | undefined {
  return GATEWAY_CATALOG.find((g) => g.code === code)
}

/** Seed the PaymentGateway table on first use (idempotent). */
export async function ensureGatewaysSeeded(): Promise<void> {
  const { db } = await import('@/lib/db')
  const existing = await db.paymentGateway.count()
  if (existing > 0) return
  let order = 0
  for (const g of GATEWAY_CATALOG) {
    await db.paymentGateway.upsert({
      where: { code: g.code },
      update: {},
      create: {
        code: g.code,
        name: g.name,
        isManual: g.isManual,
        logoEmoji: g.logoEmoji,
        order: order++,
        mode: g.code === 'MANUAL' ? 'LIVE' : 'OFF',
        enabled: g.code === 'MANUAL',
        config: '{}',
        instructions:
          g.code === 'MANUAL'
            ? '১) নিচের নম্বরে Send Money করুন ২) রেফারেন্স-এ ইনভয়েস নম্বরটি অবশ্যই দিন ৩) ট্রানজেকশন আইডি (TrxID) কপি করে নিচের ফর্মে জমা দিন। অ্যাডমিন যাচাই করে কোর্স আনলক করে দেবেন।'
            : '',
        instructionsEn:
          g.code === 'MANUAL'
            ? '1) Send Money to the number below 2) Use the INVOICE number as reference 3) Copy the TrxID and submit it in the form below. The admin verifies and unlocks your course.'
            : '',
      },
    })
  }
}

export interface PublicGateway {
  code: string
  name: string
  isManual: boolean
  mode: string
  logoEmoji: string
  /** Uploaded logo for CUSTOM gateways (built-ins use GATEWAY_LOGOS). */
  logoUrl?: string | null
  instructions: string
  instructionsEn: string
  /** Manual payment destinations (numbers/bank) — safe to expose. */
  manualNumbers?: { bkash?: string; nagad?: string; rocket?: string; bank?: string }
}

/**
 * ORIGINAL official gateway logos — sourced from the web (Wikimedia Commons /
 * official brand vector assets), NOT hand-drawn:
 *   BKASH      বিকাশ wordmark + origami bird (official primary lockup)
 *   ROCKET     ROCKET রকেট — Dutch-Bangla Bank mobile banking (purple)
 *   UPAY       উপায় smile mark (yellow/blue)
 *   SSLCOMMERZ SSLCOMMERZ blue rounded wordmark
 *   STRIPE     stripe wordmark (#635BFF)
 * Custom gateways use their uploaded logoUrl instead of this map.
 * Used in the admin gateway setup AND on checkout, WITHOUT any circular
 * container, border or decorative frame (per spec: clean, original logo only).
 */
export const GATEWAY_LOGOS: Record<string, string> = {
  BKASH: '/images/gateways/bkash.svg',
  ROCKET: '/images/gateways/rocket.svg',
  UPAY: '/images/gateways/upay.svg',
  SSLCOMMERZ: '/images/gateways/sslcommerz.svg',
  STRIPE: '/images/gateways/stripe.svg',
  MANUAL: '/images/gateways/manual.svg',
}

export function gatewayLogo(code: string): string | null {
  return GATEWAY_LOGOS[code.toUpperCase()] ?? null
}

/** Public checkout payload — NEVER includes secrets/config. */
export function toPublicGateway(g: {
  code: string
  name: string
  isManual: boolean
  mode: string
  logoEmoji: string
  logoUrl?: string | null
  instructions: string
  instructionsEn: string
  config: string
}): PublicGateway {
  const pub: PublicGateway = {
    code: g.code,
    name: g.name,
    isManual: g.isManual,
    mode: g.mode,
    logoEmoji: g.logoEmoji,
    logoUrl: g.logoUrl ?? null,
    instructions: g.instructions,
    instructionsEn: g.instructionsEn,
  }
  if (g.isManual) {
    try {
      const cfg = JSON.parse(g.config || '{}') as Record<string, string>
      pub.manualNumbers = {
        bkash: cfg.bkash_number || undefined,
        nagad: cfg.nagad_number || undefined,
        rocket: cfg.rocket_number || undefined,
        bank: cfg.bank_info || undefined,
      }
    } catch {
      /* empty config */
    }
  }
  return pub
}
