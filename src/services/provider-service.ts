import { METHOD_PRICING } from "../config/pricing";
import { MethodPricing } from "../models/types";
import { notFound } from "../utils/app-error";

export interface ProviderListEntry {
  name: string;
  methodCount: number;
}

export const listProviders = (): ProviderListEntry[] =>
  Object.entries(METHOD_PRICING).map(([name, methods]) => ({
    name,
    methodCount: Object.keys(methods).length
  }));

export const getProviderMethods = (provider: string): Record<string, MethodPricing> => {
  const methods = METHOD_PRICING[provider.toLowerCase()];
  if (!methods) throw notFound("Provider", provider);
  return methods;
};

export const getMethodPricing = (provider: string, method: string): MethodPricing => {
  const methods = METHOD_PRICING[provider.toLowerCase()];
  if (!methods) throw notFound("Provider", provider);
  const pricing = methods[method];
  if (!pricing) throw notFound(`Provider '${provider}' method`, method);
  return pricing;
};
