import type { TransactionTagColour } from "./transactionTagTypes";

export const transactionTagColourOptions: ReadonlyArray<{
  value: TransactionTagColour;
  label: string;
  swatch: string;
}> = [
  { value: "red", label: "Red", swatch: "#dc5548" },
  { value: "rose", label: "Rose", swatch: "#e34f76" },
  { value: "gray", label: "Gray", swatch: "#747b88" },
  { value: "orange", label: "Orange", swatch: "#ed7d2b" },
  { value: "amber", label: "Amber", swatch: "#f0a000" },
  { value: "yellow", label: "Yellow", swatch: "#e7b72d" },
  { value: "lime", label: "Lime", swatch: "#8bc735" },
  { value: "green", label: "Green", swatch: "#60bd67" },
  { value: "emerald", label: "Emerald", swatch: "#57b484" },
  { value: "teal", label: "Teal", swatch: "#55aca4" },
  { value: "cyan", label: "Cyan", swatch: "#56afd0" },
  { value: "sky", label: "Sky", swatch: "#3e9be8" },
  { value: "blue", label: "Blue", swatch: "#4f7fe8" },
  { value: "navy", label: "Navy", swatch: "#36558f" },
  { value: "indigo", label: "Indigo", swatch: "#5c63df" },
  { value: "violet", label: "Violet", swatch: "#7f5ce1" },
  { value: "purple", label: "Purple", swatch: "#a755d1" },
  { value: "fuchsia", label: "Fuchsia", swatch: "#cf4bc5" },
  { value: "pink", label: "Pink", swatch: "#df5795" },
  { value: "brown", label: "Brown", swatch: "#936646" },
  { value: "sand", label: "Sand", swatch: "#ad8b62" },
  { value: "slate", label: "Slate", swatch: "#425166" },
  { value: "black", label: "Black", swatch: "#24272d" },
];
