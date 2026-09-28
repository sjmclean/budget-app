export type GovernmentSourceKind = "csv" | "html" | "json" | "paginated-json" | "zip-csv";

export interface GovernmentSourceDefinition {
  readonly id: string;
  readonly country: "AU" | "NZ" | "GB" | "US";
  readonly level: "federal" | "national" | "state-local" | "local";
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
  {
    id: "au-local-government-areas",
    country: "AU",
    level: "local",
    kind: "json",
    url: "https://spatial.infrastructure.gov.au/server/rest/services/Hosted/Local_Government_Areas__Navigate__Live/FeatureServer/0/query?where=1%3D1&outFields=lga_name,state_code&returnGeometry=false&f=json",
    snapshotFile: "au-local-government-areas.json",
    authority: "Australian Government Department of Infrastructure / Geoscape Australia",
  },
  {
    id: "gb-local-authorities",
    country: "GB",
    level: "local",
    kind: "json",
    url: "https://www.planning.data.gov.uk/entity.json?dataset=local-authority&limit=500&field=name&field=entity",
    snapshotFile: "gb-local-authorities.json",
    authority: "UK Ministry of Housing, Communities and Local Government Planning Data",
  },
  {
    id: "us-government-units-2026",
    country: "US",
    level: "state-local",
    kind: "zip-csv",
    url: "https://www2.census.gov/programs-surveys/gus/datasets/2026/gov_units_2026.zip",
    snapshotFile: "us-government-units-2026.zip",
    authority: "United States Census Bureau",
  },
] as const;
