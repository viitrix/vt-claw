define PYTHON_CODE
import sys,json; 

positions = json.load(sys.stdin);

for pos in positions:
	print(f"Qestion: {pos['title']}") 
	print(f"Slug: {pos['slug']}")
	print(f"Outcome: {pos['outcome_index']}")
	print(f"Size: {pos['size']}")
	print(f"购买价格：{pos['avg_price']}, 当前价格：{pos['cur_price']}, 盈亏金额：{pos['cash_pnl']}");
	print("------")
endef
export PYTHON_CODE


ifeq ($(MY_WALLET_ADDRESS),)
$(error MY_WALLET_ADDRESS is not set. Please set your wallet address in the environment)
endif

all:
	@echo "查询我的持仓以及盈亏信息...\n"
	@polymarket data positions  ${MY_WALLET_ADDRESS} -o json 2>/dev/null | python3 -c "$$PYTHON_CODE"