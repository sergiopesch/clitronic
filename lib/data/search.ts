import { electronicsComponents } from "./components";
import type { ElectronicsComponent } from "./types";

export function lookupComponent(query: string): ElectronicsComponent | null {
  const q = query.toLowerCase().trim();

  // Exact id match
  const exactId = electronicsComponents.find((c) => c.id === q);
  if (exactId) return exactId;

  // Exact name match (case-insensitive)
  const exactName = electronicsComponents.find(
    (c) => c.name.toLowerCase() === q
  );
  if (exactName) return exactName;

  // Partial name match
  const partialName = electronicsComponents.find(
    (c) =>
      c.name.toLowerCase().includes(q) || c.id.includes(q) || q.includes(c.id)
  );
  if (partialName) return partialName;

  // Fuzzy: check if query words appear in description
  const words = q.split(/\s+/);
  const fuzzy = electronicsComponents.find((c) => {
    const text = `${c.name} ${c.description}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  return fuzzy ?? null;
}

export function searchComponents(options: {
  category?: string;
  keyword?: string;
}): ElectronicsComponent[] {
  let results = [...electronicsComponents];

  if (options.category) {
    const cat = options.category.toLowerCase();
    results = results.filter((c) => c.category === cat);
  }

  if (options.keyword) {
    const kw = options.keyword.toLowerCase();
    results = results.filter(
      (c) =>
        c.name.toLowerCase().includes(kw) ||
        c.description.toLowerCase().includes(kw) ||
        c.id.includes(kw)
    );
  }

  return results;
}
