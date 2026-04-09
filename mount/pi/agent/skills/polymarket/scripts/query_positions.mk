define PYTHON_CODE
import sys,json; 

positions = json.load(sys.stdin);
for pos in positions:
	print(f"Qestion: {pos['title']}") 
	print(f"Slug: {pos['slug']}")
	print(f"购买价格：{pos['avg_price']}, 持仓数量：{pos['size']}, 当前价格：{pos['cur_price']}, 盈亏百分比：{pos['percent_pnl']}%, 盈亏金额：{pos['cash_pnl']}");
	print("------")
endef
export PYTHON_CODE

all:
	@echo "查询我的持仓以及盈亏信息...\n"
	@polymarket data positions  ${MY_WALLET_ADDRESS} -o json 2>/dev/null | python3 -c "$$PYTHON_CODE"