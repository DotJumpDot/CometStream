export function castToType(key, value) {
  const definitions = {
    openAiTemp: {
      cast: (value) => Number(value),
    },
    openAiHistory: {
      cast: (value) => Number(value),
    },
    similarityThreshold: {
      cast: (value) => parseFloat(value),
    },
    topN: {
      cast: (value) => Number(value),
    },
    router_id: {
      cast: (value) => (value ? Number(value) : null),
    },
    autoCompact: {
      cast: (value) => value === true || value === "true",
    },
    compactThreshold: {
      cast: (value) => Number(value),
    },
  };

  if (!definitions.hasOwnProperty(key)) return value;
  return definitions[key].cast(value);
}
