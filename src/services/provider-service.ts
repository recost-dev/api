import { PROVIDER_PRICING } from "../config/pricing";
import { ProviderPricing } from "../models/types";
import { notFound } from "../utils/app-error";

export const listProviders = (): ProviderPricing[] => {
  return Object.values(PROVIDER_PRICING);
};

export const getProvider = (name: string): ProviderPricing => {
  const provider = PROVIDER_PRICING[name.toLowerCase()];
  if (!provider) throw notFound("Provider", name);
  return provider;
};

