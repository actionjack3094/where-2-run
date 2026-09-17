const HEDGE =
  /\b(maybe|might|perhaps|sort of|kind of|i think|possibly|not sure)\b/i;
const CONCRETE =
  /\b(percent|budget|district|tax|housing|vote|ordinance|bill|school|transit|freeze|exemption|appraisal)\b/i;

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function evaluateConsistency(content: string, topic: string) {
  const words = content.trim().split(/\s+/).filter(Boolean);
  const lengthScore =
    words.length < 28
      ? 42
      : words.length < 60
        ? 64
        : words.length < 180
          ? 84
          : words.length < 320
            ? 76
            : 58;

  const topicTerms = topic
    .toLowerCase()
    .split(/\W+/)
    .filter((term) => term.length > 4);
  const haystack = content.toLowerCase();
  const overlap = topicTerms.filter((term) => haystack.includes(term)).length;
  const topicScore =
    topicTerms.length === 0 ? 70 : (overlap / topicTerms.length) * 100;

  const hedgePenalty = HEDGE.test(content) ? 8 : 0;
  const concreteBonus = CONCRETE.test(content) ? 7 : 0;
  const score = clampScore(lengthScore * 0.5 + topicScore * 0.4 + concreteBonus - hedgePenalty);

  let critique =
    "The argument is on-topic, but it still reads more like a talking point than a district-specific case.";
  if (score >= 82) {
    critique =
      "High consistency: stays on the prompt, uses local framing, and advances a concrete mechanism instead of a slogan.";
  } else if (score >= 70) {
    critique =
      "Mostly consistent with the topic. The position is clear, though a sharper trade-off or local detail would lock it in.";
  } else if (words.length < 28) {
    critique =
      "Too thin to evaluate a governing position. Expand with a mechanism, a constituency, and a cost.";
  } else if (overlap === 0) {
    critique =
      "Drifts off the stated topic. Bring the claim back to the question on the floor.";
  }

  return { score, critique };
}
