// Package cost provides cost estimation for agent spawns.
package cost

import (
	"fmt"
	"strings"
)

// ModelPricing contains estimated pricing per 1M tokens (USD).
// These are approximate values for planning purposes.
type ModelPricing struct {
	InputPer1M  float64 // Cost per 1M input tokens
	OutputPer1M float64 // Cost per 1M output tokens
}

// EstimatedTokens contains typical token usage estimates.
type EstimatedTokens struct {
	InputTokens  int // Estimated input tokens per task
	OutputTokens int // Estimated output tokens per task
}

// CostEstimate contains the estimated cost for a spawn operation.
type CostEstimate struct {
	Agent           string  `json:"agent"`
	Tier            string  `json:"tier"`
	TaskCount       int     `json:"taskCount"`
	InputTokensEst  int     `json:"inputTokensEst"`
	OutputTokensEst int     `json:"outputTokensEst"`
	CostLowUSD      float64 `json:"costLowUsd"`
	CostHighUSD     float64 `json:"costHighUsd"`
	CostMidUSD      float64 `json:"costMidUsd"`
	Note            string  `json:"note,omitempty"`
}

// BatchCostEstimate contains cost estimates for a batch spawn.
type BatchCostEstimate struct {
	Tasks        []CostEstimate `json:"tasks"`
	TotalLowUSD  float64        `json:"totalLowUsd"`
	TotalHighUSD float64        `json:"totalHighUsd"`
	TotalMidUSD  float64        `json:"totalMidUsd"`
	TaskCount    int            `json:"taskCount"`
	Note         string         `json:"note"`
}

// Pricing tiers (approximate USD per 1M tokens as of 2026)
var pricingTiers = map[string]ModelPricing{
	// Anthropic
	"claude/opus-4.7":   {InputPer1M: 15.0, OutputPer1M: 75.0},
	"claude/opus-4.6":   {InputPer1M: 15.0, OutputPer1M: 75.0},
	"claude/opus-4.5":   {InputPer1M: 15.0, OutputPer1M: 75.0},
	"claude/sonnet-4.6": {InputPer1M: 3.0, OutputPer1M: 15.0},
	"claude/sonnet-4.5": {InputPer1M: 3.0, OutputPer1M: 15.0},
	"claude/haiku-4.5":  {InputPer1M: 0.80, OutputPer1M: 4.0},

	// OpenAI Codex
	"codex/gpt-5.4-xhigh":     {InputPer1M: 10.0, OutputPer1M: 30.0},
	"codex/gpt-5.1-codex":     {InputPer1M: 2.5, OutputPer1M: 10.0},
	"codex/gpt-5.1-codex-mini": {InputPer1M: 1.5, OutputPer1M: 6.0},

	// Defaults by tier
	"tier:paid": {InputPer1M: 5.0, OutputPer1M: 20.0},
	"tier:free": {InputPer1M: 0.0, OutputPer1M: 0.0},
}

// Typical token usage for different task complexities.
var tokenEstimates = map[string]EstimatedTokens{
	"simple":  {InputTokens: 5000, OutputTokens: 2000},   // Quick fixes, small changes
	"medium":  {InputTokens: 15000, OutputTokens: 8000},  // Feature implementation
	"complex": {InputTokens: 40000, OutputTokens: 20000}, // Large refactors, reviews
}

// GetPricing returns pricing for an agent.
func GetPricing(agent string) ModelPricing {
	agent = strings.ToLower(agent)

	// Exact match
	if p, ok := pricingTiers[agent]; ok {
		return p
	}

	// Tier-based fallback
	if strings.Contains(agent, "opus") || strings.Contains(agent, "gpt-5.4") {
		return pricingTiers["tier:paid"]
	}
	if strings.Contains(agent, "haiku") || strings.Contains(agent, "mini") {
		return ModelPricing{InputPer1M: 1.0, OutputPer1M: 4.0}
	}
	if strings.Contains(agent, "free") {
		return pricingTiers["tier:free"]
	}

	// Default to mid-tier
	return pricingTiers["tier:paid"]
}

// GetTokenEstimate returns typical token usage for a complexity level.
func GetTokenEstimate(complexity string) EstimatedTokens {
	if est, ok := tokenEstimates[complexity]; ok {
		return est
	}
	return tokenEstimates["medium"]
}

// EstimateCost calculates estimated cost for a single agent spawn.
func EstimateCost(agent string, complexity string) CostEstimate {
	pricing := GetPricing(agent)
	tokens := GetTokenEstimate(complexity)

	// Calculate cost (tokens / 1M * price per 1M)
	inputCost := float64(tokens.InputTokens) / 1_000_000 * pricing.InputPer1M
	outputCost := float64(tokens.OutputTokens) / 1_000_000 * pricing.OutputPer1M
	midCost := inputCost + outputCost

	// Add variance for low/high estimates (±50%)
	lowCost := midCost * 0.5
	highCost := midCost * 1.5

	tier := "paid"
	if pricing.InputPer1M == 0 {
		tier = "free"
	}

	return CostEstimate{
		Agent:           agent,
		Tier:            tier,
		TaskCount:       1,
		InputTokensEst:  tokens.InputTokens,
		OutputTokensEst: tokens.OutputTokens,
		CostLowUSD:      roundTo4(lowCost),
		CostHighUSD:     roundTo4(highCost),
		CostMidUSD:      roundTo4(midCost),
	}
}

// EstimateBatchCost calculates estimated cost for multiple agents.
func EstimateBatchCost(agents []string, complexity string) BatchCostEstimate {
	var estimates []CostEstimate
	var totalLow, totalHigh, totalMid float64

	for _, agent := range agents {
		est := EstimateCost(agent, complexity)
		estimates = append(estimates, est)
		totalLow += est.CostLowUSD
		totalHigh += est.CostHighUSD
		totalMid += est.CostMidUSD
	}

	return BatchCostEstimate{
		Tasks:        estimates,
		TotalLowUSD:  roundTo4(totalLow),
		TotalHighUSD: roundTo4(totalHigh),
		TotalMidUSD:  roundTo4(totalMid),
		TaskCount:    len(agents),
		Note:         "Estimates based on typical token usage. Actual costs may vary.",
	}
}

// FormatCostEstimate formats a cost estimate for display.
func FormatCostEstimate(est CostEstimate) string {
	if est.Tier == "free" {
		return fmt.Sprintf("%s: FREE", est.Agent)
	}
	return fmt.Sprintf("%s: $%.4f - $%.4f (est: $%.4f)",
		est.Agent, est.CostLowUSD, est.CostHighUSD, est.CostMidUSD)
}

// FormatBatchCostEstimate formats a batch estimate for display.
func FormatBatchCostEstimate(est BatchCostEstimate) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Cost Estimate (%d tasks)\n", est.TaskCount))
	sb.WriteString(strings.Repeat("-", 40) + "\n")

	for _, task := range est.Tasks {
		sb.WriteString("  " + FormatCostEstimate(task) + "\n")
	}

	sb.WriteString(strings.Repeat("-", 40) + "\n")
	sb.WriteString(fmt.Sprintf("Total: $%.4f - $%.4f (est: $%.4f)\n",
		est.TotalLowUSD, est.TotalHighUSD, est.TotalMidUSD))
	sb.WriteString("\n" + est.Note + "\n")

	return sb.String()
}

func roundTo4(f float64) float64 {
	return float64(int(f*10000+0.5)) / 10000
}
