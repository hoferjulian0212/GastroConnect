---
name: AI knowledge learning pipeline
description: Constraints for the central self-learning AI knowledge base (feedback-driven RAG)
---

- The Replit AI integration gateway does NOT support `POST /embeddings` (400 "not supported"). Retrieval must rely on keyword-overlap matching; the embedding failure is cached in a module flag so it isn't retried per request. If the gateway ever adds embeddings, cosine retrieval activates automatically.
- **Why untrusted injection:** learned entries are LLM-distilled from user chats and shared across all orgs of a role — they are poisonable. They must be injected as clearly-marked untrusted context inside the *user* message (with an ignore-instructions wrapper), never as a system message.
- **Why a deterministic privacy gate:** prompt instructions alone ("strip names/prices") are not a control for a cross-org shared store. Every candidate entry must pass regex checks (email/phone/order-ref/price/long numbers) plus a DB-driven denylist of all company/member names (umlaut-folded) before insert.
- **How to apply:** any future change to what gets stored in or retrieved from `ai_knowledge` must keep both guards (gate before insert, untrusted wrapper on injection) intact; there are unit tests for both in `server/aiKnowledge.test.ts`.
