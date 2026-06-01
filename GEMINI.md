# NIGHTWATCHER V3: High-Integrity Execution Rail

## Project Vision & Reframing
NIGHTWATCHER is not just an autonomous trader; it is a **production-grade execution rail**. While V2 explored alpha generation (sentiment, technicals, LLMs), V3 prioritizes **execution integrity** as its irreducible core.

### The First Principle
A bug in the execution loop is a fire that spends real money. Every other requirement—latency, alpha, variety of strategies—is secondary to the proof that the system is **gated, idempotent, and reconcilable**.

## Core Mandates

### 1. Execution Integrity
- **Idempotency**: All order submissions MUST use deterministic `client_order_id`s. For user-initiated or policy-approved trades, this is derived from the `HMAC(approval_token, KILL_SWITCH_SECRET)`.
- **Reconciliation**: The system must continuously verify that the broker's actual position/order state matches the internal state (D1). Without reconciliation, the database is fiction.
- **Kill Switch**: The kill switch is a top-level, synchronous in-memory flag in the Durable Object. If active, all execution paths are physically blocked.

### 2. The Moat: Validation as a Product
The value of NIGHTWATCHER is the **Integrity Proof**. This is delivered via:
- **Deterministic Replay Harness**: Recorded signals + market state in → byte-identical policy decisions out.
- **Property-Based Testing**: Validating invariants (e.g., "exposure never exceeds X") across thousands of random signal inputs.
- **30-Day Paper Canary**: A mandatory proof window of clean paper operation with zero reconciliation errors before production deployment.

## Technical Standards
- **Venue Abstraction**: Implement the `ExecutionProvider` interface to swap between Alpaca (Paper/Dev) and Institutional (Production) venues without changing core logic.
- **Deterministic IDs**: `client_order_id` length limit is 48 characters (Alpaca). Use the first 48 chars of the HMAC-SHA256 hex string.
- **No Fragile Triggers**: Alpha sources (StockTwits, etc.) are treated as untrusted external plugins. The core engine only cares about the signal blob hitting the policy gate.

## V3 Production Roadmap (Integrity Focus)
1. **Core Hardening (Week 1)**: Idempotency, reconciliation loop, in-memory kill switch.
2. **Validation Harness (Weeks 2-3)**: Replay harness, property-based tests for Policy Engine.
3. **Venue Abstraction (Week 4)**: `ExecutionProvider` interface and institutional adapter stub.
4. **Paper Proof (30 Days)**: Parallel run of the system on paper money to prove stability.
