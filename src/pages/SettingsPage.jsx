import { useState } from 'react'
import TabBar from '@/components/shared/TabBar'
import Panel from '@/components/shared/Panel'

const SETTINGS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'thresholds', label: 'Thresholds' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'team', label: 'Team' },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general')

  return (
    <div className="p-5 space-y-5">
      <TabBar tabs={SETTINGS_TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'general' && (
        <Panel title="General Settings">
          <div className="p-4 space-y-4">
            <SettingRow label="Organization Name" value="Acme Corp" />
            <SettingRow label="Default Time Range" value="Last 1 hour" />
            <SettingRow label="Auto-Refresh Interval" value="30 seconds" />
            <SettingRow label="Timezone" value="UTC" />
          </div>
        </Panel>
      )}

      {activeTab === 'thresholds' && (
        <Panel title="Alert Thresholds" hint="Global defaults - override per-service below">
          <div className="p-4 space-y-4">
            <SettingRow label="Latency Warning" value="500ms" editable />
            <SettingRow label="Latency Critical" value="1000ms" editable />
            <SettingRow label="Error Rate Warning" value="1%" editable />
            <SettingRow label="Error Rate Critical" value="5%" editable />
            <SettingRow label="P99 Warning" value="800ms" editable />
            <SettingRow label="P99 Critical" value="2000ms" editable />
          </div>
        </Panel>
      )}

      {activeTab === 'notifications' && (
        <Panel title="Notification Channels">
          <div className="p-4 space-y-3">
            <NotificationChannel name="Slack - #incidents" type="Slack" enabled />
            <NotificationChannel name="PagerDuty - On-call" type="PagerDuty" enabled />
            <NotificationChannel name="Email - team@acme.com" type="Email" enabled={false} />
          </div>
        </Panel>
      )}

      {activeTab === 'team' && (
        <Panel title="Team Members">
          <div className="p-4 text-[12px] text-text-muted">
            Team management settings will appear here.
          </div>
        </Panel>
      )}
    </div>
  )
}

function SettingRow({ label, value, editable = false }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border-subtle last:border-b-0">
      <span className="text-[12.5px] text-text-secondary">{label}</span>
      {editable ? (
        <input
          defaultValue={value}
          className="w-32 h-7 px-2 bg-panel border border-border-panel rounded-md text-[12px] text-text-primary text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      ) : (
        <span className="text-[12.5px] text-text-primary font-mono">{value}</span>
      )}
    </div>
  )
}

function NotificationChannel({ name, type, enabled }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border-subtle last:border-b-0">
      <div>
        <span className="text-[12.5px] text-text-primary">{name}</span>
        <span className="ml-2 text-[10px] text-text-muted bg-panel px-1.5 py-0.5 rounded">{type}</span>
      </div>
      <span className={`text-[11px] font-medium ${enabled ? 'text-healthy' : 'text-text-muted'}`}>
        {enabled ? 'Active' : 'Disabled'}
      </span>
    </div>
  )
}
