## 初始定义
define PYTHON_CODE
import sys,json; 

balance = json.load(sys.stdin);
balance = float(balance["balance"]);
print(f"Total cash : {total}")

endef
export PYTHON_CODE

all:
	@echo "查询我的现金金额..."
	@polymarket -o json clob balance --asset-type collateral 2>/dev/null | python3 -c "$$PYTHON_CODE"