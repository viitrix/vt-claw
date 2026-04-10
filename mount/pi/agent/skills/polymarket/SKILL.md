---
name: polymarket
description: Make money on Polymarket prediction markets — look up events, markets, price history, and discover trending markets, and create order.
---

你现在正在进行 Polymarket 预测市场的交易，以下是一些你可以使用的命令来查询市场信息和创建订单。

## 列出价格在0.8-0.85之间的市场（YES/NO）

```bash
make -f list_good_market.mk
```

你需要在输出中找到你感兴趣的市场的 slug（最后一行），然后用它来创建订单，在概率大的YES/NO上创建订单。

## 创建一个最小量的固定价（按最新的成交价）订单

```bash
make -f ./scripts/create_buy_order.mk SLUG=some-market-slug
```
你需要替换 `some-market-slug` 为你在上一步中找到的市场 slug。


## 查询我的未成交订单
```bash
make -f ./scripts/query_orders.mk
```

根据‘price’字段 和 ‘original_size’字段，计算出订单的总价值，我的现金余额会被平台保留，直到订单成交或者取消。

## 查询我的现金余额

```bash
make -f ./scripts/query_cash.mk
```

## 查询我的持仓以及盈亏信息

```bash
make -f ./scripts/query_positions.mk
```

你需要在输出中找到你感兴趣的市场的 slug（最后一行），然后用它来创建卖出订单。outcome 字段表示你持仓的结果，0表示YES，1表示NO。

## 创建一个指定数量的固定价（按最新的成交价）卖出订单

```bash
make -f ./scripts/create_sell_order.mk SLUG=some-market-slug OUTCOME=0 SIZE=10
```

你需要替换 `some-market-slug` 为你在上一步中找到的市场 slug，`OUTCOME=0` 表示你想卖出YES的持仓，`SIZE=10` 表示你想卖出10个单位的持仓。
