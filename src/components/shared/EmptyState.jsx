import { clsx } from 'clsx'

export default function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center py-16 px-4 text-center', className)}>
      {Icon && (
        <div className="w-12 h-12 rounded-lg bg-raised flex items-center justify-center mb-4">
          <Icon size={24} className="text-text-muted" />
        </div>
      )}
      <h3 className="text-[14px] font-medium text-text-primary mb-1">{title}</h3>
      {description && (
        <p className="text-[12px] text-text-muted max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
