import type { EvalCase } from "./types.js";

export const DEFAULT_CASES: EvalCase[] = [
  {
    id: "trivial-greeting",
    prompt: "Say hello to the user in a friendly way.",
    expectedOutcome: "consensus",
    maxRounds: 2,
    category: "trivial",
  },
  {
    id: "arch-database",
    prompt:
      "We're building a social media app with complex relationships (followers, posts, comments, likes, shares). " +
      "The team needs to decide between PostgreSQL with a relational schema and a graph database like Neo4j. " +
      "We expect 10M users within a year. What's the right choice and why?",
    expectedOutcome: "consensus",
    qualityKeywords: ["joins", "graph", "scale", "query"],
    maxRounds: 5,
    category: "architectural",
  },
  {
    id: "arch-monolith-vs-micro",
    prompt:
      "We have a 3-person startup building an e-commerce platform (product catalog, cart, checkout, inventory). " +
      "Should we start with a monolith or microservices? We need to ship an MVP in 8 weeks.",
    expectedOutcome: "consensus",
    qualityKeywords: ["monolith", "microservice", "deploy", "team"],
    maxRounds: 4,
    category: "architectural",
  },
  {
    id: "debug-race-condition",
    prompt:
      "Our Node.js API has an intermittent bug: when two users simultaneously update the same document, " +
      "one update is silently lost. We're using MongoDB with Mongoose. The update handler reads the doc, " +
      "modifies it in memory, then saves. How should we fix this?",
    expectedOutcome: "consensus",
    qualityKeywords: ["race", "atomic", "findOneAndUpdate"],
    maxRounds: 4,
    category: "debugging",
  },
  {
    id: "security-jwt",
    prompt:
      "Review this authentication approach: we store JWT tokens in localStorage, the token contains " +
      "the user's role and email, tokens expire after 30 days, and we validate tokens on the server " +
      "by checking the signature only (no revocation list). What are the security concerns?",
    qualityKeywords: ["XSS", "localStorage", "revocation", "httpOnly"],
    maxRounds: 4,
    category: "security",
  },
  {
    id: "adversarial-subjective",
    prompt:
      "Is it better to use tabs or spaces for indentation in a Python codebase? " +
      "Take a strong position and defend it.",
    expectedOutcome: "consensus",
    maxRounds: 3,
    category: "adversarial",
  },
];
