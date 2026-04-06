# Environment Variables

## Overview

All environment variables are stored in `.env` at the project root.

---

## Required Variables

### Supabase
| Variable | Description | Status |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | ✅ Configured |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | ✅ Configured |

### Stripe
| Variable | Description | Status |
|---|---|---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe frontend key | ✅ Configured |
| `STRIPE_SECRET_KEY` | Stripe server-side key | ⚠️ Needs real value |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | ⚠️ Needs real value |

### Twilio
| Variable | Description | Status |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio account SID | ⚠️ Needs real value |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | ⚠️ Needs real value |
| `TWILIO_PHONE_NUMBER` | SMS sender number | ⚠️ Needs real value |
| `TWILIO_WHATSAPP_FROM` | WhatsApp sender number | ✅ Configured |

### App
| Variable | Description | Status |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Application base URL | ✅ Set to production URL |

### Optional (AI / Analytics)
| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `PERPLEXITY_API_KEY` | Perplexity API key |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics ID |
| `NEXT_PUBLIC_ADSENSE_ID` | Google AdSense ID |

---

## Where Variables Are Used

| Variable | Used In |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `src/app/settlement-dashboard/components/SettlementClient.tsx` |
| `STRIPE_SECRET_KEY` | `src/app/api/stripe/charge-subscription/route.ts` |
| `STRIPE_WEBHOOK_SECRET` | `supabase/functions/stripe-webhook/index.ts` |
| `TWILIO_*` | `src/app/api/send-low-stock-sms/route.ts`, `supabase/functions/send-whatsapp-receipt/index.ts` |
| `NEXT_PUBLIC_SITE_URL` | OAuth redirect URLs |
