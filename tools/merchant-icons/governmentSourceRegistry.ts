export type GovernmentSourceKind = "csv" | "html" | "paginated-json";

export interface GovernmentSourceDefinition {
  readonly id: string;
  readonly country: "AU" | "NZ" | "GB" | "US";
  readonly level: "federal" | "national";
  readonly kind: GovernmentSourceKind;
  readonly url: string;
  readonly snapshotFile: string;
  readonly authority: string;
}

export const GOVERNMENT_SOURCE_REGISTRY: readonly GovernmentSourceDefinition[] = [
  {
    id: "au-agor",
    country: "AU",
    level: "federal",
    kind: "csv",
    url: "https://data.gov.au/data/dataset/c77cface-69aa-4dd0-b99f-b065dc33c8e6/resource/257663f6-9996-4089-9244-7b205413898f/download/agor-2025-07-07.csv",
    snapshotFile: "au-agor.csv",
    authority: "Australian Government Organisations Register (Department of Finance)",
  },
  {
    id: "nz-government-a-z",
    country: "NZ",
    level: "national",
    kind: "html",
    url: "https://www.govt.nz/organisations/",
    snapshotFile: "nz-government-a-z.html",
    authority: "New Zealand Government",
  },
  {
    id: "gb-govuk-organisations",
    country: "GB",
    level: "national",
    kind: "paginated-json",
    url: "https://www.gov.uk/api/organisations",
    snapshotFile: "gb-govuk-organisations.json",
    authority: "GOV.UK Organisations API",
  },
  {
    id: "us-usagov-agencies",
    country: "US",
    level: "federal",
    kind: "html",
    url: "https://www.usa.gov/agency-index",
    snapshotFile: "us-usagov-agencies.html",
    authority: "USAGov",
  },
] as const;
