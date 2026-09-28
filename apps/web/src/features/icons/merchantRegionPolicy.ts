/**
 * Merchant matching has no persisted payee region yet. The application currently
 * defaults new budgets to AUD and formats its primary UI with en-AU, so automatic
 * payee rendering uses AU until an authoritative per-budget region is available.
 * Pass null at boundaries that cannot safely apply the application default.
 */
export const DEFAULT_MERCHANT_REGION = "AU";

