import { METHOD_PRICING } from "../config/pricing";
import { notFound } from "../utils/app-error";

export interface ProviderSummary {
  name: string;
  methods: string[];
}

export const listProviders = (): ProviderSummary[] => {
  return Object.entries(METHOD_PRICING).map(([name, methods]) => ({
    name,
    methods: Object.keys(methods)
  }));
};

export const getProvider = (name: string): ProviderSummary => {
  const methods = METHOD_PRICING[name.toLowerCase()];
  if (!methods) throw notFound("Provider", name);
  return { name, methods: Object.keys(methods) };
};
