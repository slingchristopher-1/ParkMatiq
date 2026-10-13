function Icon({ children, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

export const IconMail = props => (
  <Icon {...props}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></Icon>
)

export const IconLock = props => (
  <Icon {...props}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></Icon>
)

export const IconUser = props => (
  <Icon {...props}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></Icon>
)

export const IconEye = props => (
  <Icon {...props}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/></Icon>
)

export const IconEyeOff = props => (
  <Icon {...props}><path d="M3 3l18 18"/><path d="M10 5.3A10.8 10.8 0 0 1 12 5c6.5 0 10 6 10 6a17.6 17.6 0 0 1-3 3.5M6.6 6.6C3.8 8.3 2 11 2 11s3.5 7 10 7c1.9 0 3.6-.5 5-1.3"/></Icon>
)

export const IconPlay = props => (
  <Icon {...props}><path d="M7 5l12 7-12 7V5Z" fill="currentColor" stroke="none"/></Icon>
)

export const IconStop = props => (
  <Icon {...props}><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/></Icon>
)

export const IconDownload = props => (
  <Icon {...props}><path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/></Icon>
)

export const IconLocate = props => (
  <Icon {...props}><circle cx="12" cy="12" r="7"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/></Icon>
)

export const IconBolt = props => (
  <Icon {...props}><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></Icon>
)

export const IconNavigate = props => (
  <Icon {...props}><path d="M3 11l19-9-9 19-2-8z"/></Icon>
)

export const IconSearch = props => (
  <Icon {...props}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Icon>
)
