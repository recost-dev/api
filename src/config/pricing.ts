import { MethodPricingRegistry } from "../models/types";

export const DEFAULT_PER_REQUEST_COST_USD = 0.0001;

export const METHOD_PRICING: MethodPricingRegistry = {
  openai: {
    "chat.completions.create": {
      costModel: "per_token",
      inputPricePer1M: 2.5,
      outputPricePer1M: 10.0,
      defaultInputTokens: 500,
      defaultOutputTokens: 200,
      notes: "GPT-4o pricing (as of 2025)"
    },
    "responses.create": {
      costModel: "per_token",
      inputPricePer1M: 2.5,
      outputPricePer1M: 10.0,
      defaultInputTokens: 500,
      defaultOutputTokens: 200,
      notes: "Responses API — same model pricing as chat.completions.create (GPT-4o)"
    },
    "embeddings.create": {
      costModel: "per_token",
      inputPricePer1M: 0.02,
      outputPricePer1M: 0,
      defaultInputTokens: 500,
      defaultOutputTokens: 0,
      notes: "text-embedding-3-small pricing"
    },
    "images.generate": {
      costModel: "per_request",
      perRequestCostUsd: 0.04,
      notes: "DALL-E 3 standard quality, 1024×1024"
    },
    "audio.transcriptions.create": {
      costModel: "per_request",
      perRequestCostUsd: 0.006,
      notes: "Whisper — $0.006/minute; approximated as ~1 minute per request"
    }
  },

  anthropic: {
    "messages.create": {
      costModel: "per_token",
      inputPricePer1M: 3.0,
      outputPricePer1M: 15.0,
      defaultInputTokens: 500,
      defaultOutputTokens: 200,
      notes: "Claude Sonnet 4 pricing"
    },
    "messages.batches.create": {
      costModel: "per_token",
      inputPricePer1M: 1.5,
      outputPricePer1M: 7.5,
      defaultInputTokens: 500,
      defaultOutputTokens: 200,
      notes: "Batch API — 50% discount on messages.create"
    }
  },

  stripe: {
    "paymentIntents.create": {
      costModel: "per_transaction",
      fixedFee: 0.3,
      percentageFee: 0.029,
      defaultTransactionUsd: 50,
      notes: "Standard card processing: $0.30 + 2.9%"
    },
    "customers.create": {
      costModel: "free",
      notes: "Creating customers is free"
    },
    "customers.list": {
      costModel: "free",
      notes: "Listing customers is free"
    },
    "subscriptions.create": {
      costModel: "per_transaction",
      fixedFee: 0.3,
      percentageFee: 0.029,
      defaultTransactionUsd: 50,
      notes: "Subscription billing uses same processing fees as PaymentIntents"
    },
    "charges.create": {
      costModel: "per_transaction",
      fixedFee: 0.3,
      percentageFee: 0.029,
      defaultTransactionUsd: 50,
      notes: "Legacy Charges API: $0.30 + 2.9%"
    }
  },

  supabase: {
    "from.select": {
      costModel: "per_request",
      perRequestCostUsd: 0.0000012,
      notes: "Database read: ~$0.09/100K rows read (Pro plan)"
    },
    "from.insert": {
      costModel: "per_request",
      perRequestCostUsd: 0.0000025,
      notes: "Database write: ~$0.09/100K rows written (Pro plan)"
    },
    "from.update": {
      costModel: "per_request",
      perRequestCostUsd: 0.0000025,
      notes: "Database write: ~$0.09/100K rows written (Pro plan)"
    },
    "storage.from.upload": {
      costModel: "per_request",
      perRequestCostUsd: 0.000021,
      notes: "Storage upload costs including egress approximation"
    }
  },

  firebase: {
    "firestore.doc.get": {
      costModel: "per_request",
      perRequestCostUsd: 0.0000006,
      notes: "Firestore read: $0.06/100K reads"
    },
    "firestore.doc.set": {
      costModel: "per_request",
      perRequestCostUsd: 0.0000018,
      notes: "Firestore write: $0.18/100K writes"
    },
    "storage.upload": {
      costModel: "per_request",
      perRequestCostUsd: 0.000021,
      notes: "Cloud Storage: $0.10/GB stored + $0.12/GB egress (approximated per request)"
    }
  },

  "aws-bedrock": {
    invokeModel: {
      costModel: "per_token",
      inputPricePer1M: 3.0,
      outputPricePer1M: 15.0,
      defaultInputTokens: 500,
      defaultOutputTokens: 200,
      notes: "Claude Sonnet via Bedrock on-demand pricing"
    },
    converseCommand: {
      costModel: "per_token",
      inputPricePer1M: 3.0,
      outputPricePer1M: 15.0,
      defaultInputTokens: 500,
      defaultOutputTokens: 200,
      notes: "Bedrock Converse API with Claude Sonnet pricing"
    }
  },

  "google-gemini": {
    generateContent: {
      costModel: "per_token",
      inputPricePer1M: 0.075,
      outputPricePer1M: 0.3,
      defaultInputTokens: 500,
      defaultOutputTokens: 200,
      notes: "Gemini 2.0 Flash pricing"
    }
  },

  cohere: {
    chat: {
      costModel: "per_token",
      inputPricePer1M: 2.5,
      outputPricePer1M: 10.0,
      defaultInputTokens: 500,
      defaultOutputTokens: 200,
      notes: "Command R+ pricing"
    },
    embed: {
      costModel: "per_token",
      inputPricePer1M: 0.1,
      outputPricePer1M: 0,
      defaultInputTokens: 500,
      defaultOutputTokens: 0,
      notes: "Embed v3 pricing"
    },
    rerank: {
      costModel: "per_request",
      perRequestCostUsd: 0.002,
      notes: "Rerank: $2.00/1K queries"
    }
  },

  sendgrid: {
    "mail.send": {
      costModel: "per_request",
      perRequestCostUsd: 0.001,
      notes: "Transactional email: ~$0.001/email on paid plans"
    }
  },

  twilio: {
    "messages.create": {
      costModel: "per_request",
      perRequestCostUsd: 0.0079,
      notes: "SMS to US numbers: $0.0079 per outbound message"
    }
  },

  "google-maps": {
    geocode: {
      costModel: "per_request",
      perRequestCostUsd: 0.005,
      notes: "Geocoding API: $5.00/1K requests"
    },
    directions: {
      costModel: "per_request",
      perRequestCostUsd: 0.01,
      notes: "Directions API: $5.00–$10.00/1K requests"
    }
  }
};

export const computeMonthlyCost = (
  provider: string,
  methodSignature: string | undefined,
  callsPerDay: number
): number => {
  const providerMethods = METHOD_PRICING[provider];

  if (providerMethods && methodSignature) {
    const pricing = providerMethods[methodSignature];
    if (pricing) {
      let costPerCall: number;
      switch (pricing.costModel) {
        case "per_token":
          costPerCall =
            ((pricing.defaultInputTokens ?? 0) / 1_000_000) * (pricing.inputPricePer1M ?? 0) +
            ((pricing.defaultOutputTokens ?? 0) / 1_000_000) * (pricing.outputPricePer1M ?? 0);
          break;
        case "per_transaction":
          costPerCall =
            (pricing.fixedFee ?? 0) +
            (pricing.defaultTransactionUsd ?? 0) * (pricing.percentageFee ?? 0);
          break;
        case "per_request":
          costPerCall = pricing.perRequestCostUsd ?? 0;
          break;
        case "free":
          return 0;
      }
      return costPerCall * callsPerDay * 30;
    }
  }

  return DEFAULT_PER_REQUEST_COST_USD * callsPerDay * 30;
};
