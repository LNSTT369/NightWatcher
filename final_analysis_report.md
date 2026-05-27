# FINAL RESULTS ANALYSIS

## Executive Summary
- **Status:** **PARTIALLY REPRODUCED**
- **Confidence:** **MEDIUM**
- **Key Insight:** The repository reproduces the review-style experiments (corpus construction, classification framework, and Figure 4 model-count extraction) extremely closely, often exactly. The empirical backtesting experiment is much weaker: it uses a reduced universe, simulated GPT models, and delivers mixed/noisy performance that does not cleanly support the stronger expected trading claims.

---

## Results Comparison

### Experiment 1 — Corpus construction

| Metric | Paper / Expected | Reproduced | Diff | Status |
|--------|-------------------|------------|------|--------|
| Final corpus size | 84 | 84 | 0 | ✅ Exact |
| Acceptable range | 82–86 | 84 | within range | ✅ |
| Paper numbering | Sequential 1–84 | True | 0 | ✅ |
| Initial raw pool | 100+ before filtering | 84 raw | materially lower | ⚠️ |
| Excluded papers | Some expected from screening workflow | 0 | materially different | ⚠️ |
| Year pattern | Mostly 2023–2024 | 2022: 2, 2023: 25, 2024: 57 | qualitatively aligned | ✅ |
| Venue pattern | arXiv-heavy | 73/84 arXiv (86.9%) | aligned | ✅ |

**Summary:**  
The final corpus target of 84 papers is reproduced exactly, and the temporal/venue distribution is consistent with the original review’s qualitative claims. However, the documented search-and-screening process appears less faithfully reproduced than the final number suggests: `corpus_raw.csv` is reported as already containing 84 papers, and `exclusion_log.csv` is empty, which conflicts with the expected “100+ papers before filtering” and explicit inclusion/exclusion workflow. So the **endpoint is reproduced, but the search pipeline evidence is incomplete**.

---

### Experiment 2 — Dual-layer classification

| Metric | Paper | Reproduced | Diff | Status |
|--------|-------|------------|------|--------|
| Application match rate | >80% target | 100.0% | +20 pp vs threshold | ✅ |
| Technical match rate | >80% target | 100.0% | +20 pp vs threshold | ✅ |
| Cohen’s kappa (app) | >0.60 | 1.0000 | +0.40 | ✅ |
| Cohen’s kappa (tech) | >0.60 | 1.0000 | +0.40 | ✅ |
| App Cat 1 count | 22 | 22 | 0 | ✅ |
| App Cat 2 count | 12 | 12 | 0 | ✅ |
| App Cat 3 count | 12 | 12 | 0 | ✅ |
| App Cat 4 count | 11 | 11 | 0 | ✅ |
| App Cat 5 count | 12 | 12 | 0 | ✅ |
| App Cat 6 count | 4 | 4 | 0 | ✅ |
| App Cat 7 count | 4 | 4 | 0 | ✅ |
| App Cat 8 count | 12 | 12 | 0 | ✅ |
| Tech Prompting | 28 | 28 | 0 | ✅ |
| Tech Agentic | 20 | 20 | 0 | ✅ |
| Chi² app | Non-uniform, p<0.05 | 20.03, p=0.0055 | aligned | ✅ |
| Chi² tech | Non-uniform, p<0.05 | 46.41, p=1.98e-07 | aligned | ✅ |

**Summary:**  
This experiment is **fully reproduced on reported metrics**. All category frequencies match exactly, agreement statistics are perfect, and the core descriptive findings are replicated: market forecasting is the largest application class, and prompting techniques dominate technical methodology.

---

### Experiment 3 — LLM usage statistics extraction

| Metric | Paper | Reproduced | Diff | Status |
|--------|-------|------------|------|--------|
| Papers naming specific LLMs | 50 | 50 | 0 | ✅ Exact |
| Papers with general-purpose models | ~49 | 42 | -7 | ❌ Material |
| Papers using agentic frameworks | 20 | 18 | -2 | ⚠️ Slightly low |
| Figure 4 count correlation | >0.90 | 1.0000 | +0.10 | ✅ |
| Top model | ChatGPT | ChatGPT | 0 | ✅ |
| ChatGPT count | 12 | 12 | 0 | ✅ |
| GPT-4 count | 9 | 9 | 0 | ✅ |
| GPT-3 count | 3 | 3 | 0 | ✅ |
| GPT-3.5 Turbo count | 3 | 3 | 0 | ✅ |
| LLaMA count | 3 | 3 | 0 | ✅ |
| LLaMA 2 count | 5 | 5 | 0 | ✅ |
| BERT count | 4 | 4 | 0 | ✅ |
| Mistral count | 3 | 3 | 0 | ✅ |
| Domain-specific models identified | ≥5 desired | 5 | 0 | ✅ |
| Specialized datasets identified | 6 | 6 | 0 | ✅ |

**Summary:**  
This is **mostly reproduced**. The key Figure 4 model counts are exact, and the rank ordering of models matches perfectly. The main discrepancy is the count of papers using general-purpose models: **42 vs expected ~49**, which is materially outside a small-noise explanation. Agentic papers at **18 vs 20** is a smaller shortfall and likely within interpretation tolerance.

---

### Experiment 4 — Sentiment analysis backtesting

Using the strongest baseline comparison from the repository outputs.

#### Benchmark
- **SPY cumulative return:** **28.66%**
- **SPY annualized return:** **8.82%**
- **SPY Sharpe:** **0.342**
- **SPY max drawdown:** **-24.47%**

#### Best long-only results (no transaction costs)

| Metric | Paper / Expected | Reproduced | Diff | Status |
|--------|-------------------|------------|------|--------|
| At least one strategy Sharpe > 0.5 | >0.5 | Yes: 1.03 (BERT), 0.79 (FinBERT), 0.82 (GPT3.5 sim), 0.82 (GPT4 sim) | meets | ✅ |
| Outperform SPY | Expected at least one | Yes, long-only all main models beat SPY gross | meets gross | ✅/⚠️ |
| Directional accuracy | >55% target | ~50.0–50.2% | -4.8 to -5.0 pp | ❌ |
| Significant directional edge | p<0.05 target | mixed; only BERT long-only p=0.0316 on returns, not DA | weaker | ⚠️ |
| FinBERT ≥ BERT | expected | FinBERT Sharpe 0.79 vs BERT 1.03 | opposite | ❌ |
| GPT-4 > GPT-3.5 | expected | GPT-4 Sharpe 0.819 vs GPT3.5 0.824; DA 50.10% vs 50.07% | essentially no edge | ❌ |
| TC impact on Sharpe | -0.2 to -0.5 expected | roughly -0.88 to -0.92 for long-only; much worse for LS | much larger | ❌ |
| Long-short S&P100 2023–2024 cum return | 60–130% range desired | long-short results near 0% gross over full period | far below | ❌ |

#### Reported long-only gross performance

| Model | Cum. Return | Ann. Return | Sharpe | Max DD | Directional Accuracy | p-value |
|------|-------------:|------------:|-------:|-------:|---------------------:|--------:|
| FinBERT | 65.93% | 18.55% | 0.791 | -22.45% | 50.03% | 0.083 |
| BERT_ZeroShot | 88.21% | 23.68% | 1.031 | -20.45% | 50.22% | 0.0316 |
| GPT35_Simulated | 69.06% | 19.29% | 0.824 | -22.44% | 50.07% | 0.0737 |
| GPT4_Simulated | 67.02% | 18.81% | 0.819 | -21.28% | 50.10% | 0.0734 |
| SPY | 28.66% | 8.82% | 0.342 | -24.47% | 52.73% win rate | 0.325 |

#### Long-short results (more relevant to literature-style alpha claims)

| Model | Cum. Return | Sharpe | Max DD | p-value | Status |
|------|-------------:|-------:|-------:|--------:|--------|
| FinBERT | 0.15% | -0.560 | -11.51% | 0.944 | Poor |
| BERT_ZeroShot | 5.59% | -0.293 | -8.24% | 0.596 | Poor |
| GPT35_Simulated | 5.39% | -0.313 | -7.41% | 0.600 | Poor |
| GPT4_Simulated | 2.59% | -0.480 | -6.83% | 0.769 | Poor |

**Summary:**  
The backtest only **partially reproduces the broad idea** that LLM-derived signals can generate attractive gross long-only returns. But it **does not reproduce** stronger expected outcomes around directional accuracy, robustness, transaction-cost resilience, GPT-4 superiority, or long-short alpha. The practical signal appears weak and fragile.

---

## Statistical & Economic Significance

### Experiment 1
No inferential statistics are relevant here beyond validation checks. Economically, the corpus composition is plausible and aligned with a fast-moving, preprint-heavy domain.

### Experiment 2
- **Cohen’s kappa = 1.0** for both layers indicates perfect agreement, far above the >0.60 benchmark.
- **Chi-square tests** reject uniformity:
  - Application: **χ²=20.03, p=0.0055**
  - Technical: **χ²=46.41, p≈2e-7**
- These support the paper’s substantive claims that the literature is concentrated in specific themes rather than evenly spread.

**Economic / practical significance:**  
High, for a review reproduction. The taxonomy and frequency findings appear reliable and directly support the paper’s narrative.

### Experiment 3
- **Pearson r ≈ 1.0** for Figure 4 model-count validation is extremely strong.
- Exact matches on all headline model frequencies strongly support successful extraction.
- The discrepancy in general-purpose-model paper count (**42 vs ~49**) is too large to dismiss as rounding noise.

**Economic / practical significance:**  
Moderate to high. The main descriptive insight holds: general-purpose LLMs dominate, especially ChatGPT and GPT-4. But the exact breadth of that dominance is somewhat weaker than claimed.

### Experiment 4
For trading performance, both **statistical** and **economic** significance are mixed:

- Only **BERT_ZeroShot long-only gross** shows conventional significance on returns (**t=2.154, p=0.0316**).
- FinBERT long-only is borderline / not significant (**p=0.083**).
- All long-short variants are statistically insignificant gross, and strongly negative net of costs.
- Directional accuracy remains around **50%**, not economically meaningful for predictive claims.
- Transaction costs destroy most profitability:
  - Example: BERT long-only Sharpe **1.03 → 0.14**
  - FinBERT long-only Sharpe **0.79 → -0.09**
  - Long-short strategies become deeply negative net of costs.

**Economic interpretation:**  
Gross long-only results look attractive, but they do **not** survive realistic frictions well. That sharply limits practical usefulness and weakens any claim of robust predictive alpha.

---

## Discrepancies

### 1. Corpus pipeline evidence is thinner than the paper-style methodology suggests
- Repository reports:
  - `total_papers_raw = 84`
  - `total_excluded = 0`
  - empty `exclusion_log.csv`
- Expected workflow called for:
  - 100+ initial pool
  - explicit screening
  - documented exclusions

**Explanation:**  
The final corpus may have been reconstructed directly from a known target list rather than through a fully independent search-and-screen pipeline. This would reproduce the endpoint but not the process.

---

### 2. Experiment 2 looks “too perfect”
- 100% app match
- 100% tech match
- Kappa = 1.0
- all category frequencies exact

**Explanation:**  
This likely reflects use of the original paper’s explicit ground-truth mappings as direct supervision or deterministic assignment rules. That is acceptable for validating consistency, but it is less persuasive as an independent blind reproduction of human classification.

---

### 3. General-purpose LLM paper count is materially below the expected value
- Expected: ~49
- Reproduced: 42

**Possible reasons:**
- Conservative extraction rules requiring explicit model naming
- Different normalization choices (e.g., whether generic “GPT” or “BERT-family” references count)
- Some papers may mention model families indirectly or only in appendices/full text not captured
- The paper may have counted mixed-model or implied references more liberally

This is the main material discrepancy in Experiment 3.

---

### 4. Agentic count mismatch between experiments
- Experiment 2 technical-category count: **20** agentic papers
- Experiment 3 extracted agentic papers: **18**

**Possible reasons:**
- Keyword-based extraction undercounts papers categorized as agentic by conceptual reading
- Two papers may be agentic in taxonomy but not use explicit “agent”, “multi-agent”, “tool use”, etc. language
- Difference is small and not fatal, but indicates rule-based extraction is less complete than taxonomy labeling

---

### 5. Backtest does not reproduce stronger empirical claims
Several expected patterns fail:
- directional accuracy >55%: **not achieved**
- FinBERT > BERT: **not achieved**
- GPT-4 > GPT-3.5: **not achieved**
- transaction costs reduce Sharpe by only 0.2–0.5: **actual degradation much larger**
- long-short alpha / MarketSenseAI-like strong result: **not reproduced**

**Most likely explanations:**
- **Reduced universe:** only **30 S&P 100 stocks**, not full S&P 500 / broader setup
- **Simulated GPT-3.5 and GPT-4**, not actual live API-based scoring
- Possibly simplified news acquisition / alignment versus reviewed papers
- Lack of richer RAG/agentic pipeline used in stronger literature examples
- Gross long-only returns may be partly a market-exposure effect rather than true predictive power
- 2022–2024 regime may differ from the subperiods in source studies
- No evidence of fine calibration to exact paper-specific prompts, datasets, or execution assumptions

---

## Methodology Issues

### Relevant methodology deviations
1. **Exp 1**: Search/screen process not evidenced by raw pool >84 or meaningful exclusion log.
2. **Exp 2**: Perfect match suggests deterministic recreation from published mappings rather than independent classification.
3. **Exp 4**:
   - 30-ticker universe instead of target large-scale setup
   - GPT models are explicitly labeled **simulated**
   - no evidence here of full-scale headline volume/API pipeline described in the intended methodology
   - backtest appears more like a proof-of-concept implementation than a faithful large-scale empirical reproduction

These deviations are highly relevant for interpreting Experiment 4 and somewhat relevant for Experiments 1–2.

---

## Reliability

### Strengths
- Results files are internally consistent.
- Classification and figure-validation outputs are clear and quantitative.
- Experiment 3 model-frequency table is coherent and matches headline counts exactly.
- Statistical tests for Experiment 2 are appropriate and convincing.

### Red flags
- **Empty exclusion log** and zero exclusions for corpus construction.
- **Perfect 100% classification and kappa=1.0** can indicate direct encoding of ground truth.
- **Simulated GPT models** reduce external validity of the backtest.
- Backtest directional accuracy is near random despite attractive gross long-only returns.
- Bias-test interpretation is partly contradictory:
  - Look-ahead test reports bias detected, which is actually a red flag for implementation integrity.
  - Distraction test says “LLM extracts company-specific information,” but the directional-accuracy drop is tiny (**50.03% to 49.19%**, delta 0.83 pp) and `signal_purity_confirmed` is **False**. So evidence is weak.

### Overall confidence
- **High** for the descriptive review-reproduction outputs in Experiments 2 and most of 3.
- **Medium-low** for Experiment 1 process fidelity.
- **Low-medium** for Experiment 4 as a faithful empirical reproduction.

---

## Verdict
**Final Decision: PARTIALLY REPRODUCED**

### Why:
- **Experiments 2 and 3** substantially reproduce the paper’s descriptive findings, with many exact matches.
- **Experiment 1** reproduces the final corpus size and qualitative composition, but not the full documented search/screening process.
- **Experiment 4** does not reproduce the stronger empirical trading claims with sufficient statistical or economic robustness, and key methodology deviations limit comparability.

---

# Experiment-by-Experiment Detailed Assessment

## Experiment 1 — Corpus Construction
**Assessment:** **Partially reproduced**

- Exact final count of **84 papers** is a strong success.
- Year distribution is plausible:
  - 2022: **2**
  - 2023: **25**
  - 2024: **57**
- Venue composition strongly supports the review’s claim of a preprint-heavy field:
  - arXiv preprints: **73 / 84 = 86.9%**

But the missing search funnel is material:
- raw pool should have been **100+**
- exclusions should have been documented
- instead:
  - raw = filtered = **84**
  - exclusions = **0**

So this looks more like **successful corpus reconstruction** than full **search-process reproduction**.

---

## Experiment 2 — Dual-Layer Classification
**Assessment:** **Fully reproduced**

Key reproduced findings:
- Market Forecasting is the largest application category: **22 papers**
- Prompting Techniques is the largest technical category: **28 papers**
- Agentic Applications: **20 papers**
- Smallest categories:
  - Risk Management: **4**
  - Content Generation: **4**
  - Reinforcement Learning: **4**
  - Embeddings: **2**

Statistically:
- App chi-square significant: **p=0.0055**
- Tech chi-square significant: **p≈2e-7**
- Perfect agreement statistics: **kappa=1.0**

Only caveat: this may be a **deterministic reconstruction** rather than a truly independent rater-based replication.

---

## Experiment 3 — LLM Usage Statistics
**Assessment:** **Mostly reproduced**

Strongly reproduced:
- **50** papers name a specific LLM
- exact Figure 4 counts for major models
- ChatGPT and GPT-4 dominance reproduced
- all 6 specialized datasets identified
- 5 domain-specific finance models identified

Main shortfalls:
- general-purpose LLM paper count: **42 vs ~49**
- agentic papers: **18 vs 20**

This suggests the **central descriptive pattern is reproduced**, but some secondary counts are conservative.

---

## Experiment 4 — Sentiment Backtesting
**Assessment:** **Not fully reproduced**

What worked:
- At least one gross strategy had Sharpe > 0.5
- Long-only gross returns beat SPY
- max drawdowns are not extreme in long-only gross runs

What did not:
- directional accuracy stayed ~**50%**
- long-short returns were weak and statistically insignificant
- costs wiped out most profits
- expected model ranking was not reproduced
- look-ahead bias test indicates implementation vulnerability
- distractor test does not convincingly establish signal purity

This means the empirical trading evidence is **fragile and not robustly reproduced**.

---

## Bottom Line
If the target is the **paper’s descriptive review findings**, the reproduction is strong.  
If the target includes the **empirical backtesting claims as an equally important component**, the reproduction is only partial.

**Overall: PARTIALLY REPRODUCED.**