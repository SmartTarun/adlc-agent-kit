// Agent: Rohan | Sprint: 01 | Date: 2026-03-16
import { useRef } from 'react'
import Editor from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { Copy, Download, Save, CheckCircle } from 'lucide-react'
import { useState } from 'react'
import { iacApi } from '../../api/client'
import type { IaCGenerateResponse } from '../../types'
import styles from './IaCCodeEditor.module.css'

interface IaCCodeEditorProps {
  response: IaCGenerateResponse | null
  streaming?: boolean
  projectId?: string
  onSaved?: () => void
}

export default function IaCCodeEditor({ response, streaming = false, projectId, onSaved }: IaCCodeEditorProps) {
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  function handleEditorMount(ed: editor.IStandaloneCodeEditor) {
    editorRef.current = ed
  }

  async function handleCopy() {
    if (!response?.code) return
    await navigator.clipboard.writeText(response.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownload() {
    if (!response?.code) return
    const blob = new Blob([response.code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'main.tf'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleSave() {
    if (!response?.code || !projectId) return
    setSaving(true)
    try {
      await iacApi.saveTemplate({
        project_id: projectId,
        content: response.code,
        template_type: 'terraform',
        version: 1,
        language: 'terraform',
      })
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  const isEmpty = !response?.code

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.filename}>main.tf</span>
          {response && (
            <>
              <span className={styles.meta}>
                {response.model}
              </span>
              <span className={styles.meta}>
                {response.tokens_used.toLocaleString()} tokens
              </span>
            </>
          )}
          {streaming && (
            <span className={`${styles.streamingBadge} stream-cursor`}>
              Streaming
            </span>
          )}
        </div>

        <div className={styles.toolbarRight}>
          <button
            className={styles.toolBtn}
            onClick={() => void handleCopy()}
            disabled={isEmpty}
            title="Copy to clipboard"
            aria-label="Copy code to clipboard"
          >
            {copied ? <CheckCircle size={14} color="var(--color-success)" /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>

          <button
            className={styles.toolBtn}
            onClick={handleDownload}
            disabled={isEmpty}
            title="Download main.tf"
            aria-label="Download as main.tf"
          >
            <Download size={14} />
            Download
          </button>

          {projectId && (
            <button
              className={`${styles.toolBtn} ${styles.saveBtn}`}
              onClick={() => void handleSave()}
              disabled={isEmpty || saving}
              title="Save to project"
              aria-label="Save template to project"
              aria-busy={saving}
            >
              <Save size={14} />
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>

      <div className={styles.monacoWrap}>
        {isEmpty ? (
          <div className={styles.placeholder}>
            <p>Generated Terraform will appear here.</p>
            <p className={styles.placeholderHint}>Describe your infrastructure above and click Generate.</p>
          </div>
        ) : (
          <Editor
            height="100%"
            defaultLanguage="hcl"
            value={response.code}
            onMount={handleEditorMount}
            theme="vs-dark"
            options={{
              readOnly: !streaming,
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              padding: { top: 12 },
              renderLineHighlight: 'line',
              scrollbar: {
                verticalScrollbarSize: 6,
                horizontalScrollbarSize: 6,
              },
            }}
          />
        )}
      </div>
    </div>
  )
}
