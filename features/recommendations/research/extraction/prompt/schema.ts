export const GROUNDED_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    version: { type: "integer", enum: [1] },
    assessments: {
      type: "array", maxItems: 8,
      items: {
        type: "object",
        properties: {
          passageId: { type: "string", minLength: 1, maxLength: 120 },
          finding: { type: "string", enum: ["supports_presence", "supports_explicit_absence", "irrelevant", "insufficient"] },
          level: { type: ["string", "null"], enum: ["incidental", "significant", "primary", null] },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          evidenceUnitIds: { type: "array", maxItems: 64, items: { type: "string", minLength: 1, maxLength: 80 } },
          basis: { type: "string", enum: ["explicit_statement", "recurring_element", "affects_character_decisions", "affects_plot", "core_premise", "explicit_absence_statement", "context_insufficient", "unrelated_context"] },
        },
        required: ["passageId", "finding", "level", "confidence", "evidenceUnitIds", "basis"],
        additionalProperties: false,
      },
    },
  },
  required: ["version", "assessments"],
  additionalProperties: false,
} as const;

export const GROUNDED_EXTRACTION_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: { name: "grounded_aspect_observations", strict: true, schema: GROUNDED_EXTRACTION_JSON_SCHEMA },
} as const;

export function buildGroundedExtractionResponseFormat(input: { evidenceUnits: readonly { unitId: string; passageId: string }[] }) {
  const unitIds = [...new Set(input.evidenceUnits.map((unit) => unit.unitId))];
  const passageIds = [...new Set(input.evidenceUnits.map((unit) => unit.passageId))];
  return {
    type: "json_schema",
    json_schema: {
      name: "grounded_aspect_observations",
      strict: true,
      schema: {
        ...GROUNDED_EXTRACTION_JSON_SCHEMA,
        properties: {
          ...GROUNDED_EXTRACTION_JSON_SCHEMA.properties,
          assessments: {
            ...GROUNDED_EXTRACTION_JSON_SCHEMA.properties.assessments,
            items: {
              ...GROUNDED_EXTRACTION_JSON_SCHEMA.properties.assessments.items,
              properties: {
                ...GROUNDED_EXTRACTION_JSON_SCHEMA.properties.assessments.items.properties,
                passageId: { type: "string", enum: passageIds },
                evidenceUnitIds: { type: "array", maxItems: unitIds.length, items: { type: "string", enum: unitIds } },
              },
            },
          },
        },
      },
    },
  } as const;
}
