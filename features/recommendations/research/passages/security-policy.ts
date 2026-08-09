import type { ResearchPassageSecurityFlag } from "./types";

const SCRIPT_OR_HTML = /<\/?(?:script|style|iframe|form|html|body|svg|object|embed)\b|javascript\s*:/iu;
const PROMPT_INJECTION = /\b(?:ignore|disregard|override|forget)\s+(?:all\s+)?(?:previous|prior|above|system|developer)\s+(?:instructions?|prompts?|messages?)\b/iu;
const INSTRUCTION_LIKE = /\b(?:do not follow|instead follow|you must now|new instructions?|reveal the system prompt)\b/iu;
const ROLE_MARKER = /(?:^|\n)\s*(?:system|assistant|developer|tool)\s*:/iu;
const TOOL_CALL = /\{\s*"(?:tool|function|name|arguments)"\s*:/u;
const ENCODED_PAYLOAD = /(?:^|\s)(?:[A-Za-z0-9+/]{256,}={0,2})(?:\s|$)/u;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const UNPAIRED_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;

export function inspectResearchPassageSecurity(text: string): readonly ResearchPassageSecurityFlag[] {
  const flags = new Set<ResearchPassageSecurityFlag>();
  if (CONTROL_CHARACTER.test(text) || UNPAIRED_SURROGATE.test(text)) flags.add("malformed_unicode");
  if (SCRIPT_OR_HTML.test(text)) flags.add("script_or_html_detected");
  if (PROMPT_INJECTION.test(text)) flags.add("prompt_injection_pattern");
  if (INSTRUCTION_LIKE.test(text)) flags.add("instruction_like_text");
  if (ROLE_MARKER.test(text)) flags.add("role_marker_pattern");
  if (TOOL_CALL.test(text)) flags.add("tool_call_pattern");
  if (ENCODED_PAYLOAD.test(text)) flags.add("encoded_payload_pattern");
  return [...flags].sort();
}

export function documentSecurityRejected(flags: readonly ResearchPassageSecurityFlag[]): boolean {
  return flags.includes("script_or_html_detected")
    || flags.includes("malformed_unicode")
    || flags.includes("source_identity_mismatch");
}

export function passageRequiresIsolatedExtraction(flags: readonly ResearchPassageSecurityFlag[]): boolean {
  return flags.some((flag) => [
    "instruction_like_text", "prompt_injection_pattern", "role_marker_pattern",
    "tool_call_pattern", "encoded_payload_pattern", "oversized_fragment",
  ].includes(flag));
}

