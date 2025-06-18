'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'

interface Asset {
  code: string
  name: string
  target: number
  shares: string
  price: string
}

interface ComputedAsset extends Asset {
  marketValue: number
  weight: number
  delta: number
  tradeShares: number
  tradeAmount: number
  adjustedTradeShares: number
  adjustedTradeAmount: number
  finalWeight: number
  finalDelta: number
}

const initialAssets: Omit<Asset, 'shares' | 'price'>[] = [
  { code: '159632', name: '纳斯达克ETF', target: 25 },
  { code: '510880', name: '上证红利ETF', target: 30 },
  { code: '511260', name: '10年国债ETF', target: 20 },
  { code: '511380', name: '可转债ETF', target: 15 },
  { code: '518880', name: '黄金ETF', target: 10 },
]

const STORAGE_KEY = 'rebalance-tracker-data'
const FUNDS_STORAGE_KEY = 'rebalance-tracker-funds'

// 调整到100的整数倍
function roundToHundred(shares: number): number {
  return Math.round(shares / 100) * 100
}

// 智能调整算法：在满足100份约束的同时尽可能接近目标
function optimizeTradeShares(
  computedAssets: Omit<
    ComputedAsset,
    'adjustedTradeShares' | 'adjustedTradeAmount' | 'finalWeight' | 'finalDelta'
  >[]
): number[] {
  const n = computedAssets.length
  const idealShares = computedAssets.map(a => a.tradeShares)
  const prices = computedAssets.map(a => parseFloat(a.price || '0'))

  // 初始调整：简单四舍五入到100的整数倍
  const adjustedShares = idealShares.map(roundToHundred)

  // 计算调整后的资金偏差
  const totalAdjustedAmount = adjustedShares.reduce((sum, shares, i) => sum + shares * prices[i], 0)
  const idealTotalAmount = idealShares.reduce((sum, shares, i) => sum + shares * prices[i], 0)
  let deviation = totalAdjustedAmount - idealTotalAmount

  // 如果偏差较小（<1000元），直接返回
  if (Math.abs(deviation) < 1000) {
    return adjustedShares
  }

  // 优化算法：逐步调整以减少偏差
  const maxIterations = 20
  for (let iter = 0; iter < maxIterations && Math.abs(deviation) > 100; iter++) {
    let bestImprovement = 0
    let bestIndex = -1
    let bestDirection = 0

    // 尝试每个资产的±100份调整
    for (let i = 0; i < n; i++) {
      if (prices[i] <= 0) continue

      for (const direction of [-1, 1]) {
        const newShares = adjustedShares[i] + direction * 100
        const currentCost = adjustedShares[i] * prices[i]
        const newCost = newShares * prices[i]
        const costChange = newCost - currentCost

        // 计算这个调整对总偏差的改善
        const newDeviation = deviation + costChange
        const improvement = Math.abs(deviation) - Math.abs(newDeviation)

        if (improvement > bestImprovement) {
          bestImprovement = improvement
          bestIndex = i
          bestDirection = direction
        }
      }
    }

    // 应用最佳调整
    if (bestIndex >= 0 && bestImprovement > 0) {
      adjustedShares[bestIndex] += bestDirection * 100
      deviation += bestDirection * 100 * prices[bestIndex]
    } else {
      break // 无法进一步改善
    }
  }

  return adjustedShares
}

export default function RebalanceTracker() {
  // 初始化为默认数据，避免hydration问题
  const [assets, setAssets] = useState<Asset[]>(() =>
    initialAssets.map(a => ({ ...a, shares: '', price: '' }))
  )

  // 新增资金状态
  const [additionalFunds, setAdditionalFunds] = useState<string>('')

  // 标记是否已经从localStorage加载数据
  const [isLoaded, setIsLoaded] = useState(false)

  // 在客户端加载localStorage数据
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        // 加载资产数据
        const savedAssets = localStorage.getItem(STORAGE_KEY)
        if (savedAssets) {
          const parsedData = JSON.parse(savedAssets)
          const mergedAssets = initialAssets.map(initial => {
            const saved = parsedData.find((item: Asset) => item.code === initial.code)
            return {
              ...initial,
              shares: saved?.shares || '',
              price: saved?.price || '',
            }
          })
          setAssets(mergedAssets)
        }

        // 加载新增资金数据
        const savedFunds = localStorage.getItem(FUNDS_STORAGE_KEY)
        if (savedFunds) {
          setAdditionalFunds(savedFunds)
        }

        setIsLoaded(true)
      } catch (error) {
        console.error('读取本地存储数据失败:', error)
        setIsLoaded(true)
      }
    }
  }, [])

  // 保存资产数据到localStorage
  useEffect(() => {
    if (isLoaded && typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(assets))
      } catch (error) {
        console.error('保存资产数据到本地存储失败:', error)
      }
    }
  }, [assets, isLoaded])

  // 保存新增资金到localStorage
  useEffect(() => {
    if (isLoaded && typeof window !== 'undefined') {
      try {
        localStorage.setItem(FUNDS_STORAGE_KEY, additionalFunds)
      } catch (error) {
        console.error('保存资金数据到本地存储失败:', error)
      }
    }
  }, [additionalFunds, isLoaded])

  // 计算当前总市值
  const currentTotal = useMemo(() => {
    return assets.reduce((sum, a) => {
      const mv = parseFloat(a.shares || '0') * parseFloat(a.price || '0')
      return sum + (isNaN(mv) ? 0 : mv)
    }, 0)
  }, [assets])

  // 计算目标总市值（当前市值 + 新增资金）
  const targetTotal = useMemo(() => {
    const additional = parseFloat(additionalFunds || '0')
    return currentTotal + (isNaN(additional) ? 0 : additional)
  }, [currentTotal, additionalFunds])

  const computedAssets: ComputedAsset[] = useMemo(() => {
    // 第一步：计算理想调仓
    const basicComputed = assets.map(a => {
      const shares = parseFloat(a.shares || '0')
      const price = parseFloat(a.price || '0')
      const marketValue = shares * price
      const currentWeight = currentTotal > 0 ? (marketValue / currentTotal) * 100 : 0
      const delta = currentWeight - a.target

      // 计算目标市值和需要调整的金额
      const targetMarketValue = (a.target / 100) * targetTotal
      const tradeAmount = targetMarketValue - marketValue
      const tradeShares = price > 0 ? tradeAmount / price : 0

      return {
        ...a,
        marketValue,
        weight: currentWeight,
        delta,
        tradeShares,
        tradeAmount,
      }
    })

    // 第二步：应用100份约束优化
    const optimizedShares = optimizeTradeShares(basicComputed)

    // 第三步：计算调整后的最终结果
    return basicComputed.map((a, i) => {
      const adjustedTradeShares = optimizedShares[i]
      const adjustedTradeAmount = adjustedTradeShares * parseFloat(a.price || '0')

      // 计算调整后的最终市值和权重
      const finalMarketValue = a.marketValue + adjustedTradeAmount
      const finalWeight = targetTotal > 0 ? (finalMarketValue / targetTotal) * 100 : 0
      const finalDelta = finalWeight - a.target

      return {
        ...a,
        adjustedTradeShares,
        adjustedTradeAmount,
        finalWeight,
        finalDelta,
      }
    })
  }, [assets, currentTotal, targetTotal])

  // 验证调仓金额总和
  const totalTradeAmount = useMemo(() => {
    return computedAssets.reduce((sum, a) => sum + a.tradeAmount, 0)
  }, [computedAssets])

  const totalAdjustedTradeAmount = useMemo(() => {
    return computedAssets.reduce((sum, a) => sum + a.adjustedTradeAmount, 0)
  }, [computedAssets])

  const handleChange = (
    index: number,
    field: keyof Pick<Asset, 'shares' | 'price'>,
    value: string
  ) => {
    setAssets(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  // 在数据加载完成前显示加载状态
  if (!isLoaded) {
    return (
      <div className="p-4 max-w-6xl mx-auto space-y-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-center h-32">
              <div className="text-gray-500">加载中...</div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <h1 className="text-xl font-bold">投资组合再平衡追踪器</h1>

          {/* 新增资金输入 */}
          <div className="flex items-center gap-4 p-3 bg-blue-50 rounded-lg">
            <label className="font-medium text-blue-900">新增资金 ¥:</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={additionalFunds}
              onChange={e => setAdditionalFunds(e.target.value)}
              className="w-32"
              placeholder="0.00"
            />
            <span className="text-sm text-blue-700">
              {parseFloat(additionalFunds || '0') > 0 ? '增资调仓模式' : '纯调仓模式'}
            </span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>代码</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>目标权重%</TableHead>
                <TableHead>持仓份额</TableHead>
                <TableHead>价格 ¥</TableHead>
                <TableHead>当前市值 ¥</TableHead>
                <TableHead>当前权重%</TableHead>
                <TableHead>Δ vs 目标%</TableHead>
                <TableHead>理想调仓份额</TableHead>
                <TableHead className="bg-green-50">实际调仓份额</TableHead>
                <TableHead className="bg-green-50">实际调仓金额 ¥</TableHead>
                <TableHead className="bg-green-50">调整后权重%</TableHead>
                <TableHead className="bg-green-50">调整后Δ%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {computedAssets.map((a, idx) => (
                <TableRow key={a.code} className="hover:bg-gray-50">
                  <TableCell>{a.code}</TableCell>
                  <TableCell>{a.name}</TableCell>
                  <TableCell>{a.target.toFixed(0)}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      value={a.shares}
                      onChange={e => handleChange(idx, 'shares', e.target.value)}
                      className="w-28"
                      placeholder="0"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={a.price}
                      onChange={e => handleChange(idx, 'price', e.target.value)}
                      className="w-24"
                      placeholder="0.00"
                    />
                  </TableCell>
                  <TableCell>{a.marketValue.toFixed(2)}</TableCell>
                  <TableCell>{a.weight.toFixed(2)}</TableCell>
                  <TableCell
                    className={a.delta > 6 ? 'text-red-500' : a.delta < -6 ? 'text-green-600' : ''}
                  >
                    {a.delta.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">
                    {a.tradeShares.toFixed(0)}
                  </TableCell>
                  <TableCell className="font-medium bg-green-50">
                    <span
                      className={
                        a.adjustedTradeShares > 0
                          ? 'text-blue-600 font-bold'
                          : a.adjustedTradeShares < 0
                          ? 'text-orange-600 font-bold'
                          : ''
                      }
                    >
                      {a.adjustedTradeShares.toFixed(0)}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium bg-green-50">
                    <span
                      className={
                        a.adjustedTradeAmount > 0
                          ? 'text-blue-600'
                          : a.adjustedTradeAmount < 0
                          ? 'text-orange-600'
                          : ''
                      }
                    >
                      {a.adjustedTradeAmount.toFixed(2)}
                    </span>
                  </TableCell>
                  <TableCell className="bg-green-50">{a.finalWeight.toFixed(2)}</TableCell>
                  <TableCell
                    className={`bg-green-50 ${
                      a.finalDelta > 6 ? 'text-red-500' : a.finalDelta < -6 ? 'text-green-600' : ''
                    }`}
                  >
                    {a.finalDelta.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* 汇总信息 */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="space-y-2">
              <div className="text-right font-semibold">当前总市值: ¥{currentTotal.toFixed(2)}</div>
              <div className="text-right font-semibold">目标总市值: ¥{targetTotal.toFixed(2)}</div>
              <div className="text-right font-semibold">
                新增资金: ¥{(targetTotal - currentTotal).toFixed(2)}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-right font-semibold text-gray-600">
                理想调仓总额: ¥{totalTradeAmount.toFixed(2)}
              </div>
              <div className="text-xs text-gray-500 text-right">
                {Math.abs(totalTradeAmount) < 0.01 ? '✅ 理想平衡' : '⚠️ 理想不平衡'}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-right font-semibold text-green-600">
                实际调仓总额: ¥{totalAdjustedTradeAmount.toFixed(2)}
              </div>
              <div className="text-xs text-green-600 text-right">
                偏差: ¥{(totalAdjustedTradeAmount - totalTradeAmount).toFixed(2)}
              </div>
            </div>
          </div>

          <div className="space-y-2 text-sm text-gray-500">
            <p>
              * <span className="font-semibold text-green-600">实际调仓</span>
              ：考虑100份整数倍约束的优化结果
            </p>
            <p>
              * <span className="font-semibold">纯调仓</span>：不增加资金，调仓金额总和应为0
            </p>
            <p>
              * <span className="font-semibold">增资调仓</span>
              ：增加新资金，调仓金额总和应等于新增资金
            </p>
            <p>
              * Δ 列超过 <span className="font-semibold">±6%</span> 时建议再平衡
            </p>
            <p>* 蓝色数字表示买入，橙色数字表示卖出</p>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            💾 数据会自动保存到本地存储，下次打开时会自动恢复。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
