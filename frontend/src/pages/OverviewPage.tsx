// Agent: Rohan | Sprint: 01 | Date: 2026-03-16
import { useEffect, useState } from 'react'
import { DollarSign, AlertTriangle, Server, Activity } from 'lucide-react'
import MetricCard from '../components/MetricCard/MetricCard'
import CostTimeseriesChart from '../components/CostTimeseriesChart/CostTimeseriesChart'
import AnomalyTable from '../components/AnomalyTable/AnomalyTable'
import AgentStatusPanel from '../components/AgentStatusPanel/AgentStatusPanel'
import { anomaliesApi, costApi } from '../api/client'
import type { AnomalyRecord, CostDataPoint } from '../types'
import styles from './OverviewPage.module.css'

export default function OverviewPage() {
  const [anomalies, setAnomalies] = useState<AnomalyRecord[]>([])
  const [costData, setCostData] = useState<CostDataPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      anomaliesApi.list().catch(() => [] as AnomalyRecord[]),
      costApi.timeseries({ days: 30 }).catch(() => [] as CostDataPoint[]),
    ]).then(([a, c]) => {
      setAnomalies(a)
      setCostData(c)
      setLoading(false)
    })
  }, [])

  const criticalCount = anomalies.filter((a) => a.severity === 'critical').length
  const openCount = anomalies.filter((a) => a.status === 'open').length
  const totalCost = costData.length
    ? costData[costData.length - 1]?.actual ?? 0
    : 0

  async function handleAcknowledge(id: string) {
    await anomaliesApi.acknowledge(id)
    setAnomalies((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'acknowledged' } : a))
    )
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Overview</h1>

      <div className={styles.kpiGrid}>
        <MetricCard
          label="Monthly Spend"
          value={`$${totalCost.toLocaleString()}`}
          icon={<DollarSign size={18} />}
          variant="default"
          loading={loading}
        />
        <MetricCard
          label="Open Anomalies"
          value={openCount}
          icon={<AlertTriangle size={18} />}
          variant={openCount > 0 ? 'warning' : 'default'}
          loading={loading}
        />
        <MetricCard
          label="Critical Alerts"
          value={criticalCount}
          icon={<Activity size={18} />}
          variant={criticalCount > 0 ? 'danger' : 'default'}
          loading={loading}
        />
        <MetricCard
          label="Resources Tracked"
          value="—"
          icon={<Server size={18} />}
          variant="default"
          loading={loading}
        />
      </div>

      <div className={styles.chartSection}>
        <h2 className={styles.sectionTitle}>Cost Trend (30 days)</h2>
        <CostTimeseriesChart
          data={costData}
          anomalies={anomalies.map((a) => ({ timestamp: a.detected_at, severity: a.severity }))}
          timeRange="30d"
        />
      </div>

      <div className={styles.bottomGrid}>
        <div className={styles.anomalySection}>
          <h2 className={styles.sectionTitle}>Recent Anomalies</h2>
          <AnomalyTable
            anomalies={anomalies.slice(0, 10)}
            onAcknowledge={(id) => void handleAcknowledge(id)}
            onDrillDown={() => {}}
            loading={loading}
          />
        </div>

        <div className={styles.agentSection}>
          <h2 className={styles.sectionTitle}>Agent Status</h2>
          <AgentStatusPanel />
        </div>
      </div>
    </div>
  )
}
