// Loads the JSON data files into one shared registry.
export const DATA = { industries: [], furniture: [], names: { first: [], last: [] }, furnById: {}, indById: {} };

export async function loadData() {
  const load = (n) => fetch(`data/${n}.json`).then((r) => {
    if (!r.ok) throw new Error(`Could not load data/${n}.json`);
    return r.json();
  });
  const [industries, furniture, names] = await Promise.all([load('industries'), load('furniture'), load('names')]);
  DATA.industries = industries;
  DATA.furniture = furniture;
  DATA.names = names;
  for (const i of industries) DATA.indById[i.id] = i;
  for (const f of furniture) DATA.furnById[f.id] = f;
}
