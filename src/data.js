// Loads the JSON data files into one shared registry.
export const DATA = {
  industries: [], furniture: [], names: { first: [], last: [] }, traits: [], topics: [],
  furnById: {}, indById: {}, traitById: {},
};

export async function loadData() {
  const load = (n) => fetch(`data/${n}.json`).then((r) => {
    if (!r.ok) throw new Error(`Could not load data/${n}.json`);
    return r.json();
  });
  const [industries, furniture, names, traits, topics] = await Promise.all(
    ['industries', 'furniture', 'names', 'traits', 'topics'].map(load));
  DATA.industries = industries;
  DATA.furniture = furniture;
  DATA.names = names;
  DATA.traits = traits;
  DATA.topics = topics;
  for (const t of traits) DATA.traitById[t.id] = t;
  for (const i of industries) DATA.indById[i.id] = i;
  for (const f of furniture) DATA.furnById[f.id] = f;
}
