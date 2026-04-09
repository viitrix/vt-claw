## 查询 clobTokenId
define PYTHON_CODE_QUERY
import sys,json; 

market = json.load(sys.stdin);

lastPrice = float(market.get("lastTradePrice"))
clobTokens = json.loads( market.get("clobTokenIds") );
clobTokenId = clobTokens[0]
if lastPrice < 0.5:
	clobTokenId = clobTokens[1]
	lastPrice = 1 - lastPrice

## 调整价格到小数点后两位
lastPrice = round(lastPrice, 3)
orderMinSize = int(market.get("orderMinSize"))

print(json.dumps({
	"clobTokenId": clobTokenId,
	"price": lastPrice,
	"amount": orderMinSize
}))

endef
export PYTHON_CODE_QUERY

## 根据 clobTokenId 进行下单操作
define PYTHON_CODE_ORDER
import sys,json;
orderInfo = json.load(sys.stdin);
clobTokenId = orderInfo["clobTokenId"]
price = orderInfo["price"]
amount = orderInfo["amount"]

cmd = f"polymarket clob create-order --order-type GTC --token {clobTokenId} --side buy --price {price} --size {amount}"
print(cmd)

endef
export PYTHON_CODE_ORDER

## 检查是命令行是否输入了必要的参数
ifeq ($(SLUG),)
$(error SLUG is not set. Please provide the market slug as an argument, e.g., make SLUG=some-market-slug)
endif

all:
	@echo "I will create a buy order for $(SLUG)"
	@polymarket markets get $(SLUG) -o json 2>/dev/null | python3 -c "$$PYTHON_CODE_QUERY" | python3 -c "$$PYTHON_CODE_ORDER" 