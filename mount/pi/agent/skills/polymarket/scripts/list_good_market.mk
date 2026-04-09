## 初始定义
define PYTHON_CODE
import sys,json; 
markets = json.load(sys.stdin);

selected = [];

for m in markets:
	prices = m.get("outcomePrices");
	prices = json.loads(prices);
	yes = float(prices[0]);
	no = float(prices[1]);
	
	if (yes >= 0.8 and yes < 0.85) or (no >= 0.8 and no < 0.85):
		selected.append(m)
	
for i,m in enumerate(selected):
	print(f'Question: {m["question"]}');
	print(f'Prices:{m["outcomePrices"]}');
	print(f'Slug: {m["slug"]}');
	print('---');
endef
export PYTHON_CODE

all:
	@echo "Listing  markets priced between 0.8 and 0.85...\n"
	@polymarket -o json markets list --order volumeNum --active true --offset 0 --limit 100 2>/dev/null | python3 -c "$$PYTHON_CODE"
	@sleep 1
	@polymarket -o json markets list --order volumeNum --active true --offset 100 --limit 100 2>/dev/null | python3 -c "$$PYTHON_CODE"
	@sleep 1
	@polymarket -o json markets list --order volumeNum --active true --offset 200 --limit 100 2>/dev/null | python3 -c "$$PYTHON_CODE"
	@sleep 1
	@polymarket -o json markets list --order volumeNum --active true --offset 300 --limit 100 2>/dev/null | python3 -c "$$PYTHON_CODE"
	@sleep 1
	@polymarket -o json markets list --order volumeNum --active true --offset 400 --limit 100 2>/dev/null | python3 -c "$$PYTHON_CODE"
	