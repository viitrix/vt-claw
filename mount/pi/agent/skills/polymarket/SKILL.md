---
name: polymarket
description: Research Polymarket prediction markets — look up events, markets, price history, top holders, generate charts, analyze wallets, and discover trending markets
---

# Polymarket Research Skill 

### Sports Tags (for routing)
**Live sports tags:** 

```bash
polymarket -o json sports list 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(', '.join(x['sport'] for x in d))"
```

Use these tags for sports intent classification and routing to sports-markets agent.

### Trending Events — Top 10 by Volume (for leaderboard/discovery queries)
```bash
polymarket -o json events list --order volume --active true --limit 10 2>/dev/null | python3 -c "import sys,json; [print(f'{i+1}. {e[\"title\"]} | vol:\${float(e.get(\"volume\",0))/1e6:.1f}M | slug:{e[\"slug\"]}') for i,e in enumerate(json.load(sys.stdin))]
```

### Trending Markets — Top 10 by Volume (individual binary markets)
```bash
polymarket -o json markets list --order volumeNum --active true --limit 10 2>/dev/null | python3 -c "import sys,json; [print(f'{i+1}. {m[\"question\"]} | vol:\${float(m.get(\"volumeNum\",0))/1e6:.1f}M | slug:{m[\"slug\"]}') for i,m in enumerate(json.load(sys.stdin))]
```

### Top Traders Leaderboard — This Week by PnL
```bash
polymarket -o json data leaderboard --period week --order-by pnl --limit 10 2>/dev/null | python3 -c "import sys,json; [print(f'{t[\"rank\"]}. {t.get(\"user_name\") or \"anon\"} | PnL:+\${float(t[\"pnl\"]):,.0f} | vol:\${float(t[\"volume\"])/1e6:.1f}M | {t[\"proxy_wallet\"]}') for t in json.load(sys.stdin)]
```

## Quick Lookup (no agent file needed)

For simple event/market lookups without analysis keywords:

**Event URL** (`/event/` in URL):
```bash
polymarket -o json events get <slug>
```

**Market URL** (`/market/` in URL):
```bash
polymarket -o json markets get <slug>
```

**Ambiguous slug**: Try `events get` first; if 404, fall back to `markets get`.

Parse `outcomePrices` with `json.loads()` — it's a JSON string, not an array.

## Global CLI Reference

### Key Commands

| Goal | Command |
|------|---------|
| Get event | `polymarket -o json events get <slug>` |
| Get market | `polymarket -o json markets get <slug>` |
| Search markets | `polymarket markets search "<q>" --limit 20` |
| List events by volume | `polymarket -o json events list --order volume --active true --limit 20` |
| List markets by volume | `polymarket -o json markets list --order volumeNum --active true --limit 20` |
| CLOB market info | `polymarket -o json clob market <CONDITION_ID>` |
| Price spread | `polymarket -o json clob spread <TOKEN_ID>` |
| Price midpoint | `polymarket -o json clob midpoint <TOKEN_ID>` |
| Order book | `polymarket -o json clob book <TOKEN_ID>` |
| Price history (recent) | `polymarket -o json clob price-history --interval max <TOKEN_ID>` |
| Price history (full) | `polymarket -o json clob price-history --interval max --fidelity 5000 <TOKEN_ID>` |
| Top holders | `polymarket -o json data holders <CONDITION_ID>` |
| Open interest | `polymarket data open-interest <CONDITION_ID>` |
| Wallet profile | `polymarket -o json profiles get <WALLET>` |
| Portfolio value | `polymarket -o json data value <WALLET>` |
| Volume traded | `polymarket -o json data traded <WALLET>` |
| Positions | `polymarket -o json data positions <WALLET>` |
| Closed positions | `polymarket -o json data closed-positions <WALLET>` |
| Activity | `polymarket -o json data activity <WALLET> --limit 50` |
| Trades | `polymarket -o json data trades <WALLET> --limit 500` |
| Leaderboard | `polymarket -o json data leaderboard --period all --order-by pnl` |
| Builder leaderboard | `polymarket -o json data builder-leaderboard` |
| Tags | `polymarket -o json tags related-tags "<topic>"` |
| Comments | `polymarket -o json comments list <CONDITION_ID> --limit 20` |
| Sports list | `polymarket -o json sports list` |
| Sports teams | `polymarket -o json sports teams --league "<LEAGUE>"` |
| Sports market types | `polymarket -o json sports market-types` |
| Generate chart | `python3 scripts/chart.py <TOKEN_ID> --title "..."` |
| Chart from slug | `python3 scripts/chart.py --slug <slug> --outcome "Yes"` |
| Chart from conditionId | `python3 scripts/chart.py --condition-id <CID>` |

### Critical Gotchas

| Gotcha | Detail |
|--------|--------|
| `outcomePrices` is a JSON string | Must `json.loads()` to parse prices from event data |
| Hex token IDs work in v0.1.5 | No decimal conversion needed for `price`, `spread`, `book`, `price-history` |
| `--order` is camelCase | `volumeNum` works; `volume_num` causes 422 error |
| `markets search` has NO `--order` | Sort results manually after fetching |
| `events list --order volume` | Works, descending by default |
| Sum of YES prices ~ 1.01 | Normal — 1% house vig across outcomes |
| Open Interest != face value | In neg-risk markets, OI is current-value-weighted |
| Wrong command -> 404 | `/event/` URL = `events get`; `/market/` URL = `markets get` |
| Holders grouped by token | `data holders` returns holders with `name`/`pseudonym` fields |
| Infrastructure wallets | Check for empty trades, $0 avg_price, billions in value before profiling |