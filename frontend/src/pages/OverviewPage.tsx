// Agent: rohan | Sprint: 01 | Date: 2026-03-16
import { useNavigate } from 'react-router-dom'
import { Network, MessageSquareCode, Terminal, Zap } from 'lucide-react'
import styles from './OverviewPage.module.css'

const VIEWS = [
  {
    icon: Network,
    title: 'Canvas',
    description: 'Drag-drop AWS services onto a visual canvas. Connect them, then generate production-ready Terraform with one click.',
    cta: 'Open Canvas',
    to: '/canvas',
    accent: 'primary',
  },
  {
    icon: MessageSquareCode,
    title: 'Dashboard',
    description: 'Describe your infrastructure in plain English. Claude generates Terraform files, architecture docs, cost estimates, and more.',
    cta: 'Open Dashboard',
    to: '/dashboard',
    accent: 'accent',
  },
  {
    icon: Terminal,
    title: 'Terminal',
    description: 'CLI-style interface with real-time streaming. Type infrastructure requirements and watch Claude generate Terraform live.',
    cta: 'Open Terminal',
    to: '/terminal',
    accent: 'accent',
  },
] as const

export default function OverviewPage() {
  const navigate = useNavigate()

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true">
          <Zap size={36} color="var(--color-primary-400)" />
        </div>
        <h1 className={styles.heroTitle}>InfraViz</h1>
        <p className={styles.heroSubtitle}>
          AI-powered Infrastructure-as-Code generation for cloud architects.
          Powered by <strong>Claude claude-sonnet-4-6</strong>.
        </p>
      </div>

      <div className={styles.grid}>
        {VIEWS.map(({ icon: Icon, title, description, cta, to, accent }) => (
          <button
            key={to}
            className={`${styles.card} ${styles[`card_${accent}`]}`}
            onClick={() => navigate(to)}
            aria-label={`Go to ${title}`}
          >
            <div className={`${styles.cardIcon} ${styles[`icon_${accent}`]}`} aria-hidden="true">
              <Icon size={28} />
            </div>
            <h2 className={styles.cardTitle}>{title}</h2>
            <p className={styles.cardDesc}>{description}</p>
            <span className={`${styles.cardCta} ${styles[`cta_${accent}`]}`}>{cta} →</span>
          </button>
        ))}
      </div>

      <div className={styles.pipeline}>
        <h2 className={styles.pipelineTitle}>7-Step AI Pipeline</h2>
        <div className={styles.steps}>
          {[
            'Parse Requirements',
            'Design Architecture',
            'Generate Terraform',
            'ASCII Diagram',
            'Cost Estimate',
            'Compliance Check',
            'Deployment Guide',
          ].map((step, i) => (
            <div key={step} className={styles.step}>
              <span className={styles.stepNum}>{i + 1}</span>
              <span className={styles.stepLabel}>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
