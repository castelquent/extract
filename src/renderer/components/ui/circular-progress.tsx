import * as React from 'react'
import { cn } from '@/lib/utils'

interface CircularProgressProps {
  value: number
  renderLabel?: (progress: number) => number | string
  size?: number
  strokeWidth?: number
  shape?: 'square' | 'round'
  className?: string
  progressClassName?: string
  labelClassName?: string
  showLabel?: boolean
}

const CircularProgress: React.FC<CircularProgressProps> = ({
  value,
  renderLabel,
  className,
  progressClassName,
  labelClassName,
  showLabel,
  shape = 'round',
  size = 100,
  strokeWidth = 10,
}) => {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.max(0, Math.min(100, value)) / 100)

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        height={size}
        width={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          className={cn('stroke-primary/25', className)}
          cx={size / 2}
          cy={size / 2}
          fill="transparent"
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className={cn('stroke-primary transition-[stroke-dashoffset] duration-500', progressClassName)}
          cx={size / 2}
          cy={size / 2}
          fill="transparent"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap={shape}
          strokeWidth={strokeWidth}
        />
      </svg>
      {showLabel && (
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center text-md',
            labelClassName
          )}
        >
          {renderLabel ? renderLabel(value) : value}
        </div>
      )}
    </div>
  )
}

export { CircularProgress }
